import { api } from './client';

export function runAudit(kitId: string, scannedBarcodes: string[]) {
  return api<{
    success: true;
    expected: number;
    found: number;
    missing: any[];
    unexpected: string[];
  }>('/audit/run', {
    method: 'POST',
    body: JSON.stringify({ kitId, scannedBarcodes }),
  });
}
