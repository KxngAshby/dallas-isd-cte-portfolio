import { api } from './client';

export function getKits() {
  return api<{ success: true; kits: any[] }>('/kits');
}

export function saveKit(data: Record<string, any>) {
  return api('/kits', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteKit(id: string) {
  if (!id || !String(id).trim()) {
    return Promise.reject(new Error('Kit ID is required — this row has no kit_id to remove.'));
  }
  return api(`/kits/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function getKitItems(kitId: string) {
  return api<{ success: true; items: any[] }>(`/kits/${encodeURIComponent(kitId)}/items`);
}

export function getTemplateItemsForKit(kitId: string) {
  return api<{ success: true; items: any[]; template?: any }>(
    `/kits/${encodeURIComponent(kitId)}/template-items`,
  );
}

export function generateBarcodes(kitId: string, items: any[]) {
  return api(`/kits/${encodeURIComponent(kitId)}/barcodes`, {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
}

export function getTemplates() {
  return api<{ success: true; templates: any[] }>('/kits/templates');
}

export function saveTemplate(data: Record<string, any>) {
  return api('/kits/templates', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteTemplate(templateId: string) {
  return api(`/kits/templates/${encodeURIComponent(templateId)}`, { method: 'DELETE' });
}

export function saveTemplateItems(templateId: string, items: any[]) {
  return api(`/kits/templates/${encodeURIComponent(templateId)}/items`, {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
}

export function getItemTypes() {
  return api<{ success: true; types: any[] }>('/kits/types');
}

export function saveItemType(data: Record<string, any>) {
  return api('/kits/types', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteItemType(typeId: string) {
  return api(`/kits/types/${encodeURIComponent(typeId)}`, { method: 'DELETE' });
}

export function updateItemStatus(barcode: string, status: string, notes?: string) {
  return api('/kits/item-status', {
    method: 'POST',
    body: JSON.stringify({ barcode, status, notes: notes || '' }),
  });
}
