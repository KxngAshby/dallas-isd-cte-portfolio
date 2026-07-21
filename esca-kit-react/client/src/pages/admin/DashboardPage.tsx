import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Link, useLocation } from 'react-router-dom';
import { getDashboard, getRegionalData } from '../../api/dashboard';
import { sendOverdueNotices, sendReturnReminder } from '../../api/emails';
import { getOverdueLoans, getStatusBoard } from '../../api/loans';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Spinner } from '../../components/Spinner';
import { useToast } from '../../context/ToastContext';

function formatDate(v: unknown) {
  if (!v) return '—';
  const s = String(v);
  if (s.includes('T')) return s.slice(0, 10);
  return s;
}

export function DashboardPage() {
  const location = useLocation();
  const emailsPath = location.pathname.startsWith('/admin') ? '/admin/emails' : '/emails';
  const qc = useQueryClient();
  const { toast } = useToast();
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: getDashboard });
  const board = useQuery({
    queryKey: ['status-board'],
    queryFn: getStatusBoard,
    refetchInterval: 30_000,
  });
  const overdue = useQuery({ queryKey: ['overdue-loans'], queryFn: getOverdueLoans });
  const regional = useQuery({ queryKey: ['regional'], queryFn: getRegionalData });
  const [selectedOverdue, setSelectedOverdue] = useState<Record<string, boolean>>({});

  const sendOverdue = useMutation({
    mutationFn: () =>
      sendOverdueNotices(Object.keys(selectedOverdue).filter((k) => selectedOverdue[k])),
    onSuccess: (r: any) => {
      toast(
        `Overdue notices sent: ${r.sent ?? 0}${r.errors?.length ? ` · ${r.errors.length} errors` : ''}`,
        'ok',
      );
      setSelectedOverdue({});
      void qc.invalidateQueries({ queryKey: ['overdue-loans'] });
    },
    onError: (e: Error) => toast(e.message, 'err'),
  });

  const sendReminders = useMutation({
    mutationFn: () =>
      sendReturnReminder(Object.keys(selectedOverdue).filter((k) => selectedOverdue[k])),
    onSuccess: (r: any) => {
      toast(
        `Reminders sent: ${r.sent ?? 0}${r.errors?.length ? ` · ${r.errors.length} errors` : ''}`,
        'ok',
      );
      setSelectedOverdue({});
    },
    onError: (e: Error) => toast(e.message, 'err'),
  });

  if (dash.isLoading) return <Spinner label="Loading dashboard…" />;
  if (dash.isError) {
    return (
      <Card>
        <p className="text-[var(--red)] m-0">{(dash.error as Error).message}</p>
      </Card>
    );
  }

  const d = dash.data!;
  const openLoans = d.open_loans || [];
  const overdueList = overdue.data?.loans || [];
  const regions = (regional.data?.regions || []).map((r: any) => ({
    name: String(r.region || r.name || 'Unknown').replace('Region ', 'R'),
    checkouts: Number(r.checkouts ?? r.count ?? r.checked_out ?? 0),
  }));

  const b = board.data;
  const boardCards = b
    ? [
        {
          label: 'Ready',
          big: String(b.kits_ready),
          meta: `${b.kits_total} kits total`,
          hot: false,
        },
        {
          label: 'Checked out',
          big: String(b.kits_out),
          meta: `${b.open_loans} open loans`,
          hot: false,
        },
        {
          label: 'Overdue',
          big: String(b.overdue),
          meta: 'needs follow-up',
          hot: b.overdue > 0,
        },
        ...(b.careers || []).slice(0, 5).map((c) => ({
          label: c.career,
          big: String(c.total),
          meta: `${c.out} out · ${c.ready} ready`,
          hot: false,
        })),
      ]
    : [];

  const anySelected = Object.values(selectedOverdue).some(Boolean);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-[#061018] text-slate-200 px-5 py-5 border border-slate-800">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <p className="text-[0.7rem] uppercase tracking-[0.12em] text-slate-500 font-bold m-0 mb-1">
              Dallas ISD · CTE · Live
            </p>
            <h2 className="font-display text-white text-[1.45rem] m-0">Kit status</h2>
          </div>
          <p className="text-xs text-slate-500 m-0">
            {board.isFetching ? 'Refreshing…' : 'Updates every 30s'}
          </p>
        </div>

        {board.isLoading ? (
          <div className="py-6">
            <Spinner label="Loading status…" />
          </div>
        ) : board.isError ? (
          <p className="text-red-300 text-sm m-0">{(board.error as Error).message}</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {boardCards.map((c) => (
              <div
                key={`${c.label}-${c.meta}`}
                className={`rounded-xl border px-3.5 py-3.5 ${
                  c.hot ? 'border-red-500/50 bg-red-500/10' : 'border-white/10 bg-white/[0.04]'
                }`}
              >
                <div className="text-[0.68rem] uppercase tracking-[0.1em] text-slate-400 mb-1.5 truncate">
                  {c.label}
                </div>
                <div className="font-display text-[1.85rem] text-white leading-none">{c.big}</div>
                <div className="text-xs text-slate-400 mt-1.5">{c.meta}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {overdueList.length > 0 && (
        <Card
          title={
            <span>
              Overdue{' '}
              <span className="text-[var(--red)] font-semibold text-[0.95rem]">
                ({overdueList.length})
              </span>
            </span>
          }
          actions={
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
          }
        >
          <div className="max-h-56 overflow-auto rounded-xl border border-[var(--border)] mb-3">
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
                  · {l.campus_name || '—'} · {l.kit_name || l.kit_id}
                </span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="warn"
              onClick={() => sendOverdue.mutate()}
              disabled={!anySelected || sendOverdue.isPending}
            >
              Send overdue notices
            </Button>
            <Button
              variant="ghost"
              onClick={() => sendReminders.mutate()}
              disabled={!anySelected || sendReminders.isPending}
            >
              Send reminders
            </Button>
            <Link
              to={emailsPath}
              className="inline-flex items-center text-[0.85rem] font-semibold text-[var(--blue-mid)] no-underline hover:underline px-2"
            >
              Email Center →
            </Link>
          </div>
        </Card>
      )}

      <Card
        title={
          <span>
            Open loans{' '}
            <span className="text-[var(--muted)] font-semibold text-[0.95rem]">({openLoans.length})</span>
          </span>
        }
        actions={
          <Link
            to={emailsPath}
            className="text-[0.85rem] font-semibold text-[var(--blue-mid)] no-underline hover:underline"
          >
            Send reminders →
          </Link>
        }
      >
        {openLoans.length === 0 ? (
          <p className="text-[var(--muted)] text-sm m-0">No kits checked out right now.</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  {['Counselor', 'Campus', 'Kit', 'Out since'].map((h) => (
                    <th
                      key={h}
                      className="text-left px-3 py-2.5 text-[0.7rem] uppercase tracking-wide text-[var(--muted)] font-semibold border-b border-[var(--border)]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {openLoans.map((l: any) => (
                  <tr key={l.loan_id} className="hover:bg-slate-50">
                    <td className="px-3 py-3 border-b border-[var(--border)] font-medium">
                      {l.teacher_name || l.counselor_name || '—'}
                    </td>
                    <td className="px-3 py-3 border-b border-[var(--border)] text-[var(--muted)]">
                      {l.campus_name || l.campus_id || '—'}
                    </td>
                    <td className="px-3 py-3 border-b border-[var(--border)]">
                      {l.kit_name || l.kit_id || '—'}
                    </td>
                    <td className="px-3 py-3 border-b border-[var(--border)] text-[var(--muted)]">
                      {formatDate(l.checked_out_at || l.checkout_date || l.checked_out)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Checkouts by region">
        {regional.isLoading ? (
          <Spinner label="Loading regions…" />
        ) : regions.length === 0 ? (
          <p className="text-[var(--muted)] text-sm m-0">No regional data yet.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={regions} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                />
                <Bar dataKey="checkouts" fill="#003366" radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {(d.alerts?.length > 0 || d.careerAlerts?.length > 0) && (
        <Card title="Reorder alerts">
          <div className="space-y-2">
            {(d.alerts || []).map((a: any, i: number) => (
              <div
                key={`a-${i}`}
                className="bg-[var(--amber-bg)] text-[var(--amber)] rounded-lg px-3.5 py-2.5 text-sm"
              >
                <strong>{a.type_name}</strong> — {a.available} available (threshold {a.threshold})
              </div>
            ))}
            {(d.careerAlerts || []).map((a: any, i: number) => (
              <div
                key={`c-${i}`}
                className="bg-[var(--amber-bg)] text-[var(--amber)] rounded-lg px-3.5 py-2.5 text-sm"
              >
                <strong>{a.career}</strong> / {a.type_name} — {a.available} available (threshold{' '}
                {a.threshold})
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
