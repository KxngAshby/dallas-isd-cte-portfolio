import { Outlet, useLocation } from 'react-router-dom';
import {
  Boxes,
  Briefcase,
  ClipboardCheck,
  Gauge,
  History,
  Info,
  LayoutDashboard,
  MailOpen,
  Printer,
  School,
  Sliders,
  Tags,
  Users,
} from 'lucide-react';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { Sidebar, type NavItem } from '../../components/Sidebar';

const NAV: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: Gauge, end: true },
  { to: '/admin/history', label: 'History', icon: History },
  { to: '/admin/kits', label: 'Kits', icon: Boxes },
  { to: '/admin/templates', label: 'Templates', icon: Briefcase },
  { to: '/admin/types', label: 'Item Types', icon: Tags },
  { to: '/admin/labels', label: 'Labels', icon: Printer },
  { to: '/admin/audit', label: 'Audit', icon: ClipboardCheck },
  { to: '/admin/campuses', label: 'Campuses', icon: School },
  { to: '/admin/counselors', label: 'Counselors', icon: Users },
  { to: '/admin/emails', label: 'Emails', icon: MailOpen },
  { to: '/admin/settings', label: 'Settings', icon: Sliders },
  { to: '/admin/guide', label: 'Guide', icon: Info },
];

const TITLES: Record<string, string> = {
  '/admin': 'Dashboard',
  '/admin/history': 'Loan History',
  '/admin/kits': 'Kits',
  '/admin/types': 'Item Types',
  '/admin/templates': 'Career Templates',
  '/admin/labels': 'Labels & Barcodes',
  '/admin/audit': 'Kit Audit',
  '/admin/campuses': 'Campuses',
  '/admin/counselors': 'Counselors',
  '/admin/emails': 'Email Center',
  '/admin/settings': 'Settings',
  '/admin/guide': 'How It Works',
};

const SUBTITLES: Record<string, string> = {
  '/admin': 'Live kit status, open loans, and what needs attention',
  '/admin/history': 'Search who had which kit and when',
  '/admin/kits': 'Physical kits and TipWeb barcodes',
  '/admin/types': 'Item definitions and reorder thresholds',
  '/admin/templates': 'What belongs in each career kit',
  '/admin/labels': 'Generate and print kit and item barcodes',
  '/admin/audit': 'Scan items and verify everything is accounted for',
  '/admin/campuses': 'Org numbers, regions, and principals',
  '/admin/counselors': 'Powers Hub EID sign-in — import your list here',
  '/admin/emails': 'Templates, CC controls, reminders, and overdue notices',
  '/admin/settings': 'System keys stored in the Settings sheet',
  '/admin/guide': 'Executive overview of the ESCA system',
};

function resolvePath(pathname: string) {
  if (TITLES[pathname]) return pathname;
  const asAdmin = pathname === '/' ? '/admin' : `/admin${pathname}`;
  return TITLES[asAdmin] ? asAdmin : '/admin';
}

export function AdminLayout() {
  const location = useLocation();
  const useGasPaths = !location.pathname.startsWith('/admin');
  const items = useGasPaths
    ? NAV.map((item) => ({ ...item, to: item.to.replace(/^\/admin/, '') || '/' }))
    : NAV;
  const pathKey = resolvePath(location.pathname);
  const title = TITLES[pathKey] || 'Admin';
  const subtitle = SUBTITLES[pathKey] || '';

  return (
    <div className="min-h-screen flex bg-[var(--bg)]">
      <Sidebar items={items} footer="Dallas ISD · CTE" />
      <div className="flex-1 ml-16 md:ml-[240px] flex flex-col min-h-screen">
        <header className="bg-white/90 backdrop-blur px-5 md:px-8 py-4 border-b border-[var(--border)] sticky top-0 z-10">
          <p className="text-[0.7rem] uppercase tracking-[0.12em] text-[var(--muted)] font-bold m-0 mb-1 flex items-center gap-2">
            <LayoutDashboard size={12} /> Dallas ISD · CTE · ESCA Admin
          </p>
          <h1 className="font-display text-[1.5rem] text-[var(--navy)] font-bold m-0 leading-tight">
            {title}
          </h1>
          {subtitle && <p className="text-[0.88rem] text-[var(--muted)] m-0 mt-1">{subtitle}</p>}
        </header>
        <main className="max-w-[1100px] w-full mx-auto px-4 md:px-8 py-7">
          <ErrorBoundary key={location.pathname} recoveryTo={useGasPaths ? '/emails' : '/admin/emails'}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
