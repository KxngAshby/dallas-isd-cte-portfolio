import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CircleAlert } from 'lucide-react';
import { getCounselorByEid, upsertCounselorFromHub } from '../../api/counselors';
import { BrandLogo } from '../../components/BrandLogo';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { useCounselor } from '../../context/CounselorContext';
import { useToast } from '../../context/ToastContext';

type FoundCounselor = {
  eid: string;
  name: string;
  email: string;
  campus_id: string;
  campus_name: string;
};

export function SignInPage() {
  const { setSession } = useCounselor();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [eid, setEid] = useState('');
  const [looking, setLooking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [found, setFound] = useState<FoundCounselor | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [found]);

  const lookup = async () => {
    const trimmed = eid.trim();
    if (!trimmed) {
      toast('Enter your Employee ID.', 'err');
      return;
    }
    setLooking(true);
    setNotFound(false);
    setFound(null);
    try {
      const r = await getCounselorByEid(trimmed);
      if (!r.found || !r.counselor) {
        setNotFound(true);
        return;
      }
      const c = r.counselor;
      setFound({
        eid: String(c.eid || trimmed),
        name: String(c.name || ''),
        email: String(c.email || ''),
        campus_id: String(c.campus_id || ''),
        campus_name: String(c.campus_name || ''),
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lookup failed.', 'err');
    } finally {
      setLooking(false);
    }
  };

  const continueSession = async () => {
    if (!found) return;
    if (!found.campus_id) {
      toast('This ID has no campus on file. Ask ESCA staff to update the counselor list.', 'err');
      return;
    }
    if (!found.email) {
      toast('This ID has no email on file. Ask ESCA staff to update the counselor list.', 'err');
      return;
    }
    setSubmitting(true);
    try {
      await upsertCounselorFromHub({
        eid: found.eid,
        name: found.name,
        campusId: found.campus_id,
        email: found.email,
      });
      setSession({
        eid: found.eid,
        name: found.name,
        email: found.email,
        campusId: found.campus_id,
        campusName: found.campus_name,
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Sign-in failed.', 'err');
    } finally {
      setSubmitting(false);
    }
  };

  const tryAgain = () => {
    setFound(null);
    setNotFound(false);
    setEid('');
  };

  if (looking || submitting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--navy-deep)] text-white">
        <Spinner label={submitting ? 'Starting your session…' : 'Looking up your ID…'} />
      </div>
    );
  }

  if (found) {
    return (
      <div className="min-h-screen flex flex-col bg-[var(--bg)] animate-[fadeUp_0.35s_ease]">
        <header className="bg-gradient-to-r from-[var(--navy-deep)] to-[var(--navy)] text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandLogo onDark height={32} />
            <div>
              <div className="font-display font-bold text-[1.05rem] leading-tight">ESCA Kit Hub</div>
              <div className="text-[0.72rem] uppercase tracking-[0.1em] text-slate-400">Counselor kiosk</div>
            </div>
          </div>
          <button
            type="button"
            onClick={tryAgain}
            className="text-[0.85rem] font-semibold px-3.5 py-2 rounded-full border border-white/25 bg-transparent text-slate-100 cursor-pointer"
          >
            Not you?
          </button>
        </header>
        <main className="flex-1 flex items-center justify-center px-5 py-10 bg-[radial-gradient(900px_400px_at_15%_0%,rgba(0,86,179,0.12),transparent_55%),linear-gradient(180deg,#f4f7fb,#e8eef5)]">
          <div className="w-full max-w-[440px] text-center">
            <p className="text-[0.72rem] uppercase tracking-[0.14em] text-[var(--muted)] font-bold mb-2">
              Signed in
            </p>
            <h1 className="font-display text-[2rem] font-bold text-[var(--navy)] m-0 mb-2">Is this you?</h1>
            <p className="text-[var(--muted)] mb-6 m-0">
              Name and campus come from the counselor list — nothing to type.
            </p>
            <div className="bg-white border border-[var(--border)] rounded-2xl p-5 text-left mb-5 shadow-sm">
              <p className="font-display text-[1.55rem] font-bold text-[var(--navy)] m-0 mb-1">
                {found.name || 'Counselor'}
              </p>
              <p className="text-[var(--muted)] m-0">{found.campus_name || 'Campus on file'}</p>
              {found.email && <p className="text-[var(--muted)] m-0 mt-1 text-sm">{found.email}</p>}
              <p className="text-xs text-[var(--muted)] m-0 mt-2 font-mono">EID {found.eid}</p>
            </div>
            <Button className="w-full" size="lg" onClick={() => void continueSession()}>
              Continue to scan <ArrowRight size={18} />
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-10 relative overflow-hidden bg-[linear-gradient(160deg,rgba(0,26,51,0.94),rgba(0,51,102,0.82)),radial-gradient(800px_500px_at_20%_20%,rgba(0,86,179,0.45),transparent_60%),linear-gradient(180deg,#001a33,#003366)]">
      <div className="absolute inset-auto -right-[10%] -bottom-[30%] left-[40%] h-[70%] bg-[radial-gradient(circle,rgba(255,255,255,0.08),transparent_60%)] pointer-events-none" />
      <div className="w-full max-w-[440px] text-center relative z-10 animate-[fadeUp_0.4s_ease]">
        <BrandLogo onDark height={48} className="mx-auto mb-6 block" />
        <p className="text-[0.72rem] uppercase tracking-[0.14em] text-slate-400 font-bold mb-2">
          Dallas ISD · Career &amp; Technical Education
        </p>
        <h1 className="font-display text-[2.4rem] sm:text-[2.7rem] font-bold text-white leading-[1.1] m-0 mb-3">
          ESCA Kit Hub
        </h1>
        <p className="text-[1.05rem] text-slate-300 leading-relaxed m-0 mb-7">
          Enter your Employee ID to check a career kit out or back in.
        </p>

        <input
          ref={inputRef}
          id="hubEid"
          type="text"
          inputMode="numeric"
          value={eid}
          onChange={(e) => {
            setEid(e.target.value);
            setNotFound(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void lookup();
          }}
          placeholder="Employee ID"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full px-4 py-4 text-[1.4rem] tracking-[0.08em] text-center border-0 rounded-2xl outline-none bg-white text-[var(--text)] mb-3.5 shadow-lg focus:shadow-[0_0_0_4px_rgba(255,255,255,0.25)]"
        />

        {notFound && (
          <div className="flex gap-2.5 items-start bg-[var(--amber-bg)] text-[var(--amber)] rounded-xl px-3.5 py-3 mb-3.5 text-[0.9rem] text-left">
            <CircleAlert size={18} className="shrink-0 mt-0.5" />
            <div>
              <strong className="block mb-0.5">ID not found</strong>
              Ask ESCA staff to add you to the counselor list, then try again.
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => void lookup()}
          disabled={!eid.trim()}
          className="w-full py-4 rounded-2xl bg-white text-[var(--navy)] font-bold text-[1.05rem] border-0 cursor-pointer disabled:opacity-50"
        >
          Continue
        </button>
        <p className="mt-6 text-[0.75rem] uppercase tracking-[0.12em] text-slate-500 m-0">
          One ID · No paperwork
        </p>
      </div>
    </div>
  );
}
