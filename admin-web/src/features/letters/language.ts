import type { DictationLanguage } from '@/lib/dictation';
import type { LetterFormat, LetterGoType, LetterLanguage } from '@/types/api';

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

/** The five shapes a letter can be written in — chosen once, changeable while writing. */
export const LETTER_FORMATS = [
  { code: 'LETTER', label: 'Letter', short: 'Letter' },
  { code: 'MEMO', label: 'Memo', short: 'Memo' },
  { code: 'GO', label: 'Government Order', short: 'G.O.' },
  { code: 'DO', label: 'D.O. Letter', short: 'D.O.' },
  { code: 'OFFICE_NOTE', label: 'Office Note', short: 'Note' },
] as const satisfies ReadonlyArray<{ code: LetterFormat; label: string; short: string }>;

/**
 * Who a Demi-Official letter is being written to, relative to its author — which decides the
 * salutation ({@link DO_SALUTATIONS}) a real D.O. is opened with. Not stored on the letter itself:
 * it only ever fills in a starting salutation, which the writer can then edit like any other block.
 */
export const DO_HIERARCHIES = [
  { code: 'SENIOR_TO_SUBORDINATE', label: 'Writing to a subordinate' },
  { code: 'SUBORDINATE_TO_SENIOR', label: 'Writing to a senior' },
  { code: 'EQUAL', label: 'Equal rank / another department' },
] as const;

export type DoHierarchy = (typeof DO_HIERARCHIES)[number]['code'];

/**
 * The salutation a D.O. opens with, by who is writing to whom. "[Name]" is left for the writer to
 * fill in — the letter carries no structured field for the recipient's bare name to fill it from.
 */
export const DO_SALUTATIONS: Record<LetterLanguage, Record<DoHierarchy, string>> = {
  EN: {
    SENIOR_TO_SUBORDINATE: 'My dear [Name],',
    SUBORDINATE_TO_SENIOR: 'Respected Sir / Madam,',
    EQUAL: 'Dear Thiru./Tmt./Selvi [Name],',
  },
  TA: {
    SENIOR_TO_SUBORDINATE: 'எனதன்பார்ந்த [பெயர்],',
    SUBORDINATE_TO_SENIOR: 'மதிப்பிற்குரிய ஐயா / அம்மையீர்,',
    EQUAL: 'அன்பார்ந்த திரு./திருமதி/செல்வி [பெயர்],',
  },
};

/** The classification a Government Order is issued under, printed in brackets before its number. */
export const GO_TYPES = [
  { code: 'MS', short: 'Ms' },
  { code: 'RT', short: 'Rt' },
  { code: 'PT', short: 'Pt' },
  { code: 'ONE_D', short: '1D' },
] as const satisfies ReadonlyArray<{ code: LetterGoType; short: string }>;

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
  /** The salutation a new letter opens with in this language. */
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
      from: 'விடுநர்,',
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
      from: 'விடுநர்',
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

/**
 * The headings and labels a memo prints — its own set, not a trimmed-down letter.
 *
 * <p>A memo has no salutation and is not addressed "From" and "To" the way a letter is: the office
 * heads it, a subordinate office or officer receives it, and the body is written about them in the
 * third person rather than to them. Kept apart from {@link SheetLabels}/{@link FormLabels} rather
 * than folding format into those shapes, because a field either belongs to every letter or it does
 * not — there is no "sometimes" cell to leave blank in a table meant to be read at a glance.
 */
export interface MemoSheetLabels {
  fileNo: string;
  office: string;
  dated: string;
  title: string;
  subject: string;
  reference: string;
  recipient: string;
}

export interface MemoFormLabels {
  headingSection: string;
  bodySection: string;
  closingSection: string;

  referenceNo: string;
  referenceNoHint: string;
  date: string;
  office: string;
  officeHint: string;
  recipient: string;
  recipientHint: string;
  recipientPlaceholder: string;

  subject: string;
  subjectHint: string;
  reference: string;
  referenceHint: string;
  body: string;
  bodyHint: string;

