import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { tokenCache, tokenStorage } from '../lib/storage';

// Decode JWT and return its `exp` (Unix seconds) — null if malformed.
export function getTokenExpiry(token: string | null | undefined): number | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    // RN-friendly base64 decode: pad and use atob if available, otherwise Buffer
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '==='.slice((b64.length + 3) % 4);
    const json =
      typeof atob === 'function'
        ? atob(padded)
        : // @ts-ignore — Buffer exists in RN runtime
          Buffer.from(padded, 'base64').toString('utf-8');
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
}

interface Tenant {
  id: string;
  slug: string;
  status: string;
  businessName: string;
  gstin?: string | null;
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
  hydrated: boolean;
  setAuth: (user: User, token: string) => Promise<void>;
  setContext: (data: {
    user?: Partial<User> | null;
    tenant?: Tenant | null;
    plan?: Plan | null;
    subscription?: Subscription | null;
    permissions?: string[];
  }) => void;
  startImpersonation: (tenant: Tenant) => Promise<void>;
  stopImpersonation: () => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: () => boolean;
  hasPermission: (...codes: string[]) => boolean;
  hasFeature: (flag: string) => boolean;
  isPlatformAdmin: () => boolean;
  markHydrated: () => void;
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
      hydrated: false,
      setAuth: async (user, token) => {
        await tokenStorage.set('token', token);
        tokenCache.set(token);
        set({ user, token });
      },
      setContext: ({ user, tenant, plan, subscription, permissions }) =>
        set((s) => ({
          user: user ? ({ ...(s.user as User), ...user } as User) : s.user,
          tenant: tenant ?? s.tenant,
          plan: plan ?? s.plan,
          subscription: subscription ?? s.subscription,
          permissions: permissions ?? s.permissions,
        })),
      startImpersonation: async (tenant) => {
        await tokenStorage.set('impersonate-tenant', tenant.id);
        tokenCache.setImpersonation(tenant.id);
        set({ impersonatingTenant: tenant });
      },
      stopImpersonation: async () => {
        await tokenStorage.remove('impersonate-tenant');
        tokenCache.setImpersonation(null);
        set({ impersonatingTenant: null });
      },
      logout: async () => {
        await tokenStorage.remove('token');
        await tokenStorage.remove('impersonate-tenant');
        tokenCache.set(null);
        tokenCache.setImpersonation(null);
        set({
          user: null,
          token: null,
          tenant: null,
          plan: null,
          subscription: null,
          permissions: [],
          impersonatingTenant: null,
        });
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
      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'kartriq-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        user: s.user,
        token: s.token,
        tenant: s.tenant,
        plan: s.plan,
        subscription: s.subscription,
        permissions: s.permissions,
        impersonatingTenant: s.impersonatingTenant,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.token) tokenCache.set(state.token);
        if (state?.impersonatingTenant?.id)
          tokenCache.setImpersonation(state.impersonatingTenant.id);
        state?.markHydrated();
      },
    }
  )
);
