import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type Props = {
  icon?: LucideIcon;
  title: string;
  body?: string;
  action?: ReactNode;
};

export function EmptyState({ icon: Icon, title, body, action }: Props) {
  return (
    <div className="text-center py-10 px-4">
      {Icon && (
        <div className="w-14 h-14 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
          <Icon size={24} strokeWidth={1.5} />
        </div>
      )}
      <h3 className="text-[1.05rem] font-bold text-[var(--blue)] m-0 mb-1.5">{title}</h3>
      {body && <p className="text-sm text-[var(--muted)] m-0 mb-4 max-w-md mx-auto">{body}</p>}
      {action}
    </div>
  );
}
