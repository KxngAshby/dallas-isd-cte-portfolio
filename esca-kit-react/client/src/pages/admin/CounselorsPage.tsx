import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { FileUp, Plus } from 'lucide-react';
import { getCampuses } from '../../api/campuses';
import { deleteCounselor, getCounselors, importCounselors, saveCounselor } from '../../api/counselors';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { CsvImportWizard } from '../../components/CsvImportWizard';
import { TextInput, TextSelect } from '../../components/FormField';
import { Spinner } from '../../components/Spinner';
import { Table } from '../../components/Table';
import { useToast } from '../../context/ToastContext';

type Mode = 'list' | 'form' | 'import';

export function CounselorsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const counselors = useQuery({ queryKey: ['counselors'], queryFn: getCounselors });
  const campuses = useQuery({ queryKey: ['campuses'], queryFn: getCampuses });
  const [mode, setMode] = useState<Mode>('list');
  const [form, setForm] = useState({ eid: '', name: '', email: '', campus_id: '' });
  const [confirmEid, setConfirmEid] = useState<string | null>(null);

  const existingKeys = useMemo(
    () => new Set((counselors.data?.counselors || []).map((c: any) => String(c.eid).trim())),
    [counselors.data],
  );

  const save = useMutation({
    mutationFn: () => saveCounselor(form),
    onSuccess: () => {
      toast('Counselor saved.', 'ok');
      setMode('list');
      void qc.invalidateQueries({ queryKey: ['counselors'] });
    },
    onError: (e: Error) => toast(e.message, 'err'),
  });

  const remove = useMutation({
    mutationFn: (eid: string) => deleteCounselor(eid),
    onSuccess: () => {
      toast('Counselor removed.', 'ok');
      setConfirmEid(null);
      void qc.invalidateQueries({ queryKey: ['counselors'] });
    },
    onError: (e: Error) => toast(e.message, 'err'),
  });

  if (counselors.isLoading) return <Spinner />;

  if (mode === 'import') {
    return (
      <CsvImportWizard
        title="Import Counselors"
        identityKey="eid"
        existingKeys={existingKeys}
        fields={[
          { key: 'eid', label: 'Employee ID', required: true },
          { key: 'name', label: 'Name', required: true },
          { key: 'email', label: 'Email' },
          { key: 'campus_id', label: 'Campus Org #' },
          { key: 'campus_name', label: 'Campus Name' },
        ]}
        hints={{
          eid: ['eid', 'employee', 'id', 'badge'],
          name: ['name', 'counselor'],
          email: ['email', 'mail'],
          campus_id: ['org', 'campus_id', 'number'],
          campus_name: ['campus', 'school'],
        }}
        onCancel={() => {
          setMode('list');
          void qc.invalidateQueries({ queryKey: ['counselors'] });
        }}
        onImport={async (rows) => {
          const r = await importCounselors(rows);
          return { inserted: r.inserted, updated: r.updated };
        }}
      />
    );
  }

  if (mode === 'form') {
    return (
      <Card title="Add / Edit Counselor">
        <TextInput
          label="Employee ID (EID)"
          required
          value={form.eid}
          onChange={(e) => setForm((f) => ({ ...f, eid: e.target.value }))}
        />
        <TextInput
          label="Full Name"
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <TextInput
          label="Email"
          type="email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        />
        <TextSelect
          label="Campus"
          value={form.campus_id}
          onChange={(e) => setForm((f) => ({ ...f, campus_id: e.target.value }))}
        >
          <option value="">— select campus —</option>
          {(campuses.data?.campuses || []).map((c: any) => (
            <option key={c.campus_id} value={c.campus_id}>
              {c.name}
            </option>
          ))}
        </TextSelect>
        <div className="flex gap-2 justify-end mt-4">
          <Button variant="ghost" onClick={() => setMode('list')}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Save Counselor
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="Counselors"
      actions={
        <div className="flex gap-2">
          <Button onClick={() => setMode('import')}>
            <FileUp size={16} /> Import CSV
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setForm({ eid: '', name: '', email: '', campus_id: '' });
              setMode('form');
            }}
          >
            <Plus size={16} /> Add one
          </Button>
        </div>
      }
    >
      <p className="text-[var(--muted)] text-sm mb-4">
        <strong className="text-[var(--text)]">Powers Hub sign-in.</strong> Counselors enter only their EID — name,
        email, and campus come from this list. Import a CSV (EID, name, email, campus org #) to unlock auto-fill, or
        add one person manually. Re-import updates school changes safely.
      </p>
      {counselors.isError ? (
        <p className="text-[var(--red)]">{(counselors.error as Error).message}</p>
      ) : (
        <Table
          rows={counselors.data?.counselors || []}
          rowKey={(r) => r.eid}
          columns={[
            { key: 'eid', header: 'EID', render: (r) => <code className="text-xs">{r.eid}</code> },
            { key: 'name', header: 'Name', render: (r) => <strong>{r.name}</strong> },
            { key: 'email', header: 'Email', render: (r) => r.email || '—' },
            { key: 'campus', header: 'Campus', render: (r) => r.campus_name || r.campus_id || '—' },
            { key: 'seen', header: 'Last Seen', render: (r) => r.last_seen || '—' },
            {
              key: 'actions',
              header: '',
              render: (r) => {
                const eid = String(r.eid);
                const confirming = confirmEid === eid;
                return (
                  <div className="flex gap-2 justify-end items-center flex-wrap">
                    {confirming ? (
                      <>
                        <span className="text-xs text-[var(--muted)]">Remove from Hub?</span>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(eid)}
                        >
                          {remove.isPending ? 'Removing…' : 'Yes, remove'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={remove.isPending}
                          onClick={() => setConfirmEid(null)}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setForm({
                              eid: r.eid || '',
                              name: r.name || '',
                              email: r.email || '',
                              campus_id: r.campus_id || '',
                            });
                            setMode('form');
                          }}
                        >
                          Edit
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => setConfirmEid(eid)}>
                          Remove
                        </Button>
                      </>
                    )}
                  </div>
                );
              },
            },
          ]}
          empty="No counselors yet. Import a CSV or add one manually — until then Hub sign-in will say ID not found."
        />
      )}
    </Card>
  );
}
