import { useEffect, useRef, useState } from 'react';
import type { Letter, LetterLanguage } from '@/types/api';
import { formatLetterDate } from '@/features/letters/format';
import { HTML_LANG, doText, goText, letterText, memoText, officeNoteText } from '@/features/letters/language';

/**
 * The state emblem a G.O. is headed with — its own image per language, because the seal itself
 * carries the government's name and motto rather than that being a separate line of text.
 *
 * <p>Served from the public folder rather than imported, so a missing file 404s quietly instead of
 * failing the build.
 */
const EMBLEM_SRC: Record<LetterLanguage, string> = {
  EN: '/emblems/tn-emblem-en.png',
  TA: '/emblems/tn-emblem-ta.svg',
};

/** The blocks of a letter that can be typed straight into the sheet. */
export type LetterField =
  | 'referenceNo'
  | 'fromBlock'
  /** The office's own name, place, phone and e-mail, printed opposite the From block on a D.O. letter. */
  | 'officeBlock'
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
 * A memo ({@link Letter.format} `MEMO`), a Government Order (`GO`), a Demi-Official letter (`DO`)
 * and an Office Note (`OFFICE_NOTE`) are different shapes rather than a letter with blocks left out
 * — a memo heads with the office and its file number under a centred title and has no salutation,
 * enclosure or "Copy to."; a G.O. heads with the state emblem, the department and its number and
 * date, then an abstract, and below that a single free-form order the writer composes in full —
 * nothing about "Read", "-oOo-" or "ORDER:" is imposed — authenticated "by order of the Governor"
 * rather than signed off; a D.O. heads with the writer's name and the office's own details side by
 * side, is written in the first person, and closes "Yours sincerely," rather than a plain signature;
 * an Office Note is not correspondence at all — no sender or recipient, just a file number, a
 * centred title, a fixed submission phrase before the body and fixed "for orders" / "put up for
 * approval" blocks after it. {@link LetterBody}, {@link MemoBody}, {@link GoBody}, {@link DoBody}
 * and {@link OfficeNoteBody} draw the five.
 *
 * <p><b>Tables are not tied to any one shape, or to being just one.</b> A letter can carry any number
 * of small tables of figures — a schedule under the subject, a list of pending items further down —
 * each dragged to wherever the writer wants it and floating there above the letter's text, the way a
 * shape dropped onto a page in a word processor sits wherever it is placed rather than in the flow of
 * the surrounding paragraphs. {@link Letter.tableData} is a JSON array, one entry per table, and every
 * one of them is drawn once, directly on the sheet.
 *
 * <p><b>The headings are the letter's own language.</b> "From,", "Sub:" and "Copy to." on an English
 * letter; "விடுநர்,", "பொருள்:" and "நகல்:" on a Tamil one. Nobody types them, so they are drawn
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
  onFocusField,
  onTableChange,
}: {
  letter: Letter;
  /** Supplied by the editor; absent wherever the letter is only being shown. */
  onEdit?: (field: LetterField, value: string) => void;
  /** Supplied alongside `onEdit`; told which block the cursor is in. */
  onFocusField?: (field: LetterField) => void;
  /** Supplied alongside `onEdit`; edits, or removes, one of the letter's tables by id. */
  onTableChange?: TableChangeHandler;
}) {
  const editable = onEdit !== undefined;

  /** Shown but not printed: a block nobody filled in is not part of the letter. */
  const empty = (value: string | null) => (value ?? '').trim().length === 0;

  const bodyProps = { letter, onEdit, onFocusField, editable, empty };
  const body =
    letter.format === 'MEMO' ? (
      <MemoBody {...bodyProps} />
    ) : letter.format === 'GO' ? (
      <GoBody {...bodyProps} />
    ) : letter.format === 'DO' ? (
      <DoBody {...bodyProps} />
    ) : letter.format === 'OFFICE_NOTE' ? (
      <OfficeNoteBody {...bodyProps} />
    ) : (
      <LetterBody {...bodyProps} />
    );

  return (
    <article
      lang={HTML_LANG[letter.language ?? 'EN']}
      className="letter-sheet relative mx-auto w-full max-w-[210mm] rounded-xl border border-line
        bg-surface px-10 py-12 text-slate-900 shadow-card print:max-w-none print:rounded-none
        print:border-0 print:px-0 print:py-0 print:shadow-none"
    >
      {body}
      {/* Every table on the letter, floating above this text rather than laid out among it — see
          {@link LetterTable}. Drawn once here, not once per block, now that a table's position has
          nothing to do with which block of the letter it happens to sit near. */}
      {parseTables(letter.tableData).map((table) => (
        <LetterTable
          key={table.id}
          table={table}
          onChange={onTableChange ? (next) => onTableChange(table.id, next) : undefined}
          onRemove={onTableChange ? () => onTableChange(table.id, null) : undefined}
        />
      ))}
    </article>
  );
}