  designation: string;
  designationHint: string;
}

interface MemoText {
  sheet: MemoSheetLabels;
  form: MemoFormLabels;
  placeholders: Record<'office' | 'recipient' | 'fileNo' | 'subject' | 'reference' | 'body' | 'designation', string>;
}

export const MEMO_TEXT: Record<LetterLanguage, MemoText> = {
  EN: {
    sheet: {
      fileNo: 'File No.',
      office: 'Office:',
      dated: 'Date:',
      title: 'MEMORANDUM',
      subject: 'Sub:',
      reference: 'Ref:',
      recipient: 'To,',
    },
    form: {
      headingSection: 'Heading',
      bodySection: 'The memo',
      closingSection: 'Closing',

      referenceNo: 'File number',
      referenceNoHint: 'Printed as File No.',
      date: 'Date',
      office: 'Office',
      officeHint: 'Filled from your profile. Edit it here for this memo only.',
      recipient: 'To',
      recipientHint: 'The subordinate office or officer this memo is addressed to.',
      recipientPlaceholder: 'Tahsildar, Egmore Taluk.',

      subject: 'Subject',
      subjectHint: 'Printed after Sub:',
      reference: 'Reference',
      referenceHint: 'Printed after Ref: — the order or letter this one answers',
      body: 'Body',
      bodyHint: 'Written in the third person — "is directed to", not "I direct"',

      designation: "Issuing officer's designation",
      designationHint: 'Sits above the line, on the right',
    },
    placeholders: {
      fileNo: 'File number',
      office: 'Office name and place',
      recipient: 'Who the memo is to',
      subject: 'What the memo is about',
      reference: 'The order or letter this one answers',
      body: 'Write the memo here, in the third person',
      designation: 'Name and post',
    },
  },

  TA: {
    sheet: {
      fileNo: 'கோப்பு எண்:',
      office: 'அலுவலகத்தின் பெயர்:',
      dated: 'நாள்:',
      title: 'குறிப்பாணை',
      subject: 'பொருள்:',
      reference: 'பார்வை:',
      recipient: 'பெறுநர்:',
    },
    form: {
      headingSection: 'தலைப்பு',
      bodySection: 'குறிப்பாணை உரை',
      closingSection: 'முடிவுரை',

      referenceNo: 'கோப்பு எண்',
      referenceNoHint: 'குறிப்பாணையில் "கோப்பு எண்:" என அச்சிடப்படும்',
      date: 'நாள்',
      office: 'அலுவலகம்',
      officeHint: 'உங்கள் சுயவிவரத்திலிருந்து நிரப்பப்பட்டது. இக்குறிப்பாணைக்கு மட்டும் இங்கே மாற்றலாம்.',
      recipient: 'பெறுநர்',
      recipientHint: 'கீழ்நிலை அலுவலகம் அல்லது அலுவலரின் பதவி மற்றும் முகவரி.',
      recipientPlaceholder: 'வட்டாட்சியர், எழும்பூர் வட்டம்.',

      subject: 'பொருள்',
      subjectHint: '"பொருள்:" என்பதற்குப் பிறகு அச்சிடப்படும்',
      reference: 'பார்வை',
      referenceHint: '"பார்வை:" என்பதற்குப் பிறகு — இக்குறிப்பாணை பதிலளிக்கும் ஆணை அல்லது கடிதம்',
      body: 'குறிப்பாணை உரை',
      bodyHint: 'மூன்றாம் நபர் / செயப்பாட்டு வினையில் எழுதப்பட வேண்டும் — "தெரிவிக்கப்படுகிறது" போல, "நான்" அல்ல',

      designation: 'ஒப்புதல் அளிக்கும் அலுவலரின் பதவிப் பெயர்',
      designationHint: 'வலப்புறம், கோட்டுக்கு மேலே இடம்பெறும்',
    },
    placeholders: {
      fileNo: 'கோப்பு எண்',
      office: 'அலுவலகத்தின் பெயர் மற்றும் இடம்',
      recipient: 'குறிப்பாணை யாருக்கு',
      subject: 'குறிப்பாணையின் பொருள்',
      reference: 'இக்குறிப்பாணை பதிலளிக்கும் ஆணை அல்லது கடிதம்',
      body: 'குறிப்பாணையை இங்கே எழுதுங்கள் — மூன்றாம் நபர் வழக்கில்',
      designation: 'பெயர் மற்றும் பதவி',
    },
  },
};

