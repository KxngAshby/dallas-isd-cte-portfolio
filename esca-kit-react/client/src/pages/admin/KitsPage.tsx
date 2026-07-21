import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Boxes, Plus } from 'lucide-react';
import { getKits, getTemplates, saveKit } from '../../api/kits';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { TextInput, TextSelect } from '../../components/FormField';
import { Spinner } from '../../components/Spinner';
import { Table } from '../../components/Table';
import { useToast } from '../../context/ToastContext';

type KitForm = {
  kit_id: string;
  name: string;
  template_id: string;
  tipweb_tag: string;
  location: string;
  notes: string;
};

const emptyForm = (): KitForm => ({
  kit_id: '',
  name: '',
  template_id: '',
  tipweb_tag: '',
  location: '',
  notes: '',
});

export function KitsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const kits = useQuery({ queryKey: ['kits'], queryFn: getKits });
  const templates = useQuery({ queryKey: ['templates'], queryFn: getTemplates });
  const [form, setForm] = useState<KitForm | null>(null);

  const save = useMutation({
    mutationFn: () => {
      if (!form) throw new Error('No form');
      if (!form.name.trim()) throw new Error('Kit name is required.');
      const tipweb = form.tipweb_tag.trim();
      const data: Record<string, string> = {
        name: form.name.trim(),
        template_id: form.template_id,
        tipweb_tag: tipweb,
        location: form.location.trim(),
        notes: form.notes.trim(),
      };
      if (form.kit_id) {
        data.kit_id = form.kit_id;
        if (tipweb) data.kit_barcode = tipweb;
      }
      return saveKit(data);
    },
    onSuccess: () => {
      toast('Kit saved.', 'ok');
      setForm(null);
      void qc.invalidateQueries({ queryKey: ['kits'] });
    },
    onError: (e: Error) => toast(e.message, 'err'),
  });

  if (kits.isLoading) return <Spinner label="Loading kits…" />;

  const tplList = templates.data?.templates || [];

  if (form) {
    return (
      <Card title={form.kit_id ? 'Edit Kit' : 'New Kit'}>
        {tplList.length === 0 && (
          <p className="text-sm text-[var(--amber)] mb-4">
            No career templates yet. Create a template first so this kit can load the right contents on Labels.
          </p>
        )}
        <div className="grid md:grid-cols-2 gap-x-4">
          <TextInput
            label="Kit Name"
            required
            placeholder="e.g. Nursing Kit 001"
            value={form.name}
            onChange={(e) => setForm((f) => (f ? { ...f, name: e.target.value } : f))}
          />
          <TextSelect
            label="Career Template"
            value={form.template_id}
            onChange={(e) => setForm((f) => (f ? { ...f, template_id: e.target.value } : f))}
          >
            <option value="">— select template —</option>
            {tplList.map((t: any) => (
              <option key={t.template_id} value={t.template_id}>
                {t.career || t.name}
              </option>
            ))}
          </TextSelect>
        </div>
        <TextInput
          label="Location"
          placeholder="e.g. Storage Room A"
          value={form.location}
          onChange={(e) => setForm((f) => (f ? { ...f, location: e.target.value } : f))}
        />
        <TextInput
          label="TipWeb Asset Tag"
          placeholder="Scan or type the TipWeb barcode on the case"
          value={form.tipweb_tag}
          onChange={(e) => setForm((f) => (f ? { ...f, tipweb_tag: e.target.value } : f))}
        />
        <p className="text-xs text-[var(--muted)] -mt-2 mb-4">
          TipWeb becomes the ESCA kit scan barcode (one sticker on the case).
        </p>
        <TextInput
          label="Notes"
          value={form.notes}
          onChange={(e) => setForm((f) => (f ? { ...f, notes: e.target.value } : f))}
        />
        <div className="flex gap-2 justify-end mt-2">
          <Button variant="ghost" onClick={() => setForm(null)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Save Kit
          </Button>
        </div>
      </Card>
    );
  }

  if (kits.isError) {
    return (
      <Card title="ESCA Kits">
        <p className="text-[var(--red)] m-0">{(kits.error as Error).message}</p>
      </Card>
    );
  }

  const list = kits.data?.kits || [];

  return (
    <Card
      title="ESCA Kits"
      actions={
        <Button onClick={() => setForm(emptyForm())}>
          <Plus size={16} /> New Kit
        </Button>
      }
    >
      {list.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No kits yet"
          body={
            tplList.length
              ? 'Create a physical kit and assign a career template. Then use Labels to generate item barcodes.'
              : 'Create a career template first, then come back to add physical kits.'
          }
          action={
            <Button onClick={() => setForm(emptyForm())}>
              <Plus size={16} /> New Kit
            </Button>
          }
        />
      ) : (
        <Table
          rows={list}
          rowKey={(r) => r.kit_id}
          columns={[
            { key: 'name', header: 'Name', render: (r) => <strong>{r.name}</strong> },
            {
              key: 'barcode',
              header: 'Barcode',
              render: (r) => (
                <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{r.kit_barcode}</code>
              ),
            },
            {
              key: 'template',
              header: 'Template',
              render: (r) => r.template_name || r.career || '—',
            },
            {
              key: 'status',
              header: 'Loan Status',
              render: (r) => (
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                    r.loan_status === 'Checked Out'
                      ? 'bg-blue-100 text-[var(--blue)]'
                      : 'bg-[var(--green-bg)] text-[var(--green)]'
                  }`}
                >
                  {r.loan_status || 'Available'}
                </span>
              ),
            },
            {
              key: 'actions',
              header: '',
              render: (r) => (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setForm({
                      kit_id: r.kit_id,
                      name: r.name || '',
                      template_id: r.template_id || '',
                      tipweb_tag: r.tipweb_tag || r.kit_barcode || '',
                      location: r.location || '',
                      notes: r.notes || '',
                    })
                  }
                >
                  Edit
                </Button>
              ),
            },
          ]}
        />
      )}
    </Card>
  );
}
