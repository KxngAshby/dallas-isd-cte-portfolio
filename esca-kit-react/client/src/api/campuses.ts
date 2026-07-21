import { api } from './client';

export function getCampuses() {
  return api<{ success: true; campuses: any[] }>('/campuses');
}

export function saveCampus(data: Record<string, any>) {
  return api('/campuses', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function importCampuses(rows: Record<string, any>[]) {
  return api<{ success: true; inserted: number; updated: number }>('/campuses/import', {
    method: 'POST',
    body: JSON.stringify({ rows }),
  });
}

export function deleteCampus(id: string) {
  return api(`/campuses/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