/** The language of a memo, with English standing in for anything a server has not said. */
export function memoText(language: LetterLanguage | null | undefined): MemoText {
  return MEMO_TEXT[language ?? 'EN'] ?? MEMO_TEXT.EN;
}

/**
 * The headings and labels a Government Order prints — its own set again, for the same reason a
 * memo's is not a trimmed-down letter. A G.O. has an abstract instead of a subject line, an order
 * written entirely by the writer instead of a body addressed to the reader, and is authenticated
 * "by order of the Governor" rather than signed off like a letter or a memo.
 */
export interface GoSheetLabels {
  /** Alt text for the state emblem — the emblem image itself already carries the government's name. */
  emblemAlt: string;
  abstractHeading: string;
  byOrderOfGovernor: string;
  recipients: string;
  copyTo: string;
  dated: string;
}

export interface GoFormLabels {
  headingSection: string;
  abstractSection: string;
  bodySection: string;
  closingSection: string;

  goType: string;
  goNumber: string;
  goNumberHint: string;
  date: string;
  department: string;
  departmentHint: string;

  abstract: string;
  abstractHint: string;
  body: string;
  bodyHint: string;

  designation: string;
  designationHint: string;
  recipients: string;
  recipientsHint: string;
  copyTo: string;
  copyToHint: string;
}

interface GoText {
  sheet: GoSheetLabels;
  form: GoFormLabels;
  /** The classification prefix printed before the number — "அரசாணை (நிலை) எண்:" / "G.O.(Ms)No." */
  goTypeLabel: Record<LetterGoType, string>;
  placeholders: Record<'goNumber' | 'department' | 'abstract' | 'body' | 'designation' | 'recipients' | 'copyTo', string>;
}

