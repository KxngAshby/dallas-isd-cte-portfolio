import { useMemo, useState } from 'react';
import { Check, TriangleAlert } from 'lucide-react';
import { checkoutLoan } from '../../api/loans';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { useCounselor } from '../../context/CounselorContext';
import { useToast } from '../../context/ToastContext';
import type { ScanResult } from '../../api/scan';

function badgeClass(status: string) {
  if (status === 'Available') return 'bg-[var(--green-bg)] text-[var(--green)]';
  if (status === 'Needs Replacement') return 'bg-[var(--amber-bg)] text-[var(--amber)]';
  if (status === 'Dead') return 'bg-[var(--red-bg)] text-[var(--red)]';
  return 'bg-slate-100 text-[var(--muted)]';
}

function isProblemStatus(status: string) {
  return status === 'Needs Replacement' || status === 'Dead' || status === 'Missing';
}

type Props = {
  data: ScanResult;
  onDone: () => void;
  onCancel: () => void;
};

export function CheckoutPanel({ data, onDone, onCancel }: Props) {
  const { name, campusId, campusName, eid, email } = useCounselor();
  const { toast } = useToast();
  const items = data.items || [];
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.map((i) => [i.barcode, true])),
  );
  const [busy, setBusy] = useState(false);
  const [acknowledgeOverride, setAcknowledgeOverride] = useState(false);

  const problemItems = useMemo(
    () => items.filter((i) => isProblemStatus(String(i.status || ''))),
    [items],
  );
  const kitReady = Boolean(data.ready) && problemItems.length === 0;
  const canCheckout = kitReady || acknowledgeOverride;

  const toggle = (barcode: string) => {
    setChecked((c) => ({ ...c, [barcode]: !c[barcode] }));
  };

  const confirm = async () => {
    if (!campusId) {
      toast('Session error — please sign in again.', 'err');
      return;
    }
    if (!canCheckout) {
      toast('This kit is not ready. Acknowledge the override to continue.', 'err');
      return;
    }
    const confirmedBarcodes = items.filter((i) => checked[i.barcode]).map((i) => i.barcode);
    setBusy(true);
    try {
      const r = await checkoutLoan({
        kitId: data.kit.kit_id,
        tipwebTag: data.kit?.tipweb_tag || data.kit?.kit_barcode || '',
        teacherName: name,
        confirmedBarcodes,
        campusId,
        counselorEid: eid,
        counselorEmail: email,
        forceCheckout: !kitReady,
      });
      toast(`Checked out${r.loanId ? ` · ${r.loanId}` : ''}`, 'ok');
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Checkout failed.', 'err');
    } finally {
      setBusy(false);
    }
  };

  if (busy) {
    return (
      <div className="bg-white rounded-2xl border border-[var(--border)] p-6 shadow-sm">
        <Spinner label="Checking out…" />
      </div>
    );
  }

  return (
    <div className="animate-[fadeUp_0.25s_ease] bg-white border border-[var(--border)] rounded-2xl p-6 shadow-sm max-w-xl mx-auto">
      <p className="text-[0.72rem] uppercase tracking-[0.12em] text-[var(--muted)] font-bold m-0 mb-2">
        Available kit
      </p>
      <h2 className="font-display text-[1.65rem] font-bold text-[var(--navy)] m-0 mb-1">{data.kit?.name}</h2>
      <p className="text-[0.92rem] text-[var(--muted)] mb-4 m-0">
        {data.kit?.career ? `${data.kit.career} · ` : ''}
        TipWeb {data.kit?.tipweb_tag || data.kit?.kit_barcode || '—'}
        {campusName ? ` · ${campusName}` : ''}
      </p>

      {kitReady ? (
        <div className="bg-[var(--green-bg)] text-[var(--green)] font-semibold text-[0.9rem] rounded-xl px-3.5 py-3 mb-4">
          All items look good — confirm to take this kit.
        </div>
      ) : (
        <div className="bg-[var(--red-bg)] text-[var(--red)] font-semibold text-[0.9rem] rounded-xl px-3.5 py-3 mb-4">
          <div className="flex items-start gap-2">
            <TriangleAlert size={18} className="shrink-0 mt-0.5" />
            <div>
              <strong className="block mb-1">Kit not ready</strong>
              {problemItems.length
                ? `${problemItems.length} item(s) need attention before a normal checkout.`
                : 'Some items are not Available.'}{' '}
              Ask ESCA staff, or acknowledge an override below.
            </div>
          </div>
        </div>
      )}

      <ul className="list-none m-0 p-0 mb-4 border border-[var(--border)] rounded-xl overflow-hidden">
        {items.map((i) => (
          <li
            key={i.barcode}
            className="flex items-center gap-3 px-3.5 py-3 border-b border-[var(--border)] last:border-0"
          >
            <input
              type="checkbox"
              id={`cb_${i.barcode}`}
              checked={Boolean(checked[i.barcode])}
              onChange={() => toggle(i.barcode)}
              className="w-5 h-5 accent-[var(--blue)]"
            />
            <label htmlFor={`cb_${i.barcode}`} className="flex-1 cursor-pointer text-[0.95rem] font-semibold">
              {i.type_name}
            </label>
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${badgeClass(i.status)}`}>
              {i.status}
            </span>
          </li>
        ))}
      </ul>

      {!kitReady && (
        <label className="flex items-start gap-2.5 mb-4 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={acknowledgeOverride}
            onChange={(e) => setAcknowledgeOverride(e.target.checked)}
            className="mt-0.5 w-[18px] h-[18px] accent-[var(--amber)]"
          />
          <span>
            I understand this kit is not fully ready and accept responsibility for checking it out
            anyway. This override is logged.
          </span>
        </label>
      )}

      <Button
        variant="success"
        size="lg"
        className="w-full !rounded-2xl"
        onClick={() => void confirm()}
        disabled={!canCheckout}
      >
        <Check size={18} /> Confirm checkout
      </Button>
      <Button variant="ghost" className="w-full !rounded-2xl mt-2.5" onClick={onCancel}>
        Cancel
      </Button>
      <p className="text-center text-xs text-[var(--muted)] mt-3 m-0">Checking out as {name}</p>
    </div>
  );
}