/** The office letter shape: From/To at the top, a salutation, and the body addressed to the reader. */
function LetterBody({
  letter,
  onEdit,
  onFocusField,
  editable,
  empty,
}: {
  letter: Letter;
  onEdit?: (field: LetterField, value: string) => void;
  onFocusField?: (field: LetterField) => void;
  editable: boolean;
  empty: (value: string | null) => boolean;
}) {
  const text = letterText(letter.language);
  const { sheet, placeholders } = text;

  return (
    <>
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
        <section>
          <h2 className="font-semibold">{sheet.from}</h2>
          <Block
            field="fromBlock"
            value={letter.fromBlock}
            onEdit={onEdit}
            onFocusField={onFocusField}
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
            onFocusField={onFocusField}
            placeholder={placeholders.to}
            className="mt-2 leading-relaxed"
          />
        </section>
      </div>
      {/* The file number sits under From, and the date under To — the same two columns as the
          block above, not a line centred across both of them. */}
      {(editable || letter.referenceNo || letter.letterDate) && (
        <div className="mt-10 grid grid-cols-1 gap-8 font-semibold sm:grid-cols-2">
          <div>
            {(editable || letter.referenceNo) && (
              <span data-empty={empty(letter.referenceNo)} className="inline-flex items-baseline">
                {sheet.letterNo}
                <Block
                  field="referenceNo"
                  value={letter.referenceNo ?? ''}
                  onEdit={onEdit}
                  onFocusField={onFocusField}
                  placeholder={placeholders.letterNo}
                  singleLine
                  inline
                />
              </span>
            )}
          </div>
          {/* The date is the one thing not typed here: it is a date, and the field beside the sheet
              is a date picker that cannot produce one the server will reject. */}
          {letter.letterDate && (
            <div>
              {sheet.dated} {formatLetterDate(letter.letterDate)}
            </div>
          )}
        </div>
      )}
      {(editable || letter.salutation) && (
        <div data-empty={empty(letter.salutation)} className="mt-8">
          <Block
            field="salutation"
            value={letter.salutation ?? ''}
            onEdit={onEdit}
            onFocusField={onFocusField}
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
            onFocusField={onFocusField}
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
            onFocusField={onFocusField}
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
        onFocusField={onFocusField}
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
            onFocusField={onFocusField}
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
          onFocusField={onFocusField}
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
            onFocusField={onFocusField}
            placeholder={placeholders.copyTo}
            className="mt-2 leading-relaxed"
          />
        </div>
      )}
    </>
  );
}

/**
 * The memo shape: the office and its file number head it, a centred title names it, and the body
 * speaks about the recipient in the third person rather than to them — so there is no salutation,
 * no enclosure, and no "Copy to." to leave off when empty.
 */