export const GO_TEXT: Record<LetterLanguage, GoText> = {
  EN: {
    sheet: {
      emblemAlt: 'Emblem of the Government of Tamil Nadu',
      abstractHeading: 'ABSTRACT',
      byOrderOfGovernor: '(BY ORDER OF THE GOVERNOR)',
      recipients: 'To',
      copyTo: 'Copy to:',
      dated: 'Dated:',
    },
    form: {
      headingSection: 'Heading',
      abstractSection: 'Abstract',
      bodySection: 'Order',
      closingSection: 'Closing',

      goType: 'G.O. type',
      goNumber: 'G.O. number',
      goNumberHint: 'Printed after the type selected above',
      date: 'Date',
      department: 'Department & section',
      departmentHint: 'Printed in the centre of the heading line',

      abstract: 'Abstract',
      abstractHint: 'A brief summary of what the order is about',
      body: 'Order',
      bodyHint: 'Written in the third person — "is sanctioned", not "I sanction"',

      designation: "Signing officer's name and designation",
      designationHint: 'Sits under "By order of the Governor", on the right',
      recipients: 'To',
      recipientsHint: 'Who the order is issued to',
      copyTo: 'Copy to',
      copyToHint: 'Left off the order entirely when empty',
    },
    goTypeLabel: {
      MS: 'G.O.(Ms)No.',
      RT: 'G.O.(Rt)No.',
      PT: 'G.O.(Pt)No.',
      ONE_D: 'G.O.(1D)No.',
    },
    placeholders: {
      goNumber: 'G.O. number',
      department: 'Department name and section code',
      abstract: 'What the order is about',
      body: 'Write the order here, in the third person',
      designation: 'Name and designation',
      recipients: 'Who the order is issued to',
      copyTo: 'Who else gets a copy',
    },
  },

  TA: {
    sheet: {
      emblemAlt: 'தமிழ்நாடு அரசின் சின்னம்',
      abstractHeading: 'சுருக்கம்',
      byOrderOfGovernor: '(ஆளுநரின் ஆணைப்படி)',
      recipients: 'பெறுநர்:',
      copyTo: 'நகல்:',
      dated: 'நாள்:',
    },
    form: {
      headingSection: 'தலைப்பு',
      abstractSection: 'சுருக்கம்',
      bodySection: 'ஆணை',
      closingSection: 'முடிவுரை',

      goType: 'அரசாணை வகை',
      goNumber: 'அரசாணை எண்',
      goNumberHint: 'மேலே தேர்ந்தெடுத்த வகைக்குப் பிறகு அச்சிடப்படும்',
      date: 'நாள்',
      department: 'துறை & பிரிவு எண்',
      departmentHint: 'தலைப்பு வரியின் நடுவில் அச்சிடப்படும்',

      abstract: 'சுருக்கம்',
      abstractHint: 'ஆணையின் சுருக்கமான விவரம்',
      body: 'ஆணை',
      bodyHint: 'மூன்றாம் நபர் வழக்கில் எழுதப்பட வேண்டும் — "அனுமதிக்கப்படுகிறது" போல, "நான்" அல்ல',

      designation: 'ஒப்பமிடும் அலுவலரின் பெயர் மற்றும் பதவி',
      designationHint: '"ஆளுநரின் ஆணைப்படி" என்பதற்குக் கீழ், வலப்புறம் இடம்பெறும்',
      recipients: 'பெறுநர்',
      recipientsHint: 'ஆணை யாருக்கு அளிக்கப்படுகிறது',
      copyTo: 'நகல்',
      copyToHint: 'காலியாக இருந்தால் ஆணையில் இடம்பெறாது',
    },
    goTypeLabel: {
      MS: 'அரசாணை (நிலை) எண்:',
      RT: 'அரசாணை (வாலாயம்) எண்:',
      PT: 'அரசாணை (நிரந்தரம்) எண்:',
      ONE_D: 'அரசாணை (பத்தாண்டு) எண்:',
    },
    placeholders: {
      goNumber: 'அரசாணை எண்',
      department: 'துறையின் பெயர் மற்றும் பிரிவு எண்',
      abstract: 'ஆணையின் பொருள்',
      body: 'ஆணையை இங்கே எழுதுங்கள் — மூன்றாம் நபர் வழக்கில்',
      designation: 'பெயர் மற்றும் பதவி',
      recipients: 'ஆணை யாருக்கு',
      copyTo: 'யாருக்கு நகல் அளிக்கப்படுகிறது',
    },
  },
};

/** The language of a G.O., with English standing in for anything a server has not said. */
export function goText(language: LetterLanguage | null | undefined): GoText {
  return GO_TEXT[language ?? 'EN'] ?? GO_TEXT.EN;
}

/**
 * The headings and labels a Demi-Official letter prints. It keeps the salutation, the subject and
 * the reference a letter has, but its header is two blocks side by side — the writer's name and
 * designation, and the office's own name, place, phone and e-mail — never headed "From,"; and it
 * closes "Yours sincerely," a fixed phrase the sheet prints rather than something typed, followed
 * by the signing officer's initials, with "பெறுநர்" (Recipient) instead of "To," beneath it.
 */
export interface DoSheetLabels {
  /** Alt text for the state emblem — the same one a G.O. is headed with. */
  emblemAlt: string;
  /** Printed before the D.O. number — "நேர்முக ந.க. எண்." / "D.O.No." */
  doNumber: string;
  dated: string;
  subject: string;
  reference: string;
  /** The fixed closing phrase — never "Yours lovingly", and never typed by the author. */
  truly: string;
  recipient: string;
}

