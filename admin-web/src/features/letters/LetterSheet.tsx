import { useEffect, useRef } from 'react';
import type { Letter, LetterLanguage } from '@/types/api';
import { formatLetterDate } from '@/features/letters/format';
import { HTML_LANG, doText, goText, letterText, memoText } from '@/features/letters/language';

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
 * A memo ({@link Letter.format} `MEMO`), a Government Order (`GO`) and a Demi-Official letter (`DO`)
 * are different shapes rather than a letter with blocks left out — a memo heads with the office and
 * its file number under a centred title and has no salutation, enclosure or "Copy to."; a G.O. heads
 * with the state emblem, the department and its number and date, then an abstract, and below that a
 * single free-form order the writer composes in full — nothing about "Read", "-oOo-" or "ORDER:" is
 * imposed — authenticated "by order of the Governor" rather than signed off; a D.O. heads with the
 * writer's name and the office's own details side by side, is written in the first person, and
 * closes "Yours sincerely," rather than a plain signature. {@link LetterBody}, {@link MemoBody},
 * {@link GoBody} and {@link DoBody} draw the four.
 *
 * <p><b>A table is not tied to any one shape.</b> Any letter can carry one small table of figures —
 * a schedule, a list of pending items — printed at the end, after everything else. It is drawn once
 * here rather than inside each shape's own component: {@link Letter.tableData} is JSON rows of
 * cells, and {@link LetterTable} draws nothing when it is absent or empty.
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
  onTableChange,
}: {
  letter: Letter;
  /** Supplied by the editor; absent wherever the letter is only being shown. */
  onEdit?: (field: LetterField, value: string) => void;
  /** Supplied alongside `onEdit`; edits the table's cells and shape rather than a single block. */
  onTableChange?: (rows: string[][]) => void;
}) {
  const editable = onEdit !== undefined;

  /** Shown but not printed: a block nobody filled in is not part of the letter. */
  const empty = (value: string | null) => (value ?? '').trim().length === 0;

  const body =
    letter.format === 'MEMO' ? (
      <MemoBody letter={letter} onEdit={onEdit} editable={editable} empty={empty} />
    ) : letter.format === 'GO' ? (
      <GoBody letter={letter} onEdit={onEdit} editable={editable} empty={empty} />
    ) : letter.format === 'DO' ? (
      <DoBody letter={letter} onEdit={onEdit} editable={editable} empty={empty} />
    ) : (
      <LetterBody letter={letter} onEdit={onEdit} editable={editable} empty={empty} />
    );

  return (
    <article
      lang={HTML_LANG[letter.language ?? 'EN']}
      className="letter-sheet mx-auto w-full max-w-[210mm] rounded-xl border border-line bg-surface
        px-10 py-12 text-slate-900 shadow-card print:max-w-none print:rounded-none print:border-0
        print:px-0 print:py-0 print:shadow-none"
    >
      {body}
      <LetterTable tableData={letter.tableData} onChange={onTableChange} />
    </article>
  );
}

/** The office letter shape: From/To at the top, a salutation, and the body addressed to the reader. */
function LetterBody({
  letter,
  onEdit,
  editable,
  empty,
}: {
  letter: Letter;
  onEdit?: (field: LetterField, value: string) => void;
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
  editable,
  empty,
}: {
  letter: Letter;
  onEdit?: (field: LetterField, value: string) => void;
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

      <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2">
        <section>
          <h2 className="font-semibold">{sheet.recipient}</h2>
          <Block
            field="toBlock"
            value={letter.toBlock}
            onEdit={onEdit}
            placeholder={placeholders.recipient}
            className="mt-2 leading-relaxed"
          />
        </section>
        <section className="sm:text-right">
          <Block
            field="signOff"
            value={letter.signOff ?? ''}
            onEdit={onEdit}
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
  editable,
  empty,
}: {
  letter: Letter;
  onEdit?: (field: LetterField, value: string) => void;
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
            placeholder={placeholders.copyTo}
            className="mt-2 leading-relaxed"
          />
        </div>
      )}
    </>
  );
}

