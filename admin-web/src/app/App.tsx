import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AdminDashboardPage } from '@/features/admin/AdminDashboardPage';
import { AuditLogPage } from '@/features/admin/audit/AuditLogPage';
import { AdsPage } from '@/features/ads/admin/AdsPage';
import { DeletionsPage } from '@/features/admin/deletions/DeletionsPage';
import { MemberActivityPage } from '@/features/admin/members/MemberActivityPage';
import { MembersPage } from '@/features/admin/members/MembersPage';
import { RegistrationRequestsPage } from '@/features/admin/registrations/RegistrationRequestsPage';
import { ReportsPage } from '@/features/admin/reports/ReportsPage';
import { ProfilePage } from '@/features/profile/ProfilePage';
import { AboutPage, HelpPage, PrivacyPage } from '@/features/static/StaticPages';
import { AccessRestrictedPage } from '@/features/auth/AccessRestrictedPage';
import { DepartmentPage } from '@/features/documents/DepartmentPage';
import { DepartmentsPage } from '@/features/documents/DepartmentsPage';
import { DownloadsPage } from '@/features/documents/DownloadsPage';
import { FilePreviewPage } from '@/features/documents/FilePreviewPage';
import { FolderPage } from '@/features/documents/FolderPage';
import { MyUploadsPage } from '@/features/documents/MyUploadsPage';
import { NotificationsPage } from '@/features/notifications/NotificationsPage';
import { LetterEditorPage } from '@/features/letters/LetterEditorPage';
import { LettersPage } from '@/features/letters/LettersPage';
import { PhonebookPage } from '@/features/phonebook/PhonebookPage';
import { SearchPage } from '@/features/search/SearchPage';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { PendingApprovalPage } from '@/features/auth/PendingApprovalPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { SignedInPage } from '@/features/auth/SignedInPage';
import { AuthProvider } from '@/lib/AuthProvider';
import { ThemeProvider } from '@/lib/ThemeProvider';
import { RequireAdmin, RequireAuth } from '@/lib/RouteGuards';

/**
 * Route skeleton for the screens in docs/IMPLEMENTATION_PLAN.md.
 * Screens are filled in phase by phase; every element below is a placeholder
 * until its feature module lands.
 *
 * The guards keep members off admin URLs, but they are a courtesy only —
 * every admin endpoint enforces the same rule server-side.
 */
/**
 * Server state lives here rather than in per-screen effects, so a list refreshes itself after an
 * approval instead of each screen re-implementing the same load-and-reload dance.
 *
 * <p>Retries are off: the API's failures are decisions — 401, 403, 409 — and repeating a rejected
 * request neither helps the user nor changes the answer.
 */
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
    {/* Outermost of the three: the appearance of the sign-in screen should not depend on whether
        there is a session, and nothing below here should have to ask permission to be themed. */}
    <ThemeProvider>
    <BrowserRouter>
      <AuthProvider>
      <Routes>
        {/* public */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/register/pending" element={<PendingApprovalPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/restricted" element={<AccessRestrictedPage />} />

        {/* any active user */}
        <Route element={<RequireAuth />}>
          <Route path="/home" element={<SignedInPage />} />
          <Route path="/departments" element={<DepartmentsPage />} />
          <Route path="/departments/:departmentId" element={<DepartmentPage />} />
          <Route path="/folders/:folderId" element={<FolderPage />} />
          <Route path="/files/:fileId" element={<FilePreviewPage />} />
          {/* Uploading happens inside the folder it files into, so there is no standalone
              upload screen; the old route redirects rather than 404s. */}
          <Route path="/upload" element={<Navigate to="/departments" replace />} />
          <Route path="/my-uploads" element={<MyUploadsPage />} />
          <Route path="/downloads" element={<DownloadsPage />} />
          {/* Favourites were removed; anyone with the old link or bookmark lands on the
              documents they can actually act on rather than a 404. */}
          <Route path="/favorites" element={<Navigate to="/my-uploads" replace />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/phonebook" element={<PhonebookPage />} />
          <Route path="/letters" element={<LettersPage />} />
          {/* `/new` before `/:letterId`, or "new" is read as an id and the editor asks the server
              for a letter by that name. */}
          <Route path="/letters/new" element={<LetterEditorPage />} />
          <Route path="/letters/:letterId" element={<LetterEditorPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>

        {/* admin */}
        <Route element={<RequireAdmin />}>
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="/admin/requests" element={<RegistrationRequestsPage />} />
          <Route path="/admin/members" element={<MembersPage />} />
          <Route path="/admin/members/:memberId" element={<MemberActivityPage />} />
          <Route path="/admin/deletions" element={<DeletionsPage />} />
          <Route path="/admin/reports" element={<ReportsPage />} />
          <Route path="/admin/logs" element={<AuditLogPage />} />
          <Route path="/admin/ads" element={<AdsPage />} />
          {/* Departments and folders are managed where they are browsed, so these older routes
              lead there rather than to a screen that would duplicate it. */}
          <Route path="/admin/departments" element={<Navigate to="/departments" replace />} />
          <Route path="/admin/folders" element={<Navigate to="/departments" replace />} />
          <Route path="/admin/files" element={<Navigate to="/admin/deletions" replace />} />
          <Route path="/admin/settings" element={<Placeholder name="Settings" />} />
        </Route>

        {/* static — readable signed out too, which is the only moment the privacy notice matters */}
        <Route path="/help" element={<HelpPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />

        <Route path="*" element={<Placeholder name="Not Found" />} />
      </Routes>
      </AuthProvider>
    </BrowserRouter>
    </ThemeProvider>
    </QueryClientProvider>
  );
}

function Placeholder({ name }: { name: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="rounded-lg border border-line bg-surface px-8 py-6 text-center shadow-card">
        <p className="text-sm uppercase tracking-wide text-navy-500">All GO’s AND COURT COPIES</p>
        <h1 className="mt-2 text-2xl font-semibold text-navy-800">{name}</h1>
        <p className="mt-2 text-sm text-slate-500">Not implemented yet.</p>
      </div>
    </main>
  );
}
