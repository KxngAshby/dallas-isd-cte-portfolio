import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ClipboardCheck, ScanLine } from 'lucide-react';
import { runAudit } from '../../api/audit';
import { getKits } from '../../api/kits';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { TextSelect } from '../../components/FormField';
import { Spinner } from '../../components/Spinner';
import { useToast } from '../../context/ToastContext';

export function AuditPage() {
  const { toast } = useToast();
  const kits = useQuery({ queryKey: ['kits'], queryFn: getKits });
  const [kitId, setKitId] = useState('');
  const [scan, setScan] = useState('');
  const [scanned, setScanned] = useState<string[]>([]);
  const [result, setResult] = useState<any | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [kitId]);

  const addScan = () => {
    const v = scan.trim();
    if (!v) return;
    setScanned((list) => (list.includes(v) ? list : [...list, v]));
    setScan('');
    inputRef.current?.focus();
  };

  const audit = useMutation({
    mutationFn: () => runAudit(kitId, scanned),
    onSuccess: (r) => {
      setResult(r);
      toast(
        r.missing.length === 0 && r.unexpected.length === 0
          ? 'All items accounted for.'
          : `Audit done — ${r.missing.length} missing.`,
        r.missing.length ? 'err' : 'ok',
      );
    },
    onError: (e: Error) => toast(e.message, 'err'),
  });

  if (kits.isLoading) return <Spinner label="Loading kits…" />;
  if (kits.isError) {
    return (
      <Card>
        <p className="text-[var(--red)] m-0">{(kits.error as Error).message}</p>
      </Card>
    );
  }

  const kitList = kits.data?.kits || [];

  return (
    <div className="space-y-5">
      <Card title="Kit audit">
        {kitList.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title="No kits to audit"
            body="Create kits and generate item barcodes first."
          />
        ) : (
          <>
            <TextSelect
              label="Kit"
              value={kitId}
              onChange={(e) => {
                setKitId(e.target.value);
                setScanned([]);
                setResult(null);
              }}
            >
              <option value="">— select a kit —</option>
              {kitList.map((k: any) => (
                <option key={k.kit_id} value={k.kit_id}>
                  {k.name}
                </option>
              ))}
            </TextSelect>

            <label className="block text-sm font-semibold text-[var(--text)] mb-1.5">
              Scan item barcodes
            </label>
            <div className="flex gap-2 mb-3">
              <input
                ref={inputRef}
                type="text"
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addScan();
                }}
                disabled={!kitId}
                placeholder="Scan or type, then Enter…"
                autoComplete="off"
                className="flex-1 px-3 py-2.5 border border-[var(--border)] rounded-lg text-[0.95rem] disabled:bg-slate-50"
              />
              <Button onClick={addScan} disabled={!kitId || !scan.trim()}>
                <ScanLine size={16} /> Add
              </Button>
            </div>

            <p className="text-sm text-[var(--muted)] mb-4">
              <strong className="text-[var(--text)]">{scanned.length}</strong> scanned
              {scanned.length > 0 && (
                <span className="block mt-1 font-mono text-xs break-all">{scanned.join(', ')}</span>
              )}
            </p>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setScanned([]);
                  setResult(null);
                  inputRef.current?.focus();
                }}
                disabled={!scanned.length}
              >
                Clear scans
              </Button>
              <Button
                variant="success"
                onClick={() => audit.mutate()}
                disabled={!kitId || audit.isPending}
              >
                Run audit
              </Button>
            </div>
          </>
        )}
      </Card>

      {result && (
        <Card title="Audit results">
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: 'Expected', value: result.expected },
              { label: 'Scanned', value: result.found },
              { label: 'Missing', value: result.missing?.length || 0, warn: true },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-[var(--border)] bg-slate-50 px-3 py-3 text-center"
              >
                <div
                  className={`text-2xl font-bold ${
                    s.warn && s.value > 0 ? 'text-[var(--red)]' : 'text-[var(--blue)]'
                  }`}
                >
                  {s.value}
                </div>
                <div className="text-xs text-[var(--muted)] uppercase tracking-wide mt-1">
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {result.missing?.length > 0 && (
            <div className="mb-4">
              <p className="font-semibold text-[var(--red)] text-sm mb-2">Missing items</p>
              <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs uppercase text-[var(--muted)]">
                      <th className="px-3 py-2">Barcode</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.missing.map((m: any) => (
                      <tr key={m.barcode} className="border-t border-[var(--border)]">
                        <td className="px-3 py-2 font-mono text-xs">{m.barcode}</td>
                        <td className="px-3 py-2">{m.type_name || m.type_id}</td>
                        <td className="px-3 py-2">{m.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result.unexpected?.length > 0 && (
            <div className="mb-3">
              <p className="font-semibold text-[var(--amber)] text-sm mb-1">
                Unexpected scans (not in this kit)
              </p>
              <p className="text-sm font-mono break-all m-0">{result.unexpected.join(', ')}</p>
            </div>
          )}

          {!result.missing?.length && !result.unexpected?.length && (
            <div className="bg-[var(--green-bg)] text-[var(--green)] font-semibold rounded-xl px-4 py-3 text-sm">
              All items accounted for.
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
