import type { ReactNode } from 'react';

type Props = {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
};

export function Card({ title, children, className = '', actions }: Props) {
  return (
    <div className={`bg-white rounded-xl border border-[var(--border)] p-5 md:p-6 mb-0 ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 mb-4">
          {title ? <h2 className="text-[1.05rem] font-bold text-[var(--blue)] m-0">{title}</h2> : <div />}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}
