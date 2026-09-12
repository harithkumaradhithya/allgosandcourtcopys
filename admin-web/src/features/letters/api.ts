import { api } from '@/lib/api';
import type {
  Letter,
  LetterFormat,
  LetterGoType,
  LetterLanguage,
  LetterStatus,
  LetterSummary,
  PageResponse,
} from '@/types/api';

/** What a letter carries when it is saved. Everything the print view needs, and nothing else. */
export interface LetterDraft {
  /** English or Tamil. Decides the headings the sheet prints, so it is saved with the letter. */
  language: LetterLanguage;
  /** The office letter shape, the shorter third-person memo, or a Government Order. */
  format: LetterFormat;
  /** Which classification a G.O. is issued under. Meaningless outside a G.O., where it is null. */
  goType: LetterGoType | null;
  referenceNo: string;
  letterDate: string;
  fromBlock: string;
  /** The office's own name, place, phone and e-mail. Meaningless outside a D.O. letter. */
  officeBlock: string;
  toBlock: string;
  salutation: string;
  subject: string;
  reference: string;
  body: string;
  enclosure: string;
  copyTo: string;
  signOff: string;
  /** A table dropped into the body, JSON-encoded as rows of cells. Empty when there is none. */
  tableData: string;
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
