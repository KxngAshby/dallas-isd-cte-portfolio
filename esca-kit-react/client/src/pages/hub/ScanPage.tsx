import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Package, ScanLine } from 'lucide-react';
import { scanBarcode, type ScanResult } from '../../api/scan';
import { getKitItems, updateItemStatus } from '../../api/kits';
import { getOpenLoansForCounselor } from '../../api/loans';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { useCounselor } from '../../context/CounselorContext';
import { useToast } from '../../context/ToastContext';
import { CheckoutPanel } from './CheckoutPanel';
import { CheckinPanel } from './CheckinPanel';

type Props = {
  scan: { code: string; nonce: number };
  setBarcodeInput: (v: string) => void;
  onRequestScanFocus?: () => void;
  onPanelActiveChange?: (active: boolean) => void;
};

export function ScanPage({
  scan,
  setBarcodeInput,
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
  const [lastScan, setLastScan] = useState('');
  const lastNonce = useRef(0);

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
    if (scan.nonce === 0 || scan.nonce === lastNonce.current) return;
    lastNonce.current = scan.nonce;
    const v = scan.code.trim();
    if (!v) {
      // Surface empty submits instead of silently doing nothing.
      setLastScan('(empty) — the scanner sent no characters');
      setError('No barcode scanned. Point the scanner at the tag and try again.');
      setResult(null);
      setSuccessMsg('');
      return;
    }
    setBusy(true);
    setError('');
    setResult(null);
    setSuccessMsg('');
    scanBarcode(v)
      .then((r) => {
        setLastScan(`"${v}" -> ${r?.panel || 'no panel'}`);
        setResult(r);
        setBarcodeInput('');
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : 'Scan failed.';
        setLastScan(`"${v}" -> ${msg}`);
        setError(msg);
        setBarcodeInput('');
      })
      .finally(() => setBusy(false));
  }, [scan, setBarcodeInput]);

  // Scan-independent check-in: open the same panel straight from the "out" list.
  const startCheckin = async (l: any) => {
    setBusy(true);
    setError('');
    setSuccessMsg('');
    setResult(null);
    try {
      let items: any[] = [];
      if (l.kit_id) {
        const r = (await getKitItems(l.kit_id).catch(() => null)) as { items?: any[] } | null;
        items = r?.items || [];
      }
      setResult({
        success: true,
        panel: 'checkin',
        kit: { name: l.kit_name || l.kit_id, kit_id: l.kit_id, kit_barcode: l.kit_barcode },
        loan: {
          loan_id: l.loan_id,
          teacher_name: l.teacher_name || '',
          due_date: l.due_date || '',
        },
        items,
      } as ScanResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open check-in.');
    } finally {
      setBusy(false);
    }
  };

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
                className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <strong className="text-[var(--text)]">{l.kit_name || l.kit_id}</strong>
                  {l.kit_barcode && (
                    <span className="block text-xs text-[var(--muted)] font-mono mt-0.5">
                      {l.kit_barcode}
                    </span>
                  )}
                  <span className="block text-xs text-[var(--muted)] mt-0.5">
                    {l.due_date ? `Due ${l.due_date}` : 'Checked out'}
                  </span>
                </div>
                <Button
                  size="sm"
                  className="shrink-0 !rounded-xl"
                  onClick={() => void startCheckin(l)}
                >
                  Check in
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-[var(--muted)] m-0 mt-3">
            Scan that kit&apos;s TipWeb tag to check it back in.
          </p>
        </div>
      )}

      {mine.length === 0 && (
        <div className="bg-white border border-[var(--border)] rounded-2xl p-4 mb-6 shadow-sm max-w-lg mx-auto">
          <div className="flex items-center gap-2 text-[var(--navy)] font-bold text-sm mb-2">
            <Package size={16} />
            Nothing checked out under your EID
          </div>
          <p className="text-xs text-[var(--muted)] m-0">
            {myKits.isError
              ? `Could not load your loans: ${(myKits.error as Error).message}`
              : `No open loans found for EID ${eid || '(none)'}. If you just checked a kit out and it is not here, tell ESCA.`}
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
        {lastScan && (
          <p className="text-xs text-[var(--muted)] mt-4 m-0 font-mono break-all">
            Last scan: {lastScan}
          </p>
        )}
      </div>
    </div>
  );
}
