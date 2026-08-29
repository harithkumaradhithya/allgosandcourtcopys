import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { controlClass } from '@/components/ui/Field';
import { SkeletonRows } from '@/components/ui/Skeleton';
import {
  fetchNotificationCategories,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationLink,
  sendAnnouncement,
} from '@/features/notifications/api';
import { useAuth } from '@/lib/auth-context';
import { toApiError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { tone } from '@/lib/tones';
import type { ToneName } from '@/lib/tones';
import type { Notification, NotificationCategoryOption } from '@/types/api';

/**
 * What the office has been told: approvals, rejections, deletions with their reasons, restores.
 *
 * <p>The rows have been written since Phase 1 and nothing ever read them, which meant an admin was
 * notified of a deletion they had no way to see. This screen and the bell are the read side.
 */
export function NotificationsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();

  /**
   * Only an admin composes. A circular goes to every account at once, which is the office speaking
   * rather than any one clerk; the server refuses a member's send regardless, and this keeps a
   * member from being shown a box that would only fail.
   */
  const isAdmin = user?.role === 'ADMIN';

  /*
   * The filters live in the URL, not in component state. A notification is opened by leaving this
   * screen for the document it is about, and coming back to an inbox that has quietly forgotten
   * you were looking at last month's deletions is the whole reason filtering felt useless. It also
   * means a particular view can be bookmarked, or sent to whoever asked about it.
   */
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState<number | null>(null);

  const unreadOnly = params.get('unread') === '1';
  /** Repeated in the URL — `?category=deletions&category=uploads` — so several can be ticked. */
  const selected = params.getAll('category');

  /**
   * The categories this reader may filter by. Asked of the server rather than listed here, because
   * the server is what decides who receives what: an admin is offered registration requests and a
   * member is not, since a member is never sent one.
   */
  const categories = useQuery({
    queryKey: ['notifications', 'categories'],
    queryFn: fetchNotificationCategories,
  });

  const notifications = useQuery({
    // Joined rather than held as an array: a fresh array every render is a fresh key every render.
    queryKey: ['notifications', 'list', unreadOnly, selected.join(',')],
    queryFn: () => fetchNotifications(unreadOnly, selected),
  });

  const applyFilters = (next: URLSearchParams) => setParams(next, { replace: true });

  const setUnreadOnly = (value: boolean) => {
    const next = new URLSearchParams(params);
    if (value) {
      next.set('unread', '1');
    } else {
      next.delete('unread');
    }
    applyFilters(next);
  };

  /**
   * Categories are additive: ticking Deletions as well as Uploads widens the list rather than
   * replacing it, which is what somebody unsure which of the two they are looking for wants.
   */
  const toggleCategory = (id: string) => {
    const chosen = new Set(selected);
    if (!chosen.delete(id)) chosen.add(id);

    const next = new URLSearchParams(params);
    next.delete('category');
    chosen.forEach((value) => next.append('category', value));
    applyFilters(next);
  };

  const clearFilters = () => {
    const next = new URLSearchParams(params);
    next.delete('category');
    next.delete('unread');
    applyFilters(next);
  };

  /** Both the list and the bell's count are stale after any change here. */
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });

  const markRead = useMutation({
    mutationFn: (notification: Notification) => markNotificationRead(notification.id),
    onSuccess: () => void refresh(),
  });

  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => void refresh(),
  });

  /**
   * The sender gets no notification of their own message — they wrote it — so the count coming back
   * is the only confirmation that it went anywhere. It is kept on screen until they type again.
   */
  const announce = useMutation({
    mutationFn: () => sendAnnouncement(message.trim()),
    onSuccess: (recipients) => {
      setSent(recipients);
      setMessage('');
      void refresh();
    },
  });

  const activeFilters = selected.length + (unreadOnly ? 1 : 0);
  const items = notifications.data?.items ?? [];
  const unreadShowing = items.filter((item) => !item.read).length;
  const error = notifications.error ?? markRead.error ?? markAll.error ?? announce.error;

  const MAX_MESSAGE = 500;
  const trimmed = message.trim();
  const remaining = MAX_MESSAGE - message.length;
  const canSend = trimmed.length > 0 && message.length <= MAX_MESSAGE && !announce.isPending;

  /**
   * Opening a notification marks it read and follows it to its subject, if it has one. Doing both
   * from one click is the point — a notification you have acted on should not still be waiting.
   */
  const open = (notification: Notification) => {
    if (!notification.read) markRead.mutate(notification);

    const destination = notificationLink(notification.entityRef, user?.role === 'ADMIN');
    if (destination) navigate(destination);
  };

  return (
    <AppShell
      title="Notifications"
      subtitle={
        isAdmin
          ? 'What the office has told you, and anything you need to tell the office'
          : 'What the office has told you'
      }
      actions={
        unreadShowing > 0 ? (
          <Button variant="secondary" loading={markAll.isPending} onClick={() => markAll.mutate()}>
            Mark all as read
          </Button>
        ) : undefined
      }
    >
      {/*
        Sending sits above the list rather than behind a button: telling the office something is a
        thing an admin comes to this screen to do, and a composer they have to go looking for is a
        feature nobody uses. A member sees the list alone.
      */}
      {isAdmin && (
        <section className="mb-6 rounded-xl border border-line bg-surface shadow-card">
          <div className="border-b border-line bg-surface-sunken px-5 py-3">
            <h2 className="font-semibold text-slate-900">Tell everyone</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Everyone with an account is notified, and your name is on it.
            </p>
          </div>

          <div className="space-y-3 p-5">
            <label htmlFor="announcement" className="sr-only">
              Message to everyone
            </label>
            <textarea
              id="announcement"
              value={message}
              onChange={(event) => {
                setMessage(event.target.value);
                // The previous confirmation belongs to the previous message.
                if (sent !== null) setSent(null);
              }}
              rows={3}
              maxLength={MAX_MESSAGE}
              placeholder="The office will be closed on Friday for the audit."
              className={`${controlClass} resize-y`}
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Only worth saying as the limit gets close; a counter at 500 remaining is noise. */}
              <span className={`text-xs ${remaining <= 50 ? 'text-amber-700' : 'text-slate-500'}`}>
                {remaining <= 50 ? `${remaining} characters left` : 'Up to 500 characters'}
              </span>
              <Button loading={announce.isPending} disabled={!canSend} onClick={() => announce.mutate()}>
                Send to everyone
              </Button>
            </div>

            {sent !== null && (
              <Alert tone="success">
                {sent === 0
                  ? 'Sent — though nobody else has an active account yet.'
                  : `Sent to ${sent} ${sent === 1 ? 'person' : 'people'}.`}
              </Alert>
            )}
          </div>
        </section>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="inline-flex flex-wrap gap-1 rounded-lg bg-surface-sunken p-1 ring-1 ring-line">
          {[
            { value: false, label: 'All' },
            { value: true, label: 'Unread' },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => setUnreadOnly(option.value)}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors
                duration-[--duration-base] ease-[--ease-settle] ${
                  unreadOnly === option.value
                    ? 'bg-brand text-on-brand shadow-card'
                    : 'text-slate-600 hover:bg-navy-50/70 hover:text-navy-700'
                }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/*
          Behind a button rather than always open: most visits are a glance at what is new, and a
          row of categories above every one of those is furniture. The button carries the count of
          what is on, so a filtered list is never a mystery once the panel is shut again.
        */}
        <button
          type="button"
          aria-expanded={filtersOpen}
          aria-controls="notification-filters"
          onClick={() => setFiltersOpen((open) => !open)}
          className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm
            font-semibold transition-all duration-[--duration-base] ease-[--ease-settle]
            hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2
            focus-visible:ring-navy-300 ${
              filtersOpen || activeFilters > 0
                ? 'border-navy-300 bg-navy-50 text-navy-700 shadow-card'
                : 'border-line bg-surface text-slate-600 hover:border-navy-300 hover:text-navy-700'
            }`}
        >
          <FunnelIcon />
          Filter
          {activeFilters > 0 && (
            <span
              className="rounded-full bg-brand px-1.5 py-0.5 text-[11px] font-bold leading-none
                text-on-brand"
            >
              {activeFilters}
            </span>
          )}
          <ChevronIcon open={filtersOpen} />
        </button>

        {activeFilters > 0 && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-sm font-semibold text-slate-500 underline-offset-2 transition-colors
              hover:text-navy-700 hover:underline"
          >
            Clear filters
          </button>
        )}

        {notifications.isSuccess && (
          <span className="ml-auto text-sm text-slate-500" role="status">
            {notifications.data.totalItems === 0
              ? 'Nothing to show'
              : `${notifications.data.totalItems} notification${
                  notifications.data.totalItems === 1 ? '' : 's'
                }`}
          </span>
        )}
      </div>

      {filtersOpen && (
        <div
          id="notification-filters"
          className="animate-rise mb-5 rounded-xl border border-line bg-surface p-4 shadow-card"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Show only</p>

          <div className="mt-3 flex flex-wrap gap-2">
            {categories.isPending
              ? null
              : (categories.data ?? []).map((category) => (
                  <CategoryChip
                    key={category.id}
                    category={category}
                    active={selected.includes(category.id)}
                    onToggle={() => toggleCategory(category.id)}
                  />
                ))}
          </div>

          <p className="mt-3 text-xs text-slate-500">
            {selected.length === 0
              ? 'Nothing ticked shows everything you have been sent.'
              : 'Ticking a second category widens the list rather than narrowing it.'}
          </p>
        </div>
      )}

      {error && <Alert tone="error">{toApiError(error).message}</Alert>}

      {notifications.isPending ? (
        <SkeletonRows count={4} label="Loading notifications" />
      ) : items.length === 0 ? (
        <EmptyState unreadOnly={unreadOnly} filtered={selected.length > 0} />
      ) : (
        <ul className="stagger space-y-2">
          {items.map((notification) => (
            <li key={notification.id}>
              <NotificationRow notification={notification} onOpen={() => open(notification)} />
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

/**
 * One notification.
 *
 * <p>A button rather than a link even when it has a destination: opening it also marks it read, so
 * the click is an action with a navigation attached rather than plain navigation.
 */
function NotificationRow({
  notification,
  onOpen,
}: {
  notification: Notification;
  onOpen: () => void;
}) {
  const { chip, edge } = tone(toneFor(notification.type));

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group relative flex w-full gap-4 overflow-hidden rounded-xl border border-line
        bg-surface p-4 text-left shadow-card outline-none transition-all duration-[--duration-base]
        ease-[--ease-settle] hover:-translate-y-0.5 hover:border-navy-300 hover:shadow-lifted
        focus-visible:ring-2 focus-visible:ring-navy-300 ${notification.read ? 'opacity-75' : ''}`}
    >
      {/* Unread carries a coloured edge as well as the dot, so the state survives a greyscale print
          and does not depend on noticing one small circle. */}
      {!notification.read && <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${edge}`} />}

      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${chip}`}>
        <Glyph type={notification.type} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className={`text-sm ${notification.read ? 'font-medium' : 'font-semibold'} text-slate-900`}>
            {notification.title}
          </span>
          {!notification.read && (
            <span className="rounded-full bg-navy-50 px-2 py-0.5 text-[11px] font-semibold text-navy-700">
              New
            </span>
          )}
        </span>
        {notification.body && (
          // `whitespace-pre-line`, because a duplicate report is written as a sentence and then the
          // two locations on their own lines, and collapsing that runs them into one paragraph. The
          // bodies that carry no line breaks are unaffected.
          <span className="mt-0.5 block whitespace-pre-line text-sm text-slate-600">
            {notification.body}
          </span>
        )}
        <span className="mt-1 block text-xs text-slate-400">
          {formatDateTime(notification.createdAt)}
        </span>
      </span>
    </button>
  );
}

