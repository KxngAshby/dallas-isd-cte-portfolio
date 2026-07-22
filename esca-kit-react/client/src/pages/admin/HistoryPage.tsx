import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { getLoanHistory } from '../../api/loans';
import { Card } from '../../components/Card';
import { Spinner } from '../../components/Spinner';
import { Table } from '../../components/Table';

function fmtDate(v: string) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function HistoryPage() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const hist = useQuery({
    queryKey: ['loan-history', search],
    queryFn: () => getLoanHistory(search),
  });

  const rows = useMemo(() => hist.data?.loans || [], [hist.data]);

  if (hist.isLoading) return <Spinner label="Loading history…" />;

  return (
    <Card title="Loan history">
      <form
        className="flex flex-wrap gap-2 mb-4"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(q.trim());
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by EID, name, campus, or kit…"
          className="flex-1 min-w-[220px] px-3.5 py-2.5 border border-[var(--border)] rounded-xl text-sm"
        />
        <button
          type="submit"
          className="px-4 py-2.5 rounded-xl bg-[var(--navy)] text-white font-semibold text-sm border-0 cursor-pointer"
        >
          Search
        </button>
      </form>

      {hist.isError ? (
        <p className="text-[var(--red)] m-0">{(hist.error as Error).message}</p>
      ) : (
        <Table
          rows={rows}
          rowKey={(r) => r.loan_id}
          empty="No loans match that search."
          columns={[
            {
              key: 'when',
              header: 'Checked out',
              render: (r) => fmtDate(r.checked_out_at),
            },
            {
              key: 'kit',
              header: 'Kit',
              render: (r) => <strong>{r.kit_name || r.kit_id}</strong>,
            },
            {
              key: 'items',
              header: 'Items',
              render: (r) =>
                r.items_count != null ? (
                  <span className="text-xs text-[var(--muted)]">{r.items_count} confirmed</span>
                ) : (
                  '—'
                ),
            },
            {
              key: 'who',
              header: 'Counselor',
              render: (r) => (
                <span>
                  {r.teacher_name || '—'}
                  {r.counselor_eid ? (
                    <span className="block text-xs text-[var(--muted)] font-mono">{r.counselor_eid}</span>
                  ) : null}
                </span>
              ),
            },
            { key: 'campus', header: 'Campus', render: (r) => r.campus_name || '—' },
            {
              key: 'result',
              header: 'Status',
              render: (r) => {
                if (r.status === 'Open') {
                  return (
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-blue-100 text-[var(--blue)]">
                      Open
                    </span>
                  );
                }
                if (r.return_type === 'problem') {
                  return (
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-[var(--amber-bg)] text-[var(--amber)]">
                      Issue reported
                    </span>
                  );
                }
                return (
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-[var(--green-bg)] text-[var(--green)]">
                    Returned
                  </span>
                );
              },
            },
          ]}
        />
      )}
    </Card>
  );
}
