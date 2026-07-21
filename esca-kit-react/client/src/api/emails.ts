import { api } from './client';

export function getEmailTemplates() {
  return api<{ success: true; templates: any[] }>('/emails/templates');
}

export function saveEmailTemplate(data: Record<string, any>) {
  return api('/emails/templates', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function sendTestEmail(toEmail: string, subject: string, body: string) {
  return api('/emails/test', {
    method: 'POST',
    body: JSON.stringify({ toEmail, subject, body }),
  });
}

export function sendReturnReminder(loanIds: string[], returnDeadline?: string) {
  return api('/emails/return-reminder', {
    method: 'POST',
    body: JSON.stringify({ loanIds, returnDeadline }),
  });
}

export function sendOverdueNotices(loanIds: string[], returnDeadline?: string) {
  return api('/emails/overdue-notices', {
    method: 'POST',
    body: JSON.stringify({ loanIds, returnDeadline }),
  });
}
