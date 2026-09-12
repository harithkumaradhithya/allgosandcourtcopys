import type { AxiosAdapter, AxiosRequestConfig } from 'axios';

/**
 * Representative API responses, for rendering the real application without a backend.
 *
 * <p>This is not a test double for behaviour — nothing here asserts anything. It exists so that
 * every screen can be *looked at*, which is the one check that has repeatedly caught what the build
 * did not: a screen that renders nothing, an empty state that throws, a table that pushes the page
 * sideways. See `src/preview/screens-preview.tsx`.
 *
 * <p>The shapes are copied from `src/types/api.ts`. If a screen looks wrong here and right in the
 * real app, suspect a fixture before suspecting the screen.
 */

const DEPARTMENT_ID = '11111111-1111-1111-1111-111111111111';
const QUIET_DEPARTMENT_ID = '11111111-1111-1111-1111-111111111112';
const FOLDER_ID = '22222222-2222-2222-2222-222222222221';
const FILE_ID = '33333333-3333-3333-3333-333333333331';
const MEMBER_ID = '44444444-4444-4444-4444-444444444441';
const ADMIN_ID = '44444444-4444-4444-4444-444444444440';

const ADMIN_USER = {
  id: ADMIN_ID,
  fullName: 'System Administrator',
  mobileNumber: '9999999999',
  email: 'admin@example.gov.in',
  role: 'ADMIN',
  status: 'ACTIVE',
  departmentId: DEPARTMENT_ID,
  departmentName: 'Department of Information Technology and Digital Services',
  designation: 'Administrator',
  officeAddress: 'Ezhilagam Extension Building II Floor,\nChepauk, Chennai - 600 005.',
  lastLoginAt: '2026-08-14T04:30:00Z',
  createdAt: '2026-01-04T06:00:00Z',
};

/** A long Tamil-transliterated name, because that is what actually stresses a layout. */
const LONG_DEPARTMENT_NAME =
  'Department of Backward Classes, Most Backward Classes and Minorities Welfare';

const DEPARTMENTS = [
  {
    id: DEPARTMENT_ID,
    name: 'Department of Information Technology and Digital Services',
    code: 'ITD',
    description: 'Circulars and orders issued by the IT department',
    folderCount: 4,
    fileCount: 27,
  },
  {
    id: QUIET_DEPARTMENT_ID,
    name: LONG_DEPARTMENT_NAME,
    code: 'BCW',
    description: null,
    // A department holding nothing must still render — the empty case is the common one at launch.
    folderCount: 0,
    fileCount: 0,
  },
  {
    id: '11111111-1111-1111-1111-111111111113',
    name: 'Department of Agriculture and Farmers Welfare',
    code: 'AGR',
    description: null,
    folderCount: 2,
    fileCount: 9,
  },
];

const FOLDERS = [
  {
    id: FOLDER_ID,
    departmentId: DEPARTMENT_ID,
    departmentName: DEPARTMENTS[0].name,
    parentFolderId: null,
    name: 'Circulars 2026',
    category: 'CIRCULAR',
    fileCount: 12,
    createdAt: '2026-02-01T05:00:00Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    departmentId: DEPARTMENT_ID,
    departmentName: DEPARTMENTS[0].name,
    parentFolderId: null,
    name: 'Government Orders 2026',
    category: 'GOVT_ORDER',
    fileCount: 15,
    createdAt: '2026-01-11T05:00:00Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222223',
    departmentId: DEPARTMENT_ID,
    departmentName: DEPARTMENTS[0].name,
    parentFolderId: null,
    name: 'Acts and Rules',
    category: 'ACT_RULE',
    fileCount: 0,
    createdAt: '2026-01-11T05:00:00Z',
  },
];

function file(id: string, fileName: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    folderId: FOLDER_ID,
    folderName: 'Circulars 2026',
    departmentId: DEPARTMENT_ID,
    departmentName: DEPARTMENTS[0].name,
    fileName,
    fileType: 'application/pdf',
    sizeBytes: 284_517,
    uploadedById: MEMBER_ID,
    uploadedByName: 'Meena Rajan',
    version: 1,
    canModify: true,
    previewable: true,
    uploadedAt: '2026-08-11T09:15:00Z',
    ...overrides,
  };
}

