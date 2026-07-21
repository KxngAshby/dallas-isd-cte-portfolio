import type { ReactNode } from 'react';

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  empty?: ReactNode;
};

export function Table<T>({ columns, rows, rowKey, empty }: Props<T>) {
  if (!rows.length) {
    return <div className="text-[var(--muted)] text-sm py-4">{empty || 'No records found.'}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[0.92rem]">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="text-left px-4 py-3 bg-slate-50 text-[var(--muted)] font-semibold text-xs uppercase tracking-wide"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey(row, i)} className="hover:bg-[#f0f7ff]">
              {columns.map((col) => (
                <td key={col.key} className={`px-4 py-3.5 border-b border-[var(--border)] ${col.className || ''}`}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