function MemoBody({
  letter,
  onEdit,
  onFocusField,
  editable,
  empty,
}: {
  letter: Letter;
  onEdit?: (field: LetterField, value: string) => void;
  onFocusField?: (field: LetterField) => void;
  editable: boolean;
  empty: (value: string | null) => boolean;
}) {
  const text = memoText(letter.language);
  const { sheet, placeholders } = text;

  return (
    <>
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
        <section>
          <h2 className="font-semibold">{sheet.fileNo}</h2>
          <Block
            field="referenceNo"
            value={letter.referenceNo ?? ''}
            onEdit={onEdit}
            onFocusField={onFocusField}
            placeholder={placeholders.fileNo}
            className="mt-2"
            singleLine
          />
        </section>
        <section>
          <h2 className="font-semibold">{sheet.office}</h2>
          <Block
            field="fromBlock"
            value={letter.fromBlock}
            onEdit={onEdit}
            onFocusField={onFocusField}
            placeholder={placeholders.office}
            className="mt-2 leading-relaxed"
          />
          {/* The date is not typed here for the same reason it is not on a letter: the field beside
              the sheet is a date picker, and this element cannot produce a date the server accepts. */}
          {letter.letterDate && (
            <p className="mt-1">
              {sheet.dated} {formatLetterDate(letter.letterDate)}
            </p>
          )}
        </section>
      </div>

      <h1 className="mt-10 text-center text-lg font-bold">{sheet.title}</h1>

      {(editable || letter.subject) && (
        <p
          data-empty={empty(letter.subject)}
          className="mt-8 pl-16 -indent-16 leading-relaxed sm:pl-20 sm:-indent-20"
        >
          <span className="font-semibold">{sheet.subject}&nbsp;&nbsp;</span>
          <Block
            field="subject"
            value={letter.subject}
            onEdit={onEdit}
            onFocusField={onFocusField}
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
            onFocusField={onFocusField}
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
        onFocusField={onFocusField}
        placeholder={placeholders.body}
        className="mt-6 leading-loose"
      />

      <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2">
        <section>
          <h2 className="font-semibold">{sheet.recipient}</h2>
          <Block
            field="toBlock"
            value={letter.toBlock}
            onEdit={onEdit}
            onFocusField={onFocusField}
            placeholder={placeholders.recipient}
            className="mt-2 leading-relaxed"
          />
        </section>
        <section className="sm:text-right">
          <Block
            field="signOff"
            value={letter.signOff ?? ''}
            onEdit={onEdit}
            onFocusField={onFocusField}
            placeholder={placeholders.designation}
            data-empty={empty(letter.signOff)}
            className="leading-relaxed"
          />
        </section>
      </div>
    </>
  );
}

/**
 * The Government Order shape: the state emblem, then the department and the G.O. number and date —
 * the heading a G.O. is filed and known by, printed before the abstract rather than after it, the
 * way the office's own G.O.s are laid out. The abstract follows, then a plain line, then the order
 * itself — one free-form block the writer composes in full, with no "Read", "-oOo-" or "ORDER:"
 * imposed on it — and authentication by order of the Governor before the recipients and copy list.
 * Never a salutation, an enclosure, or a plain "Ref:".
 */
function GoBody({
  letter,
  onEdit,
  onFocusField,
  editable,
  empty,
}: {
  letter: Letter;
  onEdit?: (field: LetterField, value: string) => void;
  onFocusField?: (field: LetterField) => void;
  editable: boolean;
  empty: (value: string | null) => boolean;
}) {
  const text = goText(letter.language);
  const { sheet, placeholders, goTypeLabel } = text;
  const typeLabel = goTypeLabel[letter.goType ?? 'MS'];
  const emblem = EMBLEM_SRC[letter.language ?? 'EN'];

  return (
    <>
      <div className="text-center">
        <img src={emblem} alt={sheet.emblemAlt} className="mx-auto h-24 w-24 object-contain" />
      </div>

      {/* The department names itself on its own centred line right under the emblem, and the
          number and date follow on the line under it — the heading a G.O. is filed and known by,
          printed before the abstract rather than after it, the way the office's own G.O.s are laid
          out. */}
      <div className="mt-4 text-center font-bold">
        <Block
          field="fromBlock"
          value={letter.fromBlock}
          onEdit={onEdit}
          onFocusField={onFocusField}
          placeholder={placeholders.department}
          className="leading-relaxed"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-baseline justify-center gap-x-1 text-center font-bold">
        <span className="inline-flex flex-wrap items-baseline">
          {typeLabel}
          <Block
            field="referenceNo"
            value={letter.referenceNo ?? ''}
            onEdit={onEdit}
            onFocusField={onFocusField}
            placeholder={placeholders.goNumber}
            singleLine
            inline
          />
        </span>
        {/* The date is not typed here for the same reason it is not on a letter or a memo: the
            field beside the sheet is a date picker, and this element cannot produce a date the
            server accepts. */}
        {letter.letterDate && (
          <span>
            , {sheet.dated} {formatLetterDate(letter.letterDate)}
          </span>
        )}
      </div>

      <h2 className="mt-8 text-center font-semibold underline">{sheet.abstractHeading}</h2>
      <Block
        field="subject"
        value={letter.subject}
        onEdit={onEdit}
        onFocusField={onFocusField}
        placeholder={placeholders.abstract}
        className="mt-3 font-semibold leading-relaxed"
      />

      <hr className="mt-6 border-t border-slate-400" />

      {/* Nothing prescribed below the line — no "Read the following", no "-oOo-", no "ORDER:".
          The order itself is free text the writer composes in full, including any of that
          scaffolding they want, rather than the sheet imposing a shape on it. */}
      <Block
        field="body"
        value={letter.body}
        onEdit={onEdit}
        onFocusField={onFocusField}
        placeholder={placeholders.body}
        className="mt-6 leading-loose"
      />

      <div className="mt-12 flex justify-end">
        <div className="text-center">
          <p className="font-semibold">{sheet.byOrderOfGovernor}</p>
          <Block
            field="signOff"
            value={letter.signOff ?? ''}
            onEdit={onEdit}
            onFocusField={onFocusField}
            placeholder={placeholders.designation}
            data-empty={empty(letter.signOff)}
            className="mt-2 leading-relaxed"
          />
        </div>
      </div>

      {(editable || letter.toBlock) && (
        <div className="mt-12">
          <h2 className="font-semibold">{sheet.recipients}</h2>
          <Block
            field="toBlock"
            value={letter.toBlock}
            onEdit={onEdit}
            onFocusField={onFocusField}
            placeholder={placeholders.recipients}
            className="mt-2 leading-relaxed"
          />
        </div>
      )}

      {(editable || letter.copyTo) && (
        <div data-empty={empty(letter.copyTo)} className="mt-8">
          <h2 className="font-semibold">{sheet.copyTo}</h2>
          <Block
            field="copyTo"
            value={letter.copyTo ?? ''}
            onEdit={onEdit}
            onFocusField={onFocusField}
            placeholder={placeholders.copyTo}
            className="mt-2 leading-relaxed"
          />
        </div>
      )}
    </>
  );
}

/**
 * The Demi-Official letter shape: one line across the top — the writer's name and designation on
 * the left, the state emblem centred (the same one a G.O. is headed with), and the office's own
 * name, place, phone and e-mail on the right, never headed "From," — the way the office's own D.O.
 * letters are laid out, under a plain rule. Then the D.O. number and date, a salutation, the subject
 * and reference, and a body the writer composes in the first person. It closes with the fixed
 * phrase "Yours sincerely," (never "Yours lovingly", and never something the sheet lets anyone
 * type) above the signing officer's initials, and "பெறுநர்" (Recipient) rather than "To," beneath it.
 */
function DoBody({
  letter,
  onEdit,
  onFocusField,
  editable,
  empty,
}: {
  letter: Letter;
  onEdit?: (field: LetterField, value: string) => void;
  onFocusField?: (field: LetterField) => void;
  editable: boolean;
  empty: (value: string | null) => boolean;
}) {
  const text = doText(letter.language);
  const { sheet, placeholders } = text;
  const emblem = EMBLEM_SRC[letter.language ?? 'EN'];

  return (
    <>
      {/* The writer's name, the emblem and the office sit on one line, the way the office's own D.O.
          letters are laid out — not the emblem on its own line above a two-column block, the way a
          G.O. is headed. */}
      <div className="grid grid-cols-1 items-start gap-6 sm:grid-cols-[1fr_auto_1fr]">
        <section>
          <Block
            field="fromBlock"
            value={letter.fromBlock}
            onEdit={onEdit}
            onFocusField={onFocusField}
            placeholder={placeholders.sender}
            className="leading-relaxed"
          />
        </section>
        <div className="text-center">
          <img src={emblem} alt={sheet.emblemAlt} className="mx-auto h-20 w-20 object-contain" />
        </div>
        <section>
          <Block
            field="officeBlock"
            value={letter.officeBlock ?? ''}
            onEdit={onEdit}
            onFocusField={onFocusField}
            placeholder={placeholders.office}
            className="leading-relaxed"
          />
        </section>
      </div>

      <hr className="mt-6 border-t border-slate-400" />

      <div className="mt-8 flex flex-wrap items-baseline justify-center gap-x-1 text-center font-semibold">
        <span className="inline-flex flex-wrap items-baseline">
          {sheet.doNumber}
          <Block
            field="referenceNo"
            value={letter.referenceNo ?? ''}
            onEdit={onEdit}
            onFocusField={onFocusField}
            placeholder={placeholders.doNumber}
            singleLine
            inline
          />
        </span>
        {/* The date is not typed here for the same reason it is not on any other shape: the field
            beside the sheet is a date picker, and this element cannot produce a date the server
            accepts. */}
        {letter.letterDate && (
          <span>
            , {sheet.dated} {formatLetterDate(letter.letterDate)}
          </span>
        )}
      </div>

      {(editable || letter.salutation) && (
        <div data-empty={empty(letter.salutation)} className="mt-8">
          <Block
            field="salutation"
            value={letter.salutation ?? ''}
            onEdit={onEdit}
            onFocusField={onFocusField}
            placeholder={placeholders.salutation}
            singleLine
          />
        </div>
      )}

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
            onFocusField={onFocusField}
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
            onFocusField={onFocusField}
            placeholder={placeholders.reference}
            inline
          />
        </p>
      )}

      <Block
        field="body"
        value={letter.body}
        onEdit={onEdit}
        onFocusField={onFocusField}
        placeholder={placeholders.body}
        className="mt-6 leading-loose"
      />

      <div className="mt-12 flex justify-end">
        <div className="text-right">
          <p className="font-semibold">{sheet.truly}</p>
          <Block
            field="signOff"
            value={letter.signOff ?? ''}
            onEdit={onEdit}
            onFocusField={onFocusField}
            placeholder={placeholders.initials}
            data-empty={empty(letter.signOff)}
            className="mt-2 leading-relaxed"
          />
        </div>
      </div>

      <div className="mt-12">
        <h2 className="font-semibold">{sheet.recipient}</h2>
        <Block
          field="toBlock"
          value={letter.toBlock}
          onEdit={onEdit}
          onFocusField={onFocusField}
          placeholder={placeholders.recipient}
          className="mt-2 leading-relaxed"
        />
      </div>
    </>
  );
}