function EmptyState({ unreadOnly, filtered }: { unreadOnly: boolean; filtered: boolean }) {
  return (
    <div
      className="animate-rise flex flex-col items-center rounded-xl border border-dashed
        border-line-strong bg-surface px-6 py-12 text-center"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-10 w-10 text-slate-300"
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      <p className="mt-3 text-sm text-slate-500">
        {filtered
          ? 'Nothing matches these filters. Try removing one.'
          : unreadOnly
            ? 'Nothing unread. You are up to date.'
            : 'No notifications yet.'}
      </p>
    </div>
  );
}

/**
 * One category, ticked or not.
 *
 * <p>A chip rather than a checkbox, and coloured with the same tone its notifications carry in the
 * list — the eye learns "deletions are rose" once and the filter reads as the list's own language.
 * `aria-pressed` is what tells a screen reader it is a toggle; the colour is never the only signal,
 * since a ticked chip also carries the mark.
 */
function CategoryChip({
  category,
  active,
  onToggle,
}: {
  category: NotificationCategoryOption;
  active: boolean;
  onToggle: () => void;
}) {
  const { chip, text } = tone(categoryTone(category.id));

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold
        transition-all duration-[--duration-base] ease-[--ease-settle] hover:-translate-y-px
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-300 ${
          active
            ? `${chip} shadow-card`
            : 'bg-surface-sunken text-slate-600 ring-1 ring-inset ring-line hover:text-navy-700'
        }`}
    >
      <span aria-hidden className={`inline-flex h-3.5 w-3.5 items-center justify-center ${text}`}>
        {active ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="m20 6-11 11-5-5" />
          </svg>
        ) : (
          <span className="h-2 w-2 rounded-full bg-current opacity-40" />
        )}
      </span>
      {category.label}
    </button>
  );
}

/**
 * A category takes the tone of the notifications inside it, so the filter and the list agree.
 * Keyed on the id the server sends; anything it does not know about falls back to neutral rather
 * than to a colour that would mean something else.
 */
function categoryTone(id: string): ToneName {
  const tones: Record<string, ToneName> = {
    uploads: 'navy',
    // Not an error and not a loss -- something filed twice, waiting for somebody to decide which
    // copy stays. Amber is the colour the rest of the app gives that.
    duplicates: 'amber',
    deletions: 'rose',
    restores: 'emerald',
    announcements: 'sky',
    registrations: 'gold',
    account: 'violet',
  };
  return tones[id] ?? 'slate';
}

function FunnelIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M3 5h18l-7 8v5.5l-4 2V13Z" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-3.5 w-3.5 transition-transform duration-[--duration-base]
        ease-[--ease-settle] ${open ? 'rotate-180' : ''}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/**
 * Colour by what happened, borrowed from the shared palette rather than chosen here: a rejection and
 * a deletion read as the same kind of event wherever they appear.
 */
function toneFor(type: string): ToneName {
  if (type.includes('rejected') || type.includes('deleted') || type.includes('disabled')) return 'rose';
  if (type.includes('approved') || type.includes('restored')) return 'emerald';
  if (type.includes('submitted')) return 'gold';
  if (type.includes('duplicate')) return 'amber';
  // A person speaking, rather than the system reporting — worth its own colour among the rest.
  if (type === 'announcement') return 'sky';
  return 'navy';
}

function Glyph({ type }: { type: string }) {
  const paths =
    type === 'announcement'
      ? // A speech bubble: somebody said this, as against the system reporting it.
        ['M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.3-.6L3 21l1.9-4.9A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z']
      : type.includes('duplicate')
        ? // One page behind another: the same document in the system twice.
          [
            'M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z',
            'M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2',
          ]
        : type.includes('file') || type.includes('deleted') || type.includes('restored')
          ? ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z', 'M14 2v6h6']
          : ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z'];

  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4.5 w-4.5"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