export interface DoFormLabels {
  headingSection: string;
  letterSection: string;
  closingSection: string;

  doNumber: string;
  doNumberHint: string;
  date: string;
  sender: string;
  senderHint: string;
  office: string;
  officeHint: string;

  hierarchy: string;
  hierarchyHint: string;
  salutation: string;
  subject: string;
  subjectHint: string;
  reference: string;
  referenceHint: string;
  body: string;
  bodyHint: string;

  initials: string;
  initialsHint: string;
  recipient: string;
  recipientHint: string;
  recipientPlaceholder: string;
}

interface DoText {
  sheet: DoSheetLabels;
  form: DoFormLabels;
  placeholders: Record<
    'doNumber' | 'sender' | 'office' | 'salutation' | 'subject' | 'reference' | 'body' | 'initials' | 'recipient',
    string
  >;
}

export const DO_TEXT: Record<LetterLanguage, DoText> = {
  EN: {
    sheet: {
      emblemAlt: 'Emblem of the Government of Tamil Nadu',
      doNumber: 'D.O.No.',
      dated: 'Dated :',
      subject: 'Sub:',
      reference: 'Ref:',
      truly: 'Yours sincerely,',
      recipient: 'To',
    },
    form: {
      headingSection: 'Heading',
      letterSection: 'The letter',
      closingSection: 'Closing',

      doNumber: 'D.O. number',
      doNumberHint: 'Printed as D.O.No.',
      date: 'Date',
      sender: 'Your name, qualification and designation',
      senderHint: 'Printed on the left. Never headed "From,".',
      office: 'Office, place, phone and e-mail',
      officeHint: 'Printed on the right, opposite your name',

      hierarchy: 'Who you are writing to',
      hierarchyHint: 'Fills in a starting salutation below — edit it freely afterwards',
      salutation: 'Salutation',
      subject: 'Subject',
      subjectHint: 'Printed after Sub:',
      reference: 'Reference',
      referenceHint: 'Printed after Ref:',
      body: 'Body',
      bodyHint: 'First person, active voice — "I request", not "it is requested"',

      initials: 'Your initials',
      initialsHint: 'Printed under "Yours sincerely,"',
      recipient: 'Recipient',
      recipientHint: 'Name, qualification, designation and place',
      recipientPlaceholder: 'Thiru. R.K. Narayanan, B.A.,\nTahsildar,\nErode.',
    },
    placeholders: {
      doNumber: 'D.O. number',
      sender: 'Your name, qualification and designation',
      office: 'Office name, place, phone and e-mail',
      salutation: 'My dear [Name],',
      subject: 'What the letter is about',
      reference: 'The order or letter this one answers',
      body: 'Write the letter here, in the first person',
      initials: 'Initials',
      recipient: 'Who the letter is to',
    },
  },

  TA: {
    sheet: {
      emblemAlt: 'தமிழ்நாடு அரசின் சின்னம்',
      doNumber: 'நேர்முக ந.க. எண்.',
      dated: 'நாள் :',
      subject: 'பொருள்:',
      reference: 'பார்வை:',
      truly: 'தங்கள் உண்மையுள்ள,',
      recipient: 'பெறுநர்',
    },
    form: {
      headingSection: 'தலைப்பு',
      letterSection: 'கடிதம்',
      closingSection: 'முடிவுரை',

      doNumber: 'நேர்முக ந.க. எண்',
      doNumberHint: '"நேர்முக ந.க. எண்." என அச்சிடப்படும்',
      date: 'நாள்',
      sender: 'உங்கள் பெயர், கல்வித் தகுதி மற்றும் பதவி',
      senderHint: 'இடதுபுறம் அச்சிடப்படும். "அனுப்புநர்" எனக் குறிப்பிடப்படாது.',
      office: 'அலுவலகம், இடம், தொலைபேசி மற்றும் மின்னஞ்சல்',
      officeHint: 'வலதுபுறம், உங்கள் பெயருக்கு எதிரே அச்சிடப்படும்',

      hierarchy: 'யாருக்கு எழுதுகிறீர்கள்',
      hierarchyHint: 'கீழே ஒரு தொடக்க வாழ்த்துரையை நிரப்பும் — பின்னர் விருப்பப்படி மாற்றலாம்',
      salutation: 'விளிப்பு',
      subject: 'பொருள்',
      subjectHint: '"பொருள்:" என்பதற்குப் பிறகு அச்சிடப்படும்',
      reference: 'பார்வை',
      referenceHint: '"பார்வை:" என்பதற்குப் பிறகு அச்சிடப்படும்',
      body: 'கடித உரை',
      bodyHint: 'முதல் நபர், நேரடி நடையில் — "கேட்டுக்கொள்கிறேன்" போல, "கேட்கப்படுகிறது" அல்ல',

      initials: 'உங்கள் முன்னெழுத்துகள்',
      initialsHint: '"தங்கள் உண்மையுள்ள," என்பதற்குக் கீழ் அச்சிடப்படும்',
      recipient: 'பெறுநர்',
      recipientHint: 'பெயர், கல்வித் தகுதி, பதவி மற்றும் இடம்',
      recipientPlaceholder: 'திரு. ஆர்.கே. நாராயணன், பி.ஏ.,\nவட்டாட்சியர்,\nஏற்காடு.',
    },
    placeholders: {
      doNumber: 'நேர்முக ந.க. எண்',
      sender: 'உங்கள் பெயர், கல்வித் தகுதி மற்றும் பதவி',
      office: 'அலுவலகத்தின் பெயர், இடம், தொலைபேசி மற்றும் மின்னஞ்சல்',
      salutation: 'எனதன்பார்ந்த [பெயர்],',
      subject: 'கடிதத்தின் பொருள்',
      reference: 'இக்கடிதம் பதிலளிக்கும் ஆணை அல்லது கடிதம்',
      body: 'கடிதத்தை இங்கே எழுதுங்கள் — முதல் நபர் வழக்கில்',
      initials: 'முன்னெழுத்துகள்',
      recipient: 'கடிதம் யாருக்கு',
    },
  },
};

