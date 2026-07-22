import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { getSettings, saveSetting } from '../../api/settings';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { TextInput } from '../../components/FormField';
import { Spinner } from '../../components/Spinner';
import { Table } from '../../components/Table';
import { useToast } from '../../context/ToastContext';

const HIGHLIGHT = new Set([
  'dept_signature',
  'dept_reply_to',
  'dept_hours',
  'default_due_date',
  'cc_principal',
  'extra_cc',
  'extra_bcc',
  'url_counselor',
  'url_admin',
  'barcode_prefix',
]);

export function SettingsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');

  const save = useMutation({
    mutationFn: () => saveSetting(key, value),
    onSuccess: () => {
      toast('Setting saved.', 'ok');
      setKey('');
      setValue('');
      void qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (e: Error) => toast(e.message, 'err'),
  });

  if (q.isLoading) return <Spinner />;

  const rows = (q.data?.settings || []).map((s: any) => ({
    key: s.key || s.setting_key,
    value: s.value ?? s.setting_value ?? '',
  }));

  const important = rows.filter((r) => HIGHLIGHT.has(r.key));
  const rest = rows.filter((r) => !HIGHLIGHT.has(r.key));

  return (
    <div className="space-y-5">
      <Card title="Common settings">
        <p className="text-[var(--muted)] text-sm mb-4 m-0">
          Email controls also live under <strong>Emails</strong>. Use this page for URLs and other keys.
        </p>
        {q.isError ? (
          <p className="text-[var(--red)]">{(q.error as Error).message}</p>
        ) : important.length === 0 ? (
          <p className="text-[var(--muted)] text-sm m-0">No common settings found yet.</p>
        ) : (
          <Table
            rows={important}
            rowKey={(r) => r.key}
            columns={[
              { key: 'key', header: 'Key', render: (r) => <code className="text-xs">{r.key}</code> },
              { key: 'value', header: 'Value', render: (r) => r.value || '—' },
            ]}
          />
        )}
      </Card>

      <Card title="All settings">
        <Table
          rows={rest}
          rowKey={(r) => r.key}
          columns={[
            { key: 'key', header: 'Key', render: (r) => <code className="text-xs">{r.key}</code> },
            { key: 'value', header: 'Value', render: (r) => r.value || '—' },
          ]}
          empty="No other settings."
        />
      </Card>

      <Card title="Update a setting">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextInput label="Key" value={key} onChange={(e) => setKey(e.target.value)} />
          <TextInput label="Value" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={!key || save.isPending}>
            Save
          </Button>
        </div>
      </Card>
    </div>
  );
}
