import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
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

/** CSS bar list — avoids Recharts/ResponsiveContainer crashes inside the GAS iframe. */
function RegionBars({ regions }: { regions: { name: string; checkouts: number }[] }) {
  const max = Math.max(1, ...regions.map((r) => r.checkouts));
  return (
    <div className="space-y-3">
      {regions.map((r, i) => (
        <div key={`${r.name}-${i}`}>
          <div className="flex justify-between gap-2 text-sm mb-1">
            <span className="font-medium text-[var(--navy)] truncate">{r.name}</span>
            <span className="text-[var(--muted)] tabular-nums shrink-0">{r.checkouts}</span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--navy)] transition-[width] duration-300"
              style={{ width: `${Math.round((r.checkouts / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const location = useLocation();
  const emailsPath = location.pathname.startsWith('/admin') ? '/admin/emails' : '/emails';
  const qc = useQueryClient();
  const { toast } = useToast();

  const dash = useQuery({ queryKey: ['dashboard'], queryFn: getDashboard });

  // Stagger secondary calls until primary dashboard data is in (reduces GAS pile-up).
  const board = useQuery({
    queryKey: ['status-board'],
    queryFn: getStatusBoard,
    enabled: dash.isSuccess,
    refetchInterval: 30_000,
  });
  const overdue = useQuery({
    queryKey: ['overdue-loans'],
    queryFn: getOverdueLoans,
    enabled: dash.isSuccess,
  });
  const regional = useQuery({
    queryKey: ['regional'],
    queryFn: getRegionalData,
    enabled: dash.isSuccess,
  });

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

  const openLoans = useMemo(() => {
    const raw = dash.data?.open_loans;
    return Array.isArray(raw) ? raw : [];
  }, [dash.data]);

  const overdueList = useMemo(() => {
    const raw = overdue.data?.loans;
    return Array.isArray(raw) ? raw : [];
  }, [overdue.data]);

  const regions = useMemo(() => {
    const raw = regional.data?.regions;
    if (!Array.isArray(raw)) return [];
    return raw.map((r: any) => ({
      name: String(r?.region || r?.name || 'Unknown').replace('Region ', 'R'),
      checkouts: Number(r?.checkouts ?? r?.count ?? r?.checked_out ?? 0) || 0,
    }));
  }, [regional.data]);

  const boardCards = useMemo(() => {
    const b = board.data;
    if (!b || typeof b !== 'object') return [];
    const careers = Array.isArray(b.careers) ? b.careers : [];
    return [
      {
        label: 'Ready',
        big: String(b.kits_ready ?? 0),
        meta: `${b.kits_total ?? 0} kits total`,
        hot: false,
      },
      {
        label: 'Checked out',
        big: String(b.kits_out ?? 0),
        meta: `${b.open_loans ?? 0} open loans`,
        hot: false,
      },
      {
        label: 'Overdue',
        big: String(b.overdue ?? 0),
        meta: 'needs follow-up',
        hot: Number(b.overdue) > 0,
      },
      ...careers.slice(0, 5).map((c: any, i: number) => ({
        label: String(c?.career || `Career ${i + 1}`),
        big: String(c?.total ?? 0),
        meta: `${c?.out ?? 0} out · ${c?.ready ?? 0} ready`,
        hot: false,
      })),
    ];
  }, [board.data]);

  const alerts = Array.isArray(dash.data?.alerts) ? dash.data!.alerts : [];
  const careerAlerts = Array.isArray(dash.data?.careerAlerts) ? dash.data!.careerAlerts : [];
  const anySelected = Object.values(selectedOverdue).some(Boolean);

  if (dash.isLoading) {
    return (
      <Card>
        <Spinner label="Loading dashboard…" />
      </Card>
    );
  }

  if (dash.isError) {
    return (
      <Card title="Dashboard unavailable">
        <p className="text-[var(--red)] m-0 mb-3">{(dash.error as Error).message}</p>
        <Button onClick={() => void dash.refetch()}>Retry</Button>
      </Card>
    );
  }

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
            {boardCards.map((c, i) => (
              <div
                key={`board-${i}-${c.label}`}
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
                const all = Object.fromEntries(
                  overdueList.map((l: any, i: number) => [String(l.loan_id || i), true]),
                );
                setSelectedOverdue(all);
              }}
            >
              Select all
            </button>
          }
        >
          <div className="max-h-56 overflow-auto rounded-xl border border-[var(--border)] mb-3">
            {overdueList.map((l: any, i: number) => {
              const id = String(l.loan_id || `row-${i}`);
              return (
                <label
                  key={id}
                  className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-[var(--border)] text-sm cursor-pointer hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(selectedOverdue[id])}
                    onChange={(e) => setSelectedOverdue((s) => ({ ...s, [id]: e.target.checked }))}
                    className="accent-[var(--blue)]"
                  />
                  <span className="font-medium">{l.teacher_name || l.counselor_name || '—'}</span>
                  <span className="text-[var(--muted)] truncate">
                    · {l.campus_name || '—'} · {l.kit_name || l.kit_id}
                  </span>
                </label>
              );
            })}
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
                {openLoans.map((l: any, i: number) => (
                  <tr key={String(l.loan_id || `loan-${i}`)} className="hover:bg-slate-50">
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
        ) : regional.isError ? (
          <p className="text-[var(--red)] text-sm m-0">{(regional.error as Error).message}</p>
        ) : regions.length === 0 ? (
          <p className="text-[var(--muted)] text-sm m-0">No regional data yet.</p>
        ) : (
          <RegionBars regions={regions} />
        )}
      </Card>

      {(alerts.length > 0 || careerAlerts.length > 0) && (
        <Card title="Reorder alerts">
          <div className="space-y-2">
            {alerts.map((a: any, i: number) => (
              <div
                key={`a-${i}`}
                className="bg-[var(--amber-bg)] text-[var(--amber)] rounded-lg px-3.5 py-2.5 text-sm"
              >
                <strong>{a.type_name}</strong> — {a.available} available (threshold {a.threshold})
              </div>
            ))}
            {careerAlerts.map((a: any, i: number) => (
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
