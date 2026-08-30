import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { DictationField } from '@/components/ui/DictationField';
import { TextField } from '@/components/ui/Field';
import { LetterSheet, type LetterField } from '@/features/letters/LetterSheet';
import { createLetter, fetchLetter, updateLetter, type LetterDraft } from '@/features/letters/api';
import {
  NEW_LETTER,
  clearLocalDraft,
  hasContent,
  isAheadOf,
  readLocalDraft,
  type LocalDraft,
} from '@/features/letters/draft-storage';
import { defaultFromBlock, todayIso } from '@/features/letters/format';
import { DICTATION_FOR, LETTER_LANGUAGES, LETTER_TEXT, letterText } from '@/features/letters/language';
import { useLetterAutosave, type AutosaveState } from '@/features/letters/useAutosave';
import { useAuth } from '@/lib/auth-context';
import { useDictationLanguage } from '@/lib/dictation';
import { toApiError } from '@/lib/errors';
import { formatTime } from '@/lib/format';
import type { Letter, LetterLanguage } from '@/types/api';

const EMPTY: LetterDraft = {
  language: 'EN',
  referenceNo: '',
  letterDate: '',
  fromBlock: '',
  toBlock: '',
  salutation: '',
  subject: '',
  reference: '',
  body: '',
  enclosure: '',
  copyTo: '',
  signOff: '',
};

/**
 * Writing a letter: the form on one side, the letter itself on the other.
 *
 * <p>The preview is the same component that prints, drawn from the same draft the form is editing,
 * so what somebody approves on screen is exactly what comes out of the printer. A separate print
 * rendering would be a second thing to keep in step, and the first time it drifted nobody would
 * notice until a letter had already gone out. It is also editable: the same draft can be typed into
 * from either side, which is what makes fixing a word in the middle of a paragraph a matter of
 * clicking on the word.
 *
 * <p>Serves both a new letter and an existing one. Which it is depends on the route: `/letters/new`
 * starts from the author's own details, `/letters/:id` loads what was saved — and a saved letter
 * that is still a draft opens here exactly as it was left.
 *
 * <p><b>Nothing being written here is at the mercy of the network.</b> Every change is kept on this
 * machine within a moment and sent up as a draft shortly after; a server that is down or a
 * connection that drops costs the writer nothing and says so on the screen rather than pretending.
 */
