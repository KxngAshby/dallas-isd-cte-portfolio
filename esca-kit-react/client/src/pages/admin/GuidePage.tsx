import { Card } from '../../components/Card';

export function GuidePage() {
  return (
    <Card title="How This System Works">
      <div className="prose-like space-y-4 text-[0.95rem] leading-relaxed text-[var(--text)]">
        <p>
          The ESCA Kit Barcode System tracks career exploration kits loaned to campus counselors across Dallas ISD.
          Every kit and every item inside it carries a barcode. Counselors sign in with their Employee ID, scan a
          barcode to check a kit out or back in, and the Google Sheet updates instantly.
        </p>

        <h3 className="text-[var(--blue)] font-bold text-base m-0">Counselor Hub</h3>
        <ol className="m-0 pl-5 space-y-1.5 text-[var(--muted)]">
          <li>Sign in with Employee ID (EID). Returning counselors are recognized and pre-filled.</li>
          <li>Scan the TipWeb sticker on the kit case to start checkout or check-in.</li>
          <li>At checkout, confirm the item checklist. At check-in, choose a clean return or report problems.</li>
          <li>Confirmation emails go to the counselor and CC the campus principal when configured.</li>
        </ol>

        <h3 className="text-[var(--blue)] font-bold text-base m-0">Admin Portal</h3>
        <ol className="m-0 pl-5 space-y-1.5 text-[var(--muted)]">
          <li>Dashboard shows kit availability, open loans, and regional participation.</li>
          <li>Manage kits, item types, career templates, campuses, and counselors.</li>
          <li>Generate and print item barcode labels; run kit audits to find missing or unexpected items.</li>
          <li>Import campuses and counselors from district CSV exports using the mapping wizard.</li>
          <li>Edit email templates and send return reminders or overdue notices from the Email Center.</li>
        </ol>

        <h3 className="text-[var(--blue)] font-bold text-base m-0">Architecture</h3>
        <p className="text-[var(--muted)] m-0">
          React is the primary Hub and Admin UI, served from Google Apps Script as a single HTML file. Data
          lives in Google Sheets. Classic HTML remains only as a fallback via{' '}
          <code>?view=classic</code> / <code>?view=classic-admin</code>.
        </p>
      </div>
    </Card>
  );
}
