import { useEffect, useRef, useState } from 'react';
import { ScanBarcode } from 'lucide-react';
import { BrandLogo } from '../../components/BrandLogo';
import { Button } from '../../components/Button';
import { useCounselor } from '../../context/CounselorContext';
import { ScanPage } from './ScanPage';
import { SignInPage } from './SignInPage';

const IDLE_MS = 8 * 60 * 1000;

export function HubShell() {
  const { signedIn, name, campusName, reset } = useCounselor();
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scan, setScan] = useState<{ code: string; nonce: number }>({ code: '', nonce: 0 });
  const [panelActive, setPanelActive] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';

  // Read the code straight from the input DOM at submit time so a fast scanner
  // (types + Enter in the same tick) never fires with a stale/empty state value.
  const submitScan = () => {
    const raw = scanRef.current?.value ?? barcodeInput;
    setScan((s) => ({ code: raw.trim(), nonce: s.nonce + 1 }));
  };

  useEffect(() => {
    if (signedIn && !panelActive) {
      const t = setTimeout(() => scanRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [signedIn, scan.nonce, panelActive]);

  // Auto sign-out after idle so the next counselor does not inherit the session
  useEffect(() => {
    if (!signedIn) return;
    let timer = window.setTimeout(() => reset(), IDLE_MS);
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => reset(), IDLE_MS);
    };
    window.addEventListener('pointerdown', bump);
    window.addEventListener('keydown', bump);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', bump);
      window.removeEventListener('keydown', bump);
    };
  }, [signedIn, reset]);

  if (!signedIn) return <SignInPage />;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)]">
      <header className="bg-gradient-to-r from-[var(--navy-deep)] to-[var(--navy)] text-white px-5 pt-4 pb-4 shrink-0">
        <div className="max-w-[720px] mx-auto flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <BrandLogo onDark height={34} />
            <div className="min-w-0">
              <div className="font-display font-bold text-[1.15rem] tracking-tight leading-tight">
                ESCA Kit Hub
              </div>
              <div className="text-[0.72rem] uppercase tracking-[0.1em] text-slate-400 mt-0.5">
                Dallas ISD · CTE
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-right shrink-0">
            <div>
              <span className="block font-semibold text-[0.95rem] text-white leading-tight">{name}</span>
              {campusName && (
                <span className="block text-[0.75rem] text-slate-400 mt-0.5">{campusName}</span>
              )}
              <button
                type="button"
                className="mt-1.5 text-[0.8rem] font-semibold px-3 py-1 rounded-full border border-white/25 bg-transparent text-slate-200 cursor-pointer"
                onClick={reset}
              >
                Not you?
              </button>
            </div>
            <div className="w-11 h-11 bg-[var(--blue-mid)] rounded-full flex items-center justify-center font-bold text-lg text-white">
              {initial}
            </div>
          </div>
        </div>

        {!panelActive && (
          <div className="max-w-[720px] mx-auto mt-4">
            <div className="flex gap-2">
              <input
                ref={scanRef}
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitScan();
                  }
                }}
                placeholder="Scan TipWeb tag on the kit case…"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className="flex-1 px-4 py-3.5 text-[1.1rem] border-0 rounded-2xl outline-none bg-white text-[var(--text)] shadow-sm focus:shadow-[0_0_0_3px_rgba(56,189,248,0.35)]"
              />
              <Button size="lg" onClick={submitScan} className="!px-5 !rounded-2xl">
                <ScanBarcode size={20} /> Scan
              </Button>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 max-w-[720px] w-full mx-auto px-5 py-7 pb-16 bg-[radial-gradient(900px_400px_at_15%_0%,rgba(0,86,179,0.1),transparent_55%),linear-gradient(180deg,#f4f7fb,#e8eef5)]">
        <ScanPage
          scan={scan}
          setBarcodeInput={setBarcodeInput}
          onRequestScanFocus={() => scanRef.current?.focus()}
          onPanelActiveChange={setPanelActive}
        />
      </main>
    </div>
  );
}

export function HubPage() {
  return <HubShell />;
}