const FILES = [
  file(FILE_ID, 'Circular 42 of 2026 — revised working hours.pdf'),
  file('33333333-3333-3333-3333-333333333332', 'Government Order 118 of 2026.pdf', {
    version: 3,
    uploadedByName: 'Arun Kumar',
    canModify: false,
  }),
  file('33333333-3333-3333-3333-333333333333', 'Seal of the office.png', {
    fileType: 'image/png',
    sizeBytes: 41_002,
  }),
  file('33333333-3333-3333-3333-333333333334', 'Minutes of the review meeting.doc', {
    fileType: 'application/msword',
    previewable: false,
    sizeBytes: 1_204_517,
  }),
];

const page = <T>(items: T[], totalItems = items.length) => ({
  items,
  page: 0,
  size: 20,
  totalItems,
  totalPages: Math.max(1, Math.ceil(totalItems / 20)),
});

const MEMBERS = [
  {
    id: ADMIN_ID,
    fullName: 'System Administrator',
    mobileNumber: '9999999999',
    email: null,
    designation: 'Administrator',
    departmentId: DEPARTMENT_ID,
    departmentName: DEPARTMENTS[0].name,
    role: 'ADMIN',
    status: 'ACTIVE',
    lastLoginAt: '2026-08-14T04:30:00Z',
    createdAt: '2026-01-04T06:00:00Z',
  },
  {
    id: MEMBER_ID,
    fullName: 'Meena Rajan',
    mobileNumber: '9876543210',
    email: 'meena@example.gov.in',
    designation: 'Section Officer',
    departmentId: QUIET_DEPARTMENT_ID,
    departmentName: LONG_DEPARTMENT_NAME,
    role: 'MEMBER',
    status: 'ACTIVE',
    lastLoginAt: '2026-08-13T11:00:00Z',
    createdAt: '2026-03-02T06:00:00Z',
  },
  {
    id: '44444444-4444-4444-4444-444444444442',
    fullName: 'Arun Kumar',
    mobileNumber: '9876543211',
    email: null,
    designation: null,
    departmentId: DEPARTMENT_ID,
    departmentName: DEPARTMENTS[0].name,
    role: 'MEMBER',
    status: 'INACTIVE',
    lastLoginAt: null,
    createdAt: '2026-04-18T06:00:00Z',
  },
];

const AUDIT_ENTRIES = [
  {
    id: '55555555-5555-5555-5555-555555555551',
    action: 'file_deleted',
    actorId: MEMBER_ID,
    actorName: 'Meena Rajan',
    entityType: 'file',
    entityId: FILE_ID,
    metadata: '{"fileName":"Circular 41 of 2026.pdf","reason":"Filed in the wrong department"}',
    ipAddress: '10.12.4.51',
    at: '2026-08-14T05:12:00Z',
  },
  {
    id: '55555555-5555-5555-5555-555555555552',
    action: 'registration_approved',
    actorId: ADMIN_ID,
    actorName: 'System Administrator',
    entityType: 'user',
    entityId: MEMBER_ID,
    metadata: '{"requestId":"66666666-6666-6666-6666-666666666661"}',
    ipAddress: '10.12.4.9',
    at: '2026-08-14T04:58:00Z',
  },
  {
    id: '55555555-5555-5555-5555-555555555553',
    action: 'login_failed',
    // No actor: the event happened before anyone was authenticated.
    actorId: null,
    actorName: null,
    entityType: null,
    entityId: null,
    metadata: '{"mobile":"******3210","reason":"unknown_user"}',
    ipAddress: '10.12.4.77',
    at: '2026-08-14T04:41:00Z',
  },
  {
    id: '55555555-5555-5555-5555-555555555554',
    // An action with no label entry, to prove an unknown one still renders.
    action: 'folder_archived',
    actorId: ADMIN_ID,
    actorName: 'System Administrator',
    entityType: 'folder',
    entityId: FOLDER_ID,
    metadata: null,
    ipAddress: null,
    at: '2026-08-13T10:02:00Z',
  },
];

const REGISTRATION_REQUESTS = [
  {
    id: '66666666-6666-6666-6666-666666666661',
    userId: '44444444-4444-4444-4444-444444444443',
    fullName: 'Priya Lakshmi',
    mobileNumber: '9876543212',
    email: 'priya@example.gov.in',
    designation: 'Assistant Section Officer',
    departmentId: QUIET_DEPARTMENT_ID,
    departmentName: LONG_DEPARTMENT_NAME,
    requestedRole: 'MEMBER',
    status: 'PENDING',
    accountStatus: 'PENDING',
    reviewNote: null,
    reviewedByName: null,
    reviewedAt: null,
    submittedAt: '2026-08-14T03:20:00Z',
  },
];

