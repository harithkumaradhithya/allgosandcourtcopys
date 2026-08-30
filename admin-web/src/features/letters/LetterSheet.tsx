import { useEffect, useRef } from 'react';
import type { Letter } from '@/types/api';
import { formatLetterDate } from '@/features/letters/format';
import { HTML_LANG, letterText } from '@/features/letters/language';

/** The blocks of a letter that can be typed straight into the sheet. */
export type LetterField =
  | 'referenceNo'
  | 'fromBlock'
  | 'toBlock'
  | 'salutation'
  | 'subject'
  | 'reference'
  | 'body'
  | 'enclosure'
  | 'signOff'
  | 'copyTo';

/**
 * The letter as it appears on paper.
 *
 * <p>This is the only thing that prints. `@media print` in index.css hides the application around
 * it and lets this sheet fill the page, so what somebody sees on screen is what comes out of the
 * printer or the browser's Save as PDF — there is no second rendering to drift from the first.
 *
 * <p>The shape follows the office's own letters: the sender on the left and the recipients on the
 * right, both at the top; then the file number and date on one line; then the salutation, the
 * subject and the reference, the body, and finally the enclosure, the signature and who is copied.
 *
 * <p><b>The headings are the letter's own language.</b> "From,", "Sub:" and "Copy to." on an English
 * letter; "அனுப்புநர்,", "பொருள்:" and "நகல்:" on a Tamil one. Nobody types them, so they are drawn
 * from the language stored on the letter rather than from whoever happens to be looking at it — a
 * Tamil letter reprinted from an English session still comes out Tamil.
 *
 * <p><b>Given `onEdit`, the sheet is the form.</b> Every block becomes editable in place, so a
 * spacing correction or a word in the middle of a paragraph can be made where it is visible instead
 * of hunting for the box that produced it. Editing here and editing in the fields beside it are the
 * same edit — both write to the one draft the sheet is drawn from. Empty blocks then show what
 * belongs in them, and those hints are dropped when the letter prints.
 */
export function LetterSheet({
  letter,
  onEdit,
}: {
  letter: Letter;
  /** Supplied by the editor; absent wherever the letter is only being shown. */
  onEdit?: (field: LetterField, value: string) => void;
}) {
  const text = letterText(letter.language);
  const { sheet, placeholders } = text;
  const editable = onEdit !== undefined;

  /** Shown but not printed: a block nobody filled in is not part of the letter. */
  const empty = (value: string | null) => (value ?? '').trim().length === 0;

  return (
    <article
      lang={HTML_LANG[letter.language ?? 'EN']}
      className="letter-sheet mx-auto w-full max-w-[210mm] rounded-xl border border-line bg-surface
        px-10 py-12 text-slate-900 shadow-card print:max-w-none print:rounded-none print:border-0
        print:px-0 print:py-0 print:shadow-none"
    >
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
        <section>
          <h2 className="font-semibold">{sheet.from}</h2>
          <Block
            field="fromBlock"
            value={letter.fromBlock}
            onEdit={onEdit}
            placeholder={placeholders.from}
            className="mt-2 leading-relaxed"
          />
        </section>
        <section>
          <h2 className="font-semibold">{sheet.to}</h2>
          <Block
            field="toBlock"
            value={letter.toBlock}
            onEdit={onEdit}
            placeholder={placeholders.to}
            className="mt-2 leading-relaxed"
          />
        </section>
      </div>

      {(editable || letter.referenceNo || letter.letterDate) && (
        <div
          data-empty={empty(letter.referenceNo) && !letter.letterDate}
          className="mt-10 flex flex-wrap items-baseline justify-center gap-x-10 gap-y-1 font-semibold"
        >
          {(editable || letter.referenceNo) && (
            <span data-empty={empty(letter.referenceNo)} className="inline-flex items-baseline">
              {sheet.letterNo}
              <Block
                field="referenceNo"
                value={letter.referenceNo ?? ''}
                onEdit={onEdit}
                placeholder={placeholders.letterNo}
                singleLine
                inline
              />
            </span>
          )}
          {/* The date is the one thing not typed here: it is a date, and the field beside the sheet
              is a date picker that cannot produce one the server will reject. */}
          {letter.letterDate && (
            <span>
              {sheet.dated} {formatLetterDate(letter.letterDate)}
            </span>
          )}
        </div>
      )}

      {(editable || letter.salutation) && (
        <div data-empty={empty(letter.salutation)} className="mt-8">
          <Block
            field="salutation"
            value={letter.salutation ?? ''}
            onEdit={onEdit}
            placeholder={placeholders.salutation}
            singleLine
          />
        </div>
      )}

      {/* Sub: and Ref: hang, the way they do on the paper originals — the label sits in the margin
          and the text lines up under itself rather than wrapping beneath the label. */}
      {(editable || letter.subject) && (
        <p
          data-empty={empty(letter.subject)}
          className="mt-6 pl-16 -indent-16 leading-relaxed sm:pl-20 sm:-indent-20"
        >
          <span className="font-semibold">{sheet.subject}&nbsp;&nbsp;</span>
          <Block
            field="subject"
            value={letter.subject}
            onEdit={onEdit}
            placeholder={placeholders.subject}
            inline
          />
        </p>
      )}

      {(editable || letter.reference) && (
        <p
          data-empty={empty(letter.reference)}
          className="mt-4 pl-16 -indent-16 leading-relaxed sm:pl-20 sm:-indent-20"
        >
          <span className="font-semibold">{sheet.reference}&nbsp;&nbsp;</span>
          <Block
            field="reference"
            value={letter.reference ?? ''}
            onEdit={onEdit}
            placeholder={placeholders.reference}
            inline
          />
        </p>
      )}

      {(letter.subject || letter.reference) && (
        <p aria-hidden className="mt-6 text-center tracking-[0.3em]">
          *******
        </p>
      )}

      <Block
        field="body"
        value={letter.body}
        onEdit={onEdit}
        placeholder={placeholders.body}
        className="mt-6 leading-loose"
      />

      {(editable || letter.enclosure) && (
        <p data-empty={empty(letter.enclosure)} className="mt-8">
          <span className="font-semibold">{sheet.enclosure}</span>{' '}
          <Block
            field="enclosure"
            value={letter.enclosure ?? ''}
            onEdit={onEdit}
            placeholder={placeholders.enclosure}
            singleLine
            inline
          />
        </p>
      )}

      {(editable || letter.signOff) && (
        <Block
          field="signOff"
          value={letter.signOff ?? ''}
          onEdit={onEdit}
          placeholder={placeholders.signOff}
          data-empty={empty(letter.signOff)}
          className="mt-12 text-right leading-relaxed"
        />
      )}

      {(editable || letter.copyTo) && (
        <div data-empty={empty(letter.copyTo)} className="mt-12">
          <h2 className="font-semibold underline">{sheet.copyTo}</h2>
          <Block
            field="copyTo"
            value={letter.copyTo ?? ''}
            onEdit={onEdit}
            placeholder={placeholders.copyTo}
            className="mt-2 leading-relaxed"
          />
        </div>
      )}
    </article>
  );
}