/**
 * The Office Note shape: internal file noting rather than correspondence, so there is no sender or
 * recipient block at all — the letter still carries a From/To for the columns that require it, but
 * nothing here shows or prints them. A file number heads it at the top right, then a centred title,
 * the subject and reference (each hyphenated or numbered by the writer, the way a recipient list
 * is), a fixed submission phrase nobody types, the numbered-paragraph body, and finally two fixed
 * closing blocks — for orders, and put up for approval — each followed by blank space for a
 * handwritten initial and date rather than anything typed here.
 */
function OfficeNoteBody({
  letter,
  onEdit,
  onFocusField,
  editable,
  empty,
}: {
  letter: Letter;
  onEdit?: (field: LetterField, value: string) => void;
  onFocusField?: (field: LetterField) => void;
  editable: boolean;
  empty: (value: string | null) => boolean;
}) {
  const text = officeNoteText(letter.language);
  const { sheet, placeholders } = text;

  return (
    <>
      {(editable || letter.referenceNo) && (
        <div data-empty={empty(letter.referenceNo)} className="text-right font-semibold">
          <Block
            field="referenceNo"
            value={letter.referenceNo ?? ''}
            onEdit={onEdit}
            onFocusField={onFocusField}
            placeholder={placeholders.referenceNo}
            singleLine
            inline
          />
        </div>
      )}

      <h1 className="mt-4 text-center text-lg font-bold underline">{sheet.title}</h1>

      {(editable || letter.subject) && (
        <p
          data-empty={empty(letter.subject)}
          className="mt-8 pl-16 -indent-16 leading-relaxed sm:pl-20 sm:-indent-20"
        >
          <span className="font-semibold">{sheet.subject}&nbsp;</span>
          <Block
            field="subject"
            value={letter.subject}
            onEdit={onEdit}
            onFocusField={onFocusField}
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
          <span className="font-semibold">{sheet.reference}&nbsp;</span>
          <Block
            field="reference"
            value={letter.reference ?? ''}
            onEdit={onEdit}
            onFocusField={onFocusField}
            placeholder={placeholders.reference}
            inline
          />
        </p>
      )}

      <p className="mt-8 font-semibold">{sheet.submissionPhrase}</p>

      <Block
        field="body"
        value={letter.body}
        onEdit={onEdit}
        onFocusField={onFocusField}
        placeholder={placeholders.body}
        className="mt-6 leading-loose"
      />

      {/* Fixed either way: an Office Note always closes with these two blocks, each with room left
          for a handwritten initial and date rather than anything typed on screen. */}
      <div className="mt-16">
        <p className="font-semibold">{sheet.forOrders}</p>
        <p className="mt-10 text-sm text-slate-500">{sheet.signatureCaption}</p>
      </div>

      <div className="mt-12">
        <p className="font-semibold">{sheet.putUpForApproval}</p>
        <p className="mt-2">{sheet.draftForApproval}</p>
        <p className="mt-10 text-sm text-slate-500">{sheet.signatureCaption}</p>
      </div>
    </>
  );
}

