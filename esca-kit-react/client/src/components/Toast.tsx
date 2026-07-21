type Props = {
  message: string;
  type: 'ok' | 'err';
  visible: boolean;
};

export function Toast({ message, type, visible }: Props) {
  return (
    <div
      className={`fixed bottom-5 right-5 z-[999] max-w-xs px-4 py-3 rounded-lg text-sm font-semibold text-white flex items-center gap-2 pointer-events-none transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      } ${type === 'ok' ? 'bg-[var(--green)]' : 'bg-[var(--red)]'}`}
      role="status"
    >
      {message}
    </div>
  );
}
