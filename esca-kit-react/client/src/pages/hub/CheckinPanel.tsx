import { useState } from 'react';
import { ArrowLeft, Check, Flag, TriangleAlert } from 'lucide-react';
import { checkinLoan } from '../../api/loans';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { useToast } from '../../context/ToastContext';
import type { ScanResult } from '../../api/scan';

const ISSUE_TYPES = ['Needs Replacement', 'Does Not Work', 'Needs Batteries', 'Missing', 'Other'];

function badgeClass(status: string) {
  if (status === 'Available') return 'bg-[var(--green-bg)] text-[var(--green)]';
  if (status === 'Needs Replacement') return 'bg-[var(--amber-bg)] text-[var(--amber)]';
  if (status === 'Dead') return 'bg-[var(--red-bg)] text-[var(--red)]';
  return 'bg-slate-100 text-[var(--muted)]';
}

type Mode = 'choice' | 'clean' | 'problem';

type Props = {
  data: ScanResult;
  onDone: () => void;
  onCancel: () => void;
};

export function CheckinPanel({ data, onDone, onCancel }: Props) {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('choice');
  const [busy, setBusy] = useState(false);
  const [issueChecked, setIssueChecked] = useState<Record<string, boolean>>({});
  const [issueType, setIssueType] = useState<Record<string, string>>({});
  const [issueNotes, setIssueNotes] = useState<Record<string, string>>({});
  const items = data.items || [];
  const who = data.loan?.teacher_name || data.loan?.checked_out_by || 'Unknown';
  const due = data.loan?.due_date || '';

  const submit = async (returnType: 'clean' | 'problem', issues: any[] = []) => {
    const loanId = data.loan?.loan_id;
    if (!loanId) {
      toast('No active loan found for this kit.', 'err');
      return;
    }
    setBusy(true);
    try {
      await checkinLoan({ loanId, returnType, issues });
      toast('Kit checked in successfully.', 'ok');
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Check-in failed.', 'err');
    } finally {
      setBusy(false);
    }
  };

  const submitProblem = () => {
    const issues = items
      .filter((i) => issueChecked[i.barcode])
      .map((i) => ({
        barcode: i.barcode,
        issue_type: issueType[i.barcode] || ISSUE_TYPES[0],
        notes: issueNotes[i.barcode] || '',
      }));
    void submit('problem', issues);
  };

  if (busy) {
    return (
      <div className="bg-white rounded-2xl border border-[var(--border)] p-6 shadow-sm">
        <Spinner label="Completing check-in…" />
      </div>
    );
  }

  if (mode === 'choice') {
    return (
      <div className="animate-[fadeUp_0.25s_ease] bg-white border border-[var(--border)] rounded-2xl p-6 shadow-sm max-w-xl mx-auto">
        <p className="text-[0.72rem] uppercase tracking-[0.12em] text-[var(--muted)] font-bold m-0 mb-2">
          Returning kit
        </p>
        <h2 className="font-display text-[1.65rem] font-bold text-[var(--navy)] m-0 mb-1">{data.kit?.name}</h2>
        <p className="text-[0.92rem] text-[var(--muted)] mb-6 m-0">
          Checked out to {who}
          {due ? ` · Due ${due}` : ''}
        </p>

        <div className="grid sm:grid-cols-2 gap-3">
          <Button
            variant="success"
            size="lg"
            className="w-full !py-6 flex-col !gap-1 !rounded-2xl"
            onClick={() => setMode('clean')}
          >
            <span className="inline-flex items-center gap-2 text-[1.05rem]">
              <Check size={20} /> Everything looks good
            </span>
          </Button>
          <Button
            variant="warn"
            size="lg"
            className="w-full !py-6 flex-col !gap-1 !rounded-2xl"
            onClick={() => setMode('problem')}
          >
            <span className="inline-flex items-center gap-2 text-[1.05rem]">
              <TriangleAlert size={20} /> Report a problem
            </span>
          </Button>
        </div>
        <Button variant="ghost" className="w-full !rounded-2xl mt-3" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    );
  }

  if (mode === 'clean') {
    return (
      <div className="bg-white rounded-2xl border border-[var(--border)] p-6 shadow-sm max-w-xl mx-auto">
        <div className="flex items-center gap-2.5 text-[var(--navy)] font-bold text-[1.05rem] mb-4 font-display">
          <Check size={18} /> Clean return
        </div>
        <p className="text-[var(--muted)] text-[0.92rem] mb-3.5">
          Confirm non-consumable items are present and accounted for:
        </p>
        <ul className="list-none m-0 p-0 mb-4 border border-[var(--border)] rounded-xl overflow-hidden">
          {items.map((i) =>
            i.is_consumable ? (
              <li key={i.barcode} className="flex items-center gap-3 px-3.5 py-2.5 border-b border-[var(--border)] last:border-0">
                <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-slate-100 text-[var(--muted)]">
                  Consumable
                </span>
                <span className="text-[var(--muted)] line-through">{i.type_name}</span>
              </li>
            ) : (
              <li key={i.barcode} className="flex items-center gap-3 px-3.5 py-2.5 border-b border-[var(--border)] last:border-0">
                <span className="w-[22px] h-[22px] rounded-md bg-[var(--green-bg)] text-[var(--green)] grid place-items-center text-xs font-extrabold">
                  ✓
                </span>
                <div className="flex-1 text-[0.92rem] font-semibold">
                  {i.type_name}
                  <span className="block text-[0.78rem] text-[var(--muted)] font-normal">{i.barcode}</span>
                </div>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${badgeClass(i.status)}`}>
                  {i.status}
                </span>
              </li>
            ),
          )}
        </ul>
        <div className="flex gap-2.5 justify-end flex-wrap">
          <Button variant="ghost" className="!rounded-xl" onClick={() => setMode('choice')}>
            <ArrowLeft size={16} /> Back
          </Button>
          <Button variant="success" size="lg" className="!rounded-xl" onClick={() => void submit('clean', [])}>
            <Check size={18} /> Confirm check-in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-[var(--border)] p-6 shadow-sm max-w-xl mx-auto">
      <div className="flex items-center gap-2.5 text-[var(--navy)] font-bold text-[1.05rem] mb-2 font-display">
        <TriangleAlert size={18} /> Report problem
      </div>
      <p className="text-[var(--muted)] text-[0.92rem] mb-3.5">Select items with a problem:</p>
      <div className="mb-4">
        {items.map((i) => {
          const open = Boolean(issueChecked[i.barcode]);
          return (
            <div key={i.barcode} className="border border-[var(--border)] rounded-xl mb-2 overflow-hidden">
              <label className="flex items-center gap-2.5 px-3.5 py-2.5 bg-slate-50 cursor-pointer hover:bg-slate-100">
                <input
                  type="checkbox"
                  checked={open}
                  onChange={(e) => setIssueChecked((c) => ({ ...c, [i.barcode]: e.target.checked }))}
                  className="w-[18px] h-[18px] accent-[var(--blue)]"
                />
                <span className="flex-1 text-[0.92rem] font-semibold">
                  {i.type_name}
                  <span className="text-[var(--muted)] text-[0.78rem] ml-1.5 font-normal">— {i.barcode}</span>
                </span>
              </label>
              {open && (
                <div className="p-3.5 border-t border-[var(--border)] bg-white">
                  <select
                    className="w-full px-3 py-2.5 border border-[var(--border)] rounded-lg mb-2"
                    value={issueType[i.barcode] || ISSUE_TYPES[0]}
                    onChange={(e) => setIssueType((t) => ({ ...t, [i.barcode]: e.target.value }))}
                  >
                    {ISSUE_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    className="w-full px-3 py-2.5 border border-[var(--border)] rounded-lg"
                    placeholder="Additional notes…"
                    value={issueNotes[i.barcode] || ''}
                    onChange={(e) => setIssueNotes((n) => ({ ...n, [i.barcode]: e.target.value }))}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-2.5 justify-end flex-wrap">
        <Button variant="ghost" className="!rounded-xl" onClick={() => setMode('choice')}>
          <ArrowLeft size={16} /> Back
        </Button>
        <Button variant="warn" size="lg" className="!rounded-xl" onClick={submitProblem}>
          <Flag size={18} /> Submit check-in
        </Button>
      </div>
    </div>
  );
}
