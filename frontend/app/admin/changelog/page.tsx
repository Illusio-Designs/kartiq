'use client';

import { useEffect, useMemo, useState } from 'react';
import { changelogApi, type ChangelogEntry, type ChangelogTag, type ContentAudience } from '@/lib/api';
import { Button, Modal, Input, Textarea, Tabs, EmptyState } from '@/components/ui';
import { Select } from '@/components/ui/Select';
import {
  Megaphone, Plus, Pencil, Trash2, CheckCircle2, EyeOff, Sparkles, Wrench, ShieldAlert, ArrowUpRight, X,
} from 'lucide-react';

const TAGS: { key: ChangelogTag; label: string; icon: any; bg: string; text: string }[] = [
  { key: 'feature',  label: 'NEW',      icon: Sparkles,    bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
  { key: 'improve',  label: 'IMPROVED', icon: ArrowUpRight, bg: 'bg-violet-50 border-violet-200',  text: 'text-violet-700' },
  { key: 'fix',      label: 'FIX',      icon: Wrench,      bg: 'bg-blue-50 border-blue-200',       text: 'text-blue-700' },
  { key: 'security', label: 'SECURITY', icon: ShieldAlert, bg: 'bg-rose-50 border-rose-200',       text: 'text-rose-700' },
];
const TAG_MAP = TAGS.reduce((m, t) => { m[t.key] = t; return m; }, {} as Record<ChangelogTag, typeof TAGS[number]>);

function fmtDate(s?: string | null) {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AdminChangelogPage() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [editing, setEditing] = useState<ChangelogEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ChangelogEntry | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await changelogApi.adminList();
      setEntries(r.data || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return entries;
    if (filter === 'published') return entries.filter((e) => e.isPublished);
    return entries.filter((e) => !e.isPublished);
  }, [entries, filter]);

  const onSave = async (
    data: { title: string; tag: ChangelogTag; highlights: string[]; isPublished: boolean; audience: ContentAudience },
    id?: string
  ) => {
    setBusy(true);
    try {
      if (id) {
        await changelogApi.adminUpdate(id, data);
      } else {
        await changelogApi.adminCreate(data);
      }
      await load();
      setEditing(null);
      setCreating(false);
    } finally { setBusy(false); }
  };

  const onDelete = async (entry: ChangelogEntry) => {
    setBusy(true);
    try {
      await changelogApi.adminDelete(entry.id);
      await load();
      setConfirmDelete(null);
    } finally { setBusy(false); }
  };

  const togglePublish = async (entry: ChangelogEntry) => {
    setBusy(true);
    try {
      await changelogApi.adminUpdate(entry.id, { isPublished: !entry.isPublished });
      await load();
    } finally { setBusy(false); }
  };

  return (
    <div className="p-8">
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#06D4B8] to-[#06B6D4] bg-clip-text text-transparent flex items-center gap-2">
            <Megaphone size={24} className="text-emerald-600" /> What&apos;s new
          </h1>
          <p className="text-slate-500 mt-1">
            Release notes shown to logged-in users via the topbar megaphone. Newest published first.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} leftIcon={<Plus size={14} />}>New entry</Button>
      </div>

      {/* Filter */}
      <div className="mb-4">
        <Tabs
          size="sm"
          value={filter}
          onChange={(k) => setFilter(k as any)}
          items={[
            { key: 'all',       label: 'All',       badge: entries.length || undefined },
            { key: 'published', label: 'Published', badge: entries.filter((e) => e.isPublished).length || undefined },
            { key: 'draft',     label: 'Drafts',    badge: entries.filter((e) => !e.isPublished).length || undefined },
          ]}
        />
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Megaphone size={28} />}
            title="No entries yet"
            description="Add your first release note. Keep it short and customer-facing."
            action={<Button onClick={() => setCreating(true)} leftIcon={<Plus size={14} />}>New entry</Button>}
          />
        ) : (
          filtered.map((entry) => {
            const tag = TAG_MAP[entry.tag] || TAG_MAP.feature;
            return (
              <div key={entry.id} className="p-5 flex items-start gap-4 hover:bg-slate-50/50 transition-colors">
                <span className={`flex-shrink-0 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${tag.bg} ${tag.text}`}>
                  <tag.icon size={11} /> {tag.label}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-slate-900 text-sm">{entry.title}</h3>
                    {entry.isPublished ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded bg-emerald-100 text-emerald-700">
                        <CheckCircle2 size={10} /> Published
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded bg-slate-100 text-slate-600">
                        <EyeOff size={10} /> Draft
                      </span>
                    )}
                    <AudienceBadge audience={entry.audience} />
                  </div>
                  <ul className="mt-2 space-y-1">
                    {entry.highlights.slice(0, 4).map((h, i) => (
                      <li key={i} className="text-xs text-slate-600 leading-relaxed flex gap-2">
                        <span className="mt-1.5 w-1 h-1 rounded-full bg-emerald-500 flex-shrink-0" />
                        <span>{h}</span>
                      </li>
                    ))}
                    {entry.highlights.length > 4 && (
                      <li className="text-[11px] text-slate-400 pl-3">+{entry.highlights.length - 4} more</li>
                    )}
                  </ul>
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-400">
                    <span>{entry.isPublished ? 'Published' : 'Created'} {fmtDate(entry.publishedAt || entry.createdAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => togglePublish(entry)} disabled={busy}>
                    {entry.isPublished ? <><EyeOff size={13} /> Unpublish</> : <><CheckCircle2 size={13} /> Publish</>}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(entry)}>
                    <Pencil size={13} />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(entry)} className="!text-rose-600 hover:!bg-rose-50">
                    <Trash2 size={13} />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {(creating || editing) && (
        <EntryFormModal
          entry={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSave={onSave}
          busy={busy}
        />
      )}

      {/* Delete confirm */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete entry?"
        description={confirmDelete?.title}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)} disabled={busy}>Cancel</Button>
            <Button onClick={() => confirmDelete && onDelete(confirmDelete)} disabled={busy} className="!bg-rose-600 hover:!bg-rose-700 !shadow-rose-500/25">
              {busy ? 'Deleting…' : <><Trash2 size={14} /> Delete</>}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">This entry will disappear from the topbar drawer immediately. This action can&apos;t be undone.</p>
      </Modal>
    </div>
  );
}

