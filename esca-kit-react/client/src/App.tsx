import { Navigate, Route, Routes } from 'react-router-dom';
import { CounselorProvider } from './context/CounselorContext';
import { ToastProvider } from './context/ToastContext';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AuditPage } from './pages/admin/AuditPage';
import { CampusesPage } from './pages/admin/CampusesPage';
import { CounselorsPage } from './pages/admin/CounselorsPage';
import { DashboardPage } from './pages/admin/DashboardPage';
import { EmailsPage } from './pages/admin/EmailsPage';
import { GuidePage } from './pages/admin/GuidePage';
import { HistoryPage } from './pages/admin/HistoryPage';
import { ItemTypesPage } from './pages/admin/ItemTypesPage';
import { KitsPage } from './pages/admin/KitsPage';
import { LabelsPage } from './pages/admin/LabelsPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { TemplatesPage } from './pages/admin/TemplatesPage';
import { HubPage } from './pages/hub/HubShell';

function gasViewParam(): string {
  const injected = (window as unknown as { __ESCA_VIEW__?: string }).__ESCA_VIEW__;
  if (injected) return injected;
  try {
    return new URLSearchParams(window.location.search).get('view') || '';
  } catch {
    return '';
  }
}

function adminChildren() {
  return (
    <>
      <Route index element={<DashboardPage />} />
      <Route path="board" element={<DashboardPage />} />
      <Route path="history" element={<HistoryPage />} />
      <Route path="kits" element={<KitsPage />} />
      <Route path="types" element={<ItemTypesPage />} />
      <Route path="templates" element={<TemplatesPage />} />
      <Route path="labels" element={<LabelsPage />} />
      <Route path="audit" element={<AuditPage />} />
      <Route path="campuses" element={<CampusesPage />} />
      <Route path="counselors" element={<CounselorsPage />} />
      <Route path="emails" element={<EmailsPage />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="guide" element={<GuidePage />} />
    </>
  );
}

function AppRoutes() {
  const view = gasViewParam();
  const gasAdmin = view === 'admin' || view === 'react-admin';

  if (gasAdmin) {
    return (
      <Routes>
        <Route path="/*" element={<AdminLayout />}>
          {adminChildren()}
          <Route path="*" element={<DashboardPage />} />
        </Route>
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<HubPage />} />
      <Route path="/hub" element={<HubPage />} />
      <Route path="/admin" element={<AdminLayout />}>
        {adminChildren()}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <CounselorProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </CounselorProvider>
  );
}
