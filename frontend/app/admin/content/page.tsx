'use client';

/**
 * Content Manager.
 *
 * Two views:
 *   • Hub view (default) — categorised cards showing every content type
 *     known to the public site, with a friendly description and a count of
 *     how many items currently exist.
 *   • Manage view (?type=XYZ) — items list + per-type tailored form. The
 *     form only shows fields that are relevant to that type (driven by
 *     type-config.ts) so non-technical editors aren't confronted with
 *     irrelevant inputs and a raw JSON blob.
 *
 * Power-user escape hatch: an "Advanced (raw JSON)" toggle in the form
 * still lets you edit the data field directly when a type isn't covered
 * by the structured config yet.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { adminApi } from '@/lib/api';
import {
  Plus, Edit2, Trash2, Save, Eye, EyeOff, ArrowLeft, FileText,
  Search, ChevronRight, Code,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { Checkbox } from '@/components/ui/Checkbox';
import { EmptyState, useConfirm } from '@/components/ui';
import { TYPE_CONFIG, TYPE_CATEGORIES, getTypeConfig, type TypeConfig, type FieldKey } from './type-config';
import { MarkdownField } from './MarkdownField';

export default function AdminContentPage() {
  const router = useRouter();
  const params = useSearchParams();
  const activeType = params.get('type') || '';

  if (activeType) {
    return <ManageView typeId={activeType} onBack={() => router.push('/admin/content')} />;
  }
  return <HubView onPick={(id) => router.push(`/admin/content?type=${id}`)} />;
}

// ── HUB VIEW ────────────────────────────────────────────────────────────────

function HubView({ onPick }: { onPick: (id: string) => void }) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Fetch counts for every known type so the hub cards can show "12 items".
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results: Record<string, number> = {};
      await Promise.all(TYPE_CONFIG.map(async (t) => {
        try {
          const r = await adminApi.content(t.id);
          if (!cancelled) results[t.id] = (r.data || []).length;
        } catch { results[t.id] = 0; }
      }));
      if (!cancelled) {
        setCounts(results);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (t: TypeConfig) =>
      !q ||
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q);

    const out: Array<{ category: string; items: TypeConfig[] }> = [];
    for (const cat of TYPE_CATEGORIES) {
      const items = TYPE_CONFIG.filter((t) => t.category === cat && matches(t));
      if (items.length) out.push({ category: cat, items });
    }
    return out;
  }, [search]);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-[#06D4B8] to-[#06B6D4] bg-clip-text text-transparent">
          Content Manager
        </h1>
        <p className="text-slate-500 mt-1 max-w-2xl">
          Pick a content type to manage. Each card describes what it is and where it appears
          on the public site. New entries go live immediately after saving.
        </p>
      </div>

      <div className="mb-6 max-w-md">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search content types…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 bg-white text-slate-900 focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
        </div>
      </div>

      {grouped.length === 0 ? (
        <EmptyState
          icon={<FileText size={24} />}
          title="No content types match"
          description="Try a different search term."
        />
      ) : (
        <div className="space-y-8">
          {grouped.map((g) => (
            <section key={g.category}>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                {g.category}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {g.items.map((t) => {
                  const Icon = t.icon;
                  const count = counts[t.id] ?? 0;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onPick(t.id)}
                      className="group text-left p-5 bg-white border border-slate-200 rounded-2xl hover:border-emerald-300 hover:shadow-lg hover:-translate-y-0.5 transition-all"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-100 transition-colors">
                          <Icon size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="font-bold text-slate-900 truncate">{t.name}</h3>
                            <ChevronRight size={14} className="text-slate-300 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                          </div>
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{t.description}</p>
                          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                              {loading ? '…' : `${count} item${count === 1 ? '' : 's'}`}
                            </span>
                            {t.whereUsed.map((w) => (
                              <span key={w} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border border-slate-200 text-slate-600">
                                {w}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// ── MANAGE VIEW ─────────────────────────────────────────────────────────────

function ManageView({ typeId, onBack }: { typeId: string; onBack: () => void }) {
  const config = getTypeConfig(typeId);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmUi, askConfirm] = useConfirm();

  const load = async () => {
    setLoading(true);
    try {
      const r = await adminApi.content(typeId);
      setItems(r.data || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [typeId]);

  const save = async (data: any) => {
    if (data.id) await adminApi.updateContent(data.id, { ...data, type: typeId });
    else          await adminApi.createContent({ ...data, type: typeId });
    setEditing(null);
    setCreating(false);
    load();
  };

  const del = async (id: string) => {
    const ok = await askConfirm({
      title: 'Delete this item?',
      description: 'It will disappear from the public site immediately. This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    await adminApi.deleteContent(id);
    load();
  };

  const togglePublish = async (item: any) => {
    await adminApi.updateContent(item.id, { isActive: !item.isActive });
    load();
  };

  if (!config) {
    return (
      <div className="p-8">
        <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft size={14} /> Back to all types
        </button>
        <EmptyState
          icon={<FileText size={24} />}
          title={`Unknown content type: ${typeId}`}
          description="This type isn't registered in type-config.ts."
        />
      </div>
    );
  }

  const Icon = config.icon;

  return (
    <div className="p-8">
      {confirmUi}
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft size={14} /> Back to all types
      </button>

      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center flex-shrink-0">
            <Icon size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{config.name}</h1>
            <p className="text-sm text-slate-500 max-w-xl">{config.description}</p>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {config.whereUsed.map((w) => (
                <span key={w} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border border-slate-200 text-slate-600">
                  Used on: {w}
                </span>
              ))}
            </div>
          </div>
        </div>
        <Button onClick={() => setCreating(true)} leftIcon={<Plus size={14} />}>New {config.name.toLowerCase()}</Button>
      </div>

      {config.tip && (
        <div className="mb-4 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <strong>Tip:</strong> {config.tip}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
        {loading ? (
          <div className="p-12 text-center text-sm text-slate-400">Loading…</div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<FileText size={24} />}
            title={`No ${config.name.toLowerCase()} items yet`}
            description={`Click "New ${config.name.toLowerCase()}" to add the first one.`}
            action={<Button onClick={() => setCreating(true)} leftIcon={<Plus size={14} />}>New item</Button>}
          />
        ) : (
          items.map((item) => (
            <div key={item.id} className="p-5 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-slate-900 truncate">{item.title || <span className="text-slate-400 italic">Untitled</span>}</h3>
                  {item.category && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 uppercase">{item.category}</span>
                  )}
                  {!item.isActive && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-500 uppercase">Hidden</span>
                  )}
                  <span className="text-[10px] font-mono text-slate-400">#{item.sortOrder ?? 0}</span>
                </div>
                {item.subtitle && <p className="text-sm text-slate-500 mt-1 line-clamp-2">{item.subtitle}</p>}
                {item.body && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{item.body}</p>}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Tooltip content={item.isActive ? 'Hide on public site' : 'Show on public site'}>
                  <Button variant="ghost" size="icon" onClick={() => togglePublish(item)}>
                    {item.isActive ? <Eye size={14} /> : <EyeOff size={14} />}
                  </Button>
                </Tooltip>
                <Tooltip content="Edit">
                  <Button variant="ghost" size="icon" onClick={() => setEditing(item)}>
                    <Edit2 size={14} />
                  </Button>
                </Tooltip>
                <Tooltip content="Delete">
                  <Button variant="ghost" size="icon" onClick={() => del(item.id)} className="!text-rose-600 hover:!bg-rose-50">
                    <Trash2 size={14} />
                  </Button>
                </Tooltip>
              </div>
            </div>
          ))
        )}
      </div>

      <Modal
        open={creating || !!editing}
        onClose={() => { setEditing(null); setCreating(false); }}
        title={editing ? `Edit ${config.name.toLowerCase()}` : `New ${config.name.toLowerCase()}`}
        description={config.description}
        size="xl"
      >
        <ContentForm
          config={config}
          initial={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSave={save}
        />
      </Modal>
    </div>
  );
}

// ── FORM ────────────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<FieldKey, string> = {
  title:     'Title',
  subtitle:  'Subtitle',
  body:      'Body',
  icon:      'Icon (lucide name)',
  image:     'Image URL',
  category:  'Category / group',
  href:      'Link (href)',
  sortOrder: 'Sort order',
  isActive:  'Active (visible on the public site)',
};

function ContentForm({
  config, initial, onClose, onSave,
}: {
  config: TypeConfig;
  initial: any | null;
  onClose: () => void;
  onSave: (data: any) => void;
}) {
  const [f, setF] = useState<any>(
    initial || {
      title: '', subtitle: '', body: '',
      icon: '', image: '', category: '', href: '',
      sortOrder: 0, isActive: true, data: {},
    }
  );
  const [advanced, setAdvanced] = useState(false);
  const [dataJson, setDataJson] = useState(JSON.stringify(initial?.data || {}, null, 2));
  const [jsonError, setJsonError] = useState('');

  const fields = config.fields;

  // Helpers for dot-path data field access (e.g. "ctaPrimary.label")
  const getDataPath = (path: string): any => {
    const parts = path.split('.');
    let cur = f.data || {};
    for (const p of parts) {
      if (cur == null) return undefined;
      cur = cur[p];
    }
    return cur;
  };
  const setDataPath = (path: string, value: any) => {
    const parts = path.split('.');
    const next = JSON.parse(JSON.stringify(f.data || {}));
    let cur = next;
    for (let i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] = cur[parts[i]] || {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
    setF({ ...f, data: next });
    setDataJson(JSON.stringify(next, null, 2));
  };

  const submit = () => {
    let payload = { ...f };
    if (advanced) {
      try {
        payload.data = JSON.parse(dataJson || '{}');
      } catch { setJsonError('Invalid JSON in data field'); return; }
    }
    setJsonError('');
    onSave(payload);
  };

  const labelFor = (k: FieldKey) =>
    config.fieldLabels?.[k] || FIELD_LABELS[k];

  return (
    <div className="space-y-4">
      {/* Standard fields — only those listed in config.fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fields.includes('title') && (
          <div className="md:col-span-2">
            <Input
              label={labelFor('title')}
              hint={config.fieldHints?.title}
              value={f.title ?? ''}
              onChange={(e) => setF({ ...f, title: e.target.value })}
            />
          </div>
        )}
        {fields.includes('subtitle') && (
          <div className="md:col-span-2">
            <Input
              label={labelFor('subtitle')}
              hint={config.fieldHints?.subtitle}
              value={f.subtitle ?? ''}
              onChange={(e) => setF({ ...f, subtitle: e.target.value })}
            />
          </div>
        )}
        {fields.includes('body') && (
          <div className="md:col-span-2">
            <MarkdownField
              label={labelFor('body')}
              hint={config.fieldHints?.body || 'Supports markdown — use the toolbar above for formatting.'}
              value={f.body ?? ''}
              onChange={(v) => setF({ ...f, body: v })}
              rows={5}
            />
          </div>
        )}

        {fields.includes('icon') && (
          <Input
            label={labelFor('icon')}
            hint={config.fieldHints?.icon || 'Any lucide-react icon name (e.g. Sparkles, Box).'}
            placeholder="Sparkles"
            value={f.icon ?? ''}
            onChange={(e) => setF({ ...f, icon: e.target.value })}
          />
        )}
        {fields.includes('image') && (
          <Input
            label={labelFor('image')}
            hint={config.fieldHints?.image}
            placeholder="https://…"
            value={f.image ?? ''}
            onChange={(e) => setF({ ...f, image: e.target.value })}
          />
        )}
        {fields.includes('category') && (
          <Input
            label={labelFor('category')}
            hint={config.fieldHints?.category}
            value={f.category ?? ''}
            onChange={(e) => setF({ ...f, category: e.target.value })}
          />
        )}
        {fields.includes('href') && (
          <Input
            label={labelFor('href')}
            hint={config.fieldHints?.href || 'Internal path or full URL.'}
            placeholder="/pricing or https://…"
            value={f.href ?? ''}
            onChange={(e) => setF({ ...f, href: e.target.value })}
          />
        )}
        {fields.includes('sortOrder') && (
          <Input
            label={labelFor('sortOrder')}
            hint="Lower numbers appear first."
            type="number"
            value={f.sortOrder ?? 0}
            onChange={(e) => setF({ ...f, sortOrder: Number(e.target.value) })}
          />
        )}
      </div>

      {/* Per-type structured data fields — render labelled inputs instead of raw JSON */}
      {!advanced && config.dataFields && config.dataFields.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
          <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">
            Type-specific fields
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {config.dataFields.map((df) => {
              if (df.type === 'longtext') {
                return (
                  <div key={df.key} className="md:col-span-2">
                    <MarkdownField
                      label={df.label}
                      hint={df.hint}
                      value={String(getDataPath(df.key) ?? '')}
                      onChange={(v) => setDataPath(df.key, v)}
                      rows={3}
                    />
                  </div>
                );
              }
              return (
                <Input
                  key={df.key}
                  label={df.label}
                  hint={df.hint}
                  placeholder={df.placeholder}
                  type={df.type === 'number' ? 'number' : 'text'}
                  min={df.min}
                  max={df.max}
                  value={getDataPath(df.key) ?? ''}
                  onChange={(e) =>
                    setDataPath(df.key, df.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)
                  }
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Advanced JSON escape hatch */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700"
        >
          <Code size={12} />
          {advanced ? 'Hide' : 'Show'} advanced (raw JSON data)
        </button>
        {advanced && (
          <div className="mt-2 rounded-xl border border-slate-200 bg-slate-900 p-3">
            <textarea
              value={dataJson}
              onChange={(e) => setDataJson(e.target.value)}
              rows={8}
              className="w-full bg-transparent text-emerald-200 font-mono text-xs resize-y focus:outline-none"
            />
            {jsonError && <p className="text-xs text-rose-400 mt-1">{jsonError}</p>}
            <p className="text-[11px] text-slate-400 mt-2">
              Use only if a field isn&apos;t covered above. Saving here overrides the structured fields.
            </p>
          </div>
        )}
      </div>

      {/* Active toggle */}
      {fields.includes('isActive') && (
        <Checkbox
          checked={!!f.isActive}
          onCheckedChange={(c) => setF({ ...f, isActive: c })}
          label={labelFor('isActive')}
        />
      )}

      {/* Footer */}
      <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} leftIcon={<Save size={14} />}>Save</Button>
      </div>
    </div>
  );
}
