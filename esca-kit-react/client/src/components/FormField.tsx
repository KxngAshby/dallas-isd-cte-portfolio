import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

type BaseProps = {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children?: ReactNode;
};

export function FormField({ label, required, hint, error, children }: BaseProps) {
  return (
    <div className="mb-3.5">
      <label className="block text-sm font-semibold text-[var(--text)] mb-1.5">
        {label}
        {required && <span className="text-[var(--red)] ml-1">*</span>}
        {hint && <span className="font-normal text-[var(--muted)] ml-1 text-xs">{hint}</span>}
      </label>
      {children}
      {error && <p className="text-[var(--red)] text-xs mt-1 mb-0">{error}</p>}
    </div>
  );
}

const inputClass =
  'w-full px-3.5 py-2.5 border border-[var(--border)] rounded-lg text-[0.92rem] bg-white outline-none focus:border-[var(--blue-mid)] focus:shadow-[0_0_0_3px_rgba(0,86,179,0.1)]';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  required?: boolean;
  hint?: string;
};

export function TextInput({ label, required, hint, className = '', ...rest }: InputProps) {
  return (
    <FormField label={label} required={required} hint={hint}>
      <input className={`${inputClass} ${className}`} {...rest} />
    </FormField>
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
};

export function TextSelect({ label, required, hint, className = '', children, ...rest }: SelectProps) {
  return (
    <FormField label={label} required={required} hint={hint}>
      <select className={`${inputClass} ${className}`} {...rest}>
        {children}
      </select>
    </FormField>
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  required?: boolean;
  hint?: string;
};

export function TextTextarea({ label, required, hint, className = '', ...rest }: TextareaProps) {
  return (
    <FormField label={label} required={required} hint={hint}>
      <textarea className={`${inputClass} min-h-[80px] resize-y font-[inherit] ${className}`} {...rest} />
    </FormField>
  );
}
