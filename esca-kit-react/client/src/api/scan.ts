import { api } from './client';

export type ScanResult = {
  success: true;
  panel: 'checkout' | 'checkin' | 'item';
  kit?: any;
  loan?: any;
  items?: any[];
  item?: any;
  type?: any;
  ready?: boolean;
};

export function scanBarcode(barcode: string) {
  return api<ScanResult>('/scan', {
    method: 'POST',
    body: JSON.stringify({ barcode }),
  });
}
