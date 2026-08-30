/**
 * Roles and statuses are Java enums on the wire, so they arrive uppercase. The database stores them
 * lowercase, but nothing outside the backend ever sees that form — see the AttributeConverters.
 */
export type Role = 'ADMIN' | 'MEMBER';
export type UserStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'INACTIVE';
export type RegistrationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** Uppercase for the same reason as the rest: the wire carries the Java enum name. */
export type FolderCategory =
  | 'CONTRACT'
  | 'GOVT_ORDER'
  | 'COURT_ORDER'
  | 'CIRCULAR'
  | 'ACT_RULE'
  | 'GENERAL';

export interface CurrentUser {
  id: string;
  fullName: string;
  mobileNumber: string;
  email: string | null;
  role: Role;
  status: UserStatus;
  departmentId: string | null;
  departmentName: string | null;
  designation: string | null;
  /** The office address a letter's From block is built from. */
  officeAddress: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

/**
 * A department as the browsing screens see it.
 *
 * <p>The counts are absent from the public {@code /auth/departments} list, which returns only id and
 * name to an applicant who has no account yet.
 */
export interface Department {
  id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  folderCount?: number;
  fileCount?: number;
}

export interface Folder {
  id: string;
  departmentId: string;
  departmentName: string;
  parentFolderId: string | null;
  name: string;
  category: FolderCategory;
  /** Live files only — a soft delete decrements it and a restore puts it back. */
  fileCount: number;
  createdAt: string;
  /** Bumped when a document is filed into or removed from the folder, not only on rename. */
  updatedAt: string;
}

/**
 * Where an unfiled PDF probably belongs, guessed server-side from its own Abstract heading.
 *
 * <p>All four fields are null together when nothing matched closely enough to act on — the quick
 * upload picker then simply starts blank, the way it always has.
 */
export interface SuggestedDestination {
  departmentId: string | null;
  departmentName: string | null;
  folderId: string | null;
  folderName: string | null;
}

export interface FileItem {
  id: string;
  folderId: string;
  folderName: string;
  departmentId: string;
  departmentName: string;
  fileName: string;
  fileType: string;
  sizeBytes: number;
  uploadedById: string;
  uploadedByName: string;
  version: number;
  /**
   * Server-computed: true when the caller uploaded it or is an admin. Covers deleting and
   * replacing, which share one rule. A convenience for hiding buttons — the server re-checks on
   * every such call, so ignoring it gains nothing.
   */
  canModify: boolean;
  /** True when the browser can render these bytes in place — PDFs and images. */
  previewable: boolean;
  /** Whether *this* viewer has starred it. Another user's star is never visible. */
  /** The Abstract paragraph read from the document itself. Null for a scan nothing could be read from. */
  description: string | null;
  /** The G.O. number read from the document itself, e.g. "G.O.(Ms) No. 123". Null when there is none. */
  goNumber: string | null;
  uploadedAt: string;
}

/** A presigned URL the browser renders in place rather than saving. */
export interface PreviewLink {
  url: string;
  expiresAt: string;
  fileName: string;
  fileType: string;
}

/**
 * A row in the caller's own download history.
 *
 * <p>`available` goes false once the document is deleted. The row stays either way — a history that
 * dropped entries when something was removed would not be a history.
 */
export interface DownloadRecord {
  id: string;
  fileId: string;
  fileName: string;
  fileType: string;
  sizeBytes: number;
  departmentId: string;
  departmentName: string;
  folderId: string;
  folderName: string;
  available: boolean;
  downloadedAt: string;
}

/**
 * The result of one upload request. Files are reported individually rather than the whole batch
 * failing, so eight documents with one bad file still upload seven.
 */
export interface UploadResult {
  uploaded: FileItem[];
  rejected: RejectedUpload[];
}

export interface RejectedUpload {
  fileName: string;
  /** e.g. FILE_CONTENT_MISMATCH, FILE_TYPE_NOT_ALLOWED, FILE_TOO_LARGE */
  code: string;
  message: string;
}

/** A short-lived presigned URL. The bytes never pass through the application server. */
export interface DownloadLink {
  url: string;
  expiresAt: string;
  fileName: string;
}

/** A row in the admin deletions log, carrying the reason the deleter had to give. */
export interface FileDeletion {
  id: string;
  /** Null once the file has been purged — there is nothing left at that id to open or restore. */
  fileId: string | null;
  fileName: string;
  departmentId: string;
  departmentName: string;
  folderId: string;
  folderName: string;
  deletedByName: string;
  reason: string;
  deletedAt: string;
  restoredByName: string | null;
  restoredAt: string | null;
  /** True while the file is neither restored nor purged, which is when Restore is offered. */
  restorable: boolean;
  /** When the daily sweep purges this on its own, if nobody acts first. Null once restored or purged. */
  purgeExpiresAt: string | null;
  /** Null for the automatic sweep — nobody pressed the button, the 30 days did. */
  purgedByName: string | null;
  purgedAt: string | null;
}

/**
 * One notification.
 *
 * <p>`entityRef` is the server's free-form pointer back to the subject — `"file:{uuid}"` or
 * `"user:{uuid}"`. The client turns it into a route; the server deliberately does not, because URLs
 * are the web app's business.
 */
/**
 * One option in the notifications filter, as the server offers it.
 *
 * <p>Role-aware: the list a member gets is not the list an admin gets, because a member is never
 * sent a registration request in the first place.
 */
export interface NotificationCategoryOption {
  id: string;
  label: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entityRef: string | null;
  read: boolean;
  createdAt: string;
}

/**
 * One number in the office phonebook.
 *
 * <p>The same shape in both books: a department contact fills `departmentId`/`departmentName` and a
 * taluk contact fills `taluk`/`role`, with the other pair null. A screen that draws a contact does
 * not need to know which listing it came from.
 */
export interface PhonebookContact {
  id: string;
  fullName: string;
  designation: string | null;
  phoneNumber: string;
  alternatePhone: string | null;
  email: string | null;
  district: string | null;
  departmentId: string | null;
  departmentName: string | null;
  taluk: string | null;
  role: PhonebookRole | null;
}

export type PhonebookKind = 'DEPARTMENT' | 'TALUK';
export type PhonebookRole = 'TAHSILDAR' | 'GROUP_MEMBER';

export interface DepartmentContacts {
  departmentId: string;
  departmentName: string;
  contacts: PhonebookContact[];
}

/** Tahsildars kept apart from group members, because that is the order a taluk is read in. */
export interface TalukContacts {
  taluk: string;
  tahsildars: PhonebookContact[];
  groupMembers: PhonebookContact[];
}

/** A row in the admin approval queue. */
export interface RegistrationRequest {
  id: string;
  userId: string;
  fullName: string;
  mobileNumber: string;
  email: string | null;
  designation: string | null;
  departmentId: string | null;
  departmentName: string | null;
  requestedRole: Role;
  status: RegistrationStatus;
  /** The applicant's account status, which approval is what moves. */
  accountStatus: UserStatus;
  reviewNote: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  submittedAt: string;
}

/** A row in the admin members list. */
export interface Member {
  id: string;
  fullName: string;
  mobileNumber: string;
  email: string | null;
  designation: string | null;
  departmentId: string | null;
  departmentName: string | null;
  role: Role;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface MemberCounts {
  all: number;
  pending: number;
  active: number;
  inactive: number;
  rejected: number;
  /** Registration requests still awaiting review, which is not the same as pending accounts. */
  pendingRequests: number;
}

/**
 * One line of the audit trail.
 *
 * <p>`metadata` is the raw JSON the server stored, passed through rather than turned into a
 * sentence. The viewer renders whatever keys it finds, so a new action appears without a backend
 * change and nothing is dropped because no one wrote a template for it.
 */
export interface AuditEntry {
  id: string;
  action: string;
  /** Null for events that happened before anyone was authenticated — a failed login, say. */
  actorId: string | null;
  actorName: string | null;
  entityType: string | null;
  entityId: string | null;
  metadata: string | null;
  ipAddress: string | null;
  at: string;
}

export interface ActivitySummary {
  uploads: number;
  downloads: number;
  deletions: number;
  logins: number;
  lastLoginAt: string | null;
}

export interface MemberActivity {
  member: Member;
  summary: ActivitySummary;
  timeline: PageResponse<AuditEntry>;
}

/** The tiles on the admin dashboard. */
export interface SystemStats {
  departments: number;
  folders: number;
  documents: number;
  members: number;
  activeMembers: number;
  pendingRequests: number;
  uploadsThisMonth: number;
  downloadsThisMonth: number;
  deletedDocuments: number;
}

/**
 * One department's line in the report. `documents` is what it holds now; `uploads` and `downloads`
 * are what happened during the period — a department can hold nothing and still have been busy.
 */
export interface DepartmentActivity {
  departmentId: string;
  departmentName: string;
  documents: number;
  uploads: number;
  downloads: number;
}

export interface UploaderActivity {
  userId: string;
  fullName: string;
  departmentName: string | null;
  uploads: number;
}

/** `month` is `YYYY-MM`, so it sorts as it reads. Empty months are present as zeroes. */
export interface MonthlyActivity {
  month: string;
  uploads: number;
  downloads: number;
}

export interface ActivityReport {
  from: string;
  to: string;
  departments: DepartmentActivity[];
  topUploaders: UploaderActivity[];
  monthly: MonthlyActivity[];
}

/** The wire shape of every paged list endpoint. */
export interface PageResponse<T> {
  items: T[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
}

/** Shape returned by GlobalExceptionHandler for every non-2xx response. */
export interface ApiError {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
}

/** A kind of letter, with the wording it starts from. Maintained by administrators. */
/**
 * Which language a letter is written and printed in.
 *
 * <p>A property of the document, not a preference of the reader: it decides the headings the sheet
 * prints, so it is stored with the letter and travels with it to the printer.
 */
export type LetterLanguage = 'EN' | 'TA';

/** A letter still being written, or one its author has finished. */
export type LetterStatus = 'DRAFT' | 'FINAL';

/**
 * A whole letter, which is also what the print view renders.
 *
 * <p>Every block is stored as it was written rather than derived on read: a letter reprinted next
 * year has to come out as it was issued, not restyled because a designation has changed since.
 */
export interface Letter {
  id: string;
  referenceNo: string | null;
  letterDate: string | null;
  language: LetterLanguage;
  status: LetterStatus;
  fromBlock: string;
  toBlock: string;
  salutation: string | null;
  subject: string;
  reference: string | null;
  body: string;
  enclosure: string | null;
  copyTo: string | null;
  signOff: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A row in "My letters" — deliberately without the body, which a list never shows. */
export interface LetterSummary {
  id: string;
  referenceNo: string | null;
  letterDate: string | null;
  subject: string;
  language: LetterLanguage;
  status: LetterStatus;
  updatedAt: string;
}
