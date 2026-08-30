import type { DictationLanguage } from '@/lib/dictation';
import type { LetterLanguage } from '@/types/api';

/**
 * An English letter and a Tamil letter, as two documents rather than one document with a toggle.
 *
 * <p><b>The language belongs to the letter.</b> A Tamil letter is not an English one with Tamil
 * typed into it: its headings are Tamil, its Sub: and Ref: labels are Tamil, its salutation is
 * Tamil. Those are printed by the sheet rather than typed by the author, so if the language were a
 * setting on the screen instead of a property of the letter, reopening a Tamil letter in an English
 * session would print it with English headings — a document that came out differently from the one
 * that was issued.
 *
 * <p>This module is the whole of the difference: everything English and Tamil disagree about is a
 * value in {@link LETTER_TEXT}, so there is one place to correct a wording and no second letter
 * screen to keep in step with the first.
 *
 * <p>It is deliberately not an internationalisation of the application. The rest of the system is in
 * English for everybody; what is translated here is the letter — the thing that leaves the building
 * — and the boxes used to write it.
 */

export const LETTER_LANGUAGES = [
  { code: 'EN', label: 'English', short: 'EN' },
  { code: 'TA', label: 'தமிழ்', short: 'தமிழ்' },
] as const satisfies ReadonlyArray<{ code: LetterLanguage; label: string; short: string }>;

/** What the browser is asked to recognise when dictating into a letter of this language. */
export const DICTATION_FOR: Record<LetterLanguage, DictationLanguage> = {
  EN: 'en-IN',
  TA: 'ta-IN',
};

/** The `lang` attribute the sheet carries, so a browser hyphenates and reads it correctly. */
export const HTML_LANG: Record<LetterLanguage, string> = { EN: 'en-IN', TA: 'ta' };

/** The headings and labels the sheet prints — the part of a letter nobody types. */
export interface SheetLabels {
  from: string;
  to: string;
  /** Precedes the office's file number: "Lr.No." on an English letter. */
  letterNo: string;
  dated: string;
  subject: string;
  reference: string;
  enclosure: string;
  copyTo: string;
}

/** The names on the boxes the letter is written in. */
export interface FormLabels {
  headingSection: string;
  letterSection: string;
  closingSection: string;

  referenceNo: string;
  referenceNoHint: string;
  date: string;
  from: string;
  fromHint: string;
  to: string;
  toHint: string;
  toPlaceholder: string;

  salutation: string;
  subject: string;
  subjectHint: string;
  reference: string;
  referenceHint: string;
  body: string;
  bodyHint: string;

  enclosure: string;
  enclosurePlaceholder: string;
  signOff: string;
  signOffHint: string;
  copyTo: string;
  copyToHint: string;
}

interface LetterText {
  sheet: SheetLabels;
  form: FormLabels;
  /** What a new letter opens with where the template says nothing. */
  defaultSalutation: string;
  /** Shown in an empty block of the preview, to say what belongs there. Never printed. */
  placeholders: Record<keyof SheetLabels | 'body' | 'salutation' | 'signOff', string>;
}

