import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { createAd, updateAd, type SaveAdPayload } from '@/features/ads/api';
import { fromLocalInputValue, toLocalInputValue } from '@/features/ads/schedule';
import { toApiError } from '@/lib/errors';
import { formatFileSize } from '@/lib/format';
import type { AdminAd, AdPlacement } from '@/types/api';

/** Said in the words an administrator would use, not the enum's. */
const PLACEMENTS: { value: AdPlacement; label: string; hint: string }[] = [
  { value: 'HOME', label: 'Home screen', hint: 'A card low on Home, below the reader’s own work' },
  { value: 'DEPARTMENTS', label: 'Departments', hint: 'A slim strip below the department grid' },
  { value: 'SIDEBAR', label: 'Navigation rail', hint: 'A small tile at the foot of the menu' },
];

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm';

interface Props {
  open: boolean;
  /** The advert being changed, or null when adding one. */
  editing: AdminAd | null;
  onClose: () => void;
}

export function AdFormDialog({ open, editing, onClose }: Props) {
  return (
    <Modal
      open={open}
      size="lg"
      title={editing ? 'Edit advert' : 'New advert'}
      description="Everything here is configurable — the media, what the card says, and what the popup says when somebody presses it."
      onClose={onClose}
    >
      {/* Keyed, so opening the dialog on a different advert gives a fresh form rather than the last
          one's details — the same reason ContactDialog does it. */}
      <AdForm key={editing?.id ?? 'new'} editing={editing} onClose={onClose} />
    </Modal>
  );
}

