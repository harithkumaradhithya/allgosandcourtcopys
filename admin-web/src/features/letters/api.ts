import { api } from '@/lib/api';
import type {
  Letter,
  LetterLanguage,
  LetterStatus,
  LetterSummary,
  LetterTemplate,
  PageResponse,
} from '@/types/api';

/** What a letter carries when it is saved. Everything the print view needs, and nothing else. */
export interface LetterDraft {
  templateId: string | null;
  /** English or Tamil. Decides the headings the sheet prints, so it is saved with the letter. */
  language: LetterLanguage;
  referenceNo: string;
  letterDate: string;
  fromBlock: string;
  toBlock: string;
  salutation: string;
  subject: string;
  reference: string;
  body: string;
  enclosure: string;
  copyTo: string;
  signOff: string;
}

/** The templates on offer. Retired ones are not among them. */
export async function fetchTemplates(): Promise<LetterTemplate[]> {
  const { data } = await api.get<LetterTemplate[]>('/letters/templates');
  return data;
}

/** Finished letters unless drafts are asked for. The two are listed apart, never mixed. */
export async function fetchMyLetters(
  status: LetterStatus = 'FINAL',
  page = 0,
): Promise<PageResponse<LetterSummary>> {
  const { data } = await api.get<PageResponse<LetterSummary>>('/letters', {
    params: { status, page },
  });
  return data;
}

export async function fetchLetter(id: string): Promise<Letter> {
  const { data } = await api.get<Letter>(`/letters/${id}`);
  return data;
}

export async function createLetter(draft: LetterDraft): Promise<Letter> {
  const { data } = await api.post<Letter>('/letters', draft);
  return data;
}

export async function updateLetter(id: string, draft: LetterDraft): Promise<Letter> {
  const { data } = await api.put<Letter>(`/letters/${id}`, draft);
  return data;
}

export async function deleteLetter(id: string): Promise<void> {
  await api.delete(`/letters/${id}`);
}

// ---------------------------------------------------------------------- drafts

/**
 * Autosave, while somebody is still writing.
 *
 * <p>A separate endpoint from saving a letter because it accepts one that is not finished: half a
 * letter is exactly what an autosave has to be able to keep, and the requirements a finished letter
 * carries are what it cannot enforce. Nothing here is audited, and nothing notifies anybody.
 */
export async function createDraft(draft: LetterDraft): Promise<Letter> {
  const { data } = await api.post<Letter>('/letters/drafts', draft);
  return data;
}

export async function updateDraft(id: string, draft: LetterDraft): Promise<Letter> {
  const { data } = await api.put<Letter>(`/letters/drafts/${id}`, draft);
  return data;
}

/** Throws a draft away. A letter that has already been saved is deleted instead. */
export async function discardDraft(id: string): Promise<void> {
  await api.delete(`/letters/drafts/${id}`);
}

// ------------------------------------------------------------------ templates, for admins

/** Includes retired templates, which is the only place they can be seen and brought back. */
export async function fetchAllTemplates(): Promise<LetterTemplate[]> {
  const { data } = await api.get<LetterTemplate[]>('/admin/letter-templates');
  return data;
}

export interface TemplateDraft {
  name: string;
  description: string;
  defaultSubject: string;
  body: string;
  salutation: string;
  /** Which language's chooser it appears in, and which language the letter starts in. */
  language: LetterLanguage;
  active: boolean;
}

export async function createTemplate(draft: TemplateDraft): Promise<LetterTemplate> {
  const { data } = await api.post<LetterTemplate>('/admin/letter-templates', draft);
  return data;
}

export async function updateTemplate(id: string, draft: TemplateDraft): Promise<LetterTemplate> {
  const { data } = await api.put<LetterTemplate>(`/admin/letter-templates/${id}`, draft);
  return data;
}

/**
 * Removes a template nothing has been written from; retires one that has.
 *
 * @returns whether it was removed outright, so the screen can say which happened rather than
 *   claiming a deletion that did not occur
 */
export async function deleteTemplate(id: string): Promise<boolean> {
  const { data } = await api.delete<{ removed: boolean }>(`/admin/letter-templates/${id}`);
  return data.removed;
}