/**
 * One table dropped into a letter, as it is stored in {@link Letter.tableData} (JSON, one entry per
 * table) — its own id, its cells, how big it has been made, and where on the sheet it floats. A
 * letter can carry any number of these, each independent of the others.
 */
export interface TableState {
  /** Stable across edits, so moving or resizing one table never touches another. */
  id: string;
  rows: string[][];
  /** How much of the sheet's width it spans, 20–100 — dragged from the left or right handle. Columns
   *  always divide this width evenly, so the table can never run past the edge of the page. */
  widthPercent: number;
  /** How tall each row is drawn, as a percentage of its normal padding — dragged from the top or
   *  bottom handle. Purely visual; it does not change how many rows there are. */
  heightPercent: number;
  /** The table's left edge, as a percentage of the sheet's width — dragged freely by the move
   *  handle, to wherever the writer wants it, independent of the surrounding text. */
  xPercent: number;
  /** The table's top edge, in pixels down from the top of the sheet — dragged freely by the move
   *  handle, the same way. */
  yPx: number;
}

const MIN_TABLE_WIDTH_PERCENT = 20;
const MIN_TABLE_HEIGHT_PERCENT = 50;
const MAX_TABLE_HEIGHT_PERCENT = 250;

/** Edits one table among however many the letter carries — `next: null` removes it. */
export type TableChangeHandler = (id: string, next: TableState | null) => void;

/** Turns off text selection for the rest of a drag, restored by calling what this returns. Dragging
 *  one of the table's own handles across the sheet's typed text should move or resize the table, not
 *  paint a selection over the words underneath it the way an ordinary click-drag would. */
function suppressTextSelection(): () => void {
  const previous = document.body.style.userSelect;
  document.body.style.userSelect = 'none';
  return () => {
    document.body.style.userSelect = previous;
  };
}

/**
 * One small table of figures dropped into a letter — a schedule, a list of pending items — floating
 * above the letter's text wherever the writer has dragged it, the way a shape dropped onto a page in
 * a word processor sits on top of the page rather than in the flow of the paragraphs. A letter can
 * carry several of these, each independent — one under the subject, another lower down, say.
 *
 * <p>Stored as JSON ({@link Letter.tableData}, an array with one entry per table) rather than as
 * markup: a letter is text plus a handful of typed blocks, and a table that could carry arbitrary
 * HTML would be the one place that stopped being true. How many rows and columns it starts with is
 * decided once, by the writer, when they add it — not guessed at and resized afterwards.
 *
 * <p>Editing a cell is a plain `<input>` rather than the `contentEditable` {@link Block} pattern: a
 * cell is a short, single-line value, and a table's shape (how many rows, how many columns) changes
 * as a whole rather than growing text in place, which a controlled input already handles.
 *
 * <p><b>It can never run past the edge of the page.</b> `table-layout: fixed` divides
 * {@link TableState.widthPercent} evenly across however many columns there are, so nine columns
 * squeeze rather than spill off the sheet the way an auto-sized table would. The four handles — one
 * per side — drag width and row height narrower or wider, live during the drag and written to the
 * draft only once, on release, the same reason {@link Block} does not write on every keystroke.
 *
 * <p><b>The move handle repositions it freely.</b> Held and dragged, it moves the table to wherever
 * the pointer goes — a plain offset against the sheet, nothing about the surrounding text consulted
 * or shown while it moves. It floats over whatever text ends up underneath it, exactly as it was left,
 * rather than pushing that text out of the way.
 */
