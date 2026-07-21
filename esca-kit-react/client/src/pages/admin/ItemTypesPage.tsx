import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Plus, Tags } from 'lucide-react';
import { deleteItemType, getItemTypes, saveItemType } from '../../api/kits';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { TextInput, TextSelect } from '../../components/FormField';
import { Spinner } from '../../components/Spinner';
import { Table } from '../../components/Table';
import { useToast } from '../../context/ToastContext';

function isConsumable(t: any) {
  const v = t?.is_consumable;
  return v === true || v === 'TRUE' || v === 'true';
}

type TypeForm = {
  type_id: string;
  name: string;
  category: 'Durable' | 'Consumable';
  reorder_threshold: string;
  notes: string;
};

const emptyForm = (): TypeForm => ({
  type_id: '',
  name: '',
  category: 'Durable',
  reorder_threshold: '',
  notes: '',
});

export function ItemTypesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useQuery({ queryKey: ['item-types'], queryFn: getItemTypes });
  const [form, setForm] = useState<TypeForm | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      if (!form) throw new Error('No form');
      if (!form.name.trim()) throw new Error('Item type name is required.');
      const data: Record<string, string> = {
        name: form.name.trim(),
        reorder_threshold: form.reorder_threshold.trim(),
        is_consumable: form.category === 'Consumable' ? 'TRUE' : 'FALSE',
        notes: form.notes.trim(),
      };
      if (form.type_id) data.type_id = form.type_id;
      return saveItemType(data);
    },
    onSuccess: () => {
      toast('Item type saved.', 'ok');
      setForm(null);
      void qc.invalidateQueries({ queryKey: ['item-types'] });
    },
    onError: (e: Error) => toast(e.message, 'err'),
  });

  const remove = useMutation({
    mutationFn: (typeId: string) => deleteItemType(typeId),
    onSuccess: () => {
      toast('Item type removed.', 'ok');
      setConfirmId(null);
      void qc.invalidateQueries({ queryKey: ['item-types'] });
    },
    onError: (e: Error) => toast(e.message, 'err'),
  });

  if (q.isLoading) return <Spinner label="Loading item types…" />;

  if (form) {
    return (
      <Card title={form.type_id ? 'Edit Item Type' : 'Add Item Type'}>
        <TextInput
          label="Name"
          required
          placeholder="e.g. HDMI Cable"
          value={form.name}
          onChange={(e) => setForm((f) => (f ? { ...f, name: e.target.value } : f))}
        />
        <TextSelect
          label="Category"
          value={form.category}
          onChange={(e) =>
            setForm((f) =>
              f ? { ...f, category: e.target.value as 'Durable' | 'Consumable' } : f,
            )
          }
        >
          <option value="Durable">Durable</option>
          <option value="Consumable">Consumable</option>
        </TextSelect>
        <TextInput
          label="Reorder Threshold"
          value={form.reorder_threshold}
          onChange={(e) => setForm((f) => (f ? { ...f, reorder_threshold: e.target.value } : f))}
        />
        <TextInput
          label="Notes"
          value={form.notes}
          onChange={(e) => setForm((f) => (f ? { ...f, notes: e.target.value } : f))}
        />
        <div className="flex gap-2 justify-end mt-4">
          <Button variant="ghost" onClick={() => setForm(null)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Save
          </Button>
        </div>
      </Card>
    );
  }

  if (q.isError) {
    return (
      <Card title="Item Types">
        <p className="text-[var(--red)] m-0">{(q.error as Error).message}</p>
      </Card>
    );
  }

  const list = q.data?.types || [];

  return (
    <Card
      title="Item Types"
      actions={
        <Button onClick={() => setForm(emptyForm())}>
          <Plus size={16} /> Add Type
        </Button>
      }
    >
      {list.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="No item types yet"
          body="Add the kinds of items that go inside kits (e.g. HDMI Cable, Hotspot, Power Adapter)."
          action={
            <Button onClick={() => setForm(emptyForm())}>
              <Plus size={16} /> Add Type
            </Button>
          }
        />
      ) : (
        <Table
          rows={list}
          rowKey={(r) => r.type_id}
          columns={[
            { key: 'name', header: 'Name', render: (r) => <strong>{r.name}</strong> },
            {
              key: 'category',
              header: 'Category',
              render: (r) => (isConsumable(r) ? 'Consumable' : 'Durable'),
            },
            {
              key: 'threshold',
              header: 'Reorder At',
              render: (r) => r.reorder_threshold || '—',
            },
            {
              key: 'actions',
              header: '',
              render: (r) => {
                const confirming = confirmId === r.type_id;
                return (
                  <div className="flex gap-2 justify-end items-center flex-wrap">
                    {confirming ? (
                      <>
                        <span className="text-xs text-[var(--muted)]">Remove this type?</span>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(r.type_id)}
                        >
                          {remove.isPending ? 'Removing…' : 'Yes, remove'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={remove.isPending}
                          onClick={() => setConfirmId(null)}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setForm({
                              type_id: r.type_id,
                              name: r.name || '',
                              category: isConsumable(r) ? 'Consumable' : 'Durable',
                              reorder_threshold: String(r.reorder_threshold || ''),
                              notes: r.notes || '',
                            })
                          }
                        >
                          Edit
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => setConfirmId(r.type_id)}>
                          Remove
                        </Button>
                      </>
                    )}
                  </div>
                );
              },
            },
          ]}
        />
      )}
    </Card>
  );
}