/**
 * One block of the letter — read-only text, or the same text typed into directly.
 *
 * <p><b>The DOM is written to only when the writer is not in it.</b> React re-rendering a
 * `contentEditable` from its own value puts the caret back at the start on every keystroke, which is
 * unusable. So the element owns its text while it has focus and the draft is told what changed; the
 * value flows the other way only when it was changed elsewhere — in the fields beside the sheet, or
 * by switching language — and the writer is not currently typing into it.
 *
 * <p>Enter inserts a newline rather than whatever block element the browser would otherwise build,
 * and a paste arrives as plain text. Both keep the block one piece of text: a letter is text, and
 * markup smuggled in from a Word document would print in ways nobody asked for.
 */
function Block({
  field,
  value,
  onEdit,
  placeholder,
  className = '',
  singleLine = false,
  inline = false,
  'data-empty': dataEmpty,
}: {
  field: LetterField;
  value: string;
  onEdit?: (field: LetterField, value: string) => void;
  placeholder: string;
  className?: string;
  /** A file number or a salutation: Enter does not belong in it. */
  singleLine?: boolean;
  /** Sits on the same line as its label, as the Sub: and Ref: lines do. */
  inline?: boolean;
  'data-empty'?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  /** What this element last agreed the value was, so an echo of its own typing is not written back. */
  const mine = useRef<string | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || !onEdit) return;

    if (value === mine.current) return;
    mine.current = value;
    if (document.activeElement === element) return;

    element.textContent = value;
  }, [onEdit, value]);

  const shell = `whitespace-pre-wrap ${inline ? 'inline' : 'block'} ${className}`;

  if (!onEdit) {
    return inline ? (
      <span className={shell}>{value}</span>
    ) : (
      <div data-empty={dataEmpty} className={shell}>
        {value}
      </div>
    );
  }

  const props = {
    ref: ref as React.Ref<never>,
    contentEditable: true,
    suppressContentEditableWarning: true,
    role: 'textbox',
    'aria-label': placeholder,
    'aria-multiline': !singleLine,
    'data-placeholder': placeholder,
    'data-empty': dataEmpty ?? value.trim().length === 0,
    className: `letter-editable ${shell} ${value.trim().length === 0 ? 'is-empty' : ''}`,
    onInput: (event: React.FormEvent<HTMLElement>) => {
      const text = event.currentTarget.innerText.replace(/\r\n/g, '\n');
      mine.current = text;
      onEdit(field, text);
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (singleLine) return;
      document.execCommand('insertText', false, '\n');
    },
    onPaste: (event: React.ClipboardEvent<HTMLElement>) => {
      event.preventDefault();
      const text = event.clipboardData.getData('text/plain').replace(/\r\n/g, '\n');
      document.execCommand('insertText', false, singleLine ? text.replace(/\n/g, ' ') : text);
    },
  };

  return inline ? <span {...props} /> : <div {...props} />;
}
