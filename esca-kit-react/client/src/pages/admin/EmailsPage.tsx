import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  getEmailTemplates,
  saveEmailTemplate,
  sendOverdueNotices,
  sendReturnReminder,
} from '../../api/emails';
import { getOpenLoans, getOverdueLoans } from '../../api/loans';
import { getSettings, saveSetting } from '../../api/settings';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { TextInput, TextTextarea } from '../../components/FormField';
import { Spinner } from '../../components/Spinner';
import { useToast } from '../../context/ToastContext';

function settingsMap(rows: any[] | undefined) {
  const map: Record<string, string> = {};
  (rows || []).forEach((s) => {
    const k = s.key || s.setting_key;
    if (k) map[k] = String(s.value ?? s.setting_value ?? '');
  });
  return map;
}

/** Convert MM/DD/YYYY (or Date-like) → YYYY-MM-DD for <input type="date">. */
function toDateInputValue(raw: string): string {
  if (!raw) return '';
  const s = String(raw).trim();
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const mm = mdy[1].padStart(2, '0');
    const dd = mdy[2].padStart(2, '0');
    return `${mdy[3]}-${mm}-${dd}`;
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function EmailsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const templates = useQuery({ queryKey: ['email-templates'], queryFn: getEmailTemplates });
  const settings = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  const openLoans = useQuery({ queryKey: ['open-loans'], queryFn: getOpenLoans });
  const overdue = useQuery({ queryKey: ['overdue-loans'], queryFn: getOverdueLoans });

  const [deadline, setDeadline] = useState('');
  const [selectedOpen, setSelectedOpen] = useState<Record<string, boolean>>({});
  const [selectedOverdue, setSelectedOverdue] = useState<Record<string, boolean>>({});
  const [editTpl, setEditTpl] = useState<any | null>(null);

  const [signature, setSignature] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [hours, setHours] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [ccPrincipal, setCcPrincipal] = useState(true);
  const [extraCc, setExtraCc] = useState('');
  const [extraBcc, setExtraBcc] = useState('');
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    if (settingsLoaded || !settings.data?.settings) return;
    const map = settingsMap(settings.data.settings);
    setSignature(map.dept_signature || 'CTE Department, Dallas ISD');
    setReplyTo(map.dept_reply_to || '');
    setHours(map.dept_hours || '8:00 AM – 4:30 PM, Monday–Friday');
    setDueDate(toDateInputValue(map.default_due_date || ''));
    setCcPrincipal(map.cc_principal !== 'false');
    setExtraCc(map.extra_cc || '');
    setExtraBcc(map.extra_bcc || '');
    setSettingsLoaded(true);
  }, [settings.data, settingsLoaded]);

  const saveTpl = useMutation({
    mutationFn: () => saveEmailTemplate(editTpl),
    onSuccess: () => {
      toast('Template saved.', 'ok');
      setEditTpl(null);
      void qc.invalidateQueries({ queryKey: ['email-templates'] });
    },
    onError: (e: Error) => toast(e.message, 'err'),
  });

  const saveEmailSettings = async () => {
    try {
      await saveSetting('dept_signature', signature);
      await saveSetting('dept_reply_to', replyTo);
      await saveSetting('dept_hours', hours);
      await saveSetting('cc_principal', ccPrincipal ? 'true' : 'false');
      await saveSetting('extra_cc', extraCc);
      await saveSetting('extra_bcc', extraBcc);
      let updatedLoans: number | undefined;
      if (dueDate) {
        const saved: any = await saveSetting('default_due_date', dueDate);
        if (typeof saved?.updated === 'number') updatedLoans = saved.updated;
      }
      toast(
        typeof updatedLoans === 'number'
          ? `Email settings saved. Updated due date on ${updatedLoans} open loan${updatedLoans === 1 ? '' : 's'}.`
          : 'Email settings saved.',
        'ok',
      );
      void qc.invalidateQueries({ queryKey: ['settings'] });
      void qc.invalidateQueries({ queryKey: ['open-loans'] });
      void qc.invalidateQueries({ queryKey: ['overdue-loans'] });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed.', 'err');
    }
  };

  const sendReminders = useMutation({
    mutationFn: () =>
      sendReturnReminder(
        Object.keys(selectedOpen).filter((k) => selectedOpen[k]),
        deadline || undefined,
      ),
    onSuccess: (r: any) =>
      toast(`Reminders sent: ${r.sent ?? 0}${r.errors?.length ? ` · ${r.errors.length} errors` : ''}`, 'ok'),
    onError: (e: Error) => toast(e.message, 'err'),
  });

  const sendOverdue = useMutation({
    mutationFn: () =>
      sendOverdueNotices(
        Object.keys(selectedOverdue).filter((k) => selectedOverdue[k]),
        deadline || undefined,
      ),
    onSuccess: (r: any) =>
      toast(`Notices sent: ${r.sent ?? 0}${r.errors?.length ? ` · ${r.errors.length} errors` : ''}`, 'ok'),
    onError: (e: Error) => toast(e.message, 'err'),
  });

  if (templates.isLoading || settings.isLoading) return <Spinner />;

  if (editTpl) {
    return (
      <Card title={`Edit · ${editTpl.name || editTpl.template_id || 'Template'}`}>
        <TextInput
          label="Subject"
          value={editTpl.subject || ''}
          onChange={(e) => setEditTpl((t: any) => ({ ...t, subject: e.target.value }))}
        />
        <TextTextarea
          label="Body"
          value={editTpl.body || ''}
          onChange={(e) => setEditTpl((t: any) => ({ ...t, body: e.target.value }))}
          className="min-h-[240px] font-mono text-sm"
        />
        <p className="text-xs text-[var(--muted)] mb-4">
          Merge fields: {'{{counselorName}}'} {'{{lastName}}'} {'{{kitName}}'} {'{{career}}'}{' '}
          {'{{campusName}}'} {'{{returnDate}}'} {'{{returnDeadline}}'} {'{{deptSignature}}'}
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => setEditTpl(null)}>
            Cancel
          </Button>
          <Button onClick={() => saveTpl.mutate()} disabled={saveTpl.isPending}>
            Save template
          </Button>
        </div>
      </Card>
    );
  }

  const openList = openLoans.data?.loans || [];
  const overdueList = overdue.data?.loans || [];

  return (
    <div className="space-y-5">
      <Card title="Settings">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-1">
          <TextInput
            label="Department signature"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
          />
          <TextInput
            label="Reply-To email"
            type="email"
            value={replyTo}
            onChange={(e) => setReplyTo(e.target.value)}
            placeholder="esca-kits@dallasisd.org"
          />
          <TextInput
            label="Department hours"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
          <TextInput
            label="Semester return due date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            hint="All checkouts use this date; saving updates open loans"
          />
          <TextInput
            label="Additional CC"
            value={extraCc}
            onChange={(e) => setExtraCc(e.target.value)}
            placeholder="comma-separated"
          />
          <TextInput
            label="BCC"
            value={extraBcc}
            onChange={(e) => setExtraBcc(e.target.value)}
            placeholder="comma-separated"
          />
        </div>
        <label className="flex items-center gap-2.5 text-sm mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={ccPrincipal}
            onChange={(e) => setCcPrincipal(e.target.checked)}
            className="w-4 h-4 accent-[var(--blue)]"
          />
          CC campus principal on all emails
        </label>
        <div className="flex justify-end">
          <Button onClick={() => void saveEmailSettings()}>Save settings</Button>
        </div>
      </Card>

      <Card title="Templates">
        <div className="space-y-2">
          {(templates.data?.templates || []).map((t: any) => (
            <div
              key={t.template_id}
              className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] px-4 py-3.5 hover:bg-slate-50"
            >
              <div className="min-w-0">
                <strong className="text-[var(--blue)] block truncate">{t.name || t.template_id}</strong>
                <div className="text-sm text-[var(--muted)] truncate">{t.subject}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setEditTpl({ ...t })}>
                Edit
              </Button>
            </div>
          ))}
          {!templates.data?.templates?.length && (
            <p className="text-[var(--muted)] text-sm m-0">
              No templates yet — run <code>runSetup</code> in Apps Script once.
            </p>
          )}
        </div>
      </Card>

      <Card title="Send">
        <TextInput
          label="Return deadline (for reminders / overdue)"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          placeholder="e.g. Wednesday, May 20 by 3:00 pm"
        />

        <div className="mt-5 mb-2 flex items-center justify-between gap-2">
          <h3 className="text-[var(--blue)] font-bold text-[0.95rem] m-0">
            Return reminders · {openList.length} open
          </h3>
          {openList.length > 0 && (
            <button
              type="button"
              className="text-xs font-semibold text-[var(--blue-mid)] underline bg-transparent border-0 cursor-pointer"
              onClick={() => {
                const all = Object.fromEntries(openList.map((l: any) => [l.loan_id, true]));
                setSelectedOpen(all);
              }}
            >
              Select all
            </button>
          )}
        </div>
        {openList.length === 0 ? (
          <p className="text-[var(--muted)] text-sm mb-5">No open loans.</p>
        ) : (
          <div className="max-h-44 overflow-auto rounded-xl border border-[var(--border)] mb-3">
            {openList.map((l: any) => (
              <label
                key={l.loan_id}
                className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-[var(--border)] text-sm cursor-pointer hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={Boolean(selectedOpen[l.loan_id])}
                  onChange={(e) => setSelectedOpen((s) => ({ ...s, [l.loan_id]: e.target.checked }))}
                  className="accent-[var(--blue)]"
                />
                <span className="font-medium">{l.teacher_name || l.counselor_name || '—'}</span>
                <span className="text-[var(--muted)] truncate">
                  · {l.campus_name || l.campus_id || '—'} · {l.kit_name || l.kit_id}
                </span>
              </label>
            ))}
          </div>
        )}
        <Button
          className="mb-8"
          onClick={() => sendReminders.mutate()}
          disabled={sendReminders.isPending || !Object.values(selectedOpen).some(Boolean)}
        >
          Send return reminders
        </Button>

        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-[var(--blue)] font-bold text-[0.95rem] m-0">
            Overdue notices · {overdueList.length}
          </h3>
          {overdueList.length > 0 && (
            <button
              type="button"
              className="text-xs font-semibold text-[var(--blue-mid)] underline bg-transparent border-0 cursor-pointer"
              onClick={() => {
                const all = Object.fromEntries(overdueList.map((l: any) => [l.loan_id, true]));
                setSelectedOverdue(all);
              }}
            >
              Select all
            </button>
          )}
        </div>
        {overdueList.length === 0 ? (
          <p className="text-[var(--muted)] text-sm mb-4">No overdue loans.</p>
        ) : (
          <div className="max-h-44 overflow-auto rounded-xl border border-[var(--border)] mb-3">
            {overdueList.map((l: any) => (
              <label
                key={l.loan_id}
                className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-[var(--border)] text-sm cursor-pointer hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={Boolean(selectedOverdue[l.loan_id])}
                  onChange={(e) =>
                    setSelectedOverdue((s) => ({ ...s, [l.loan_id]: e.target.checked }))
                  }
                  className="accent-[var(--blue)]"
                />
                <span className="font-medium">{l.teacher_name || l.counselor_name || '—'}</span>
                <span className="text-[var(--muted)] truncate">
                  · {l.campus_name || l.campus_id || '—'} · {l.kit_name || l.kit_id}
                  {l.due_date ? ` · due ${l.due_date}` : ''}
                </span>
              </label>
            ))}
          </div>
        )}
        <Button
          variant="warn"
          onClick={() => sendOverdue.mutate()}
          disabled={sendOverdue.isPending || !Object.values(selectedOverdue).some(Boolean)}
        >
          Send overdue notices
        </Button>
      </Card>
    </div>
  );
}
