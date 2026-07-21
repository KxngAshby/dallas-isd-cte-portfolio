import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { FileUp, Plus } from 'lucide-react';
import { getCampuses, importCampuses, saveCampus } from '../../api/campuses';
import { getRegions } from '../../api/settings';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { CsvImportWizard } from '../../components/CsvImportWizard';
import { TextInput, TextSelect } from '../../components/FormField';
import { Spinner } from '../../components/Spinner';
import { Table } from '../../components/Table';
import { useToast } from '../../context/ToastContext';

type Mode = 'list' | 'form' | 'import';

export function CampusesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const campuses = useQuery({ queryKey: ['campuses'], queryFn: getCampuses });
  const regions = useQuery({ queryKey: ['regions'], queryFn: getRegions });
  const [mode, setMode] = useState<Mode>('list');
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({
    campus_id: '',
    name: '',
    region: '',
    principal_name: '',
    principal_email: '',
  });

  const existingKeys = useMemo(
    () => new Set((campuses.data?.campuses || []).map((c: any) => String(c.campus_id).trim())),
    [campuses.data],
  );

  const openForm = (c?: any) => {
    if (c) {
      setEditing(c);
      setForm({
        campus_id: c.campus_id || '',
        name: c.name || '',
        region: c.region || '',
        principal_name: c.principal_name || '',
        principal_email: c.principal_email || '',
      });
    } else {
      setEditing(null);
      setForm({ campus_id: '', name: '', region: '', principal_name: '', principal_email: '' });
    }
    setMode('form');
  };

  const save = useMutation({
    mutationFn: () => saveCampus(form),
    onSuccess: () => {
      toast('Campus saved.', 'ok');
      setMode('list');
      void qc.invalidateQueries({ queryKey: ['campuses'] });
    },
    onError: (e: Error) => toast(e.message, 'err'),
  });

  if (campuses.isLoading) return <Spinner />;

  if (mode === 'import') {
    return (
      <CsvImportWizard
        title="Import Campuses"
        identityKey="campus_id"
        existingKeys={existingKeys}
        fields={[
          { key: 'campus_id', label: 'Org Number', required: true },
          { key: 'name', label: 'Campus Name', required: true },
          { key: 'region', label: 'Region' },
          { key: 'principal_name', label: 'Principal Name' },
          { key: 'principal_email', label: 'Principal Email' },
        ]}
        hints={{
          campus_id: ['org', 'id', 'number', 'num'],
          name: ['name', 'school', 'campus'],
          region: ['region', 'director', 'area'],
          principal_name: ['principal', 'admin', 'head'],
          principal_email: ['email', 'mail'],
        }}
        onCancel={() => {
          setMode('list');
          void qc.invalidateQueries({ queryKey: ['campuses'] });
        }}
        onImport={async (rows) => {
          const r = await importCampuses(rows);
          return { inserted: r.inserted, updated: r.updated };
        }}
      />
    );
  }

  if (mode === 'form') {
    return (
      <Card title={editing ? 'Edit Campus' : 'New Campus'}>
        <TextInput
          label="Org Number"
          required
          hint="(district org # — unique ID)"
          value={form.campus_id}
          readOnly={Boolean(editing)}
          onChange={(e) => setForm((f) => ({ ...f, campus_id: e.target.value }))}
          className={editing ? 'bg-slate-50 text-slate-500' : ''}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextInput
            label="Campus Name"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <TextSelect
            label="Director Region"
            value={form.region}
            onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
          >
            <option value="">— select region —</option>
            {(regions.data?.regions || []).map((rg) => (
              <option key={rg} value={rg}>
                {rg}
              </option>
            ))}
          </TextSelect>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextInput
            label="Principal Name"
            value={form.principal_name}
            onChange={(e) => setForm((f) => ({ ...f, principal_name: e.target.value }))}
          />
          <TextInput
            label="Principal Email"
            value={form.principal_email}
            onChange={(e) => setForm((f) => ({ ...f, principal_email: e.target.value }))}
          />
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <Button variant="ghost" onClick={() => setMode('list')}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Save Campus
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="Campuses"
      actions={
        <div className="flex gap-2">
          <Button onClick={() => setMode('import')}>
            <FileUp size={16} /> Import CSV
          </Button>
          <Button variant="ghost" onClick={() => openForm()}>
            <Plus size={16} /> Add one
          </Button>
        </div>
      }
    >
      <p className="text-[var(--muted)] text-sm mb-4">
        Org number = campus ID. Import your district list anytime — updates existing schools, adds new ones, never
        deletes. Principal email is used when CC-to-principal is on.
      </p>
      {campuses.isError ? (
        <p className="text-[var(--red)]">{(campuses.error as Error).message}</p>
      ) : (
        <Table
          rows={campuses.data?.campuses || []}
          rowKey={(r) => r.campus_id}
          columns={[
            {
              key: 'id',
              header: 'Org #',
              render: (r) => (
                <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{r.campus_id}</code>
              ),
            },
            { key: 'name', header: 'Campus', render: (r) => <strong>{r.name}</strong> },
            { key: 'region', header: 'Region', render: (r) => r.region || '—' },
            { key: 'prin', header: 'Principal', render: (r) => r.principal_name || '—' },
            { key: 'email', header: 'Email', render: (r) => r.principal_email || '—' },
            {
              key: 'edit',
              header: '',
              render: (r) => (
                <Button variant="ghost" size="sm" onClick={() => openForm(r)}>
                  Edit
                </Button>
              ),
            },
          ]}
          empty="No campuses yet. Add one manually or import a CSV."
        />
      )}
    </Card>
  );
}
