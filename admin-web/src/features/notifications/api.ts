import { api } from '@/lib/api';
import type { Notification, NotificationCategoryOption, PageResponse } from '@/types/api';

/**
 * The caller's own notifications. There is no endpoint for anybody else's — an admin who wants to
 * know what a member was told reads the audit log, which records what happened rather than copying
 * someone's inbox.
 */

export async function fetchNotifications(
  unreadOnly: boolean,
  categories: string[] = [],
  page = 0,
): Promise<PageResponse<Notification>> {
  /*
   * Built by hand rather than handed to axios as an array: axios would serialise one as
   * `category[]=uploads`, and Spring binds a repeated `category=uploads&category=deletions`.
   * The filter is applied in the database, not to the page that comes back — filtering here
   * would only ever search the twenty rows already on screen.
   */
  const params = new URLSearchParams();
  params.set('unread', String(unreadOnly));
  params.set('page', String(page));
  categories.forEach((category) => params.append('category', category));

  const { data } = await api.get<PageResponse<Notification>>('/notifications', { params });
  return data;
}

/**
 * The filter options for whoever is signed in.
 *
 * <p>Asked of the server rather than listed in this file, so the categories and the notification
 * types they cover are defined once. It is also what keeps the options honest per role: a member
 * is never offered "Registration requests", which only administrators are ever sent.
 */
export async function fetchNotificationCategories(): Promise<NotificationCategoryOption[]> {
  const { data } = await api.get<NotificationCategoryOption[]>('/notifications/categories');
  return data;
}

/**
 * Just the badge number.
 *
 * <p>Separate from the list because the bell asks on every screen while the list is opened
 * occasionally — one count is a far cheaper question than a page of rows.
 */
export async function fetchUnreadCount(): Promise<number> {
  const { data } = await api.get<{ unread: number }>('/notifications/unread-count');
  return data.unread;
}

export async function markNotificationRead(id: string): Promise<Notification> {
  const { data } = await api.post<Notification>(`/notifications/${id}/read`);
  return data;
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.post('/notifications/read-all');
}

/**
 * Sends a message to everyone else with an account.
 *
 * @returns how many people were told — the client has no way of knowing how many accounts are
 *   active, and "sent to 42 people" is what tells the sender it actually went somewhere
 */
export async function sendAnnouncement(message: string): Promise<number> {
  const { data } = await api.post<{ recipients: number }>('/notifications/announcements', { message });
  return data.recipients;
}

/**
 * Turns the server's `entityRef` into a route.
 *
 * <p>The server writes `"file:{uuid}"`, `"folder:{uuid}"` and `"user:{uuid}"` and deliberately stops
 * there, so the mapping from a subject to a URL lives here — where the routes are actually defined.
 * An unrecognised kind yields no link rather than a broken one.
 *
 * <p>`user:` is the one that depends on who is reading. To an admin it means the account in the
 * members list; to everyone else it means their own account. Sending every reader to
 * `/admin/members` is what put a newly approved member on the Access Restricted screen the moment
 * they opened the notification telling them they had been approved — the route guard did exactly
 * its job, on a link that should never have pointed there.
 */
export function notificationLink(entityRef: string | null, isAdmin = false): string | null {
  if (!entityRef) return null;

  const [kind, id] = entityRef.split(':');
  if (kind === 'file' && id) return `/files/${id}`;
  if (kind === 'folder' && id) return `/folders/${id}`;
  // A deleted folder has nowhere of its own left to open — its department still does.
  if (kind === 'department' && id) return `/departments/${id}`;
  if (kind === 'user' && id) return isAdmin ? '/admin/members' : '/profile';
  return null;
}
