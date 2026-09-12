import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { deleteLetter, discardDraft, fetchMyLetters } from '@/features/letters/api';
import { forgetDraft } from '@/features/letters/draft-storage';
import { formatLetterDate } from '@/features/letters/format';
import { LETTER_FORMATS, LETTER_LANGUAGES } from '@/features/letters/language';
import { useAuth } from '@/lib/auth-context';
import { toApiError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import type { LetterFormat, LetterLanguage, LetterSummary } from '@/types/api';

/**
 * The letters this person has written, and the way into a new one.
 *
 * <p>A letter belongs to whoever wrote it: this list is scoped to the caller by the server, and
 * there is deliberately no screen anywhere that shows somebody else's drafts.
 *
 * <p><b>Drafts sit above the letters, not among them.</b> They are the opposite kind of thing — one
 * is a document that was issued, the other is a job half done — and a single list distinguishing
 * them by a badge would invite exactly the mistake of printing an unfinished letter.
 */
export function LettersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  /**
   * A new letter asks two questions before it opens: what shape it is, then what language. Chained
   * rather than shown together because "which language?" is really a question about the format just
   * chosen — a memo and a letter say it differently — and one dialogue per decision keeps each answer
   * unambiguous.
   */
  const [step, setStep] = useState<'closed' | 'format' | 'language'>('closed');
  const [chosenFormat, setChosenFormat] = useState<LetterFormat>('LETTER');
  const [confirming, setConfirming] = useState<LetterSummary | null>(null);

  const letters = useQuery({ queryKey: ['letters', 'mine'], queryFn: () => fetchMyLetters('FINAL') });
  const drafts = useQuery({ queryKey: ['letters', 'drafts'], queryFn: () => fetchMyLetters('DRAFT') });

  const remove = useMutation({
    // Throwing away a draft is not the same act as deleting a letter that was issued, and the audit
    // log should not record it as one: nothing was ever sent.
    mutationFn: (letter: LetterSummary) =>
      letter.status === 'DRAFT' ? discardDraft(letter.id) : deleteLetter(letter.id),
    onSuccess: (_removed, letter) => {
      // The copy on this machine goes with it. Somebody who discards a draft has decided; being
      // offered it back on the next new letter would be the application arguing about it.
      if (user) forgetDraft(user.id, letter.id);

      setConfirming(null);
      void queryClient.invalidateQueries({ queryKey: ['letters'] });
    },
  });

  const items = letters.data?.items ?? [];
  const unfinished = drafts.data?.items ?? [];
  const error = letters.error ?? remove.error;

  const pickFormat = (chosen: LetterFormat) => {
    setChosenFormat(chosen);
    setStep('language');
  };

  const start = (language: LetterLanguage) => {
    setStep('closed');
    navigate(`/letters/new?format=${chosenFormat}&lang=${language}`);
  };

  return (
    <AppShell
      title="Letters"
      subtitle="Write in English or Tamil, save it, and print or save as PDF"
      actions={<Button onClick={() => setStep('format')}>New letter</Button>}
    >
      {error && <Alert tone="error">{toApiError(error).message}</Alert>}

      {unfinished.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Unfinished — pick up where you left off
          </h2>
          <ul className="space-y-3">
            {unfinished.map((letter) => (
              <li
                key={letter.id}
                className="group/row flex flex-wrap items-center gap-4 rounded-xl border
                  border-dashed border-line-strong bg-surface p-5 shadow-card
                  transition-[border-color,box-shadow,background-color]
                  duration-[--duration-quick] ease-[--ease-settle] hover:border-navy-400
                  hover:bg-navy-50/40 hover:shadow-lifted"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/letters/${letter.id}`}
                    className="block truncate font-medium text-slate-900 outline-none
                      transition-colors duration-[--duration-base] group-hover/row:text-navy-800
                      focus-visible:text-navy-800"
                  >
                    {/* A draft is often abandoned before it has a subject, and "(no subject yet)" is
                        the only honest thing to call it — an empty row is unclickable. */}
                    {letter.subject.trim() || 'Letter with no subject yet'}
                  </Link>
                  <p className="mt-0.5 text-xs text-slate-500">
                    <FormatTag format={letter.format} />
                    <LanguageTag language={letter.language} /> · last edited{' '}
                    {formatDateTime(letter.updatedAt)}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/letters/${letter.id}`)}>
                    Continue
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600! hover:bg-red-50!"
                    onClick={() => setConfirming(letter)}
                  >
                    Discard
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {letters.isPending ? (
        <SkeletonRows count={4} label="Loading your letters" />
      ) : items.length === 0 ? (
        <section className="rounded-xl border border-line bg-surface p-8 text-center shadow-card">
          <h2 className="font-semibold text-slate-900">No letters yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Your own details go into the From block, and everything else can be typed on the letter
            itself.
          </p>
          <Button className="mt-5" onClick={() => setStep('format')}>
            Write your first letter
          </Button>
        </section>
      ) : (
        <ul className="stagger space-y-3">
          {items.map((letter) => (
            <li
              key={letter.id}
              className="group/row flex flex-wrap items-center gap-4 rounded-xl border border-line
                bg-surface p-5 shadow-card transition-[border-color,box-shadow,background-color]
                duration-[--duration-quick] ease-[--ease-settle] hover:border-navy-400
                hover:bg-navy-50/40 hover:shadow-lifted"
            >
              <div className="min-w-0 flex-1">
                <Link
                  to={`/letters/${letter.id}`}
                  className="block truncate font-medium text-slate-900 outline-none transition-colors
                    duration-[--duration-base] group-hover/row:text-navy-800
                    focus-visible:text-navy-800"
                >
                  {letter.subject}
                </Link>
                <p className="mt-0.5 text-xs text-slate-500">
                  <FormatTag format={letter.format} />
                  <LanguageTag language={letter.language} /> ·{' '}
                  {letter.referenceNo && <>Lr.No.{letter.referenceNo} · </>}
                  {letter.letterDate && <>{formatLetterDate(letter.letterDate)} · </>}
                  edited {formatDateTime(letter.updatedAt)}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => navigate(`/letters/${letter.id}`)}>
                  Open
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600! hover:bg-red-50!"
                  onClick={() => setConfirming(letter)}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/*
       * Two things a letter has to be decided before it is opened: its shape, then its language.
       * Everything else on it — including both of these — can be changed on the letter itself, but a
       * letter has to start in one of them, and defaulting silently would be a choice made on
       * somebody's behalf rather than by them.
       */}
      <Modal
        open={step === 'format'}
        onClose={() => setStep('closed')}
        title="What are you writing?"
        description="You can change this while writing too."
      >
        <div className="space-y-2">
          {LETTER_FORMATS.map((option) => (
            <button
              key={option.code}
              type="button"
              onClick={() => pickFormat(option.code)}
              className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-left
                outline-none transition-[border-color,background-color] duration-[--duration-quick]
                hover:border-navy-400 hover:bg-navy-50/40 focus-visible:ring-2
                focus-visible:ring-navy-300"
            >
              <span className="block font-medium text-slate-900">{option.label}</span>
              <span className="mt-0.5 block text-sm text-slate-500">
                {option.code === 'MEMO'
                  ? 'குறிப்பாணை — a short, third-person note to a subordinate office, no salutation'
                  : option.code === 'GO'
                    ? 'அரசாணை — issued by the Secretariat, with an abstract, read references and an order'
                    : option.code === 'DO'
                      ? 'நேர்முகக் கடிதம் — personal-cum-official, written in the first person, officer to officer'
                      : 'Addressed with a salutation, to one or more recipients'}
              </span>
            </button>
          ))}
        </div>
      </Modal>

      <Modal
        open={step === 'language'}
        onClose={() => setStep('closed')}
        title="Which language?"
        description="This decides the headings the letter prints — you can change it while writing."
      >
        <div className="space-y-2">
          {LETTER_LANGUAGES.map((option) => (
            <button
              key={option.code}
              type="button"
              onClick={() => start(option.code)}
              className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-left
                outline-none transition-[border-color,background-color] duration-[--duration-quick]
                hover:border-navy-400 hover:bg-navy-50/40 focus-visible:ring-2
                focus-visible:ring-navy-300"
            >
              <span
                lang={option.code === 'TA' ? 'ta' : 'en'}
                className="block font-medium text-slate-900"
              >
                {option.label}
              </span>
              <span className="mt-0.5 block text-sm text-slate-500">
                {option.code === 'TA'
                  ? 'விடுநர், பெறுநர், பொருள்: — தமிழில் அச்சிடப்படும்'
                  : 'From, To, Sub: — printed in English'}
              </span>
            </button>
          ))}
        </div>
      </Modal>

      <Modal
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={confirming?.status === 'DRAFT' ? 'Discard this draft?' : 'Delete this letter?'}
      >
        <p className="text-sm text-slate-600">
          “{confirming?.subject.trim() || 'Letter with no subject yet'}” will be removed. Nothing
          else in the system refers to it, so this cannot be undone.
        </p>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="secondary" onClick={() => setConfirming(null)}>
            Keep it
          </Button>
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => confirming && remove.mutate(confirming)}
          >
            {confirming?.status === 'DRAFT' ? 'Discard' : 'Delete'}
          </Button>
        </div>
      </Modal>
    </AppShell>
  );
}

/** Which language a letter is in, on the one line a list row has to say it. */
function LanguageTag({ language }: { language: LetterLanguage }) {
  const option = LETTER_LANGUAGES.find((candidate) => candidate.code === language);
  return <span lang={language === 'TA' ? 'ta' : 'en'}>{option?.label ?? 'English'}</span>;
}

/** Which shape a letter is in — left off the line entirely for the common case, a plain letter. */
function FormatTag({ format }: { format: LetterFormat }) {
  if (format === 'LETTER') return null;
  const label = format === 'MEMO' ? 'Memo' : format === 'GO' ? 'G.O.' : 'D.O.';
  return <>{label} · </>;
}
