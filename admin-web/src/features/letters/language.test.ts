import { describe, expect, it } from 'vitest';
import {
  DICTATION_FOR,
  HTML_LANG,
  LETTER_LANGUAGES,
  LETTER_TEXT,
  letterText,
} from '@/features/letters/language';

describe('the two languages a letter can be written in', () => {
  it('prints Tamil headings on a Tamil letter, not English ones with Tamil text under them', () => {
    const tamil = LETTER_TEXT.TA.sheet;

    expect(tamil.from).toBe('விடுநர்,');
    expect(tamil.to).toBe('பெறுநர்,');
    expect(tamil.subject).toBe('பொருள்:');
    expect(tamil.reference).toBe('பார்வை:');
    expect(tamil.copyTo).toBe('நகல்:');
  });

  /*
   * The sheet reads every one of these off the language. A label added to one set and forgotten in
   * the other prints as `undefined` on somebody's letter, which is exactly the failure nobody sees
   * until it is on paper.
   */
  it('says the same things in both languages', () => {
    const english = LETTER_TEXT.EN;
    const tamil = LETTER_TEXT.TA;

    expect(Object.keys(tamil.sheet).sort()).toEqual(Object.keys(english.sheet).sort());
    expect(Object.keys(tamil.form).sort()).toEqual(Object.keys(english.form).sort());
    expect(Object.keys(tamil.placeholders).sort()).toEqual(Object.keys(english.placeholders).sort());

    for (const set of [tamil.sheet, tamil.form, tamil.placeholders]) {
      for (const [name, value] of Object.entries(set)) {
        expect(value, `${name} is empty in Tamil`).not.toBe('');
      }
    }
  });

  it('opens each language with its own salutation', () => {
    expect(LETTER_TEXT.EN.defaultSalutation).toBe('Sir/Madam,');
    expect(LETTER_TEXT.TA.defaultSalutation).toBe('ஐயா/அம்மா,');
  });

  it('dictates in the language the letter is being written in', () => {
    expect(DICTATION_FOR.EN).toBe('en-IN');
    expect(DICTATION_FOR.TA).toBe('ta-IN');
  });

  it('tells the browser which language the sheet is, so it renders and reads it correctly', () => {
    expect(HTML_LANG.TA).toBe('ta');
  });

  it('offers both, Tamil among them, wherever a language is chosen', () => {
    expect(LETTER_LANGUAGES.map((option) => option.code)).toEqual(['EN', 'TA']);
  });

  /*
   * A letter saved before the language existed as a column, or one from a server that has not been
   * updated yet, is an English letter. Nothing should render `undefined` where a heading goes.
   */
  it('falls back to English rather than to nothing', () => {
    expect(letterText(null).sheet.from).toBe('From,');
    expect(letterText(undefined).sheet.from).toBe('From,');
    expect(letterText('TA').sheet.from).toBe('விடுநர்,');
  });
});
