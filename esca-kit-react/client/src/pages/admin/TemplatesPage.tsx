import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Briefcase, Plus, Trash2 } from 'lucide-react';
import {
  deleteTemplate,
  getItemTypes,
  getTemplates,
  saveTemplate,
  saveTemplateItems,
} from '../../api/kits';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { TextInput } from '../../components/FormField';
import { Spinner } from '../../components/Spinner';
import { Table } from '../../components/Table';
import { useToast } from '../../context/ToastContext';

type Line = { type_id: string; qty: number; reorder_threshold: string };

const emptyForm = () => ({
  template_id: '',
  career: '',
  name: '',
  notes: '',
  lines: [] as Line[],
});

export function TemplatesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const templates = useQuery({ queryKey: ['templates'], queryFn: getTemplates });
  const types = useQuery({ queryKey: ['item-types'], queryFn: getItemTypes });
  const [form, setForm] = useState<ReturnType<typeof emptyForm> | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (!form) throw new Error('No form');
      if (!form.career.trim() || !form.name.trim()) {
        throw new Error('Career and template name are required.');
      }
      const payload: Record<string, string> = {
        career: form.career.trim(),
        name: form.name.trim(),
        notes: form.notes.trim(),
      };
      if (form.template_id) payload.template_id = form.template_id;
      const r = (await saveTemplate(payload)) as { success: boolean; template_id: string };
      const items = form.lines
        .filter((l) => l.type_id)
        .map((l) => ({
          type_id: l.type_id,
          qty: l.qty || 1,
          reorder_threshold: l.reorder_threshold || '',
        }));
      await saveTemplateItems(r.template_id, items);
      return r;
    },
    onSuccess: () => {
      toast('Career template saved.', 'ok');
      setForm(null);
      void qc.invalidateQueries({ queryKey: ['templates'] });
    },
    onError: (e: Error) => toast(e.message, 'err'),
  });

  const remove = useMutation({
    mutationFn: async (templateId: string) => {
      const r = (await deleteTemplate(templateId)) as { success: boolean; error?: string };
      if (!r.success) throw new Error(r.error || 'Could not remove template.');
      return r;
    },
    onSuccess: () => {
      toast('Career template removed.', 'ok');
      void qc.invalidateQueries({ queryKey: ['templates'] });
    },
    onError: (e: Error) => toast(e.message, 'err'),
  });

  if (templates.isLoading || types.isLoading) return <Spinner label="Loading templates…" />;

  if (form) {
    const typeList = types.data?.types || [];
    return (
      <Card title={form.template_id ? 'Edit Career Template' : 'New Career Template'}>
        <div className="grid md:grid-cols-2 gap-x-4">
          <TextInput
            label="Career"
            required
            placeholder="e.g. Nursing"
            value={form.career}
            onChange={(e) => setForm((f) => (f ? { ...f, career: e.target.value } : f))}
          />
          <TextInput
            label="Template Name"
            required
            placeholder="e.g. Nursing Career Kit"
            value={form.name}
            onChange={(e) => setForm((f) => (f ? { ...f, name: e.target.value } : f))}
          />
        </div>
        <TextInput
          label="Notes"
          value={form.notes}
          onChange={(e) => setForm((f) => (f ? { ...f, notes: e.target.value } : f))}
        />

        <h3 className="text-[var(--blue)] font-bold text-base m-0 mt-2 mb-1">Expected Contents</h3>
        <p className="text-sm text-[var(--muted)] mb-3">
          Item types and quantities that belong in each physical kit using this template.
        </p>

        {typeList.length === 0 ? (
          <p className="text-sm text-[var(--amber)] mb-4">
            No item types yet. Add types under Item Types first, then come back to build the template.
          </p>
        ) : form.lines.length === 0 ? (
          <p className="text-sm text-[var(--muted)] mb-3">Add item types that belong in this career kit.</p>
        ) : (
          <div className="space-y-2 mb-3">
            {form.lines.map((line, i) => (
              <div key={i} className="flex flex-wrap gap-2 items-center">
                <select
                  className="flex-1 min-w-[160px] px-3 py-2.5 border border-[var(--border)] rounded-lg text-sm"
                  value={line.type_id}
                  onChange={(e) =>
                    setForm((f) =>
                      f
                        ? {
                            ...f,
                            lines: f.lines.map((r, idx) =>
                              idx === i ? { ...r, type_id: e.target.value } : r,
                            ),
                          }
                        : f,
                    )
                  }
                >
                  <option value="">— item type —</option>
                  {typeList.map((t: any) => (
                    <option key={t.type_id} value={t.type_id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={50}
                  title="Qty per kit"
                  value={line.qty}
                  onChange={(e) =>
                    setForm((f) =>
                      f
                        ? {
                            ...f,
                            lines: f.lines.map((r, idx) =>
                              idx === i ? { ...r, qty: parseInt(e.target.value, 10) || 1 } : r,
                            ),
                          }
                        : f,
                    )
                  }
                  className="w-20 px-3 py-2.5 border border-[var(--border)] rounded-lg text-sm"
                />
                <input
                  type="number"
                  min={0}
                  title="Reorder threshold"
                  placeholder="Min avail"
                  value={line.reorder_threshold}
                  onChange={(e) =>
                    setForm((f) =>
                      f
                        ? {
                            ...f,
                            lines: f.lines.map((r, idx) =>
                              idx === i ? { ...r, reorder_threshold: e.target.value } : r,
                            ),
                          }
                        : f,
                    )
                  }
                  className="w-28 px-3 py-2.5 border border-[var(--border)] rounded-lg text-sm"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setForm((f) => (f ? { ...f, lines: f.lines.filter((_, idx) => idx !== i) } : f))
                  }
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="mb-4"
          disabled={!typeList.length}
          onClick={() =>
            setForm((f) =>
              f ? { ...f, lines: [...f.lines, { type_id: '', qty: 1, reorder_threshold: '' }] } : f,
            )
          }
        >
          <Plus size={16} /> Add Item
        </Button>

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => setForm(null)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Save Template
          </Button>
        </div>
      </Card>
    );
  }

  if (templates.isError) {
    return (
      <Card title="Career Templates">
        <p className="text-[var(--red)] m-0">{(templates.error as Error).message}</p>
      </Card>
    );
  }

  const list = templates.data?.templates || [];

  return (
    <Card
      title="Career Templates"
      actions={
        <Button onClick={() => setForm(emptyForm())}>
          <Plus size={16} /> New Career Template
        </Button>
      }
    >
      <p className="text-[var(--muted)] text-sm mb-4">
        Templates define the expected item list for each career exploration kit. Physical kits link to a
        template; use Labels to generate barcodes from those contents.
      </p>
      {list.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No templates yet"
          body="Create one for each career (e.g. Nursing, Welding, IT). Add item types first if you have not already."
          action={
            <Button onClick={() => setForm(emptyForm())}>
              <Plus size={16} /> New Career Template
            </Button>
          }
        />
      ) : (
        <Table
          rows={list}
          rowKey={(r) => r.template_id}
          columns={[
            {
              key: 'career',
              header: 'Career',
              render: (r) => (
                <strong>{r.career || r.name || r.template_id || 'Unlabeled template'}</strong>
              ),
            },
            {
              key: 'name',
              header: 'Template Name',
              render: (r) => r.name || <span className="text-[var(--muted)]">Unlabeled</span>,
            },
            { key: 'kits', header: 'Physical Kits', render: (r) => r.kit_count ?? 0 },
            {
              key: 'contents',
              header: 'Contents',
              render: (r) =>
                (r.contents || [])
                  .map((c: any) => `${c.type_name || c.type_id} ×${c.qty}`)
                  .join(', ') || '—',
            },
            {
              key: 'actions',
              header: '',
              render: (r) => (
                <div className="flex gap-1 justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setForm({
                        template_id: r.template_id,
                        career: r.career || '',
                        name: r.name || '',
                        notes: r.notes || '',
                        lines: (r.contents || []).map((c: any) => ({
                          type_id: c.type_id,
                          qty: parseInt(String(c.qty), 10) || 1,
                          reorder_threshold: String(c.reorder_threshold || ''),
                        })),
                      })
                    }
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => {
                      const kitCount = r.kit_count ?? 0;
                      const label = r.career || r.name || r.template_id || 'this unlabeled template';
                      const msg =
                        kitCount > 0
                          ? `Remove "${label}"? ${kitCount} kit(s) will be unlinked (the kits are kept, not deleted).`
                          : `Remove "${label}"? This cannot be undone.`;
                      if (window.confirm(msg)) remove.mutate(r.template_id);
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              ),
            },
          ]}
        />
      )}
    </Card>
  );
}
