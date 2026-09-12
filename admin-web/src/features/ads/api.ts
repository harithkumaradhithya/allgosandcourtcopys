import { api } from '@/lib/api';
import type { Ad, AdminAd, AdPlacement } from '@/types/api';

export async function fetchAds(placement: AdPlacement): Promise<Ad[]> {
  const { data } = await api.get<Ad[]>('/ads', { params: { placement } });
  return data;
}

/**
 * The two counters.
 *
 * <p>Both swallow their own failures. A slot that could not record a view must still draw, and a
 * click must open its popup whether or not the count reached the server — an advert is the last
 * thing in this application that should be allowed to put an error in front of somebody.
 */
export function recordAdView(id: string): void {
  void api.post(`/ads/${id}/view`).catch(() => {});
}

export function recordAdClick(id: string): void {
  void api.post(`/ads/${id}/click`).catch(() => {});
}

/* ----------------------------------------------------------------------------- admin */

export async function fetchAllAds(): Promise<AdminAd[]> {
  const { data } = await api.get<AdminAd[]>('/admin/ads');
  return data;
}

/** Everything about an advert except its media, which travels beside this as a file. */
export interface SaveAdPayload {
  title: string;
  placement: AdPlacement;
  altText: string;
  headline?: string | null;
  caption?: string | null;
  detailTitle: string;
  detailBody: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  autoplay: boolean;
  loopMedia: boolean;
  dismissible: boolean;
  active: boolean;
  /** ISO instants, or null for "from now" and "until switched off". */
  startsAt?: string | null;
  endsAt?: string | null;
  displayOrder: number;
}

/**
 * The wording as a JSON part, the file as a file part.
 *
 * <p>A `Blob` with an explicit `application/json` type rather than a plain string: without the
 * type the browser sends the part as `text/plain`, and the server — which is binding it to a
 * validated record — refuses it with a 415 that says nothing useful about what went wrong.
 */
function toFormData(payload: SaveAdPayload, media: File | null): FormData {
  const form = new FormData();
  form.append('ad', new Blob([JSON.stringify(payload)], { type: 'application/json' }));
  if (media) {
    form.append('media', media);
  }
  return form;
}

export async function createAd(payload: SaveAdPayload, media: File): Promise<AdminAd> {
  const { data } = await api.post<AdminAd>('/admin/ads', toFormData(payload, media));
  return data;
}

/** `media` is optional here: most edits are a correction to the wording, not a new picture. */
export async function updateAd(
  id: string,
  payload: SaveAdPayload,
  media: File | null,
): Promise<AdminAd> {
  const { data } = await api.put<AdminAd>(`/admin/ads/${id}`, toFormData(payload, media));
  return data;
}

export async function deleteAd(id: string): Promise<void> {
  await api.delete(`/admin/ads/${id}`);
}
