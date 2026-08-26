'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { userApi, roleApi, billingApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { useFilteredBySearch } from '@/lib/useGlobalSearch';
import { formatDateTime } from '@/lib/utils';
import { Plus, Trash2, Users, Shield, Save, Pencil, Mail, Send, Copy, Search, Lock, Sparkles } from 'lucide-react';
import { toast } from '@/store/toast.store';
import { TableRowsSkeleton, CardSkeletonGrid } from '@/components/Shimmer';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Checkbox } from '@/components/ui/Checkbox';
import {
  Button, Badge, Card, CardHeader, CardTitle, CardDescription, Avatar, Tooltip, Tabs, EmptyState, useConfirm,
} from '@/components/ui';

export default function TeamPage() {
  const { hasPermission } = useAuthStore();
  const [tab, setTab] = useState<'users' | 'roles'>('users');
  // The primary action lives in the page header (Orders convention), so the
  // "create" modal open-state is lifted here and handed to each tab.
  const [newUserOpen, setNewUserOpen] = useState(false);
  const [newRoleOpen, setNewRoleOpen] = useState(false);

  const canManageUsers = hasPermission('users.create', 'users.update');
  const canManageRoles = hasPermission('roles.create', 'roles.update');

  return (
    <div className="space-y-5 animate-slide-up">
        <PageHeader
          title="Team"
          subtitle="Invite teammates and control what each role can do"
          actions={
            <>
              <Tabs<'users' | 'roles'>
                value={tab}
                onChange={setTab}
                size="sm"
                items={[
                  { key: 'users', label: 'Users', icon: <Users size={14} /> },
                  { key: 'roles', label: 'Roles', icon: <Shield size={14} /> },
                ]}
              />
              {tab === 'users'
                ? canManageUsers && (
                    <Button size="sm" leftIcon={<Plus size={15} />} onClick={() => setNewUserOpen(true)}>
                      Invite user
                    </Button>
                  )
                : canManageRoles && (
                    <Button size="sm" leftIcon={<Plus size={15} />} onClick={() => setNewRoleOpen(true)}>
                      New role
                    </Button>
                  )}
            </>
          }
        />

        {tab === 'users'
          ? <UsersTab canManage={canManageUsers} showNew={newUserOpen} setShowNew={setNewUserOpen} />
          : <RolesTab canManage={canManageRoles} showNew={newRoleOpen} setShowNew={setNewRoleOpen} />}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
function UsersTab({ canManage, showNew, setShowNew }: {
  canManage: boolean;
  showNew: boolean;
  setShowNew: (v: boolean) => void;
}) {
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [confirmUi, askConfirm] = useConfirm();

  const load = async () => {
    try {
      const [u, r] = await Promise.all([userApi.list(), roleApi.list()]);
      setUsers(u.data); setRoles(r.data);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  // Topbar search — filters by name, email, role names.
  const filteredUsers = useFilteredBySearch(users, (u: any) =>
    `${u.name || ''} ${u.email || ''} ${u.role || ''} ${(u.roles || []).map((ur: any) => ur.role?.name || '').join(' ')}`
  );

  const save = async (data: any) => {
    if (data.id) await userApi.update(data.id, data);
    else await userApi.create(data);
    setShowNew(false); setEditing(null); load();
  };

  const del = async (id: string) => {
    const ok = await askConfirm({
      title: 'Deactivate this user?',
      description: 'The user will lose access immediately. You can re-activate them later.',
      confirmLabel: 'Deactivate',
      variant: 'danger',
    });
    if (!ok) return;
    await userApi.delete(id); load();
  };

  return (
    <>
      {confirmUi}

      <Modal
        open={showNew || !!editing}
        onClose={() => { setShowNew(false); setEditing(null); }}
        title={editing ? 'Edit user' : 'Invite user'}
        size="lg"
      >
        <UserForm
          initial={editing}
          roles={roles}
          onClose={() => { setShowNew(false); setEditing(null); }}
          onSave={save}
        />
      </Modal>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400">
                <th className="px-4 py-2.5 font-bold">Member</th>
                <th className="px-4 py-2.5 font-bold">Role</th>
                <th className="px-4 py-2.5 font-bold">Status</th>
                <th className="px-4 py-2.5 font-bold whitespace-nowrap">Last active</th>
                <th className="px-4 py-2.5 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <TableRowsSkeleton rows={4} cols={5} cellClassName="px-4 py-3.5" /> :
               filteredUsers.length ? filteredUsers.map((u) => {
                // No dedicated last-active field exists yet — show a real
                // timestamp when the API provides one, otherwise a neutral dash
                // (never a fabricated value).
                const lastActive = u.lastLoginAt || u.lastActiveAt;
                return (
                  <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={u.name} size="sm" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-900 truncate">{u.name}</span>
                            {u.isPlatformAdmin && <Badge variant="amber">Platform admin</Badge>}
                          </div>
                          <div className="text-xs text-slate-500 truncate">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {u.roles?.length ? u.roles.map((ur: any) => (
                          <Badge key={ur.role.id} variant="emerald">{ur.role.name}</Badge>
                        )) : u.isPlatformAdmin ? (
                          <Badge variant="slate">All access</Badge>
                        ) : (
                          <span className="text-xs text-slate-400">No role</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {u.pendingInvite ? (
                        <Badge variant="amber" dot><Mail size={10} /> Invited</Badge>
                      ) : u.isActive ? (
                        <Badge variant="emerald" dot>Active</Badge>
                      ) : (
                        <Badge variant="slate" dot>Inactive</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {lastActive ? formatDateTime(lastActive) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {canManage && !u.isPlatformAdmin ? (
                          <>
                            {u.pendingInvite && (
                              <Tooltip content="Resend invite email">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={async () => {
                                    try {
                                      const r = await userApi.resendInvite(u.id);
                                      toast.success('Invite email re-sent.');
                                      if (r.data?.devInviteUrl) {
                                        // Dev only: surface the magic link so admins
                                        // can copy it when SMTP isn't configured yet.
                                        console.info('[invite] dev URL:', r.data.devInviteUrl);
                                      }
                                    } catch (err: any) {
                                      toast.error(err?.response?.data?.error || 'Could not resend invite');
                                    }
                                  }}
                                >
                                  <Send size={14} />
                                </Button>
                              </Tooltip>
                            )}
                            <Tooltip content="Edit user">
                              <Button variant="ghost" size="icon" onClick={() => setEditing(u)}>
                                <Pencil size={14} />
                              </Button>
                            </Tooltip>
                            <Tooltip content="Deactivate user">
                              <Button variant="danger" size="icon" onClick={() => del(u.id)}>
                                <Trash2 size={14} />
                              </Button>
                            </Tooltip>
                          </>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={5} className="p-0">
                    <EmptyState
                      icon={<Users size={26} />}
                      iconBg="bg-emerald-50 text-emerald-600"
                      title="No team members"
                      description="Invite teammates and assign each a role to control what they can see and do."
                      action={canManage ? (
                        <Button size="sm" leftIcon={<Plus size={14} />} onClick={() => setShowNew(true)}>
                          Invite user
                        </Button>
                      ) : undefined}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function UserForm({ initial, roles, onClose, onSave }: {
  initial: any;
  roles: any[];
  onClose: () => void;
  onSave: (data: any) => void;
}) {
  const [f, setF] = useState<any>(initial || {
    name: '', email: '', password: '', roleIds: [], isActive: true,
  });
  // Normalise initial roles into an array of IDs
  useEffect(() => {
    if (initial?.roles) {
      setF((p: any) => ({ ...p, roleIds: initial.roles.map((ur: any) => ur.role.id) }));
    }
  }, [initial]);

  const toggleRole = (id: string) => {
    setF((p: any) => ({
      ...p,
      roleIds: p.roleIds.includes(id) ? p.roleIds.filter((r: string) => r !== id) : [...p.roleIds, id],
    }));
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-4">
        <Input label="Name" value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Input label="Email" value={f.email ?? ''} onChange={(e) => setF({ ...f, email: e.target.value })} disabled={!!initial} />
        {!initial && (
          <div className="col-span-2">
            <PasswordInput
              label="Temporary password (optional)"
              value={f.password ?? ''}
              onChange={(e) => setF({ ...f, password: e.target.value })}
            />
            <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
              Leave blank to email a magic-link invite — the user picks their own password.
              Set one only if you need to hand-deliver credentials offline.
            </p>
          </div>
        )}
        {initial && (
          <div className="col-span-2">
            <Checkbox
              checked={!!f.isActive}
              onCheckedChange={(c) => setF({ ...f, isActive: c })}
              label="Active"
            />
          </div>
        )}
      </div>
      <div className="mt-4">
        <div className="text-xs font-semibold text-slate-600 uppercase mb-2">Roles</div>
        <div className="flex flex-wrap gap-2">
          {roles.map((r: any) => (
            <button
              key={r.id}
              type="button"
              onClick={() => toggleRole(r.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                f.roleIds.includes(r.id) ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {r.name}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5 flex gap-2 justify-end">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" leftIcon={<Save size={14} />} onClick={() => onSave(f)}>Save</Button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
function RolesTab({ canManage, showNew, setShowNew }: {
  canManage: boolean;
  showNew: boolean;
  setShowNew: (v: boolean) => void;
}) {
  const [roles, setRoles] = useState<any[]>([]);
  const [perms, setPerms] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [confirmUi, askConfirm] = useConfirm();
  const [usage, setUsage] = useState<{ used: number; limit: number | null } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [r, p, u] = await Promise.all([
        roleApi.list(),
        userApi.permissionCatalog(),
        // Optional — fall back gracefully if the call fails (perms or network)
        billingApi.usage().catch(() => null),
      ]);
      setRoles(r.data); setPerms(p.data);
      if (u?.data) {
        // Custom roles only — system roles don't count against the plan limit
        const customCount = (r.data || []).filter((x: any) => !x.isSystem).length;
        const limit = u.data.plan?.maxUserRoles ?? null;
        setUsage({ used: customCount, limit });
      }
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const save = async (data: any) => {
    try {
      if (data.id) await roleApi.update(data.id, data);
      else await roleApi.create(data);
      toast.success(data.id ? 'Role updated' : 'Role created');
      setEditing(null); setShowNew(false); load();
    } catch (err: any) {
      const e = err?.response?.data?.error;
      if (err?.response?.status === 402) {
        toast.error('Plan limit reached — upgrade or enable Pay-As-You-Go to add more custom roles.');
      } else {
        toast.error(e || 'Could not save role');
      }
    }
  };

  const del = async (role: any) => {
    const userCount = role._count?.users || 0;
    const ok = await askConfirm({
      title: `Delete "${role.name}"?`,
      description: userCount > 0
        ? `${userCount} user${userCount === 1 ? '' : 's'} will lose this role's permissions. This cannot be undone.`
        : 'No users are assigned to this role. This cannot be undone.',
      confirmLabel: 'Delete role',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await roleApi.delete(role.id);
      toast.success('Role deleted');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not delete role');
    }
  };

  // Re-purpose `editing` so the form pre-fills with the source role's
  // permissions, but with no `id` so save() takes the create branch.
  const clone = (role: any) => {
    setShowNew(false);
    setEditing({
      _isClone: true,
      code: `${role.code}_COPY`,
      name: `${role.name} (copy)`,
      description: role.description || '',
      permissions: role.permissions || [],
    });
  };

  const permsByModule: Record<string, any[]> = {};
  for (const p of perms) (permsByModule[p.module] ||= []).push(p);

  const customRoles = roles.filter((r: any) => !r.isSystem);
  const systemRoles = roles.filter((r: any) => r.isSystem);
  const atLimit = usage?.limit != null && usage.used >= usage.limit;

  return (
    <>
      {confirmUi}

      <Modal
        open={showNew || !!editing}
        onClose={() => { setEditing(null); setShowNew(false); }}
        title={editing && !editing._isClone && editing.id ? `Edit ${editing.name}` : (editing?._isClone ? 'Clone role' : 'New role')}
        size="xl"
      >
        <RoleForm
          initial={editing}
          permsByModule={permsByModule}
          permTotal={perms.length}
          onClose={() => { setEditing(null); setShowNew(false); }}
          onSave={save}
        />
      </Modal>

      <div className="space-y-5">
        {/* Custom roles */}
        <Card className="p-0 overflow-hidden">
          <CardHeader className="pb-3">
            <div>
              <CardTitle>Custom roles</CardTitle>
              <CardDescription>Roles you define with exactly the permissions each job needs</CardDescription>
            </div>
            {usage && (usage.limit != null ? (
              <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-full px-3 py-1.5 whitespace-nowrap">
                <strong className={atLimit ? 'text-rose-700' : 'text-slate-900'}>{usage.used}</strong>{' '}
                of <strong>{usage.limit}</strong> used
                {atLimit && <span className="ml-1.5 text-rose-600 font-bold">· at limit</span>}
              </div>
            ) : (
              <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1.5 whitespace-nowrap">
                <strong>Unlimited</strong> on your plan
              </div>
            ))}
          </CardHeader>

          {loading ? (
            <div className="p-5"><CardSkeletonGrid count={3} /></div>
          ) : customRoles.length === 0 ? (
            <EmptyState
              icon={<Sparkles size={26} />}
              iconBg="bg-emerald-50 text-emerald-600"
              title="No custom roles yet"
              description={'Define a role like "Warehouse manager" or "Read-only auditor" with exactly the permissions that job needs, then assign it to teammates.'}
              action={canManage ? (
                <Button size="sm" leftIcon={<Plus size={14} />} onClick={() => { setEditing(null); setShowNew(true); }}>
                  Create your first role
                </Button>
              ) : undefined}
            />
          ) : (
            <div className="divide-y divide-slate-100 border-t border-slate-100">
              {customRoles.map((r) => (
                <RoleRow key={r.id} role={r} canManage={canManage} onEdit={() => setEditing(r)} onClone={() => clone(r)} onDelete={() => del(r)} />
              ))}
            </div>
          )}
        </Card>

        {/* Built-in / system roles — read-only */}
        {systemRoles.length > 0 && (
          <Card className="p-0 overflow-hidden">
            <CardHeader className="pb-3">
              <div>
                <CardTitle className="flex items-center gap-1.5"><Lock size={13} className="text-slate-400" /> Built-in roles</CardTitle>
                <CardDescription>System roles ship with Kartriq and can be viewed but not edited</CardDescription>
              </div>
            </CardHeader>
            <div className="divide-y divide-slate-100 border-t border-slate-100">
              {systemRoles.map((r) => (
                <RoleRow key={r.id} role={r} canManage={canManage} onEdit={() => setEditing(r)} systemOnly />
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

function RoleRow({
  role, canManage, onEdit, onClone, onDelete, systemOnly,
}: {
  role: any;
  canManage: boolean;
  onEdit: () => void;
  onClone?: () => void;
  onDelete?: () => void;
  systemOnly?: boolean;
}) {
  const permCount = role.permissions?.length || 0;
  const userCount = role._count?.users || 0;
  // Show a short permission preview so each row is scannable.
  const previewCodes: string[] = (role.permissions || [])
    .slice(0, 4)
    .map((rp: any) => rp.permission?.code)
    .filter(Boolean);
  const wildcard = (role.permissions || []).some((rp: any) => rp.permission?.code === '*');

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5 hover:bg-slate-50/70 transition-colors">
      <div className="flex items-start gap-3 min-w-0">
        <span className={`w-9 h-9 rounded-xl grid place-items-center flex-shrink-0 ${role.isSystem ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-600'}`}>
          <Shield size={16} />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-900 truncate">{role.name}</span>
            {role.isSystem && <Badge variant="slate">System</Badge>}
            <span className="text-[11px] text-slate-400 font-mono truncate">{role.code}</span>
          </div>
          {role.description && (
            <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{role.description}</div>
          )}
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            {wildcard ? (
              <Badge variant="emerald">Full access · all permissions</Badge>
            ) : permCount === 0 ? (
              <span className="text-[11px] text-slate-400 italic">No permissions yet</span>
            ) : (
              <>
                <span className="text-[11px] font-semibold text-slate-500">
                  {permCount} permission{permCount === 1 ? '' : 's'}
                </span>
                {previewCodes.map((c) => (
                  <span key={c} className="text-[10px] font-mono text-slate-600 bg-slate-100 rounded px-1.5 py-0.5">{c}</span>
                ))}
                {permCount > previewCodes.length && (
                  <span className="text-[10px] text-slate-400">+{permCount - previewCodes.length} more</span>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="text-right hidden sm:block">
          <div className="text-sm font-bold text-slate-700">{userCount}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wider">user{userCount === 1 ? '' : 's'}</div>
        </div>
        {canManage && (
          <div className="flex items-center gap-1">
            <Tooltip content={systemOnly ? 'View role' : 'Edit role'}>
              <Button variant="ghost" size="icon" onClick={onEdit}>
                <Pencil size={14} />
              </Button>
            </Tooltip>
            {!role.isSystem && onClone && (
              <Tooltip content="Clone role">
                <Button variant="ghost" size="icon" onClick={onClone}>
                  <Copy size={14} />
                </Button>
              </Tooltip>
            )}
            {!role.isSystem && onDelete && (
              <Tooltip content="Delete role">
                <Button variant="danger" size="icon" onClick={onDelete}>
                  <Trash2 size={14} />
                </Button>
              </Tooltip>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RoleForm({ initial, permsByModule, permTotal, onClose, onSave }: {
  initial: any;
  permsByModule: Record<string, any[]>;
  permTotal: number;
  onClose: () => void;
  onSave: (data: any) => void;
}) {
  const isClone = !!initial?._isClone;
  const isSystem = !!initial?.isSystem;
  const [f, setF] = useState<any>(initial || {
    code: '', name: '', description: '', permissionCodes: [],
  });
  const [search, setSearch] = useState('');

  // Pre-fill permissionCodes from initial on mount / when switching role
  useEffect(() => {
    if (initial?.permissions) {
      setF((p: any) => ({
        ...p,
        permissionCodes: initial.permissions.map((rp: any) => rp.permission?.code).filter(Boolean),
      }));
    } else if (initial?.permissionCodes) {
      // (e.g. clone seed already carries codes)
      setF((p: any) => ({ ...p, permissionCodes: initial.permissionCodes }));
    } else if (!initial) {
      setF({ code: '', name: '', description: '', permissionCodes: [] });
    }
  }, [initial]);

  const toggle = (code: string) => {
    setF((p: any) => ({
      ...p,
      permissionCodes: p.permissionCodes.includes(code)
        ? p.permissionCodes.filter((c: string) => c !== code)
        : [...p.permissionCodes, code],
    }));
  };

  const toggleModule = (mod: string, allOn: boolean) => {
    const codesInMod = (permsByModule[mod] || []).map((p: any) => p.code);
    setF((p: any) => {
      const existing = new Set(p.permissionCodes);
      if (allOn) codesInMod.forEach((c) => existing.delete(c));
      else codesInMod.forEach((c) => existing.add(c));
      return { ...p, permissionCodes: Array.from(existing) };
    });
  };

  const clearAll = () => setF((p: any) => ({ ...p, permissionCodes: [] }));
  const grantAll = () => setF((p: any) => ({ ...p, permissionCodes: ['*'] }));

  const q = search.trim().toLowerCase();
  const filteredModules = Object.entries(permsByModule).map(([mod, list]) => ({
    mod,
    list: q ? (list as any[]).filter((p) => p.code.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)) : list,
  })).filter((g) => (g.list as any[]).length > 0);

  const selected = f.permissionCodes.length;
  const hasWildcard = f.permissionCodes.includes('*');

  return (
    <div>
      {/* Identity */}
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Code"
          value={f.code ?? ''}
          onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
          disabled={isSystem || (!!initial?.id && !isClone)}
        />
        <Input
          label="Name"
          value={f.name ?? ''}
          onChange={(e) => setF({ ...f, name: e.target.value })}
          disabled={isSystem}
        />
        <div className="col-span-2">
          <Input
            label="Description"
            value={f.description ?? ''}
            onChange={(e) => setF({ ...f, description: e.target.value })}
            disabled={isSystem}
            placeholder="What does this role do? Visible to other admins."
          />
        </div>
      </div>

      {/* Permissions header */}
      <div className="mt-6 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">Permissions</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {hasWildcard ? (
              <span className="text-emerald-700 font-bold">Full access (wildcard *)</span>
            ) : (
              <>
                <strong>{selected}</strong> of {permTotal} selected
              </>
            )}
          </div>
        </div>
        {!isSystem && (
          <div className="flex items-center gap-2">
            {!hasWildcard && (
              <button type="button" onClick={grantAll} className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700">
                Grant all
              </button>
            )}
            {selected > 0 && (
              <button type="button" onClick={clearAll} className="text-[11px] font-bold text-slate-500 hover:text-slate-700">
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Search */}
      {!isSystem && !hasWildcard && (
        <div className="mt-3 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter permissions… (e.g. orders, billing)"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none"
          />
        </div>
      )}

      {/* Permission grid */}
      <div className={`mt-3 space-y-3 max-h-[40vh] overflow-auto pr-2 ${hasWildcard ? 'opacity-60 pointer-events-none' : ''}`}>
        {filteredModules.length === 0 ? (
          <div className="text-center text-xs text-slate-400 py-6">No permissions match &quot;{search}&quot;.</div>
        ) : filteredModules.map(({ mod, list }) => {
          const codesInMod = (list as any[]).map((p: any) => p.code);
          const selectedInMod = codesInMod.filter((c) => f.permissionCodes.includes(c)).length;
          const allOn = selectedInMod === codesInMod.length && codesInMod.length > 0;
          return (
            <div key={mod}>
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">{mod}</div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400">{selectedInMod}/{codesInMod.length}</span>
                  {!isSystem && (
                    <button
                      type="button"
                      onClick={() => toggleModule(mod, allOn)}
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        allOn ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {allOn ? 'Clear module' : 'Select module'}
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(list as any[]).map((p: any) => {
                  const on = f.permissionCodes.includes(p.code);
                  return (
                    <Tooltip key={p.code} content={p.description || p.code}>
                      <button
                        type="button"
                        onClick={() => !isSystem && toggle(p.code)}
                        disabled={isSystem}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold font-mono transition-colors ${
                          on
                            ? 'bg-emerald-500 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        } ${isSystem ? 'cursor-not-allowed' : ''}`}
                      >
                        {p.code}
                      </button>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex gap-2 justify-end pt-4 border-t border-slate-100">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        {!isSystem && (
          <Button
            variant="primary"
            leftIcon={<Save size={14} />}
            onClick={() => {
              const payload = {
                ...f,
                // Strip clone marker before sending
                _isClone: undefined,
                permissions: undefined,
                // Force creation on clone (no id) but preserve id otherwise
                id: isClone ? undefined : f.id,
              };
              onSave(payload);
            }}
            disabled={!f.code || !f.name}
          >
            {isClone ? 'Create copy' : (f.id ? 'Save changes' : 'Create role')}
          </Button>
        )}
      </div>
    </div>
  );
}