export const LETTER_TEXT: Record<LetterLanguage, LetterText> = {
  EN: {
    sheet: {
      from: 'From,',
      to: 'To,',
      letterNo: 'Lr.No.',
      dated: 'Dated:',
      subject: 'Sub:',
      reference: 'Ref:',
      enclosure: 'Encl:',
      copyTo: 'Copy to.',
    },
    form: {
      headingSection: 'Heading',
      letterSection: 'The letter',
      closingSection: 'Closing',

      referenceNo: 'File number',
      referenceNoHint: 'Printed as Lr.No.',
      date: 'Date',
      from: 'From',
      fromHint: 'Filled from your profile. Edit it here for this letter only.',
      to: 'To',
      toHint: 'One recipient per line; number them if there are several.',
      toPlaceholder: '1. The Commissioner of MBC & DNC, Ch-5.\n2. The Commissioner of MW, Ch-05.',

      salutation: 'Salutation',
      subject: 'Subject',
      subjectHint: 'Printed after Sub:',
      reference: 'Reference',
      referenceHint: 'Printed after Ref: — the order or letter this one answers',
      body: 'Body',
      bodyHint: 'Blank lines separate paragraphs, exactly as they will print',

      enclosure: 'Enclosure',
      enclosurePlaceholder: 'G.O Copy.',
      signOff: 'Signature',
      signOffHint: 'Sits above the line, on the right',
      copyTo: 'Copy to',
      copyToHint: 'Left off the letter entirely when empty',
    },
    defaultSalutation: 'Sir/Madam,',
    placeholders: {
      from: 'Your name, post and office',
      to: 'Who the letter is to',
      letterNo: 'File number',
      dated: 'Date',
      subject: 'What the letter is about',
      reference: 'The order or letter this one answers',
      enclosure: 'What is enclosed',
      copyTo: 'Who else gets a copy',
      body: 'Write the letter here',
      salutation: 'Sir/Madam,',
      signOff: 'Name and post',
    },
  },

  TA: {
    sheet: {
      from: 'அனுப்புநர்,',
      to: 'பெறுநர்,',
      letterNo: 'க.எண்.',
      dated: 'நாள்:',
      subject: 'பொருள்:',
      reference: 'பார்வை:',
      enclosure: 'இணைப்பு:',
      copyTo: 'நகல்:',
    },
    form: {
      headingSection: 'தலைப்பு',
      letterSection: 'கடிதம்',
      closingSection: 'முடிவுரை',

      referenceNo: 'கோப்பு எண்',
      referenceNoHint: 'கடிதத்தில் "க.எண்." என அச்சிடப்படும்',
      date: 'நாள்',
      from: 'அனுப்புநர்',
      fromHint: 'உங்கள் சுயவிவரத்திலிருந்து நிரப்பப்பட்டது. இக்கடிதத்திற்கு மட்டும் இங்கே மாற்றலாம்.',
      to: 'பெறுநர்',
      toHint: 'ஒரு வரிக்கு ஒரு பெறுநர்; பலர் இருப்பின் எண்ணிடவும்.',
      toPlaceholder: '1. ஆணையர், மிகவும் பிற்படுத்தப்பட்டோர் நலத்துறை, சென்னை-5.\n2. ஆணையர், சிறுபான்மையினர் நலத்துறை, சென்னை-5.',

      salutation: 'விளிப்பு',
      subject: 'பொருள்',
      subjectHint: '"பொருள்:" என்பதற்குப் பிறகு அச்சிடப்படும்',
      reference: 'பார்வை',
      referenceHint: '"பார்வை:" என்பதற்குப் பிறகு — இக்கடிதம் பதிலளிக்கும் ஆணை அல்லது கடிதம்',
      body: 'கடித உரை',
      bodyHint: 'காலி வரிகள் பத்திகளைப் பிரிக்கும் — அச்சிடும்போதும் அப்படியே இருக்கும்',

      enclosure: 'இணைப்பு',
      enclosurePlaceholder: 'அரசாணை நகல்.',
      signOff: 'கையொப்பம்',
      signOffHint: 'வலப்புறம், கோட்டுக்கு மேலே இடம்பெறும்',
      copyTo: 'நகல்',
      copyToHint: 'காலியாக இருந்தால் கடிதத்தில் இடம்பெறாது',
    },
    defaultSalutation: 'ஐயா/அம்மா,',
    placeholders: {
      from: 'உங்கள் பெயர், பதவி மற்றும் அலுவலகம்',
      to: 'கடிதம் யாருக்கு',
      letterNo: 'கோப்பு எண்',
      dated: 'நாள்',
      subject: 'கடிதத்தின் பொருள்',
      reference: 'இக்கடிதம் பதிலளிக்கும் ஆணை அல்லது கடிதம்',
      enclosure: 'இணைக்கப்பட்டவை',
      copyTo: 'நகல் பெறுவோர்',
      body: 'கடிதத்தை இங்கே எழுதுங்கள்',
      salutation: 'ஐயா/அம்மா,',
      signOff: 'பெயர் மற்றும் பதவி',
    },
  },
};

/** The language of a letter, with English standing in for anything a server has not said. */
export function letterText(language: LetterLanguage | null | undefined): LetterText {
  return LETTER_TEXT[language ?? 'EN'] ?? LETTER_TEXT.EN;
}