/**
 * The Demi-Official letter shape: the state emblem centred at the top — the same one a G.O. is
 * headed with — then the writer's name and designation on the left, the office's own name, place,
 * phone and e-mail on the right — never headed "From," — then the D.O. number and date, a
 * salutation, the subject and reference, and a body the writer composes in the first person. It
 * closes with the fixed phrase "Yours sincerely," (never "Yours lovingly", and never something the
 * sheet lets anyone type) above the signing officer's initials, and "பெறுநர்" (Recipient) rather than
 * "To," beneath it.
 */
function DoBody({
  letter,
  onEdit,
  editable,
  empty,
}: {
  letter: Letter;
  onEdit?: (field: LetterField, value: string) => void;
  editable: boolean;
  empty: (value: string | null) => boolean;
}) {
  const text = doText(letter.language);
  const { sheet, placeholders } = text;
  const emblem = EMBLEM_SRC[letter.language ?? 'EN'];

  return (
    <>
      <div className="text-center">
        <img src={emblem} alt={sheet.emblemAlt} className="mx-auto h-24 w-24 object-contain" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-8 sm:grid-cols-2">
        <section>
          <Block
            field="fromBlock"
            value={letter.fromBlock}
            onEdit={onEdit}
            placeholder={placeholders.sender}
            className="leading-relaxed"
          />
        </section>
        <section className="sm:text-right">
          <Block
            field="officeBlock"
            value={letter.officeBlock ?? ''}
            onEdit={onEdit}
            placeholder={placeholders.office}
            className="leading-relaxed"
          />
        </section>
      </div>

      <div className="mt-8 flex flex-wrap items-baseline justify-center gap-x-1 text-center font-semibold">
        <span className="inline-flex flex-wrap items-baseline">
          {sheet.doNumber}
          <Block
            field="referenceNo"
            value={letter.referenceNo ?? ''}
            onEdit={onEdit}
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

      <Block
        field="body"
        value={letter.body}
        onEdit={onEdit}
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
          placeholder={placeholders.recipient}
          className="mt-2 leading-relaxed"
        />
      </div>
    </>
  );
}

/**
 * A small table of figures dropped into a letter — a schedule, a list of pending items — printed at
 * the end regardless of which of the four shapes it is on.
 *
 * <p>Stored as JSON rows of cells ({@link Letter.tableData}) rather than as markup: a letter is text
 * plus a handful of typed blocks, and a table that could carry arbitrary HTML would be the one place
 * that stopped being true. Draws nothing when there is no table — adding one is opt-in, never a
 * blank grid the writer has to notice and delete.
 *
 * <p>Editing is a plain `<input>` per cell rather than the `contentEditable` {@link Block} pattern:
 * a cell is a short, single-line value, and a table's structure (how many rows, how many columns)
 * changes as a whole rather than growing text in place, which a controlled input already handles.
 */
function LetterTable({
  tableData,
  onChange,
}: {
  tableData: string | null;
  onChange?: (rows: string[][]) => void;
}) {
  const rows = parseTable(tableData);
  if (rows.length === 0) return null;

  const columnCount = rows[0]?.length ?? 0;

  const setCell = (rowIndex: number, columnIndex: number, value: string) => {
    if (!onChange) return;
    const next = rows.map((row) => [...row]);
    next[rowIndex][columnIndex] = value;
    onChange(next);
  };

  const addRow = () => onChange?.([...rows, Array.from({ length: columnCount }, () => '')]);
  const removeLastRow = () => onChange?.(rows.slice(0, -1));
  const addColumn = () => onChange?.(rows.map((row) => [...row, '']));
  const removeLastColumn = () => onChange?.(rows.map((row) => row.slice(0, -1)));

  return (
    <div className="mt-8">
      <table className="w-full border-collapse text-sm">
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
                      className={`w-full bg-transparent px-2 py-1 outline-none ${
                        rowIndex === 0 ? 'font-semibold' : ''
                      }`}
                    />
                  </td>
                ) : (
                  <td
                    key={columnIndex}
                    className={`border border-slate-400 px-2 py-1 ${rowIndex === 0 ? 'font-semibold' : ''}`}
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

/** The table as it was stored, or an empty grid when there is nothing to parse — never a crash. */
function parseTable(raw: string | null): string[][] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is string[] => Array.isArray(row));
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
