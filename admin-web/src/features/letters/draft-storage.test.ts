import { beforeEach, describe, expect, it } from 'vitest';
import type { LetterDraft } from '@/features/letters/api';
import {
  NEW_LETTER,
  clearLocalDraft,
  differs,
  hasContent,
  isAheadOf,
  readLocalDraft,
  writeLocalDraft,
} from '@/features/letters/draft-storage';

const AUTHOR = 'user-1';
const SOMEBODY_ELSE = 'user-2';

const BLANK: LetterDraft = {
  language: 'EN',
  format: 'LETTER',
  goType: null,
  referenceNo: '',
  letterDate: '',
  fromBlock: '',
  officeBlock: '',
  toBlock: '',
  salutation: '',
  subject: '',
  reference: '',
  body: '',
  enclosure: '',
  copyTo: '',
  signOff: '',
  tableData: '',
};

const HALF_WRITTEN: LetterDraft = {
  ...BLANK,
  fromBlock: 'Meena Rajan,\nSection Officer',
  toBlock: '1. The Commissioner of MBC & DNC, Ch-5.',
  subject: 'Convening of Purchase Committee Meeting',
};

describe('the copy kept on this machine', () => {
  beforeEach(() => window.localStorage.clear());

  it('gives back the letter that was kept', () => {
    writeLocalDraft(AUTHOR, NEW_LETTER, { draft: HALF_WRITTEN, draftId: null });

    const recovered = readLocalDraft(AUTHOR, NEW_LETTER);
    expect(recovered?.draft.subject).toBe('Convening of Purchase Committee Meeting');
    expect(recovered?.savedAt).toBeTruthy();
  });

  /*
   * A section office has one computer and several people on it. Offering somebody the unfinished
   * letter the last person left open would be a leak, not a convenience.
   */
  it('is not offered to whoever signs in next', () => {
    writeLocalDraft(AUTHOR, NEW_LETTER, { draft: HALF_WRITTEN, draftId: null });

    expect(readLocalDraft(SOMEBODY_ELSE, NEW_LETTER)).toBeNull();
  });

  it('remembers which server-side draft it was going into', () => {
    writeLocalDraft(AUTHOR, NEW_LETTER, { draft: HALF_WRITTEN, draftId: 'draft-9' });

    expect(readLocalDraft(AUTHOR, NEW_LETTER)?.draftId).toBe('draft-9');
  });

  it('is gone once it has been thrown away', () => {
    writeLocalDraft(AUTHOR, NEW_LETTER, { draft: HALF_WRITTEN, draftId: null });
    clearLocalDraft(AUTHOR, NEW_LETTER);

    expect(readLocalDraft(AUTHOR, NEW_LETTER)).toBeNull();
  });

  /*
   * Something else wrote to the key, or an older version of this screen did. Ignored rather than
   * repaired: a letter assembled out of a half-understood object is worse than no letter at all.
   */
  it('ignores anything it cannot make sense of', () => {
    window.localStorage.setItem(`allgos.letter-draft.${AUTHOR}.${NEW_LETTER}`, 'not json');
    expect(readLocalDraft(AUTHOR, NEW_LETTER)).toBeNull();

    window.localStorage.setItem(`allgos.letter-draft.${AUTHOR}.${NEW_LETTER}`, '{"savedAt":"now"}');
    expect(readLocalDraft(AUTHOR, NEW_LETTER)).toBeNull();
  });
});

describe('whether the local copy is the newer one', () => {
  const snapshot = (savedAt: string) => ({ draft: HALF_WRITTEN, draftId: null, savedAt });

  it('is, when the server has never seen the letter at all', () => {
    expect(isAheadOf(snapshot('2026-08-30T10:00:00Z'), null)).toBe(true);
  });

  it('is, when it was kept well after the server was last written to', () => {
    expect(isAheadOf(snapshot('2026-08-30T10:05:00Z'), '2026-08-30T10:00:00Z')).toBe(true);
  });

  it('is not, when the server already has it', () => {
    expect(isAheadOf(snapshot('2026-08-30T10:00:00Z'), '2026-08-30T10:05:00Z')).toBe(false);
  });

  /*
   * Two clocks that do not agree to the second. Without the margin, saving a letter and reloading
   * it would offer to recover the change that had just been saved.
   */
  it('is not, for the second or two the two clocks disagree by', () => {
    expect(isAheadOf(snapshot('2026-08-30T10:00:02Z'), '2026-08-30T10:00:00Z')).toBe(false);
  });
});

describe('whether there is anything worth keeping', () => {
  it('says no to a form nobody has typed into', () => {
    expect(hasContent(BLANK)).toBe(false);
  });

  /*
   * The From block and the signature are seeded from the account, and the date from today. A letter
   * that has only those has not been written — and a drafts list full of them would be useless.
   */
  it('says no to a letter that is only what the screen filled in', () => {
    expect(
      hasContent({
        ...BLANK,
        fromBlock: 'Meena Rajan,\nSection Officer',
        letterDate: '2026-08-30',
        signOff: 'Meena Rajan',
      }),
    ).toBe(false);
  });

  it('says yes once there is a subject, a body or a recipient', () => {
    expect(hasContent({ ...BLANK, subject: 'Purchase Committee' })).toBe(true);
    expect(hasContent({ ...BLANK, body: 'Kind attention is invited.' })).toBe(true);
    expect(hasContent({ ...BLANK, toBlock: 'The Commissioner' })).toBe(true);
  });
});

describe('whether two versions differ', () => {
  it('sees a change in any block, including the language', () => {
    expect(differs(HALF_WRITTEN, { ...HALF_WRITTEN, body: 'a line' })).toBe(true);
    expect(differs(HALF_WRITTEN, { ...HALF_WRITTEN, language: 'TA' })).toBe(true);
  });

  it('sees no change in an identical copy, so nothing is sent on a timer for nothing', () => {
    expect(differs(HALF_WRITTEN, { ...HALF_WRITTEN })).toBe(false);
  });
});