const MONTHS = [
  '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02',
  '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08',
];

/**
 * A letter shaped like the office's own correspondence — the sample in docs is a meeting
 * invitation, and the composer and the print view are only worth looking at against a real one.
 */
const LETTER = {
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  language: 'EN',
  format: 'LETTER',
  status: 'FINAL',
  referenceNo: 'DBC/52/2026-D3',
  letterDate: '2026-08-22',
  fromBlock:
    'Thiru. M. Pradeep Kumar, I.A.S.,\nDirector,\nBackward Classes Welfare & Chairman of Bicycle Purchase Committee,\nEzhilagam Extension Building II Floor,\nChepauk, Chennai - 600 005.',
  toBlock:
    '1. The Commissioner of MBC & DNC, Ch-5.\n2. The Commissioner of MW, Ch-05.\n3. The Director of AD Welfare, Ch-5.\n4. The Director, DSE, Che-6.\n5. The Director, Tribal Welfare Dept, Ch-5.\n6. The Special Secretary, Finance, Sect, Chennai -09.',
  salutation: 'Sir/Madam,',
  subject:
    'O/o Director of Backward Classes Welfare - Chennai -05 - Procurement of Modern Bicycles to be supplied to BC, MBC&DNC, SC/ST and OC 11th Std Girls and Boys students studying in Govt., Govt. Aided, and Partly Govt. Aided Schools for the year 2026-27 - convening of Purchase Committee Meeting - Request to attend the meeting - Reg.',
  reference: 'G.O. (Ms) No.43, BC, MBC & MW (MW2) Dept., dated: 21.08.2026.',
  body:
    'Kind attention is invited to the references cited.\n\n2) As you are aware that the Government is implementing Modern Bicycle Scheme to BC, MBC&DNC, SC/ST and OC 11th standard Girls & Boys Students studying in Government, Government Aided and Partly Government Aided Schools across the state of Tamil Nadu for the year 2026-27.\n\n3) In this connection, it is proposed to convene the Purchase Committee meeting on 24.08.2026 at 03.00 PM in the Conference Hall of the Directorate of Backward Classes Welfare, IInd Floor, Ezhilagam Annex building, Chepauk, Chennai - 600 005.\n\n4) As you are a member of the Purchase Committee, it is requested to attend the meeting to discuss the plan of action, technical specifications of Modern Bicycles, eligibility norms for the bidder in the Tender document for procurement. The agenda for the meeting will be given in the meeting venue.\n\nPlease make it convenient to attend the above meeting.',
  enclosure: 'G.O Copy.',
  copyTo: 'Secretary to Government,\nBC, MBC and MW Department,\nSecretariat, Chennai - 09.',
  signOff:
    'Sd/- M. Pradeep Kumar\nDirector\nBackward Classes Welfare\n\nFor Director of Backward Classes Welfare.',
  createdAt: '2026-08-22T05:00:00Z',
  updatedAt: '2026-08-22T05:30:00Z',
};

/**
 * URL → response. Matched in order, first hit wins, so put the specific patterns above the general
 * ones — `/files/search` before `/files/{id}`.
 */
