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
import {
  DICTATION_FOR,
  DO_HIERARCHIES,
  DO_SALUTATIONS,
  GO_TYPES,
  LETTER_FORMATS,
  LETTER_LANGUAGES,
  LETTER_TEXT,
  doText,
  goText,
  letterText,
  memoText,
  type DoHierarchy,
} from '@/features/letters/language';
import { useLetterAutosave, type AutosaveState } from '@/features/letters/useAutosave';
import { useAuth } from '@/lib/auth-context';
import { useDictationLanguage } from '@/lib/dictation';
import { toApiError } from '@/lib/errors';
import { formatTime } from '@/lib/format';
import type { Letter, LetterFormat, LetterGoType, LetterLanguage } from '@/types/api';

const EMPTY: LetterDraft = {
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
  const requestedFormat = asFormat(searchParams.get('format'));

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
        format: letter.format,
        goType: letter.goType,
        referenceNo: letter.referenceNo ?? '',
        letterDate: letter.letterDate ?? '',
        fromBlock: letter.fromBlock,
        officeBlock: letter.officeBlock ?? '',
        toBlock: letter.toBlock,
        salutation: letter.salutation ?? '',
        subject: letter.subject,
        reference: letter.reference ?? '',
        body: letter.body,
        enclosure: letter.enclosure ?? '',
        copyTo: letter.copyTo ?? '',
        signOff: letter.signOff ?? '',
        tableData: letter.tableData ?? '',
      };
    }

    if (!isNew || !user) return EMPTY;

    const language = requestedLanguage ?? 'EN';
    const format = requestedFormat ?? 'LETTER';

    return {
      ...EMPTY,
      language,
      format,
      // A G.O. defaults to the Ms classification, the commonest one, until its author says otherwise.
      goType: format === 'GO' ? 'MS' : null,
      letterDate: todayIso(),
      fromBlock: defaultFromBlock(user),
      // A D.O.'s office block is a shorter version of the same address the From block is seeded
      // from — just what identifies the office, not the writer's own name and post again.
      officeBlock: format === 'DO' ? (user.officeAddress ?? '') : '',
      // A memo or a G.O. has no salutation — both are written about the recipient, not to them. A
      // D.O.'s salutation depends on who it is going to, which nothing here knows yet — the
      // hierarchy picker in its own form section fills this in once the writer says.
      salutation:
        format === 'MEMO' || format === 'GO' || format === 'DO'
          ? ''
          : LETTER_TEXT[language].defaultSalutation,
      signOff: [user.fullName, user.designation].filter(Boolean).join('\n'),
    };
  }, [existing.data, isNew, user, requestedLanguage, requestedFormat]);

  /** What the form shows: the writer's edits if there are any, otherwise the seed. */
  const draft = edited ?? seeded;
  const isMemo = draft.format === 'MEMO';
  const isGo = draft.format === 'GO';
  const isDo = draft.format === 'DO';
  const text = letterText(draft.language);
  const labels = text.form;
  const memo = memoText(draft.language);
  const go = goText(draft.language);
  const doLetter = doText(draft.language);

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

      // A memo or a G.O. carries no salutation to begin with, so there is nothing here to follow it.
      if (from.format === 'MEMO' || from.format === 'GO') return { ...from, language };

      // A D.O.'s salutation follows its own stock phrases (by hierarchy), not a letter's single
      // default — the same idea as below, applied to the four the hierarchy picker offers.
      if (from.format === 'DO') {
        const stockEntry = (Object.entries(DO_SALUTATIONS[from.language]) as [DoHierarchy, string][]).find(
          ([, phrase]) => phrase === from.salutation.trim(),
        );
        return {
          ...from,
          language,
          salutation: stockEntry ? DO_SALUTATIONS[language][stockEntry[0]] : from.salutation,
        };
      }

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

  /**
   * Switching a letter between the office letter shape, a memo and a Government Order.
   *
   * <p>Nothing typed is thrown away: the same blocks (office/department, recipient, subject/abstract,
   * reference/read, body, signing officer) mean something in all three shapes, so switching back and
   * forth loses nothing but a salutation neither a memo nor a G.O. prints in the first place. A G.O.
   * type is seeded to Ms the first time a letter becomes one, so the picker never opens on nothing
   * selected, but a type chosen earlier is remembered if the writer switches away and back.
   */
  const switchFormat = (format: LetterFormat) => {
    if (format === draft.format) return;
    setEdited((current) => {
      const from = current ?? seeded;
      return { ...from, format, goType: format === 'GO' ? (from.goType ?? 'MS') : from.goType };
    });
    setSaved(false);
  };

  const setGoType = (goType: LetterGoType) => {
    if (goType === draft.goType) return;
    setEdited((current) => ({ ...(current ?? seeded), goType }));
    setSaved(false);
  };

  /** Filling in a starting salutation for who the D.O. is going to — freely edited afterwards. */
  const setDoHierarchy = (hierarchy: DoHierarchy) => {
    set('salutation')(DO_SALUTATIONS[draft.language][hierarchy]);
  };

  const hasTable = draft.tableData.trim().length > 0;

  /** A table starts as two rows of two blank cells — small enough to see the shape, not a page of them. */
  const toggleTable = () => {
    set('tableData')(hasTable ? '' : JSON.stringify([['', ''], ['', '']]));
  };

  const editTable = (rows: string[][]) => set('tableData')(JSON.stringify(rows));

  const complete =
    draft.fromBlock.trim() && draft.toBlock.trim() && draft.subject.trim() && draft.body.trim();

  /** What the preview and the printer render: the draft as it stands, not the last saved copy. */
  const preview: Letter = {
    id: letterId ?? 'preview',
    language: draft.language,
    format: draft.format,
    goType: draft.goType,
    status: existing.data?.status ?? 'DRAFT',
    referenceNo: draft.referenceNo || null,
    letterDate: draft.letterDate || null,
    fromBlock: draft.fromBlock,
    officeBlock: draft.officeBlock || null,
    toBlock: draft.toBlock,
    salutation: draft.salutation || null,
    subject: draft.subject,
    reference: draft.reference || null,
    body: draft.body,
    enclosure: draft.enclosure || null,
    copyTo: draft.copyTo || null,
    signOff: draft.signOff || null,
    tableData: draft.tableData || null,
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
          <Button variant="secondary" onClick={toggleTable}>
            {hasTable ? 'Remove table' : '+ Add table'}
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
            <h2 className="font-semibold text-slate-900">Format</h2>
            <p className="mt-1 text-sm text-slate-500">
              A letter is addressed with a salutation. A memo is shorter, has none, and is written in
              the third person.
            </p>
            <div className="mt-3 flex gap-2" role="group" aria-label="Letter format">
              {LETTER_FORMATS.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  aria-pressed={draft.format === option.code}
                  onClick={() => switchFormat(option.code)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold outline-none
                    transition-[background-color,color,box-shadow] duration-[--duration-quick]
                    focus-visible:ring-2 focus-visible:ring-navy-300 ${
                      draft.format === option.code
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

          {isMemo ? (
            <>
              <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
                <h2 className="font-semibold text-slate-900">{memo.form.headingSection}</h2>
                <div className="mt-4 space-y-4">
                  <TextField
                    label={memo.form.referenceNo}
                    value={draft.referenceNo}
                    onChange={(event) => set('referenceNo')(event.target.value)}
                    placeholder="DBC/52/2026-D3"
                    hint={memo.form.referenceNoHint}
                  />
                  <TextField
                    label={memo.form.date}
                    type="date"
                    value={draft.letterDate}
                    onChange={(event) => set('letterDate')(event.target.value)}
                  />
                  <DictationField
                    label={memo.form.office}
                    rows={5}
                    value={draft.fromBlock}
                    onValueChange={set('fromBlock')}
                    hint={memo.form.officeHint}
                  />
                  <DictationField
                    label={memo.form.recipient}
                    rows={4}
                    value={draft.toBlock}
                    onValueChange={set('toBlock')}
                    placeholder={memo.form.recipientPlaceholder}
                    hint={memo.form.recipientHint}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
                <h2 className="font-semibold text-slate-900">{memo.form.bodySection}</h2>
                <div className="mt-4 space-y-4">
                  <DictationField
                    label={memo.form.subject}
                    rows={3}
                    value={draft.subject}
                    onValueChange={set('subject')}
                    hint={memo.form.subjectHint}
                  />
                  <DictationField
                    label={memo.form.reference}
                    rows={2}
                    value={draft.reference}
                    onValueChange={set('reference')}
                    hint={memo.form.referenceHint}
                  />
                  <DictationField
                    label={memo.form.body}
                    rows={12}
                    value={draft.body}
                    onValueChange={set('body')}
                    hint={memo.form.bodyHint}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
                <h2 className="font-semibold text-slate-900">{memo.form.closingSection}</h2>
                <div className="mt-4 space-y-4">
                  <DictationField
                    label={memo.form.designation}
                    rows={4}
                    value={draft.signOff}
                    onValueChange={set('signOff')}
                    hint={memo.form.designationHint}
                  />
                </div>
              </div>
            </>
          ) : isGo ? (
            <>
              <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
                <h2 className="font-semibold text-slate-900">{go.form.headingSection}</h2>
                <div className="mt-4 space-y-4">
                  <div>
                    <span className="mb-1 block text-sm font-medium text-slate-700">
                      {go.form.goType}
                    </span>
                    <div className="flex flex-wrap gap-2" role="group" aria-label="G.O. type">
                      {GO_TYPES.map((option) => (
                        <button
                          key={option.code}
                          type="button"
                          aria-pressed={draft.goType === option.code}
                          onClick={() => setGoType(option.code)}
                          title={go.goTypeLabel[option.code]}
                          className={`rounded-lg px-3 py-1.5 text-sm font-semibold outline-none
                            transition-[background-color,color,box-shadow]
                            duration-[--duration-quick] focus-visible:ring-2
                            focus-visible:ring-navy-300 ${
                              draft.goType === option.code
                                ? 'bg-navy-600 text-white'
                                : 'bg-surface-sunken text-slate-600 hover:bg-navy-50'
                            }`}
                        >
                          {option.short}
                        </button>
                      ))}
                    </div>
                  </div>
                  <TextField
                    label={go.form.goNumber}
                    value={draft.referenceNo}
                    onChange={(event) => set('referenceNo')(event.target.value)}
                    placeholder="1415"
                    hint={go.form.goNumberHint}
                  />
                  <TextField
                    label={go.form.date}
                    type="date"
                    value={draft.letterDate}
                    onChange={(event) => set('letterDate')(event.target.value)}
                  />
                  <DictationField
                    label={go.form.department}
                    rows={2}
                    value={draft.fromBlock}
                    onValueChange={set('fromBlock')}
                    hint={go.form.departmentHint}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
                <h2 className="font-semibold text-slate-900">{go.form.abstractSection}</h2>
                <div className="mt-4 space-y-4">
                  <DictationField
                    label={go.form.abstract}
                    rows={3}
                    value={draft.subject}
                    onValueChange={set('subject')}
                    hint={go.form.abstractHint}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
                <h2 className="font-semibold text-slate-900">{go.form.bodySection}</h2>
                <div className="mt-4 space-y-4">
                  <DictationField
                    label={go.form.body}
                    rows={12}
                    value={draft.body}
                    onValueChange={set('body')}
                    hint={go.form.bodyHint}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
                <h2 className="font-semibold text-slate-900">{go.form.closingSection}</h2>
                <div className="mt-4 space-y-4">
                  <DictationField
                    label={go.form.designation}
                    rows={3}
                    value={draft.signOff}
                    onValueChange={set('signOff')}
                    hint={go.form.designationHint}
                  />
                  <DictationField
                    label={go.form.recipients}
                    rows={4}
                    value={draft.toBlock}
                    onValueChange={set('toBlock')}
                    placeholder={go.placeholders.recipients}
                    hint={go.form.recipientsHint}
                  />
                  <DictationField
                    label={go.form.copyTo}
                    rows={4}
                    value={draft.copyTo}
                    onValueChange={set('copyTo')}
                    hint={go.form.copyToHint}
                  />
                </div>
              </div>
            </>
          ) : isDo ? (
            <>
              <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
                <h2 className="font-semibold text-slate-900">{doLetter.form.headingSection}</h2>
                <div className="mt-4 space-y-4">
                  <TextField
                    label={doLetter.form.doNumber}
                    value={draft.referenceNo}
                    onChange={(event) => set('referenceNo')(event.target.value)}
                    placeholder="அ-3/72/2026"
                    hint={doLetter.form.doNumberHint}
                  />
                  <TextField
                    label={doLetter.form.date}
                    type="date"
                    value={draft.letterDate}
                    onChange={(event) => set('letterDate')(event.target.value)}
                  />
                  <DictationField
                    label={doLetter.form.sender}
                    rows={3}
                    value={draft.fromBlock}
                    onValueChange={set('fromBlock')}
                    hint={doLetter.form.senderHint}
                  />
                  <DictationField
                    label={doLetter.form.office}
                    rows={3}
                    value={draft.officeBlock}
                    onValueChange={set('officeBlock')}
                    hint={doLetter.form.officeHint}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
                <h2 className="font-semibold text-slate-900">{doLetter.form.letterSection}</h2>
                <div className="mt-4 space-y-4">
                  <div>
                    <span className="mb-1 block text-sm font-medium text-slate-700">
                      {doLetter.form.hierarchy}
                    </span>
                    <div className="flex flex-wrap gap-2" role="group" aria-label={doLetter.form.hierarchy}>
                      {DO_HIERARCHIES.map((option) => (
                        <button
                          key={option.code}
                          type="button"
                          onClick={() => setDoHierarchy(option.code)}
                          className="rounded-lg bg-surface-sunken px-3 py-1.5 text-sm font-semibold
                            text-slate-600 outline-none transition-[background-color,color,box-shadow]
                            duration-[--duration-quick] hover:bg-navy-50 focus-visible:ring-2
                            focus-visible:ring-navy-300"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{doLetter.form.hierarchyHint}</p>
                  </div>
                  <TextField
                    label={doLetter.form.salutation}
                    value={draft.salutation}
                    onChange={(event) => set('salutation')(event.target.value)}
                    placeholder={doLetter.placeholders.salutation}
                  />
                  <DictationField
                    label={doLetter.form.subject}
                    rows={3}
                    value={draft.subject}
                    onValueChange={set('subject')}
                    hint={doLetter.form.subjectHint}
                  />
                  <DictationField
                    label={doLetter.form.reference}
                    rows={2}
                    value={draft.reference}
                    onValueChange={set('reference')}
                    hint={doLetter.form.referenceHint}
                  />
                  <DictationField
                    label={doLetter.form.body}
                    rows={12}
                    value={draft.body}
                    onValueChange={set('body')}
                    hint={doLetter.form.bodyHint}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
                <h2 className="font-semibold text-slate-900">{doLetter.form.closingSection}</h2>
                <div className="mt-4 space-y-4">
                  <DictationField
                    label={doLetter.form.initials}
                    rows={2}
                    value={draft.signOff}
                    onValueChange={set('signOff')}
                    hint={doLetter.form.initialsHint}
                  />
                  <DictationField
                    label={doLetter.form.recipient}
                    rows={4}
                    value={draft.toBlock}
                    onValueChange={set('toBlock')}
                    placeholder={doLetter.form.recipientPlaceholder}
                    hint={doLetter.form.recipientHint}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
        </section>

        <section data-testid="letter-preview" className="min-w-0 print:w-full">
          <p className="mb-3 text-xs uppercase tracking-wide text-slate-500 print:hidden">
            Preview — this is what prints, and you can type straight into it
          </p>
          <LetterSheet letter={preview} onEdit={editInSheet} onTableChange={editTable} />
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

/** A `?format=` that is not one of the four is simply not an answer, and the seed decides instead. */
function asFormat(value: string | null): LetterFormat | null {
  return value === 'LETTER' || value === 'MEMO' || value === 'GO' || value === 'DO' ? value : null;
}