export function LetterEditorPage() {
  const { letterId } = useParams<{ letterId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const isNew = letterId === undefined;
  const requestedLanguage = asLanguage(searchParams.get('lang'));

  /**
   * Only what the writer has actually changed; everything else is derived below. Keeping the whole
   * draft in state would mean copying the saved letter into it, which is the copy
   * an effect then has to keep in step.
   */
  const [edited, setEdited] = useState<LetterDraft | null>(null);
  const [saved, setSaved] = useState(false);
  /** Set once the writer has answered the offer below, either way. */
  const [answered, setAnswered] = useState(false);

  const existing = useQuery({
    queryKey: ['letters', letterId],
    queryFn: () => fetchLetter(letterId!),
    enabled: !isNew,
  });

  /**
   * Where a letter starts before anybody types: a saved one is itself, and a new one is the author's
   * own details in the From block, today's date, and the salutation its language opens with.
   *
   * <p>Derived rather than copied into state. Copying would need an effect to keep it in step with a
   * query that arrives whenever it arrives, and the effect that seeds a form is the one that
   * eventually overwrites something somebody typed.
   */
  const seeded: LetterDraft = useMemo(() => {
    const letter = existing.data;
    if (letter) {
      return {
        language: letter.language,
        referenceNo: letter.referenceNo ?? '',
        letterDate: letter.letterDate ?? '',
        fromBlock: letter.fromBlock,
        toBlock: letter.toBlock,
        salutation: letter.salutation ?? '',
        subject: letter.subject,
        reference: letter.reference ?? '',
        body: letter.body,
        enclosure: letter.enclosure ?? '',
        copyTo: letter.copyTo ?? '',
        signOff: letter.signOff ?? '',
      };
    }

    if (!isNew || !user) return EMPTY;

    const language = requestedLanguage ?? 'EN';

    return {
      ...EMPTY,
      language,
      letterDate: todayIso(),
      fromBlock: defaultFromBlock(user),
      salutation: LETTER_TEXT[language].defaultSalutation,
      signOff: [user.fullName, user.designation].filter(Boolean).join('\n'),
    };
  }, [existing.data, isNew, user, requestedLanguage]);

  /** What the form shows: the writer's edits if there are any, otherwise the seed. */
  const draft = edited ?? seeded;
  const text = letterText(draft.language);
  const labels = text.form;

  const ready = isNew ? user !== null : existing.isSuccess;

  /**
   * A copy on this machine that is newer than anything the server has — the letter somebody was
   * writing when the browser closed or the connection went.
   *
   * <p>Read once the letter it would be compared against has arrived, and only offered: silently
   * replacing what is on screen with something from last week would be its own kind of loss. For a
   * letter that was never saved there is nothing to compare against, and whatever was kept under
   * "new" is by definition the only copy of it there is.
   */
  const snapshot = useMemo(
    () => (ready && user ? readLocalDraft(user.id, letterId ?? NEW_LETTER) : null),
    [letterId, ready, user],
  );

  const recovered: LocalDraft | null =
    !answered &&
    snapshot &&
    hasContent(snapshot.draft) &&
    isAheadOf(snapshot, existing.data?.updatedAt ?? null)
      ? snapshot
      : null;

  const autosave = useLetterAutosave({
    userId: user?.id ?? null,
    letterId: letterId ?? null,
    draft,
    // Only once something has actually been changed. Opening a letter is not an edit, and a draft
    // saved for one would touch a letter nobody typed into and fill the drafts list with letters
    // nobody wrote.
    enabled: ready && edited !== null && recovered === null,
  });

  /** Dictation follows the letter: a Tamil letter is dictated in Tamil without being asked twice. */
  const [, setDictationLanguage] = useDictationLanguage();
  useEffect(() => {
    setDictationLanguage(DICTATION_FOR[draft.language]);
  }, [draft.language, setDictationLanguage]);

  const save = useMutation({
    mutationFn: () => {
      // A letter that has been autosaved already exists as a draft row; saving promotes that row
      // rather than writing a second copy of the same letter.
      const target = letterId ?? autosave.draftId;
      return target ? updateLetter(target, draft) : createLetter(draft);
    },
    onMutate: () => autosave.suspend(),
    onError: () => autosave.resume(),
    onSuccess: (letter) => {
      setSaved(true);
      autosave.settle(letter.id, draft);
      void queryClient.invalidateQueries({ queryKey: ['letters'] });
      if (letter.id !== letterId) navigate(`/letters/${letter.id}`, { replace: true });
    },
  });

  /**
   * One block of the letter changes.
   *
   * <p>Written as an update of whatever the draft is at the time rather than of the draft this
   * render happened to see. Two blocks can change before React draws again — a paste that fills
   * more than one, dictation landing in one while another is edited — and spreading the render's
   * copy twice would quietly keep only the second of them.
   */
  const set = (field: keyof LetterDraft) => (value: string) => {
    setEdited((current) => ({ ...(current ?? seeded), [field]: value }));
    setSaved(false);
  };

  /** Typing straight into the sheet is the same edit as typing into the field beside it. */
  const editInSheet = (field: LetterField, value: string) => set(field)(value);

  /**
   * Switching a letter between English and Tamil.
   *
   * <p>The headings change because the sheet draws them, and the salutation follows only while it is
   * still the one this screen supplied — a writer who typed their own is not overruled by a change
   * of language. What they wrote is never translated: this changes the letter's language, not its
   * words, and pretending otherwise would put machine Tamil into a signed document.
   */
  const switchLanguage = (language: LetterLanguage) => {
    if (language === draft.language) return;

    setEdited((current) => {
      const from = current ?? seeded;
      const stock = Object.values(LETTER_TEXT).some(
        (candidate) => candidate.defaultSalutation === from.salutation.trim(),
      );

      return {
        ...from,
        language,
        salutation:
          from.salutation.trim() === '' || stock
            ? LETTER_TEXT[language].defaultSalutation
            : from.salutation,
      };
    });
    setSaved(false);
  };

  const complete =
    draft.fromBlock.trim() && draft.toBlock.trim() && draft.subject.trim() && draft.body.trim();

  /** What the preview and the printer render: the draft as it stands, not the last saved copy. */
  const preview: Letter = {
    id: letterId ?? 'preview',
    language: draft.language,
    status: existing.data?.status ?? 'DRAFT',
    referenceNo: draft.referenceNo || null,
    letterDate: draft.letterDate || null,
    fromBlock: draft.fromBlock,
    toBlock: draft.toBlock,
    salutation: draft.salutation || null,
    subject: draft.subject,
    reference: draft.reference || null,
    body: draft.body,
    enclosure: draft.enclosure || null,
    copyTo: draft.copyTo || null,
    signOff: draft.signOff || null,
    createdAt: existing.data?.createdAt ?? '',
    updatedAt: existing.data?.updatedAt ?? '',
  };

  const isDraft = existing.data?.status === 'DRAFT' || (isNew && autosave.draftId !== null);
  const error = existing.error ?? save.error;

  return (
    <AppShell
      title={isNew ? 'New letter' : existing.data?.status === 'DRAFT' ? 'Draft letter' : 'Letter'}
      subtitle="Your details fill the From block; everything here can be edited before it prints — in the form, or straight on the letter"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <AutosaveBadge state={autosave.state} at={autosave.syncedAt} />
          <Button variant="secondary" onClick={() => navigate('/letters')}>
            Back
          </Button>
          {/* Printing is the browser's own dialogue, which is also where Save as PDF lives. Nothing
              is generated on the server, so what prints is exactly what is on screen. */}
          <Button variant="secondary" onClick={() => window.print()} disabled={!complete}>
            Print / Save as PDF
          </Button>
          <Button loading={save.isPending} disabled={!complete} onClick={() => save.mutate()}>
            {isNew || isDraft ? 'Save letter' : 'Save changes'}
          </Button>
        </div>
      }
    >
      {error && <Alert tone="error">{toApiError(error).message}</Alert>}
      {saved && <Alert tone="success">Saved. Print it now, or come back to it later.</Alert>}

      {recovered && (
        <Alert tone="info">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              An unfinished letter was kept on this computer at{' '}
              <strong>{formatTime(recovered.savedAt)}</strong>, newer than what was saved. It is
              still here.
            </span>
            <span className="flex shrink-0 gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setEdited(recovered.draft);
                  if (recovered.draftId) autosave.adopt(recovered.draftId);
                  setAnswered(true);
                }}
              >
                Carry on with it
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (user) clearLocalDraft(user.id, letterId ?? NEW_LETTER);
                  setAnswered(true);
                }}
              >
                Discard it
              </Button>
            </span>
          </div>
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] print:block">
        {/* The form is hidden when printing; only the sheet goes on the paper. */}
        <section data-testid="letter-form" className="space-y-4 print:hidden">
          <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
            <h2 className="font-semibold text-slate-900">Language</h2>
            <p className="mt-1 text-sm text-slate-500">
              An English letter prints English headings; a Tamil letter prints Tamil ones. What you
              write is never translated.
            </p>
            <div className="mt-3 flex gap-2" role="group" aria-label="Letter language">
              {LETTER_LANGUAGES.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  aria-pressed={draft.language === option.code}
                  onClick={() => switchLanguage(option.code)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold outline-none
                    transition-[background-color,color,box-shadow] duration-[--duration-quick]
                    focus-visible:ring-2 focus-visible:ring-navy-300 ${
                      draft.language === option.code
                        ? 'bg-navy-600 text-white'
                        : 'bg-surface-sunken text-slate-600 hover:bg-navy-50'
                    }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
            <h2 className="font-semibold text-slate-900">{labels.headingSection}</h2>
            <div className="mt-4 space-y-4">
              <TextField
                label={labels.referenceNo}
                value={draft.referenceNo}
                onChange={(event) => set('referenceNo')(event.target.value)}
                placeholder="DBC/52/2026-D3"
                hint={labels.referenceNoHint}
              />
              <TextField
                label={labels.date}
                type="date"
                value={draft.letterDate}
                onChange={(event) => set('letterDate')(event.target.value)}
              />
              <DictationField
                label={labels.from}
                rows={5}
                value={draft.fromBlock}
                onValueChange={set('fromBlock')}
                hint={labels.fromHint}
              />
              <DictationField
                label={labels.to}
                rows={6}
                value={draft.toBlock}
                onValueChange={set('toBlock')}
                placeholder={labels.toPlaceholder}
                hint={labels.toHint}
              />
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
            <h2 className="font-semibold text-slate-900">{labels.letterSection}</h2>
            <div className="mt-4 space-y-4">
              <TextField
                label={labels.salutation}
                value={draft.salutation}
                onChange={(event) => set('salutation')(event.target.value)}
                placeholder={text.defaultSalutation}
              />
              <DictationField
                label={labels.subject}
                rows={3}
                value={draft.subject}
                onValueChange={set('subject')}
                hint={labels.subjectHint}
              />
              <DictationField
                label={labels.reference}
                rows={2}
                value={draft.reference}
                onValueChange={set('reference')}
                hint={labels.referenceHint}
              />
              <DictationField
                label={labels.body}
                rows={12}
                value={draft.body}
                onValueChange={set('body')}
                hint={labels.bodyHint}
              />
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
            <h2 className="font-semibold text-slate-900">{labels.closingSection}</h2>
            <div className="mt-4 space-y-4">
              <DictationField
                label={labels.enclosure}
                singleLine
                value={draft.enclosure}
                onValueChange={set('enclosure')}
                placeholder={labels.enclosurePlaceholder}
              />
              <DictationField
                label={labels.signOff}
                rows={4}
                value={draft.signOff}
                onValueChange={set('signOff')}
                hint={labels.signOffHint}
              />
              <DictationField
                label={labels.copyTo}
                rows={4}
                value={draft.copyTo}
                onValueChange={set('copyTo')}
                hint={labels.copyToHint}
              />
            </div>
          </div>
        </section>

        <section data-testid="letter-preview" className="min-w-0 print:w-full">
          <p className="mb-3 text-xs uppercase tracking-wide text-slate-500 print:hidden">
            Preview — this is what prints, and you can type straight into it
          </p>
          <LetterSheet letter={preview} onEdit={editInSheet} />
        </section>
      </div>
    </AppShell>
  );
}