function AdForm({ editing, onClose }: { editing: AdminAd | null; onClose: () => void }) {
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    title: editing?.title ?? '',
    placement: (editing?.placement ?? 'HOME') as AdPlacement,
    altText: editing?.altText ?? '',
    headline: editing?.headline ?? '',
    caption: editing?.caption ?? '',
    detailTitle: editing?.detailTitle ?? '',
    detailBody: editing?.detailBody ?? '',
    ctaLabel: editing?.ctaLabel ?? '',
    ctaUrl: editing?.ctaUrl ?? '',
    autoplay: editing?.autoplay ?? true,
    loopMedia: editing?.loopMedia ?? true,
    dismissible: editing?.dismissible ?? true,
    active: editing?.active ?? true,
    startsAt: toLocalInputValue(editing?.startsAt),
    endsAt: toLocalInputValue(editing?.endsAt),
    displayOrder: String(editing?.displayOrder ?? 0),
  });

  const [media, setMedia] = useState<File | null>(null);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  /**
   * A preview of whatever will actually be uploaded.
   *
   * <p>Revoked when it is replaced, and on unmount: an object URL holds its file in memory until it
   * is, and an administrator trying four versions of a video would otherwise leave four of them
   * there.
   */
  const previewUrl = useMemo(() => (media ? URL.createObjectURL(media) : null), [media]);
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const isVideo = media ? media.type.startsWith('video/') : editing?.mediaKind === 'VIDEO';

  const save = useMutation({
    mutationFn: () => {
      const payload: SaveAdPayload = {
        title: form.title.trim(),
        placement: form.placement,
        altText: form.altText.trim(),
        headline: form.headline.trim() || null,
        caption: form.caption.trim() || null,
        detailTitle: form.detailTitle.trim(),
        detailBody: form.detailBody,
        ctaLabel: form.ctaLabel.trim() || null,
        ctaUrl: form.ctaUrl.trim() || null,
        autoplay: form.autoplay,
        loopMedia: form.loopMedia,
        dismissible: form.dismissible,
        active: form.active,
        startsAt: fromLocalInputValue(form.startsAt),
        endsAt: fromLocalInputValue(form.endsAt),
        displayOrder: Number(form.displayOrder) || 0,
      };

      // The file is required to create and optional to edit — the server enforces the same pairing.
      return editing ? updateAd(editing.id, payload, media) : createAd(payload, media!);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-ads'] });
      // Every slot's list as well: an advert switched on should appear without a reload, and one
      // switched off should stop appearing.
      void queryClient.invalidateQueries({ queryKey: ['ads'] });
      onClose();
    },
  });

  const complete =
    form.title.trim().length > 0 &&
    form.altText.trim().length > 0 &&
    form.detailTitle.trim().length > 0 &&
    form.detailBody.trim().length > 0 &&
    (editing !== null || media !== null);

  const error = save.error ? toApiError(save.error) : null;

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (complete) save.mutate();
      }}
    >
      {error && <Alert tone="error">{error.message}</Alert>}

      <TextField
        label="Name"
        value={form.title}
        onChange={(event) => set('title', event.target.value)}
        maxLength={160}
        required
        hint="Your own name for it, for this list only. Nobody else ever sees it."
      />

      {/* ------------------------------------------------------------------ the media */}

      <Section title="The advert" hint="A picture, an animated GIF or a short video.">
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-line bg-surface-sunken">
            <div className="flex aspect-[21/9] items-center justify-center">
              {previewUrl || editing ? (
                isVideo ? (
                  <video
                    key={previewUrl ?? editing?.mediaUrl}
                    src={previewUrl ?? editing?.mediaUrl}
                    className="h-full w-full object-contain"
                    controls
                    muted
                    playsInline
                  />
                ) : (
                  <img
                    src={previewUrl ?? editing?.mediaUrl}
                    alt=""
                    className="h-full w-full object-contain"
                  />
                )
              ) : (
                <p className="px-4 text-center text-sm text-slate-500">
                  Nothing chosen yet. PNG, JPG, WebP, GIF, MP4 or WebM — up to 5&nbsp;MB for a
                  picture, 25&nbsp;MB for a video.
                </p>
              )}
            </div>
          </div>

          <input
            type="file"
            accept={ACCEPT}
            onChange={(event) => setMedia(event.target.files?.[0] ?? null)}
            aria-label="Advert media"
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg
              file:border file:border-navy-200 file:bg-surface file:px-3 file:py-2
              file:text-sm file:font-semibold file:text-navy-700 hover:file:bg-navy-50"
          />
          {media ? (
            <p className="text-xs text-slate-500">
              {media.name} · {formatFileSize(media.size)}
            </p>
          ) : (
            editing && (
              <p className="text-xs text-slate-500">
                Currently {editing.mediaFileName} · {formatFileSize(editing.mediaSizeBytes)}. Choose
                a file only if you want to replace it.
              </p>
            )
          )}
        </div>

        <TextField
          label="Description of the media"
          value={form.altText}
          onChange={(event) => set('altText', event.target.value)}
          maxLength={255}
          required
          hint="Read aloud to anyone who cannot see it, and shown if the file fails to load."
        />
      </Section>

      {/* ------------------------------------------------------------------- the card */}

      <Section title="On the page" hint="What appears beside the advert. Both optional.">
        <TextField
          label="Headline"
          value={form.headline}
          onChange={(event) => set('headline', event.target.value)}
          maxLength={160}
        />
        <TextField
          label="Caption"
          value={form.caption}
          onChange={(event) => set('caption', event.target.value)}
          maxLength={320}
          hint="One line; trimmed to two on narrow screens."
        />
      </Section>

      {/* ------------------------------------------------------------------ the popup */}

      <Section
        title="In the popup"
        hint="What opens when somebody presses the advert. Nothing opens on its own."
      >
        <TextField
          label="Popup heading"
          value={form.detailTitle}
          onChange={(event) => set('detailTitle', event.target.value)}
          maxLength={160}
          required
        />
        <TextAreaField
          label="Popup text"
          value={form.detailBody}
          onChange={(event) => set('detailBody', event.target.value)}
          rows={6}
          maxLength={8000}
          required
          hint="Leave a blank line between paragraphs. Formatting and links are not carried across."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Button label"
            value={form.ctaLabel}
            onChange={(event) => set('ctaLabel', event.target.value)}
            maxLength={60}
            hint="Leave both boxes empty for no button."
          />
          <TextField
            label="Button web address"
            type="url"
            inputMode="url"
            value={form.ctaUrl}
            onChange={(event) => set('ctaUrl', event.target.value)}
            placeholder="https://"
            maxLength={2048}
            hint="Opens in a new tab."
          />
        </div>
      </Section>

      {/* --------------------------------------------------------------- how it behaves */}

      <Section title="How it behaves">
        <div className="space-y-2.5">
          <CheckField
            label="Readers can hide it"
            hint="Hidden for a fortnight in that person’s browser. Leave this on unless there is a reason not to."
            checked={form.dismissible}
            onChange={(value) => set('dismissible', value)}
          />
          {isVideo && (
            <>
              <CheckField
                label="Start playing on its own"
                hint="Always silent — there is no setting that lets an advert make a sound. Ignored for anyone whose machine asks for reduced motion."
                checked={form.autoplay}
                onChange={(value) => set('autoplay', value)}
              />
              <CheckField
                label="Repeat"
                checked={form.loopMedia}
                onChange={(value) => set('loopMedia', value)}
              />
            </>
          )}
        </div>
      </Section>

      {/* ---------------------------------------------------------------- the schedule */}

      <Section title="Where and when">
        <SelectField
          label="Where it appears"
          value={form.placement}
          onChange={(event) => set('placement', event.target.value as AdPlacement)}
          hint={PLACEMENTS.find((option) => option.value === form.placement)?.hint}
        >
          {PLACEMENTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Starts"
            type="datetime-local"
            value={form.startsAt}
            onChange={(event) => set('startsAt', event.target.value)}
            hint="Leave empty to start as soon as it is switched on."
          />
          <TextField
            label="Ends"
            type="datetime-local"
            value={form.endsAt}
            onChange={(event) => set('endsAt', event.target.value)}
            hint="Leave empty to run until switched off."
          />
        </div>

        <TextField
          label="Order"
          type="number"
          min={0}
          value={form.displayOrder}
          onChange={(event) => set('displayOrder', event.target.value)}
          hint="Lowest first, among the adverts sharing this place."
        />

        <CheckField
          label="Switched on"
          hint="Off keeps the advert and its wording without showing it to anyone."
          checked={form.active}
          onChange={(value) => set('active', value)}
        />
      </Section>

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!complete} loading={save.isPending}>
          {editing ? 'Save changes' : 'Create advert'}
        </Button>
      </div>
    </form>
  );
}

/** A titled group of fields. The form has five and reads as a wall of boxes without them. */
function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="space-y-4">
      <legend className="text-sm font-semibold text-slate-900">
        {title}
        {hint && <span className="mt-0.5 block text-xs font-normal text-slate-500">{hint}</span>}
      </legend>
      {children}
    </fieldset>
  );
}

/**
 * A checkbox with its label and explanation.
 *
 * <p>Local to this screen rather than added to `components/ui`: it is the only checkbox in the
 * application, and a shared component with one caller is a decision made too early.
 */
function CheckField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong accent-[var(--color-brand)]
          outline-none focus-visible:ring-2 focus-visible:ring-navy-300"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-700">{label}</span>
        {hint && <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}