function LetterTable({
  table,
  onChange,
  onRemove,
}: {
  table: TableState;
  onChange?: (next: TableState) => void;
  /** Removes just this table — a letter with several carries each one's own remove button. */
  onRemove?: () => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const [liveHeight, setLiveHeight] = useState<number | null>(null);
  const [liveX, setLiveX] = useState<number | null>(null);
  const [liveY, setLiveY] = useState<number | null>(null);

  const { id, rows, widthPercent, heightPercent, xPercent, yPx } = table;
  const columnCount = rows[0]?.length ?? 0;
  const width = liveWidth ?? widthPercent;
  const height = liveHeight ?? heightPercent;
  const x = liveX ?? xPercent;
  const y = liveY ?? yPx;

  const commit = (patch: Partial<TableState>) =>
    onChange?.({ id, rows, widthPercent, heightPercent, xPercent, yPx, ...patch });

  const setCell = (rowIndex: number, columnIndex: number, value: string) => {
    const next = rows.map((row) => [...row]);
    next[rowIndex][columnIndex] = value;
    commit({ rows: next });
  };

  const addRow = () => commit({ rows: [...rows, Array.from({ length: columnCount }, () => '')] });
  const removeLastRow = () => commit({ rows: rows.slice(0, -1) });
  const addColumn = () => commit({ rows: rows.map((row) => [...row, '']) });
  const removeLastColumn = () => commit({ rows: rows.map((row) => row.slice(0, -1)) });

  /** Tracks a resize with its own listeners rather than React state per pixel, and writes the draft
   *  only once, on release. `reversed` flips which way a pull grows the table: the trailing handle
   *  (right, bottom) widens by dragging away from the table, the leading one (left, top) by dragging
   *  away the other way.
   *
   *  <p>Pointer capture — rather than listening on `window` — is what makes this reliable: once
   *  captured, every further pointer event for this gesture goes to the handle regardless of what
   *  the pointer ends up over, so dragging across the body's own `contentEditable` region (which
   *  would otherwise start a native text selection and can swallow the events meant for this drag)
   *  cannot interrupt it. */
  const startResize =
    (axis: 'width' | 'height', reversed: boolean) => (event: React.PointerEvent<HTMLDivElement>) => {
      if (!onChange) return;
      event.preventDefault();
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);
      const restoreSelect = suppressTextSelection();

      const container = wrapperRef.current?.parentElement;
      const containerSize =
        axis === 'width' ? (container?.clientWidth ?? 1) : (wrapperRef.current?.offsetHeight ?? 1);
      const start = axis === 'width' ? event.clientX : event.clientY;
      const startPercent = axis === 'width' ? widthPercent : heightPercent;
      const [min, max] =
        axis === 'width' ? [MIN_TABLE_WIDTH_PERCENT, 100] : [MIN_TABLE_HEIGHT_PERCENT, MAX_TABLE_HEIGHT_PERCENT];

      const percentFor = (client: number) => {
        const deltaPx = reversed ? start - client : client - start;
        const deltaPercent = (deltaPx / containerSize) * 100;
        return Math.min(max, Math.max(min, startPercent + deltaPercent));
      };
      const setLive = axis === 'width' ? setLiveWidth : setLiveHeight;

      const onMove = (moveEvent: PointerEvent) =>
        setLive(percentFor(axis === 'width' ? moveEvent.clientX : moveEvent.clientY));
      const onUp = (upEvent: PointerEvent) => {
        setLive(null);
        restoreSelect();
        commit({
          [axis === 'width' ? 'widthPercent' : 'heightPercent']: percentFor(
            axis === 'width' ? upEvent.clientX : upEvent.clientY,
          ),
        });
        handle.onpointermove = null;
        handle.onpointerup = null;
      };
      handle.onpointermove = onMove;
      handle.onpointerup = onUp;
    };

  /**
   * Held and dragged, this moves the table to wherever the pointer goes — a plain offset against the
   * sheet it sits on, tracked live and written to the draft only once, on release, the same reason
   * {@link startResize} does not write on every pixel of movement either. Nothing about the
   * surrounding text is read or shown while this happens: the table floats freely, so there is
   * nothing here for it to land "in" or "on" the way there once was.
   *
   * <p>Pointer capture — rather than listening on `window` — is what makes this reliable: once
   * captured, every further pointer event for this gesture goes to the handle regardless of what the
   * pointer ends up over, so dragging across the letter's own `contentEditable` text (which would
   * otherwise start a native text selection and can swallow the events meant for this drag) cannot
   * interrupt it.
   */
  const startMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!onChange) return;
    event.preventDefault();
    const sheet = wrapperRef.current?.parentElement;
    if (!sheet) return;

    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const restoreSelect = suppressTextSelection();

    const sheetWidth = sheet.clientWidth || 1;
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startX = xPercent;
    const startY = yPx;

    const positionFor = (clientX: number, clientY: number) => {
      const deltaXPercent = ((clientX - startClientX) / sheetWidth) * 100;
      return {
        x: Math.min(100 - widthPercent, Math.max(0, startX + deltaXPercent)),
        y: Math.max(0, startY + (clientY - startClientY)),
      };
    };

    const onMove = (moveEvent: PointerEvent) => {
      const { x: nextX, y: nextY } = positionFor(moveEvent.clientX, moveEvent.clientY);
      setLiveX(nextX);
      setLiveY(nextY);
    };
    const onUp = (upEvent: PointerEvent) => {
      const { x: nextX, y: nextY } = positionFor(upEvent.clientX, upEvent.clientY);
      setLiveX(null);
      setLiveY(null);
      restoreSelect();
      commit({ xPercent: nextX, yPx: nextY });
      handle.onpointermove = null;
      handle.onpointerup = null;
    };
    handle.onpointermove = onMove;
    handle.onpointerup = onUp;
  };

  const cellPad = `${(height / 100) * 0.5}rem ${(height / 100) * 0.75}rem`;
  const textSize = height < 85 ? 'text-xs' : 'text-sm';
  const edgeHandle = 'absolute touch-none print:hidden';
  const gripDot = 'bg-line-strong opacity-0 hover:opacity-100 rounded-full';

  return (
    <div
      ref={wrapperRef}
      className="absolute max-w-full rounded-sm bg-surface shadow-card print:shadow-none"
      style={{ width: `${width}%`, left: `${x}%`, top: `${y}px` }}
    >
      {onChange && (
        <>
          <button
            type="button"
            onPointerDown={startMove}
            title="Hold and drag to move the table to another part of the letter"
            aria-label="Hold and drag to move the table"
            className="absolute -left-1 -top-9 cursor-grab touch-none rounded-md border
              border-line-strong bg-surface p-1.5 text-slate-500 shadow-card hover:bg-navy-50
              active:cursor-grabbing print:hidden"
          >
            <svg aria-hidden viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <circle cx="8" cy="6" r="1.6" />
              <circle cx="16" cy="6" r="1.6" />
              <circle cx="8" cy="12" r="1.6" />
              <circle cx="16" cy="12" r="1.6" />
              <circle cx="8" cy="18" r="1.6" />
              <circle cx="16" cy="18" r="1.6" />
            </svg>
          </button>

          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              title="Remove this table"
              aria-label="Remove this table"
              className="absolute -right-1 -top-9 rounded-md border border-line-strong bg-surface
                p-1.5 text-slate-500 shadow-card hover:border-red-300 hover:bg-red-50
                hover:text-red-600 print:hidden"
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
              >
                <path d="M18 6 6 18" />
                <path d="M6 6l12 12" />
              </svg>
            </button>
          )}

          {/* One handle per side, so any edge can be pulled in or let back out. */}
          <div
            onPointerDown={startResize('width', true)}
            title="Drag to resize from the left"
            aria-label="Drag to resize the table from the left"
            role="slider"
            aria-valuenow={Math.round(width)}
            aria-valuemin={MIN_TABLE_WIDTH_PERCENT}
            aria-valuemax={100}
            className={`${edgeHandle} -left-1.5 top-0 bottom-0 w-3 cursor-ew-resize`}
          >
            <div className={`mx-auto h-full w-1 ${gripDot}`} />
          </div>
          <div
            onPointerDown={startResize('width', false)}
            title="Drag to resize from the right"
            aria-label="Drag to resize the table from the right"
            role="slider"
            aria-valuenow={Math.round(width)}
            aria-valuemin={MIN_TABLE_WIDTH_PERCENT}
            aria-valuemax={100}
            className={`${edgeHandle} -right-1.5 top-0 bottom-0 w-3 cursor-ew-resize`}
          >
            <div className={`mx-auto h-full w-1 ${gripDot}`} />
          </div>
          <div
            onPointerDown={startResize('height', true)}
            title="Drag to resize from the top"
            aria-label="Drag to resize the table from the top"
            role="slider"
            aria-valuenow={Math.round(height)}
            aria-valuemin={MIN_TABLE_HEIGHT_PERCENT}
            aria-valuemax={MAX_TABLE_HEIGHT_PERCENT}
            className={`${edgeHandle} -top-1.5 left-0 right-0 h-3 cursor-ns-resize`}
          >
            <div className={`mx-auto h-1 w-full ${gripDot}`} />
          </div>
          <div
            onPointerDown={startResize('height', false)}
            title="Drag to resize from the bottom"
            aria-label="Drag to resize the table from the bottom"
            role="slider"
            aria-valuenow={Math.round(height)}
            aria-valuemin={MIN_TABLE_HEIGHT_PERCENT}
            aria-valuemax={MAX_TABLE_HEIGHT_PERCENT}
            className={`${edgeHandle} -bottom-1.5 left-0 right-0 h-3 cursor-ns-resize`}
          >
            <div className={`mx-auto h-1 w-full ${gripDot}`} />
          </div>
        </>
      )}

      <table className={`w-full border-collapse ${textSize}`} style={{ tableLayout: 'fixed' }}>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, columnIndex) =>
                onChange ? (
                  <td key={columnIndex} className="border border-slate-400 p-0">
                    <input
                      value={cell}
                      onChange={(event) => setCell(rowIndex, columnIndex, event.target.value)}
                      aria-label={`Row ${rowIndex + 1}, column ${columnIndex + 1}`}
                      style={{ padding: cellPad }}
                      className={`w-full bg-transparent outline-none ${rowIndex === 0 ? 'font-semibold' : ''}`}
                    />
                  </td>
                ) : (
                  <td
                    key={columnIndex}
                    style={{ padding: cellPad }}
                    className={`border border-slate-400 break-words ${rowIndex === 0 ? 'font-semibold' : ''}`}
                  >
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {onChange && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 print:hidden">
          <button type="button" onClick={addRow} className="text-xs font-semibold text-navy-700 hover:underline">
            + Row
          </button>
          <button
            type="button"
            onClick={removeLastRow}
            disabled={rows.length <= 1}
            className="text-xs font-semibold text-slate-500 hover:underline disabled:opacity-40"
          >
            − Row
          </button>
          <button
            type="button"
            onClick={addColumn}
            className="text-xs font-semibold text-navy-700 hover:underline"
          >
            + Column
          </button>
          <button
            type="button"
            onClick={removeLastColumn}
            disabled={columnCount <= 1}
            className="text-xs font-semibold text-slate-500 hover:underline disabled:opacity-40"
          >
            − Column
          </button>
        </div>
      )}
    </div>
  );
}