const ROUTES: [RegExp, (url: string, params?: Record<string, unknown>) => unknown][] = [
  [/\/auth\/refresh$/, () => ({ accessToken: 'preview-token', expiresInSeconds: 900, user: ADMIN_USER })],
  [/\/auth\/departments$/, () => DEPARTMENTS.map(({ id, name }) => ({ id, name }))],

  [/\/me$/, () => ADMIN_USER],

  // Letters. The specific path first, so /letters/drafts is not read as a letter id.
  [/\/letters\/[0-9a-f-]+$/, () => LETTER],
  // The drafts and the finished letters are the same endpoint with a different status, so the
  // fixture has to read the parameter too — otherwise the list screen shows its drafts twice.
  [/\/letters$/, (_url, params) =>
    params?.status === 'DRAFT'
      ? page([
          {
            id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
            referenceNo: null,
            letterDate: '2026-08-23',
            subject: 'Modern Bicycles - stock position as on 23.08.2026 - Reg.',
            language: 'EN',
            format: 'LETTER',
            status: 'DRAFT',
            updatedAt: '2026-08-23T11:02:00Z',
          },
        ])
      : page([
          {
            id: LETTER.id,
            referenceNo: LETTER.referenceNo,
            letterDate: LETTER.letterDate,
            subject: LETTER.subject,
            language: 'EN',
            format: 'LETTER',
            status: 'FINAL',
            updatedAt: LETTER.updatedAt,
          },
          {
            id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
            referenceNo: 'DBC/48/2026-D3',
            letterDate: '2026-08-11',
            subject: 'Supply of Modern Bicycles - Inspection of stock - Reg.',
            language: 'TA',
            format: 'LETTER',
            status: 'FINAL',
            updatedAt: '2026-08-11T09:15:00Z',
          },
        ])],

  [/\/phonebook\/departments$/, () => [
    {
      departmentId: DEPARTMENT_ID,
      departmentName: DEPARTMENTS[0].name,
      contacts: [
        {
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
          fullName: 'Dr. S. Kumar',
          designation: 'Joint Director',
          phoneNumber: '044-2345 6789',
          alternatePhone: '98765 43210',
          email: 'jd.it@example.gov.in',
          district: null,
          departmentId: DEPARTMENT_ID,
          departmentName: DEPARTMENTS[0].name,
          taluk: null,
          role: null,
        },
        {
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
          fullName: 'R. Meena',
          designation: 'Section Officer',
          phoneNumber: '044-2345 6790',
          alternatePhone: null,
          email: null,
          district: null,
          departmentId: DEPARTMENT_ID,
          departmentName: DEPARTMENTS[0].name,
          taluk: null,
          role: null,
        },
      ],
    },
    {
      departmentId: DEPARTMENTS[2].id,
      departmentName: DEPARTMENTS[2].name,
      contacts: [
        {
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
          fullName: 'K. Anbarasan',
          designation: 'Deputy Director',
          phoneNumber: '0422-244 1122',
          alternatePhone: null,
          email: null,
          district: null,
          departmentId: DEPARTMENTS[2].id,
          departmentName: DEPARTMENTS[2].name,
          taluk: null,
          role: null,
        },
      ],
    },
  ]],

  [/\/phonebook\/taluks$/, () => [
    {
      taluk: 'Avinashi',
      tahsildars: [
        {
          id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
          fullName: 'M. Devi',
          designation: null,
          phoneNumber: '94430 44444',
          alternatePhone: null,
          email: null,
          district: null,
          departmentId: null,
          departmentName: null,
          taluk: 'Avinashi',
          role: 'TAHSILDAR',
        },
      ],
      groupMembers: [],
    },
    {
      taluk: 'Coimbatore North',
      tahsildars: [
        {
          id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
          fullName: 'K. Ravi',
          designation: null,
          phoneNumber: '94430 11111',
          alternatePhone: '0422-239 0011',
          email: null,
          district: null,
          departmentId: null,
          departmentName: null,
          taluk: 'Coimbatore North',
          role: 'TAHSILDAR',
        },
      ],
      groupMembers: [
        {
          id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
          fullName: 'A. Suresh',
          designation: 'Junior Assistant',
          phoneNumber: '94430 33333',
          alternatePhone: null,
          email: null,
          district: null,
          departmentId: null,
          departmentName: null,
          taluk: 'Coimbatore North',
          role: 'GROUP_MEMBER',
        },
        {
          id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4',
          fullName: 'P. Latha',
          designation: 'Revenue Inspector',
          phoneNumber: '94430 22222',
          alternatePhone: null,
          email: null,
          district: null,
          departmentId: null,
          departmentName: null,
          taluk: 'Coimbatore North',
          role: 'GROUP_MEMBER',
        },
      ],
    },
  ]],

  [/\/notifications\/unread-count$/, () => ({ unread: 3 })],
  // Ahead of the general /notifications matcher, which would otherwise answer a send with a page
  // of rows and leave the confirmation reading "sent to undefined people".
  [/\/notifications\/announcements$/, () => ({ recipients: 42 })],
  [
    /\/notifications/,
    () =>
      page([
        {
          id: '77777777-7777-7777-7777-777777777770',
          type: 'announcement',
          title: 'Message from Meena Rajan',
          body: 'The office will be closed on Friday for the audit. Please file anything urgent before Thursday evening.',
          entityRef: null,
          read: false,
          createdAt: '2026-08-14T06:10:00Z',
        },
        {
          id: '77777777-7777-7777-7777-777777777774',
          type: 'duplicate_upload',
          title: 'A duplicate file has been uploaded',
          body:
            '"scan0007.pdf" (G.O. Ms. No. 123), uploaded at 14 Aug 2026, 11:02 am by Anitha Rao, is a '
            + 'duplicate of "GO 123 scan.pdf" (G.O.Ms.No.123), uploaded at 12 Aug 2026, 9:41 am by '
            + 'Ravi Kumar.\n\nMatched on: the same G.O. number (G.O. Ms. No. 123).\n'
            + 'First copy: Revenue Department / General.\nRecent copy: Health Department / General.',
          entityRef: `file:${FILE_ID}`,
          read: false,
          createdAt: '2026-08-14T05:32:00Z',
        },
        {
          id: '77777777-7777-7777-7777-777777777771',
          type: 'file_deleted',
          title: 'A document was deleted',
          body: 'Meena Rajan deleted "Circular 41 of 2026.pdf" from the IT department. Reason: Filed in the wrong department',
          entityRef: `file:${FILE_ID}`,
          read: false,
          createdAt: '2026-08-14T05:12:00Z',
        },
        {
          id: '77777777-7777-7777-7777-777777777772',
          type: 'registration_submitted',
          title: 'New registration awaiting approval',
          body: 'Priya Lakshmi (Department of Backward Classes…) has requested access.',
          entityRef: 'user:44444444-4444-4444-4444-444444444443',
          read: false,
          createdAt: '2026-08-14T03:20:00Z',
        },
        {
          id: '77777777-7777-7777-7777-777777777773',
          type: 'registration_approved',
          title: 'Your account has been approved',
          body: 'Your account is active. You can view, download and upload documents in every department.',
          entityRef: null,
          read: true,
          createdAt: '2026-08-12T06:00:00Z',
        },
      ]),
  ],

  [/\/admin\/stats$/, () => ({
    departments: 43,
    folders: 128,
    documents: 1_284,
    members: 96,
    activeMembers: 91,
    pendingRequests: 1,
    uploadsThisMonth: 37,
    downloadsThisMonth: 214,
    deletedDocuments: 6,
  })],
  [/\/admin\/activity/, () => page(AUDIT_ENTRIES)],
  [/\/admin\/audit-logs\/actions$/, () => [
    'file_deleted', 'file_downloaded', 'file_uploaded', 'login_failed', 'login_password',
    'registration_approved', 'registration_rejected', 'user_status_changed',
  ]],
  [/\/admin\/audit-logs/, () => page(AUDIT_ENTRIES, 412)],
  [/\/admin\/members\/[^/]+\/activity/, () => ({
    member: MEMBERS[1],
    summary: { uploads: 14, downloads: 63, deletions: 2, logins: 41, lastLoginAt: '2026-08-13T11:00:00Z' },
    timeline: page(AUDIT_ENTRIES.filter((entry) => entry.actorId === MEMBER_ID)),
  })],
  [/\/admin\/members\/summary$/, () => ({
    all: 96, pending: 1, active: 91, inactive: 4, rejected: 0, pendingRequests: 1,
  })],
  [/\/admin\/members/, () => page(MEMBERS, 96)],
  [/\/admin\/registration-requests/, () => page(REGISTRATION_REQUESTS)],
  [/\/admin\/deletions/, () => page([
    {
      id: '88888888-8888-8888-8888-888888888881',
      fileId: FILE_ID,
      fileName: 'Circular 41 of 2026.pdf',
      departmentId: DEPARTMENT_ID,
      departmentName: DEPARTMENTS[0].name,
      folderId: FOLDER_ID,
      folderName: 'Circulars 2026',
      deletedByName: 'Meena Rajan',
      reason: 'Filed in the wrong department',
      deletedAt: '2026-08-14T05:12:00Z',
      restoredByName: null,
      restoredAt: null,
      restorable: true,
      purgeExpiresAt: '2026-09-13T05:12:00Z',
      purgedByName: null,
      purgedAt: null,
    },
    {
      id: '88888888-8888-8888-8888-888888888882',
      fileId: null,
      fileName: 'Draft memo (superseded).docx',
      departmentId: DEPARTMENT_ID,
      departmentName: DEPARTMENTS[0].name,
      folderId: FOLDER_ID,
      folderName: 'Circulars 2026',
      deletedByName: 'Arun Kumar',
      reason: 'Superseded by the final version',
      deletedAt: '2026-06-01T09:00:00Z',
      restoredByName: null,
      restoredAt: null,
      restorable: false,
      purgeExpiresAt: null,
      purgedByName: null,
      purgedAt: '2026-07-01T03:00:00Z',
    },
  ])],
  [/\/admin\/reports/, () => ({
    from: '2025-09-01T00:00:00Z',
    to: '2026-08-14T00:00:00Z',
    departments: DEPARTMENTS.map((department, index) => ({
      departmentId: department.id,
      departmentName: department.name,
      documents: [27, 0, 9][index],
      uploads: [18, 0, 6][index],
      downloads: [142, 0, 33][index],
    })),
    topUploaders: [
      { userId: MEMBER_ID, fullName: 'Meena Rajan', departmentName: LONG_DEPARTMENT_NAME, uploads: 14 },
      { userId: ADMIN_ID, fullName: 'System Administrator', departmentName: DEPARTMENTS[0].name, uploads: 9 },
      { userId: '44444444-4444-4444-4444-444444444442', fullName: 'Arun Kumar', departmentName: null, uploads: 4 },
    ],
    monthly: MONTHS.map((month, index) => ({
      month,
      uploads: [12, 28, 7, 41, 33, 0, 19, 56, 22, 8, 37, 3][index],
      downloads: [34, 51, 19, 88, 64, 0, 45, 120, 39, 12, 71, 5][index],
    })),
  })],

  [/\/departments\/[^/]+\/folders/, () => FOLDERS],
  [/\/departments$/, () => DEPARTMENTS],

  [/\/folders\/[^/]+\/breadcrumb$/, () => [FOLDERS[0]]],
  [/\/folders\/[^/]+\/folders$/, () => []],
  [/\/folders\/[^/]+\/files/, () => page(FILES)],
  [/\/folders\/[^/]+$/, () => FOLDERS[0]],

  [/\/files\/search/, () => page(FILES.slice(0, 2), 2)],
  [/\/files\/recent/, () => page(FILES.slice(0, 3))],
  [/\/files\/my-uploads/, () => page(FILES)],
  [/\/files\/[^/]+\/preview-link$/, () => ({
    // A data URI, so the preview renders something real without object storage.
    url:
      'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PC9UeXBlL0NhdGFsb2c+PgplbmRvYmoKdHJhaWxlcgo8PC9Sb290IDEgMCBSPj4KJSVFT0Y=',
    expiresAt: '2026-08-14T06:00:00Z',
    fileName: FILES[0].fileName,
    fileType: 'application/pdf',
  })],
  [/\/files\/[^/]+\/download-link$/, () => ({
    url: 'data:text/plain,preview',
    expiresAt: '2026-08-14T06:00:00Z',
    fileName: FILES[0].fileName,
  })],
  [/\/files\/[^/]+$/, () => FILES[0]],

  [/\/downloads/, () => page([
    {
      id: '99999999-9999-9999-9999-999999999991',
      fileId: FILE_ID,
      fileName: FILES[0].fileName,
      fileType: 'application/pdf',
      sizeBytes: 284_517,
      departmentId: DEPARTMENT_ID,
      departmentName: DEPARTMENTS[0].name,
      folderId: FOLDER_ID,
      folderName: 'Circulars 2026',
      available: true,
      downloadedAt: '2026-08-14T05:40:00Z',
    },
    {
      id: '99999999-9999-9999-9999-999999999992',
      fileId: '33333333-3333-3333-3333-33333333333f',
      fileName: 'Circular 41 of 2026.pdf',
      fileType: 'application/pdf',
      sizeBytes: 190_004,
      departmentId: DEPARTMENT_ID,
      departmentName: DEPARTMENTS[0].name,
      folderId: FOLDER_ID,
      folderName: 'Circulars 2026',
      // Deleted since it was taken — the row must stay, marked.
      available: false,
      downloadedAt: '2026-08-10T08:05:00Z',
    },
  ])],
];

/**
 * An axios adapter that answers from the fixtures above.
 *
 * <p>An unmatched URL fails loudly rather than returning an empty object: a screen quietly rendering
 * nothing because a fixture is missing is exactly the false negative this harness exists to avoid.
 */
export const fixtureAdapter: AxiosAdapter = async (config: AxiosRequestConfig) => {
  const url = config.url ?? '';

  for (const [pattern, respond] of ROUTES) {
    if (pattern.test(url)) {
      return {
        data: respond(url, config.params as Record<string, unknown> | undefined),
        status: 200,
        statusText: 'OK',
        headers: {},
        config: config as never,
      };
    }
  }

  console.error(`[fixtures] No fixture for ${config.method?.toUpperCase()} ${url}`);
  return {
    data: { code: 'NO_FIXTURE', message: `No fixture for ${url}` },
    status: 501,
    statusText: 'Not Implemented',
    headers: {},
    config: config as never,
  };
};