function EntryFormModal({
  entry, onClose, onSave, busy,
}: {
  entry: ChangelogEntry | null;
  onClose: () => void;
  onSave: (data: { title: string; tag: ChangelogTag; highlights: string[]; isPublished: boolean; audience: ContentAudience }, id?: string) => Promise<void>;
  busy: boolean;
}) {
  const [title, setTitle] = useState(entry?.title || '');
  const [tag, setTag] = useState<ChangelogTag>(entry?.tag || 'feature');
  // Edit highlights as one bullet per line in a textarea.
  const [highlightsText, setHighlightsText] = useState((entry?.highlights || []).join('\n'));
  const [isPublished, setIsPublished] = useState(entry?.isPublished ?? false);
  const [audience, setAudience] = useState<ContentAudience>(entry?.audience || 'all');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const t = title.trim();
    const lines = highlightsText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (!t) return setError('Title is required');
    if (lines.length === 0) return setError('Add at least one highlight');
    await onSave({ title: t, tag, highlights: lines, isPublished, audience }, entry?.id);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={entry ? 'Edit entry' : 'New release entry'}
      description="Highlights are displayed as bullet points. Keep each line short and customer-facing."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="min-w-[120px] justify-center">
            {busy ? 'Saving…' : (entry ? 'Save changes' : 'Create')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Faster sync, AI demand forecast, …"
          maxLength={190}
        />
        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Tag</label>
          <div className="flex flex-wrap gap-2">
            {TAGS.map((t) => (
              <button
                type="button"
                key={t.key}
                onClick={() => setTag(t.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold uppercase tracking-wider transition-colors ${
                  tag === t.key
                    ? `${t.bg} ${t.text}`
                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                <t.icon size={11} /> {t.label}
              </button>
            ))}
          </div>
        </div>
        <Textarea
          label="Highlights (one per line)"
          rows={6}
          value={highlightsText}
          onChange={(e) => setHighlightsText(e.target.value)}
          placeholder={'Real-time sync across 56+ channels\nNew Razorpay autopay flow\nFixed: stuck shipments on Delhivery'}
        />
        <Select
          fullWidth
          label="Audience"
          value={audience}
          onChange={(v) => setAudience(v as ContentAudience)}
          options={[
            { value: 'all',     label: 'Everyone (all)' },
            { value: 'tenant',  label: 'Tenant users only' },
            { value: 'founder', label: 'Founders only' },
          ]}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isPublished}
            onChange={(e) => setIsPublished(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-slate-700">Publish immediately (visible in the topbar drawer)</span>
        </label>
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
            <X size={14} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}

// Mirror the badge from /admin/help so the changelog list shows audience
// targeting at a glance. Server filters on /changelog?audience=…; this is
// editorial colour for the founder admin only.
function AudienceBadge({ audience }: { audience: ContentAudience }) {
  if (audience === 'all') {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded bg-slate-100 text-slate-600">
        Everyone
      </span>
    );
  }
  if (audience === 'tenant') {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
        Tenants only
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200">
      Founders only
    </span>
  );
}
