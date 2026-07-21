import { api } from './client';

export function getSettings() {
  return api<{ success: true; settings: any[] }>('/settings');
}

export function saveSetting(key: string, value: string) {
  return api('/settings', {
    method: 'POST',
    body: JSON.stringify({ key, value }),
  });
}

export function getRegions() {
  return api<{ success: true; regions: string[] }>('/settings/regions');
}