/**
 * Where the letter has got to, in one line.
 *
 * <p>It says which copies exist rather than a reassuring word that covers both cases. "Kept on this
 * computer" is the truth when the server cannot be reached, and it is the difference between a
 * writer who knows to stay on this machine and one who finds out tomorrow.
 */
function AutosaveBadge({ state, at }: { state: AutosaveState; at: Date | null }) {
  if (state === 'clean') return null;

  const wording: Record<Exclude<AutosaveState, 'clean'>, { text: string; tone: string }> = {
    pending: { text: 'Draft not saved yet', tone: 'text-slate-500' },
    saving: { text: 'Saving draft…', tone: 'text-slate-500' },
    saved: {
      text: at ? `Draft saved ${formatTime(at.toISOString())}` : 'Draft saved',
      tone: 'text-emerald-700',
    },
    local: { text: 'Kept on this computer — the server is unreachable', tone: 'text-amber-700' },
  };

  const { text, tone } = wording[state];

  return (
    <span
      role="status"
      aria-live="polite"
      className={`text-xs font-medium ${tone} print:hidden`}
      data-testid="autosave-state"
      data-state={state}
    >
      {text}
    </span>
  );
}

/** A `?lang=` that is not one of the two is simply not an answer, and the seed decides instead. */
function asLanguage(value: string | null): LetterLanguage | null {
  return value === 'EN' || value === 'TA' ? value : null;
}