let nextFallbackTableId = 0;

/** One table, read from whatever shape it happened to be stored in, or null if it has no rows. */
function normalizeTable(candidate: Record<string, unknown>): TableState | null {
  const rows = Array.isArray(candidate.rows)
    ? candidate.rows.filter((row): row is string[] => Array.isArray(row))
    : [];
  if (rows.length === 0) return null;

  const widthPercent =
    typeof candidate.widthPercent === 'number'
      ? Math.min(100, Math.max(MIN_TABLE_WIDTH_PERCENT, candidate.widthPercent))
      : 100;

  return {
    // A table saved before it carried an id of its own gets one made up on the spot — stable only
    // for this render, but the first edit after that writes it back with the id attached, same as
    // width, height and position have always been filled in for a table saved before those existed.
    id: typeof candidate.id === 'string' ? candidate.id : `legacy-${nextFallbackTableId++}`,
    rows,
    widthPercent,
    heightPercent:
      typeof candidate.heightPercent === 'number'
        ? Math.min(MAX_TABLE_HEIGHT_PERCENT, Math.max(MIN_TABLE_HEIGHT_PERCENT, candidate.heightPercent))
        : 100,
    // A table saved before it floated freely (it carried an `anchor` instead) has no position of its
    // own yet — it starts at the sheet's top-left corner rather than crashing on the missing field.
    xPercent:
      typeof candidate.xPercent === 'number' ? Math.min(100 - widthPercent, Math.max(0, candidate.xPercent)) : 0,
    yPx: typeof candidate.yPx === 'number' ? Math.max(0, candidate.yPx) : 0,
  };
}

