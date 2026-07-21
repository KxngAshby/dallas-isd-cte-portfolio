import { api } from './client';

export function getDashboard() {
  return api<{
    success: true;
    counts: { available: number; needs_replacement: number; dead: number };
    alerts: any[];
    careerAlerts: any[];
    careerSummary: any[];
    kits_total: number;
    kits_checked_out: number;
    open_loans: any[];
  }>('/dashboard');
}

export function getRegionalData() {
  return api<{ success: true; regions: any[] }>('/dashboard/regional');
}
