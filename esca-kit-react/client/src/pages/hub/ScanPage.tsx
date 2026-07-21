import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Package, ScanLine } from 'lucide-react';
import { scanBarcode, type ScanResult } from '../../api/scan';
import { updateItemStatus } from '../../api/kits';
import { getOpenLoansForCounselor } from '../../api/loans';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { useCounselor } from '../../context/CounselorContext';
import { useToast } from '../../context/ToastContext';
import { CheckoutPanel } from './CheckoutPanel';
import { CheckinPanel } from './CheckinPanel';

type Props = {
  barcodeInput: string;
  setBarcodeInput: (v: string) => void;
  scanTrigger: number;
  onRequestScanFocus?: () => void;
  onPanelActiveChange?: (active: boolean) => void;
};

export function ScanPage({
  barcodeInput,
  setBarcodeInput,
  scanTrigger,
  onRequestScanFocus,
  onPanelActiveChange,
}: Props) {
  const { toast } = useToast();
  const { eid } = useCounselor();
  const qc = useQueryClient();
  const myKits = useQuery({
    queryKey: ['my-kits', eid],
    queryFn: () => getOpenLoansForCounselor(eid),
    enabled: Boolean(eid),
    refetchInterval: 60_000,
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const lastTrigger = useRef(0);

  const panelActive = Boolean(
    successMsg || error || result?.panel === 'checkout' || result?.panel === 'checkin' || result?.panel === 'item',
  );

  useEffect(() => {
    onPanelActiveChange?.(panelActive);
  }, [panelActive, onPanelActiveChange]);

  const finishAndReady = (message?: string) => {
    setResult(null);
    setError('');
    setNotes('');
    void qc.invalidateQueries({ queryKey: ['my-kits', eid] });
    if (message) {
      setSuccessMsg(message);
      setTimeout(() => {
        setSuccessMsg('');
        onRequestScanFocus?.();
      }, 2200);
    } else {
      onRequestScanFocus?.();
    }
  };

  useEffect(() => {
    if (scanTrigger > 0 && scanTrigger !== lastTrigger.current) {
      lastTrigger.current = scanTrigger;
      const v = barcodeInput.trim();
      if (!v) return;
      setBusy(true);
      setError('');
      setResult(null);
      setSuccessMsg('');
      scanBarcode(v)
        .then((r) => {
          setResult(r);
          setBarcodeInput('');
        })
        .catch((e) => {
          setError(e instanceof Error ? e.message : 'Scan failed.');
          setBarcodeInput('');
        })
        .finally(() => setBusy(false));
    }
  }, [scanTrigger, barcodeInput, setBarcodeInput]);

  const setStatus = async (status: string) => {
    if (!result?.item?.barcode) return;
    setBusy(true);
    try {
      await updateItemStatus(result.item.barcode, status, notes);
      toast(`Status updated → ${status}`, 'ok');
      finishAndReady('Item status saved.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Update failed.', 'err');
    } finally {
      setBusy(false);
    }
  };

  if (busy) {
    return (
      <div className="py-16 text-center">
        <Spinner label="Looking up barcode…" />
      </div>
    );
  }

  if (successMsg) {
    return (
      <div className="py-16 text-center animate-[fadeUp_0.3s_ease]">
        <div className="w-24 h-24 rounded-full bg-[var(--green-bg)] text-[var(--green)] flex items-center justify-center mx-auto mb-5 text-4xl font-bold">
          ✓
        </div>
        <h2 className="font-display text-[1.7rem] font-bold text-[var(--navy)] mb-2 m-0">{successMsg}</h2>
        <p className="text-[var(--muted)] m-0">Returning you to the scanner…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="animate-[fadeUp_0.25s_ease] max-w-lg mx-auto">
        <div className="bg-[var(--red-bg)] text-[var(--red)] font-semibold rounded-2xl px-4 py-3.5 mb-5">
          {error}
        </div>
        <Button
          size="lg"
          className="w-full !rounded-2xl"
          onClick={() => {
            setError('');
            onRequestScanFocus?.();
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  if (result?.panel === 'checkout') {
    return (
      <CheckoutPanel
        data={result}
        onDone={() => finishAndReady('Kit checked out.')}
        onCancel={() => finishAndReady()}
      />
    );
  }

  if (result?.panel === 'checkin') {
    return (
      <CheckinPanel
        data={result}
        onDone={() => finishAndReady('Kit checked in.')}
        onCancel={() => finishAndReady()}
      />
    );
  }

  if (result?.panel === 'item') {
    const s = result.item?.status || '';
    return (
      <div className="animate-[fadeUp_0.25s_ease] bg-white border border-[var(--border)] rounded-2xl p-6 shadow-sm max-w-lg mx-auto">
        <p className="text-[0.72rem] uppercase tracking-[0.12em] text-[var(--muted)] font-bold m-0 mb-2">
          Item barcode
        </p>
        <h2 className="font-display text-[1.4rem] font-bold text-[var(--navy)] mb-1 m-0">Update item</h2>
        <p className="text-[var(--muted)] text-[0.9rem] mb-5">
          {result.type?.name || result.item?.type_id} · {result.item?.barcode}
        </p>
        <p className="text-[0.85rem] text-[var(--muted)] mb-3">
          Current status: <strong className="text-[var(--text)]">{s}</strong>
        </p>
        <textarea
          className="w-full px-3 py-2.5 border border-[var(--border)] rounded-xl text-[0.9rem] min-h-[56px] mb-4 font-[inherit]"
          placeholder="Optional notes…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="grid grid-cols-1 gap-2.5">
          <Button variant="success" size="lg" className="!rounded-2xl" onClick={() => void setStatus('Available')}>
            Available
          </Button>
          <Button variant="warn" size="lg" className="!rounded-2xl" onClick={() => void setStatus('Needs Replacement')}>
            Needs Replacement
          </Button>
          <Button variant="danger" size="lg" className="!rounded-2xl" onClick={() => void setStatus('Dead')}>
            Dead
          </Button>
        </div>
        <button
          type="button"
          className="mt-4 w-full text-center text-[0.85rem] text-[var(--muted)] underline bg-transparent border-0 cursor-pointer"
          onClick={() => finishAndReady()}
        >
          Cancel
        </button>
      </div>
    );
  }

  const mine = myKits.data?.loans || [];

  return (
    <div className="animate-[fadeUp_0.35s_ease]">
      {mine.length > 0 && (
        <div className="bg-white border border-[var(--border)] rounded-2xl p-4 mb-6 shadow-sm max-w-lg mx-auto">
          <div className="flex items-center gap-2 text-[var(--navy)] font-bold text-sm mb-3">
            <Package size={16} />
            You currently have out
          </div>
          <ul className="list-none m-0 p-0 space-y-2">
            {mine.map((l: any) => (
              <li
                key={l.loan_id}
                className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm"
              >
                <div>
                  <strong className="text-[var(--text)]">{l.kit_name || l.kit_id}</strong>
                  {l.kit_barcode && (
                    <span className="block text-xs text-[var(--muted)] font-mono mt-0.5">
                      {l.kit_barcode}
                    </span>
                  )}
                </div>
                <span className="text-xs text-[var(--muted)] shrink-0">
                  {l.due_date ? `Due ${l.due_date}` : 'Checked out'}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-[var(--muted)] m-0 mt-3">
            Scan that kit&apos;s TipWeb tag to check it back in.
          </p>
        </div>
      )}

      <div className="py-8 text-center">
        <div className="w-[88px] h-[88px] rounded-full bg-white border border-[var(--border)] shadow-sm flex items-center justify-center mx-auto mb-5 text-[var(--navy)] animate-[softPulse_2.4s_ease-in-out_infinite]">
          <ScanLine size={36} strokeWidth={1.5} />
        </div>
        <h2 className="font-display text-[1.85rem] font-bold text-[var(--navy)] mb-2 m-0">Ready to scan</h2>
        <p className="text-[1.05rem] text-[var(--muted)] max-w-sm mx-auto leading-relaxed m-0">
          Point the scanner at the TipWeb tag on the kit case.
        </p>
      </div>
    </div>
  );
}
