import { api } from './client';

export function checkoutLoan(payload: {
  kitId: string;
  tipwebTag?: string;
  teacherName: string;
  confirmedBarcodes: string[];
  campusId: string;
  counselorEid: string;
  counselorEmail: string;
  forceCheckout?: boolean;
}) {
  return api('/loans/checkout', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function checkinLoan(payload: {
  loanId: string;
  returnType: 'clean' | 'problem';
  issues?: Array<{ barcode: string; issue_type: string; notes?: string }>;
}) {
  return api('/loans/checkin', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getOpenLoans() {
  return api<{ success: true; loans: any[] }>('/loans/open');
}

export function getOpenLoansForCounselor(eid: string) {
  return api<{ success: true; loans: any[] }>(
    `/loans/open-by-eid/${encodeURIComponent(eid)}`,
  );
}

export function getOverdueLoans() {
  return api<{ success: true; loans: any[] }>('/loans/overdue');
}

export function getLoanHistory(query = '') {
  const q = query ? `?q=${encodeURIComponent(query)}` : '';
  return api<{ success: true; loans: any[] }>(`/loans/history${q}`);
}

export function getStatusBoard() {
  return api<{
    success: true;
    kits_total: number;
    kits_out: number;
    kits_ready: number;
    open_loans: number;
    overdue: number;
    careers: { career: string; total: number; out: number; ready: number }[];
    regions: { region: string; open: number }[];
    updated_at: string;
  }>('/loans/status-board');
}
