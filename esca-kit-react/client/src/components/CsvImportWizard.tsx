import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Upload } from 'lucide-react';
import { Button } from './Button';
import { Card } from './Card';
import { Spinner } from './Spinner';
import { useToast } from '../context/ToastContext';

export type CsvField = {
  key: string;
  label: string;
  required?: boolean;
};

type Props = {
  title: string;
  fields: CsvField[];
  hints: Record<string, string[]>;
  existingKeys?: Set<string>;
  identityKey: string;
  onCancel: () => void;
  onImport: (rows: Record<string, string>[]) => Promise<{ inserted: number; updated: number }>;
  previewColumns?: Array<{ key: string; label: string }>;
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (ch === ',' && !inQ) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

export function CsvImportWizard({
  title,
  fields,
  hints,
  existingKeys,
  identityKey,
  onCancel,
  onImport,
  previewColumns,
}: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, number | ''>>({});
  const [prepared, setPrepared] = useState<Record<string, string>[]>([]);
  const [busy, setBusy] = useState(false);

  const autoMap = (hdrs: string[]) => {
    const next: Record<string, number | ''> = {};
    fields.forEach((f) => {
      const idx = hdrs.findIndex((h) =>
        (hints[f.key] || []).some((hint) => h.toLowerCase().includes(hint)),
      );
      next[f.key] = idx >= 0 ? idx : '';
    });
    setMapping(next);
  };

  const onFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) {
        toast('CSV must have a header row and at least one data row.', 'err');
        return;
      }
      const hdrs = parseCsvLine(lines[0]);
      const rows = lines.slice(1).map(parseCsvLine);
      setHeaders(hdrs);
      setRawRows(rows);
      autoMap(hdrs);
      setStep(2);
    };
    reader.readAsText(file);
  };

  const buildPreview = () => {
    for (const f of fields) {
      if (f.required && (mapping[f.key] === '' || mapping[f.key] === undefined)) {
        toast(`You must map the ${f.label} column.`, 'err');
        return;
      }
    }
    const rows = rawRows
      .map((row) => {
        const obj: Record<string, string> = {};
        fields.forEach((f) => {
          const idx = mapping[f.key];
          if (idx !== '' && idx !== undefined) obj[f.key] = (row[idx] || '').trim();
        });
        return obj;
      })
      .filter((r) => r[identityKey] && (!fields.find((f) => f.key === 'name') || r.name));

    if (!rows.length) {
      toast('No valid rows found after mapping.', 'err');
      return;
    }
    setPrepared(rows);
    setStep(3);
  };

  const stats = useMemo(() => {
    const inserts = prepared.filter((r) => !existingKeys?.has(String(r[identityKey]).trim())).length;
    const updates = prepared.length - inserts;
    return { inserts, updates };
  }, [prepared, existingKeys, identityKey]);

  const confirm = async () => {
    setBusy(true);
    try {
      const result = await onImport(prepared);
      toast(`Import complete — ${result.inserted} added, ${result.updated} updated.`, 'ok');
      onCancel();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Import failed.', 'err');
    } finally {
      setBusy(false);
    }
  };

  const cols = previewColumns || fields.map((f) => ({ key: f.key, label: f.label }));

  if (busy) {
    return (
      <Card title={`${title} — Importing`}>
        <Spinner label="Importing…" />
      </Card>
    );
  }

  if (step === 1) {
    return (
      <Card title={`${title} — Step 1 of 3: Upload CSV`}>
        <p className="text-[var(--muted)] text-sm mb-5">
          Upload any CSV export. You will map columns in the next step. Re-importing is safe: matching keys update in place; new keys are added.
        </p>
        <label className="block mb-5">
          <span className="block text-sm font-semibold mb-1.5">Choose your CSV file</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="block w-full text-sm"
            onChange={(e) => onFile(e.target.files?.[0] || null)}
          />
        </label>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </Card>
    );
  }

  if (step === 2) {
    return (
      <Card title={`${title} — Step 2 of 3: Map Columns`}>
        <p className="text-[var(--muted)] text-sm mb-5">
          Your CSV has <strong>{headers.length} columns</strong> and <strong>{rawRows.length} rows</strong>. Match each
          required field to the right column.
        </p>
        <div className="overflow-x-auto mb-5">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="text-left px-3 py-2 bg-slate-50 text-[var(--muted)]">System Field</th>
                <th className="text-left px-3 py-2 bg-slate-50 text-[var(--muted)]">Your CSV Column</th>
                <th className="text-left px-3 py-2 bg-slate-50 text-[var(--muted)]">Preview</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => {
                const idx = mapping[f.key];
                const preview =
                  idx !== '' && idx !== undefined && rawRows[0] ? rawRows[0][idx] || '—' : '—';
                return (
                  <tr key={f.key}>
                    <td className="px-3 py-2 border-b border-[var(--border)] font-semibold">
                      {f.label}
                      {f.required && <span className="text-[var(--red)]"> *</span>}
                    </td>
                    <td className="px-3 py-2 border-b border-[var(--border)]">
                      <select
                        className="w-full px-2 py-1.5 border border-[var(--border)] rounded"
                        value={idx === '' || idx === undefined ? '' : String(idx)}
                        onChange={(e) =>
                          setMapping((m) => ({
                            ...m,
                            [f.key]: e.target.value === '' ? '' : Number(e.target.value),
                          }))
                        }
                      >
                        <option value="">— skip —</option>
                        {headers.map((h, i) => (
                          <option key={`${h}-${i}`} value={i}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 border-b border-[var(--border)] text-[var(--muted)] text-xs">
                      {preview}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => setStep(1)}>
            <ArrowLeft size={16} /> Back
          </Button>
          <Button onClick={buildPreview}>
            Next: Preview <ArrowRight size={16} />
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card title={`${title} — Step 3 of 3: Preview & Confirm`}>
      <div className="flex gap-4 mb-5 flex-wrap">
        <div className="bg-[var(--green-bg)] border border-green-300 rounded-lg px-5 py-3 text-center min-w-[120px]">
          <div className="text-2xl font-bold text-[var(--green)]">{stats.inserts}</div>
          <div className="text-xs text-green-800">New</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-5 py-3 text-center min-w-[120px]">
          <div className="text-2xl font-bold text-[var(--blue)]">{stats.updates}</div>
          <div className="text-xs text-blue-900">Updates</div>
        </div>
      </div>
      <div className="max-h-96 overflow-auto border border-[var(--border)] rounded-lg mb-5">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="text-left px-3 py-2 bg-slate-50 sticky top-0">Status</th>
              {cols.map((c) => (
                <th key={c.key} className="text-left px-3 py-2 bg-slate-50 sticky top-0">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {prepared.map((r, i) => {
              const isNew = !existingKeys?.has(String(r[identityKey]).trim());
              return (
                <tr key={`${r[identityKey]}-${i}`} className={isNew ? 'bg-green-50' : 'bg-blue-50'}>
                  <td className="px-3 py-2 border-b border-[var(--border)]">
                    <span
                      className={`text-[0.72rem] px-2 py-0.5 rounded-full font-semibold ${
                        isNew ? 'bg-[var(--green-bg)] text-[var(--green)]' : 'bg-blue-100 text-[var(--blue)]'
                      }`}
                    >
                      {isNew ? 'NEW' : 'UPDATE'}
                    </span>
                  </td>
                  {cols.map((c) => (
                    <td key={c.key} className="px-3 py-2 border-b border-[var(--border)]">
                      {r[c.key] || '—'}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={() => setStep(2)}>
          <ArrowLeft size={16} /> Back
        </Button>
        <Button variant="success" onClick={confirm}>
          <Check size={16} /> Confirm Import ({prepared.length})
        </Button>
      </div>
      <div className="mt-3 text-xs text-[var(--muted)] flex items-center gap-1">
        <Upload size={12} /> {prepared.length} rows ready
      </div>
    </Card>
  );
}
