import { NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { BrandLogo } from './BrandLogo';

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
};

type Props = {
  items: NavItem[];
  footer?: string;
};

export function Sidebar({ items, footer }: Props) {
  return (
    <aside className="fixed top-0 bottom-0 left-0 z-20 w-16 md:w-[240px] bg-gradient-to-b from-[var(--sidebar)] to-[#061220] text-white flex flex-col">
      <div className="px-3 md:px-5 py-5 border-b border-white/10">
        <div className="hidden md:block">
          <BrandLogo onDark height={28} className="mb-2" />
          <div className="font-display text-[0.95rem] font-bold tracking-tight text-white">ESCA Admin</div>
          <div className="text-[0.7rem] text-slate-400 mt-0.5">Dallas ISD CTE</div>
        </div>
        <div className="md:hidden text-center font-display text-sm font-bold">E</div>
      </div>
      <nav className="flex-1 overflow-y-auto py-3">
        <ul className="list-none m-0 p-0">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-0 md:px-4 py-3 text-slate-400 no-underline font-medium text-[0.9rem] border-l-[3px] border-transparent transition hover:text-white hover:bg-white/[0.04] justify-center md:justify-start ${
                      isActive ? '!text-white bg-[rgba(0,86,179,0.35)] !border-sky-400' : ''
                    }`
                  }
                >
                  <Icon size={18} className="shrink-0" strokeWidth={1.75} />
                  <span className="hidden md:inline">{item.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
      {footer && (
        <div className="hidden md:block px-5 py-3 text-[0.68rem] text-slate-500 border-t border-white/10">
          {footer}
        </div>
      )}
    </aside>
  );
}