/** The language of a D.O. letter, with English standing in for anything a server has not said. */
export function doText(language: LetterLanguage | null | undefined): DoText {
  return DO_TEXT[language ?? 'EN'] ?? DO_TEXT.EN;
}

/**
 * The headings and fixed phrases an Office Note prints — internal file noting rather than
 * correspondence. There is no sender or recipient: it is headed by a file number (top right) and a
 * centred title, opens the body with a fixed submission phrase nobody types
 * ({@link OfficeNoteSheetLabels.submissionPhrase}), and closes with two fixed blocks — for orders,
 * and put up for approval — each followed by blank space for a handwritten initial and date rather
 * than anything typed here.
 */
export interface OfficeNoteSheetLabels {
  /** The centred, underlined title at the top — "அலுவலகக் குறிப்பு" / "OFFICE NOTE". */
  title: string;
  subject: string;
  reference: string;
  /** Printed above the body, in bold italics — never typed. */
  submissionPhrase: string;
  /** The first of the two fixed closing blocks — "அ- ஆணைக்காக" / "A - For orders". */
  forOrders: string;
  /** The second — "ப.அ" / "Put up for approval". */
  putUpForApproval: string;
  /** The fixed sentence under {@link putUpForApproval}. */
  draftForApproval: string;
  /** Under each blank signature space — "(சுருக்கொப்பம் தேதியுடன்)" / "(Initials with date)". */
  signatureCaption: string;
}

export interface OfficeNoteFormLabels {
  headingSection: string;
  bodySection: string;

  referenceNo: string;
  referenceNoHint: string;
  subject: string;
  subjectHint: string;
  reference: string;
  referenceHint: string;
  body: string;
  bodyHint: string;
}

interface OfficeNoteText {
  sheet: OfficeNoteSheetLabels;
  form: OfficeNoteFormLabels;
  placeholders: Record<'referenceNo' | 'subject' | 'reference' | 'body', string>;
}

