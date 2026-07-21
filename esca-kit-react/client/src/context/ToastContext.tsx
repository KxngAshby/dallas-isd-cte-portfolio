import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Toast } from '../components/Toast';

type ToastType = 'ok' | 'err';

type ToastContextValue = {
  toast: (message: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ message: string; type: ToastType; visible: boolean }>({
    message: '',
    type: 'ok',
    visible: false,
  });

  const toast = useCallback((message: string, type: ToastType = 'ok') => {
    setState({ message, type, visible: true });
    window.setTimeout(() => {
      setState((s) => ({ ...s, visible: false }));
    }, 3200);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <Toast message={state.message} type={state.type} visible={state.visible} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