/**
 * Every table on the letter, read from {@link Letter.tableData} — never a crash, whatever is there.
 *
 * <p>Three shapes are read, oldest first: bare rows (`[["a","b"]]`), from before a table carried a
 * size, an anchor or a neighbour; one table object (`{rows, widthPercent, ...}`), from before a
 * letter could carry more than one; and the current shape, an array of those objects. All three
 * come back as a list — of one table, for the first two — so the rest of this file only ever has to
 * handle "however many tables there are".
 */
export function parseTables(raw: string | null): TableState[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      // An array of table objects (current shape), or bare rows for one table (oldest shape) — the
      // two are told apart by what an entry of each looks like: a table object, or a row of cells.
      const isBareRows = parsed.length === 0 || Array.isArray(parsed[0]);
      if (isBareRows) {
        const single = normalizeTable({ rows: parsed });
        return single ? [single] : [];
      }
      return parsed
        .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
        .map(normalizeTable)
        .filter((table): table is TableState => table !== null);
    }

    if (parsed && typeof parsed === 'object') {
      // One table object, from before a letter could carry more than one.
      const single = normalizeTable(parsed as Record<string, unknown>);
      return single ? [single] : [];
    }

    return [];
  } catch {
    return [];
  }
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
  onFocusField,
  placeholder,
  className = '',
  singleLine = false,
  inline = false,
  'data-empty': dataEmpty,
}: {
  field: LetterField;
  value: string;
  onEdit?: (field: LetterField, value: string) => void;
  /** Told which block the writer is typing in, so "+ Add table" knows where to drop one in. */
  onFocusField?: (field: LetterField) => void;
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
    onFocus: () => onFocusField?.(field),
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