export const OFFICE_NOTE_TEXT: Record<LetterLanguage, OfficeNoteText> = {
  EN: {
    sheet: {
      title: 'OFFICE NOTE',
      subject: 'Subject:-',
      reference: 'Reference:-',
      submissionPhrase: 'Submitted respectfully.',
      forOrders: 'A - For orders',
      putUpForApproval: 'Put up for approval',
      draftForApproval: 'Draft proceedings submitted for approval.',
      signatureCaption: '(Initials with date)',
    },
    form: {
      headingSection: 'Heading',
      bodySection: 'The note',

      referenceNo: 'File number',
      referenceNoHint: 'Printed at the top right, above the title',
      subject: 'Subject',
      subjectHint:
        'Topic — action requested — the individual’s name and designation — effective date — "regarding"',
      reference: 'Reference',
      referenceHint:
        "Numbered: the parent G.O.s first, then this office's earlier disposal, then the individual's application with its date",
      body: 'Body',
      bodyHint:
        'Numbered paragraphs: (1) the request and application number (2) earlier sanctions on record (3) present balance and eligibility (4) the recommendation for orders',
    },
    placeholders: {
      referenceNo: 'File number and year',
      subject: 'What the note is about',
      reference: 'The orders and papers this note relies on',
      body: 'Write the note here, as numbered paragraphs',
    },
  },

  TA: {
    sheet: {
      title: 'அலுவலகக் குறிப்பு',
      subject: 'பொருள்:-',
      reference: 'பார்வை:-',
      submissionPhrase: 'பணிந்து அனுப்பப்படுகிறது.',
      forOrders: 'அ- ஆணைக்காக',
      putUpForApproval: 'ப.அ',
      draftForApproval: 'வரைவு செயல்முறை ஆணை ஏற்புக்கு சமர்ப்பிக்கப்பட்டுள்ளது.',
      signatureCaption: '(சுருக்கொப்பம் தேதியுடன்)',
    },
    form: {
      headingSection: 'தலைப்பு',
      bodySection: 'குறிப்பு',

      referenceNo: 'கோப்பு எண்',
      referenceNoHint: 'தலைப்புக்கு மேல், வலப்புறம் அச்சிடப்படும்',
      subject: 'பொருள்',
      subjectHint: 'பொருள் - கோரப்படும் நடவடிக்கை - தனியரின் பெயர் மற்றும் பதவி - நடைமுறை நாள் - "தொடர்பாக"',
      reference: 'பார்வை',
      referenceHint:
        'எண்ணிடப்பட்டது: முதலில் அரசாணைகள், பின் இவ்வலுவலக முந்தைய முடிவுக்கோப்பு, இறுதியாக தனியரின் விண்ணப்பம் நாளுடன்',
      body: 'குறிப்பு உரை',
      bodyHint:
        'எண்ணிடப்பட்ட பத்திகள்: (1) கோரிக்கை மற்றும் விண்ணப்ப எண் (2) பதிவிலுள்ள முந்தைய ஒப்புதல்கள் (3) தற்போதைய இருப்பு மற்றும் தகுதி (4) ஆணைக்கான பரிந்துரை',
    },
    placeholders: {
      referenceNo: 'கோப்பு எண் மற்றும் ஆண்டு',
      subject: 'குறிப்பின் பொருள்',
      reference: 'இக்குறிப்பு சார்ந்திருக்கும் ஆணைகள் மற்றும் ஆவணங்கள்',
      body: 'குறிப்பை இங்கே எழுதுங்கள் — எண்ணிடப்பட்ட பத்திகளாக',
    },
  },
};

/** The language of an Office Note, with English standing in for anything a server has not said. */
export function officeNoteText(language: LetterLanguage | null | undefined): OfficeNoteText {
  return OFFICE_NOTE_TEXT[language ?? 'EN'] ?? OFFICE_NOTE_TEXT.EN;
}
