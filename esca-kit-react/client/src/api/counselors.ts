import { api } from './client';

export function getCounselors() {
  return api<{ success: true; counselors: any[] }>('/counselors');
}

export function saveCounselor(data: Record<string, any>) {
  return api('/counselors', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteCounselor(eid: string) {
  return api(`/counselors/${encodeURIComponent(eid)}`, { method: 'DELETE' });
}

export function importCounselors(rows: Record<string, any>[]) {
  return api<{ success: true; inserted: number; updated: number }>('/counselors/import', {
    method: 'POST',
    body: JSON.stringify({ rows }),
  });
}

export function getCounselorByEid(eid: string) {
  return api<{ success: true; found: boolean; counselor?: any }>(
    `/counselors/by-eid/${encodeURIComponent(eid)}`,
  );
}

export function upsertCounselorFromHub(payload: {
  eid: string;
  name: string;
  campusId: string;
  email: string;
}) {
  return api('/counselors/upsert-hub', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
