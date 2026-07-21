import { createContext, useContext, useState, type ReactNode } from 'react';

export type CounselorSession = {
  eid: string;
  name: string;
  email: string;
  campusId: string;
  campusName: string;
};

type CounselorContextValue = CounselorSession & {
  signedIn: boolean;
  setSession: (session: CounselorSession) => void;
  reset: () => void;
};

const empty: CounselorSession = {
  eid: '',
  name: '',
  email: '',
  campusId: '',
  campusName: '',
};

const CounselorContext = createContext<CounselorContextValue | null>(null);

export function CounselorProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<CounselorSession>(empty);

  const value: CounselorContextValue = {
    ...session,
    signedIn: Boolean(session.eid),
    setSession: setSessionState,
    reset: () => setSessionState(empty),
  };

  return <CounselorContext.Provider value={value}>{children}</CounselorContext.Provider>;
}

export function useCounselor() {
  const ctx = useContext(CounselorContext);
  if (!ctx) throw new Error('useCounselor must be used within CounselorProvider');
  return ctx;
}
