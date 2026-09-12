import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { AdFormDialog } from '@/features/ads/admin/AdFormDialog';
import { deleteAd, fetchAllAds } from '@/features/ads/api';
import { toApiError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import type { AdminAd, AdPlacement } from '@/types/api';

const PLACEMENT_LABELS: Record<AdPlacement, string> = {
  HOME: 'Home screen',
  DEPARTMENTS: 'Departments',
  SIDEBAR: 'Navigation rail',
};

const PLACEMENT_ORDER: AdPlacement[] = ['HOME', 'DEPARTMENTS', 'SIDEBAR'];

/**
 * Where the adverts are maintained.
 *
 * <p>Grouped by the place they run rather than listed flat, because the question an administrator
 * arrives with is nearly always "what is on the Home screen at the moment" — and because only one
 * advert per place is shown to any reader at a time, so a group of six is itself the useful fact.
 */
export function AdsPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminAd | null>(null);
  const [deleting, setDeleting] = useState<AdminAd | null>(null);

  const ads = useQuery({ queryKey: ['admin-ads'], queryFn: fetchAllAds });

  /**
   * The clock, read once when the screen opens.
   *
   * <p>Only `StatusChip` needs it, and only to tell a scheduled advert from a finished one. Reading
   * `Date.now()` where it is used would be a different answer on every render for no benefit — the
   * distinction it draws is between yesterday and next week, not between one paint and the next.
   */
  const [openedAt] = useState(() => Date.now());

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (ad: AdminAd) => {
    setEditing(ad);
    setFormOpen(true);
  };

  const error = ads.error ? toApiError(ads.error) : null;

  return (
    <AppShell
      title="Adverts"
      subtitle="Pictures, GIFs and short videos carried in three places in the application. Every one is silent, can be put away by the reader, and opens a popup only when it is pressed."
      actions={<Button onClick={openNew}>New advert</Button>}
    >
      {error && <Alert tone="error">{error.message}</Alert>}

      {ads.isPending && <SkeletonRows count={3} label="Loading adverts" />}

      {ads.data && ads.data.length === 0 && (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
          <h2 className="text-base font-semibold text-slate-900">No adverts yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
            Until one is created the slots do not exist — no empty boxes, no reserved space. Nobody
            using the application can tell the feature is here.
          </p>
          <div className="mt-5 flex justify-center">
            <Button onClick={openNew}>Create the first advert</Button>
          </div>
        </div>
      )}

      {ads.data && ads.data.length > 0 && (
        <div className="space-y-8">
          {PLACEMENT_ORDER.map((placement) => {
            const inPlace = ads.data.filter((ad) => ad.placement === placement);
            if (inPlace.length === 0) return null;

            const liveCount = inPlace.filter((ad) => ad.live).length;

            return (
              <section key={placement}>
                <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="text-base font-semibold text-navy-900">
                    {PLACEMENT_LABELS[placement]}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {liveCount === 0
                      ? 'nothing showing here'
                      : liveCount === 1
                        ? '1 live'
                        : `${liveCount} live — a reader sees one of them, chosen when the screen opens`}
                  </p>
                </div>

                <div className="stagger space-y-3">
                  {inPlace.map((ad) => (
                    <AdRow
                      key={ad.id}
                      ad={ad}
                      now={openedAt}
                      onEdit={() => openEdit(ad)}
                      onDelete={() => setDeleting(ad)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <AdFormDialog open={formOpen} editing={editing} onClose={() => setFormOpen(false)} />
      <DeleteAdDialog ad={deleting} onClose={() => setDeleting(null)} />
    </AppShell>
  );
}

function AdRow({
  ad,
  now,
  onEdit,
  onDelete,
}: {
  ad: AdminAd;
  now: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 shadow-card transition-shadow duration-[--duration-base] ease-[--ease-settle] hover:shadow-lifted sm:flex-row">
      {/* A still even for a video: this is a management table, and six films playing at once is
          not a screen anybody can work in. */}
      <div className="aspect-video w-full shrink-0 overflow-hidden rounded-lg border border-line bg-surface-sunken sm:w-44">
        {ad.mediaKind === 'VIDEO' ? (
          <video
            src={ad.mediaUrl}
            className="h-full w-full object-contain"
            muted
            playsInline
            preload="metadata"
          />
        ) : (
          <img src={ad.mediaUrl} alt="" className="h-full w-full object-contain" loading="lazy" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-slate-900">{ad.title}</h3>
          <StatusChip ad={ad} now={now} />
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
            {ad.mediaKind}
          </span>
        </div>

        {ad.headline && <p className="mt-1 text-sm text-slate-600">{ad.headline}</p>}

        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
          <Fact label="Seen" value={ad.viewCount.toLocaleString()} />
          <Fact label="Opened" value={ad.clickCount.toLocaleString()} />
          <Fact label="Order" value={String(ad.displayOrder)} />
          {ad.startsAt && <Fact label="From" value={formatDateTime(ad.startsAt)} />}
          {ad.endsAt && <Fact label="Until" value={formatDateTime(ad.endsAt)} />}
          {!ad.dismissible && <Fact label="Hiding" value="not allowed" />}
        </dl>
      </div>

      <div className="flex shrink-0 items-start gap-2">
        <Button size="sm" variant="secondary" onClick={onEdit}>
          Edit
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </article>
  );
}

/**
 * Why an advert is or is not showing, in one word.
 *
 * <p>"Switched on" and "running" are not the same thing once a window is set, and an administrator
 * looking at a list should not have to compare two timestamps against the clock to work out which
 * of their adverts is actually in front of anybody.
 */
function StatusChip({ ad, now }: { ad: AdminAd; now: number }) {
  const { label, tone } = !ad.active
    ? { label: 'Switched off', tone: 'bg-slate-100 text-slate-600' }
    : ad.live
      ? { label: 'Live', tone: 'bg-emerald-50 text-emerald-700' }
      : ad.startsAt && new Date(ad.startsAt).getTime() > now
        ? { label: 'Scheduled', tone: 'bg-amber-50 text-amber-700' }
        : { label: 'Finished', tone: 'bg-slate-100 text-slate-600' };

  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{label}</span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-slate-400">{label}</dt>
      <dd className="font-medium text-slate-600">{value}</dd>
    </div>
  );
}

/**
 * Removing an advert for good.
 *
 * <p>Hard, unlike a document, and said plainly here: a document is the office's record and its
 * deletion is usually a mistake somebody will want undone, whereas an advert is a poster on a wall.
 */
function DeleteAdDialog({ ad, onClose }: { ad: AdminAd | null; onClose: () => void }) {
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: () => deleteAd(ad!.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-ads'] });
      void queryClient.invalidateQueries({ queryKey: ['ads'] });
      onClose();
    },
  });

  const error = remove.error ? toApiError(remove.error) : null;

  return (
    <Modal
      open={ad !== null}
      title="Delete this advert?"
      description={
        ad
          ? `“${ad.title}” and its media are removed for good. To stop it showing without losing it, edit it and switch it off instead.`
          : undefined
      }
      onClose={onClose}
    >
      {error && <Alert tone="error">{error.message}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
          Delete
        </Button>
      </div>
    </Modal>
  );
}
