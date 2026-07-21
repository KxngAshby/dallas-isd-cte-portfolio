import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'success' | 'warn' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-[var(--blue)] text-white hover:bg-[var(--blue-mid)] border border-transparent',
  success: 'bg-[var(--green)] text-white hover:bg-[#166534] border border-transparent',
  warn: 'bg-[var(--amber)] text-white hover:bg-[#854d0e] border border-transparent',
  danger: 'bg-[var(--red)] text-white hover:bg-[#991b1b] border border-transparent',
  ghost: 'bg-white text-[var(--blue)] border-[1.5px] border-[var(--blue)] hover:bg-[#eff6ff]',
};

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-[0.93rem]',
  lg: 'px-6 py-4 text-base',
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  disabled,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-default ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
