import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Loader2, Plus, Printer, Trash2 } from 'lucide-react';
import {
  generateBarcodes,
  getItemTypes,
  getKits,
  getTemplateItemsForKit,
} from '../../api/kits';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { TextSelect } from '../../components/FormField';
import { Spinner } from '../../components/Spinner';
import { useToast } from '../../context/ToastContext';

type Line = { type_id: string; qty: number };

export function LabelsPage() {
  const { toast } = useToast();
  const kits = useQuery({ queryKey: ['kits'], queryFn: getKits });
  const types = useQuery({ queryKey: ['item-types'], queryFn: getItemTypes });
  const [kitId, setKitId] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [result, setResult] = useState<{ kit: any; created: { barcode: string; type_id: string }[] } | null>(
    null,
  );
  const printRef = useRef<HTMLDivElement>(null);

  const gen = useMutation({
    mutationFn: () =>
      generateBarcodes(
        kitId,
        lines.filter((l) => l.type_id),
      ),
    onSuccess: (r: any) => {
      setResult({ kit: r.kit, created: r.created || [] });
      toast(`Generated ${r.created?.length || 0} barcodes.`, 'ok');
    },
    onError: (e: Error) => toast(e.message, 'err'),
  });

  const loadTemplate = async () => {
    if (!kitId) return toast('Select a kit first.', 'err');
    try {
      const r = await getTemplateItemsForKit(kitId);
      setLines((r.items || []).map((i: any) => ({ type_id: i.type_id, qty: i.qty || 1 })));
      toast(`Loaded ${(r.items || []).length} item(s) from template.`, 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load template.', 'err');
    }
  };

  useEffect(() => {
    if (!result || !printRef.current) return;
    const kitSvg = printRef.current.querySelector('#bc_kit') as SVGSVGElement | null;
    if (kitSvg && result.kit?.kit_barcode) {
      try {
        JsBarcode(kitSvg, String(result.kit.kit_barcode), {
          format: 'CODE128',
          width: 1.8,
          height: 50,
          displayValue: false,
          margin: 4,
        });
      } catch {
        /* ignore */
      }
    }
    result.created.forEach((item, i) => {
      const el = printRef.current?.querySelector(`#bc_item_${i}`) as SVGSVGElement | null;
      if (!el) return;
      try {
        JsBarcode(el, item.barcode, {
          format: 'CODE128',
          width: 1.5,
          height: 44,
          displayValue: false,
          margin: 4,
        });
      } catch {
        /* ignore */
      }
    });
  }, [result]);

  if (kits.isLoading || types.isLoading) return <Spinner label="Loading kits…" />;
  if (kits.isError) {
    return (
      <Card>
        <p className="text-[var(--red)] m-0">{(kits.error as Error).message}</p>
      </Card>
    );
  }

  const typeList = types.data?.types || [];
  const kitList = kits.data?.kits || [];
  const typeName = (id: string) => typeList.find((t: any) => t.type_id === id)?.name || id;

  return (
    <div className="space-y-5">
      <Card title="Generate barcodes" className="no-print">
        {kitList.length === 0 ? (
          <EmptyState
            title="No kits yet"
            body="Create a kit first, then come back to generate item barcodes."
          />
        ) : (
          <>
            <TextSelect
              label="Kit"
              value={kitId}
              onChange={(e) => {
                setKitId(e.target.value);
                setResult(null);
              }}
            >
              <option value="">— select a kit —</option>
              {kitList.map((k: any) => (
                <option key={k.kit_id} value={k.kit_id}>
                  {k.name} ({k.kit_barcode})
                </option>
              ))}
            </TextSelect>

            <div className="space-y-2 mb-4">
              {lines.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">
                  Add item types and quantities, or load from the kit&apos;s career template.
                </p>
              ) : (
                lines.map((line, i) => (
                  <div key={i} className="flex flex-wrap gap-2 items-center">
                    <select
                      className="flex-1 min-w-[180px] px-3 py-2.5 border border-[var(--border)] rounded-lg text-sm"
                      value={line.type_id}
                      onChange={(e) =>
                        setLines((rows) =>
                          rows.map((r, idx) => (idx === i ? { ...r, type_id: e.target.value } : r)),
                        )
                      }
                    >
                      <option value="">— item type —</option>
                      {typeList.map((t: any) => (
                        <option key={t.type_id} value={t.type_id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={line.qty}
                      onChange={(e) =>
                        setLines((rows) =>
                          rows.map((r, idx) =>
                            idx === i ? { ...r, qty: parseInt(e.target.value, 10) || 1 } : r,
                          ),
                        )
                      }
                      className="w-20 px-3 py-2.5 border border-[var(--border)] rounded-lg text-sm"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setLines((rows) => rows.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setLines((l) => [...l, { type_id: '', qty: 1 }])}>
                <Plus size={16} /> Add item type
              </Button>
              <Button variant="ghost" onClick={() => void loadTemplate()} disabled={!kitId}>
                Load from template
              </Button>
              <Button
                onClick={() => gen.mutate()}
                disabled={!kitId || !lines.some((l) => l.type_id) || gen.isPending}
              >
                {gen.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                Generate barcodes
              </Button>
            </div>
          </>
        )}
      </Card>

      {result && (
        <Card
          title={`Labels — ${result.kit?.name || ''}`}
          actions={
            <Button className="no-print" onClick={() => window.print()}>
              <Printer size={16} /> Print labels
            </Button>
          }
        >
          <div ref={printRef}>
            <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
              Kit case label
            </p>
            <div className="inline-block border border-[var(--border)] rounded-lg p-3 mb-5 text-center bg-white">
              <svg id="bc_kit" />
              <div className="text-sm font-bold mt-1">{result.kit?.name}</div>
              <div className="text-xs text-[var(--muted)] font-mono">{result.kit?.kit_barcode}</div>
            </div>

            <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
              Item labels ({result.created.length})
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {result.created.map((item, i) => (
                <div
                  key={item.barcode}
                  className="border border-[var(--border)] rounded-lg p-2.5 text-center bg-white break-inside-avoid"
                >
                  <svg id={`bc_item_${i}`} />
                  <div className="text-xs font-semibold mt-1">{typeName(item.type_id)}</div>
                  <div className="text-[0.7rem] text-[var(--muted)] font-mono">{item.barcode}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          aside, header { display: none !important; }
          main { margin: 0 !important; max-width: none !important; padding: 0 !important; }
        }
      `}</style>
    </div>
  );
}
