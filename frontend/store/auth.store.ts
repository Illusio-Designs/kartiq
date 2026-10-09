import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi } from '@/lib/api';

// Decode JWT and return its `exp` (Unix seconds) — null if malformed.
export function getTokenExpiry(token: string | null | undefined): number | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const { exp } = JSON.parse(json);
    return typeof exp === 'number' ? exp : null;
  } catch {
    return null;
  }
}

// True when token is missing, malformed, or past its `exp`.
export function isTokenExpired(token: string | null | undefined): boolean {
  const exp = getTokenExpiry(token);
  if (exp === null) return true;
  return Date.now() / 1000 >= exp;
}

interface User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  tenantId?: string | null;
  isPlatformAdmin?: boolean;
  avatar?: string | null;
  mfaEnabled?: boolean;
  provider?: string | null;
}

interface Tenant {
  id: string;
  slug: string;
  status: string;
  businessName: string;
  gstin?: string | null;
  /** true only for the sandbox demo tenant (fake Amazon) */
}

interface Plan {
  id: string;
  code: string;
  name: string;
  features: Record<string, any>;
}

interface Subscription {
  id: string;
  status: string;
  currentPeriodEnd: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  tenant: Tenant | null;
  plan: Plan | null;
  subscription: Subscription | null;
  permissions: string[];
  impersonatingTenant: Tenant | null;
  setAuth: (user: User, token: string) => void;
  setContext: (data: { user?: Partial<User> | null; tenant?: Tenant | null; plan?: Plan | null; subscription?: Subscription | null; permissions?: string[] }) => void;
  startImpersonation: (tenant: Tenant) => void;
  stopImpersonation: () => void;
  logout: () => void;
  isAuthenticated: () => boolean;
  hasPermission: (...codes: string[]) => boolean;
  hasFeature: (flag: string) => boolean;
  isPlatformAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      tenant: null,
      plan: null,
      subscription: null,
      permissions: [],
      impersonatingTenant: null,
      setAuth: (user, token) => {
        localStorage.setItem('token', token);
        set({ user, token });
      },
      setContext: ({ user, tenant, plan, subscription, permissions }) =>
        set((s) => ({
          user: user ? { ...(s.user as User), ...user } as User : s.user,
          tenant: tenant ?? s.tenant,
          plan: plan ?? s.plan,
          subscription: subscription ?? s.subscription,
          permissions: permissions ?? s.permissions,
        })),
      startImpersonation: (tenant) => {
        localStorage.setItem('impersonate-tenant', tenant.id);
        set({ impersonatingTenant: tenant });
      },
      stopImpersonation: () => {
        localStorage.removeItem('impersonate-tenant');
        set({ impersonatingTenant: null });
      },
      logout: () => {
        // Invalidate server-side permission cache; ignore network errors
        authApi.logout().catch(() => {});
        localStorage.removeItem('token');
        localStorage.removeItem('impersonate-tenant');
        set({ user: null, token: null, tenant: null, plan: null, subscription: null, permissions: [], impersonatingTenant: null });
      },
      isAuthenticated: () => !!get().token,
      hasPermission: (...codes) => {
        const { permissions, user } = get();
        if (user?.isPlatformAdmin) return true;
        if (permissions.includes('*')) return true;
        return codes.some((c) => permissions.includes(c));
      },
      hasFeature: (flag) => {
        const { plan, user } = get();
        if (user?.isPlatformAdmin) return true;
        return !!plan?.features?.[flag];
      },
      isPlatformAdmin: () => !!get().user?.isPlatformAdmin,
    }),
    { name: 'kartriq-auth' }
  )
);
