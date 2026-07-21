type Props = {
  label?: string;
  className?: string;
};

export function Spinner({ label = 'Loading…', className = '' }: Props) {
  return (
    <div className={`flex items-center justify-center gap-2 text-[var(--muted)] py-10 ${className}`}>
      <span className="inline-block w-5 h-5 border-2 border-[var(--border)] border-t-[var(--blue)] rounded-full animate-spin" />
      <span>{label}</span>
    </div>
  );
}
