import axios from 'axios';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { tokenCache, tokenStorage } from './storage';

const baseURL =
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ||
  'https://api.kartriq.com/api/v1';

const api = axios.create({
  baseURL,
  // Identify this client as the mobile device class so the backend's single-
  // session guard keeps it independent from a web/PC session (one of each may
  // be signed in at once).
  headers: { 'Content-Type': 'application/json', 'X-Client-Type': 'mobile' },
});

api.interceptors.request.use((config) => {
  const token = tokenCache.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const impersonate = tokenCache.getImpersonation();
  if (impersonate) config.headers['x-tenant-id'] = impersonate;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const url = err.config?.url || '';
    const isAuthRoute = url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/google') || url.includes('/auth/onboard');
    if (err.response?.status === 401 && !isAuthRoute && tokenCache.get()) {
      tokenCache.set(null);
      await tokenStorage.remove('token');
      router.replace('/login');
    }
    return Promise.reject(err);
  }
);

export default api;

// ── API helpers ──────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
  register: (data: any) => api.post('/auth/register', data),
  google: (credential: string) => api.post('/auth/google', { credential }),
  me: () => api.get('/auth/me'),
  onboard: (data: any) => api.post('/auth/onboard', data),
  logout: () => api.post('/auth/logout', {}),
  updateMe: (data: { name?: string; phone?: string }) => api.patch('/auth/me', data),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
};

export const planApi = {
  list: () => api.get('/plans'),
  get: (code: string) => api.get(`/plans/${code}`),
};

export const billingApi = {
  subscription: () => api.get('/billing/subscription'),
  usage: () => api.get('/billing/usage'),
  changePlan: (data: { planCode: string; billingCycle?: string; payAsYouGo?: boolean }) =>
    api.post('/billing/subscription/change', data),
  togglePayg: (enabled: boolean) => api.post('/billing/subscription/payg', { enabled }),
  toggleAutoRenew: (enabled: boolean) => api.post('/billing/subscription/auto-renew', { enabled }),
  cancel: () => api.post('/billing/subscription/cancel', {}),
  invoices: () => api.get('/billing/invoices'),
  // Wallet
  wallet: () => api.get('/billing/wallet'),
  walletTransactions: (limit?: number) => api.get('/billing/wallet/transactions', { params: { limit } }),
  topupWallet: (amount: number, paymentRef?: string) =>
    api.post('/billing/wallet/topup', { amount, paymentRef }),
  walletSettings: (body: {
    lowBalanceThreshold?: number;
    autoTopupEnabled?: boolean;
    autoTopupAmount?: number;
    autoTopupTriggerBelow?: number;
  }) => api.patch('/billing/wallet/settings', body),
  updateTenant: (data: { businessName?: string; gstin?: string }) =>
    api.patch('/billing/tenant', data),
  // Tenant-visible audit log (own tenant only) — same endpoint the web
  // /audit page uses. The platform-wide /admin/audit feed stays
  // desktop-only since founders run admin from a real keyboard.
  audit: (params?: { limit?: number; action?: string; before?: string }) =>
    api.get<AuditRow[]>('/billing/audit', { params }),
};

export interface AuditRow {
  id: string;
  userId: string | null;
  userEmail: string | null;
  action: string;
  resource: string | null;
  resourceId: string | null;
  ip: string | null;
  method: string | null;
  path: string | null;
  statusCode: number | null;
  metadata: unknown;
  createdAt: string;
}

export const userApi = {
  list: () => api.get('/users'),
  create: (data: any) => api.post('/users', data),
  update: (id: string, data: any) => api.put(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
  permissionCatalog: () => api.get('/users/_permissions/catalog'),
};

// Push-notification device registration (mobile only)
export const devicesApi = {
  register: (body: { token: string; platform: string; deviceName?: string | null }) =>
    api.post('/devices/register', body),
  unregister: (token: string) => api.post('/devices/unregister', { token }),
};

// ── OAuth (per-seller channel authorization) ──────────────────────
// Each *Start endpoint returns { url } that the mobile app should open in
// an in-app browser; the callback redirects back to the deep-link scheme.
export const oauthApi = {
  amazonStart:  (channelId: string, region?: string) =>
    api.get('/oauth/amazon/start', { params: { channelId, ...(region ? { region } : {}) } }),
  shopifyStart: (channelId: string, shop: string) =>
    api.get('/oauth/shopify/start', { params: { channelId, shop } }),
  flipkartStart: (channelId: string) =>
    api.get('/oauth/flipkart/start', { params: { channelId } }),
  metaStart: (channelId: string) =>
    api.get('/oauth/meta/start', { params: { channelId } }),
  lazadaStart: (channelId: string, region: string) =>
    api.get('/oauth/lazada/start', { params: { channelId, region } }),
  shopeeStart: (channelId: string, region: string) =>
    api.get('/oauth/shopee/start', { params: { channelId, region } }),
  mercadoLibreStart: (channelId: string, region: string) =>
    api.get('/oauth/mercadolibre/start', { params: { channelId, region } }),
  allegroStart: (channelId: string, sandbox: boolean) =>
    api.get('/oauth/allegro/start', { params: { channelId, sandbox: String(sandbox) } }),
  wishStart: (channelId: string) =>
    api.get('/oauth/wish/start', { params: { channelId } }),
  status: (provider: string, channelId: string) =>
    api.get(`/oauth/${provider}/status`, { params: { channelId } }),
  amazonStatus: (channelId: string) =>
    api.get('/oauth/amazon/status', { params: { channelId } }),
};

// ── Support tickets ────────────────────────────────────────────────
export const ticketApi = {
  list: () => api.get('/tickets'),
  get: (id: string) => api.get(`/tickets/${id}`),
  create: (data: { subject: string; body: string; priority?: string; category?: string }) =>
    api.post('/tickets', data),
  reply: (id: string, body: string) => api.post(`/tickets/${id}/reply`, { body }),
  close: (id: string) => api.post(`/tickets/${id}/close`, {}),
};

// ── In-app notifications inbox ─────────────────────────────────────
// Mirrors the web frontend's notificationApi. Tenant feed only — the
// platform inbox is desktop-only since founders don't operate the
// platform from a phone today.
export type NotificationCategory =
  | 'orders' | 'inventory' | 'tickets' | 'leads' | 'payments'
  | 'signup' | 'system' | 'plan' | 'channel' | 'team';
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';

export interface InboxNotification {
  id: string;
  scope: 'tenant' | 'platform';
  tenantId: string | null;
  userId: string | null;
  type: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  link: string | null;
  metadata: Record<string, any> | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface InboxListResponse {
  notifications: InboxNotification[];
  total: number;
  unread: number;
  limit: number;
  offset: number;
}

export const notificationApi = {
  list: (params: { unreadOnly?: boolean; category?: NotificationCategory; limit?: number; offset?: number } = {}) =>
    api.get<InboxListResponse>('/notifications', { params }),
  unreadCount: () => api.get<{ count: number }>('/notifications/unread-count'),
  markRead: (id: string) => api.post(`/notifications/${id}/read`, {}),
  markAllRead: () => api.post('/notifications/read-all', {}),
  remove: (id: string) => api.delete(`/notifications/${id}`),
  clearRead: () => api.delete('/notifications'),
};

// ── Help & Support FAQs ────────────────────────────────────────────
// Public GET; pass audience='tenant' so we never see founder-only rows.
export type ContentAudience = 'all' | 'tenant' | 'founder';

export interface HelpFaq {
  id: string;
  question: string;
  answer: string;
  category?: string | null;
  sortOrder: number;
  isPublished: boolean;
  audience: ContentAudience;
  createdAt: string;
  updatedAt: string;
}

export const helpApi = {
  faqs: (audience: ContentAudience = 'tenant') =>
    api.get<HelpFaq[]>('/help/faqs', { params: { audience } }),
};

// ── Changelog ("What's new") ───────────────────────────────────────
// CMS-backed by /admin/changelog on the founder side. Mobile is read-only.
export type ChangelogTag = 'feature' | 'fix' | 'security' | 'improve';

export interface ChangelogEntry {
  id: string;
  title: string;
  tag: ChangelogTag;
  highlights: string[];
  publishedAt?: string | null;
  isPublished: boolean;
  audience: ContentAudience;
  createdAt: string;
  updatedAt: string;
  // Public list endpoint flattens to a `date` field (publishedAt or createdAt)
  date?: string | null;
}

export const changelogApi = {
  list: (audience: ContentAudience = 'tenant') =>
    api.get<ChangelogEntry[]>('/changelog', { params: { audience } }),
};

// ── Razorpay checkout / verification ──────────────────────────────
// Plan flow:    checkout(planCode) → react-native-razorpay → verify(...)
// Wallet flow:  walletCheckout(amount) → react-native-razorpay → walletVerify(...)
// Methods:      methods() / setDefaultMethod(id) / deleteMethod(id)  drive
//               the backend autopay job for wallet auto top-ups.
export const paymentApi = {
  checkout: (data: { planCode: string; billingCycle?: string; savePaymentMethod?: boolean }) =>
    api.post('/payments/checkout', data),
  verify: (data: any) => api.post('/payments/verify', data),
  walletCheckout: (data: { amount: number; savePaymentMethod?: boolean }) =>
    api.post('/payments/wallet-checkout', data),
  walletVerify: (data: any) => api.post('/payments/wallet-verify', data),
  methods: () => api.get('/payments/methods'),
  setDefaultMethod: (id: string) => api.post(`/payments/methods/${id}/default`, {}),
  deleteMethod: (id: string) => api.delete(`/payments/methods/${id}`),
};

// ── Public CMS (no auth required — used by the marketing/onboarding flow) ──
export const publicApi = {
  blog: () => api.get('/public/blog'),
  blogPost: (slug: string) => api.get(`/public/blog/${slug}`),
  seo: (path: string) => api.get('/public/seo', { params: { path } }),
  sitemap: () => api.get('/public/sitemap'),
  stats: () => api.get('/public/stats'),
  integrations: () => api.get('/public/integrations'),
  content: (type: string) => api.get('/public/content', { params: { type } }),
  tracking: () => api.get('/public/tracking'),
  maintenance: () => api.get('/public/maintenance'),
};

export const roleApi = {
  list: () => api.get('/roles'),
  create: (data: any) => api.post('/roles', data),
  update: (id: string, data: any) => api.put(`/roles/${id}`, data),
  delete: (id: string) => api.delete(`/roles/${id}`),
  assign: (userId: string, roleId: string) => api.post('/roles/assign', { userId, roleId }),
  unassign: (userId: string, roleId: string) => api.post('/roles/unassign', { userId, roleId }),
};

export const adminApi = {
  stats: () => api.get('/admin/stats'),
  plans: () => api.get('/admin/plans'),
  createPlan: (data: any) => api.post('/admin/plans', data),
  updatePlan: (id: string, data: any) => api.put(`/admin/plans/${id}`, data),
  deletePlan: (id: string) => api.delete(`/admin/plans/${id}`),
  tenants: (params?: any) => api.get('/admin/tenants', { params }),
  tenant: (id: string) => api.get(`/admin/tenants/${id}`),
  updateTenant: (id: string, data: any) => api.put(`/admin/tenants/${id}`, data),
  suspendTenant: (id: string) => api.post(`/admin/tenants/${id}/suspend`, {}),
  activateTenant: (id: string) => api.post(`/admin/tenants/${id}/activate`, {}),
  assignPlan: (id: string, data: any) => api.post(`/admin/tenants/${id}/assign-plan`, data),
  subscriptions: () => api.get('/admin/subscriptions'),
  permissions: () => api.get('/admin/permissions'),
  settings: () => api.get('/admin/settings'),
  updateSetting: (key: string, value: string) =>
    api.put(`/admin/settings/${encodeURIComponent(key)}`, { value }),
  updateSettings: (items: { key: string; value: string }[]) => api.put('/admin/settings', items),
  deleteSetting: (key: string) => api.delete(`/admin/settings/${encodeURIComponent(key)}`),
};

export const dashboardApi = { get: () => api.get('/dashboard') };

export const productApi = {
  list: (params?: any) => api.get('/products', { params }),
  get: (id: string) => api.get(`/products/${id}`),
  create: (data: any) => api.post('/products', data),
  update: (id: string, data: any) => api.put(`/products/${id}`, data),
  delete: (id: string) => api.delete(`/products/${id}`),
  addVariant: (id: string, data: any) => api.post(`/products/${id}/variants`, data),
  categories: () => api.get('/products/categories'),
  brands: () => api.get('/products/brands'),
  syncChannels: (id: string, channelIds?: string[]) =>
    api.post(`/products/${id}/sync-channels`, { channelIds }),
};

export const inventoryApi = {
  list: (params?: any) => api.get('/inventory', { params }),
  lowStock: () => api.get('/inventory/low-stock'),
  movements: (params?: any) => api.get('/inventory/movements', { params }),
  adjust: (data: any) => api.post('/inventory/adjust', data),
};

export const orderApi = {
  list: (params?: any) => api.get('/orders', { params }),
  get: (id: string) => api.get(`/orders/${id}`),
  create: (data: any) => api.post('/orders', data),
  updateStatus: (id: string, data: any) => api.patch(`/orders/${id}/status`, data),
  cancel: (id: string) => api.patch(`/orders/${id}/cancel`, {}),
  requestReview: (id: string) => api.post(`/orders/${id}/request-review`, {}),
  routingSuggestion: (id: string) => api.get(`/orders/${id}/routing`),
  assignWarehouse: (id: string, body: { warehouseId?: string; auto?: boolean }) =>
    api.patch(`/orders/${id}/warehouse`, body),
  scoreRto: (id: string) => api.post(`/orders/${id}/rto/score`, {}),
  approve: (id: string) => api.post(`/orders/${id}/approve`, {}),
  reject: (id: string, reason?: string) => api.post(`/orders/${id}/reject`, { reason }),
  enrich: (id: string, body: any) => api.patch(`/orders/${id}/enrich`, body),
  setFulfillment: (id: string, body: { fulfillmentType: 'SELF' | 'CHANNEL' | 'DROPSHIP'; channelFulfillmentCenter?: string }) =>
    api.patch(`/orders/${id}/fulfillment`, body),
};

export const purchaseApi = {
  list: (params?: any) => api.get('/purchases', { params }),
  get: (id: string) => api.get(`/purchases/${id}`),
  create: (data: any) => api.post('/purchases', data),
  updateStatus: (id: string, status: string) =>
    api.patch(`/purchases/${id}/status`, { status }),
};

export const vendorApi = {
  list: () => api.get('/vendors'),
  get: (id: string) => api.get(`/vendors/${id}`),
  create: (data: any) => api.post('/vendors', data),
  update: (id: string, data: any) => api.put(`/vendors/${id}`, data),
  delete: (id: string) => api.delete(`/vendors/${id}`),
};

export const warehouseApi = {
  list: () => api.get('/warehouses'),
  get: (id: string) => api.get(`/warehouses/${id}`),
  create: (data: any) => api.post('/warehouses', data),
  update: (id: string, data: any) => api.put(`/warehouses/${id}`, data),
  delete: (id: string) => api.delete(`/warehouses/${id}`),
};

export const channelApi = {
  list: (params?: { category?: string }) => api.get('/channels', { params }),
  get: (id: string) => api.get(`/channels/${id}`),
  create: (data: { name: string; type: string; category?: string }) =>
    api.post('/channels', data),
  update: (id: string, data: any) => api.put(`/channels/${id}`, data),
  delete: (id: string) => api.delete(`/channels/${id}`),
  catalog: (params?: { category?: string }) => api.get('/channels/catalog', { params }),
  catalogEntry: (type: string) => api.get(`/channels/catalog/${type}`),
  requestIntegration: (type: string, data?: { notes?: string; name?: string }) =>
    api.post(`/channels/catalog/${type}/request`, data || {}),
  listRequests: (params?: { status?: string; type?: string; category?: string }) =>
    api.get('/channels/requests', { params }),
  connect: (id: string, credentials: Record<string, any>) =>
    api.post(`/channels/${id}/connect`, credentials),
  test: (id: string) => api.get(`/channels/${id}/test`),
  syncOrders: (id: string, body?: { since?: string }) =>
    api.post(`/channels/${id}/sync/orders`, body || {}),
  syncInventory: (id: string) => api.post(`/channels/${id}/sync/inventory`, {}),
  listListings: (id: string) => api.get(`/channels/${id}/listings`),
  createListing: (id: string, data: any) => api.post(`/channels/${id}/listings`, data),
  shippingRates: (id: string, data: any) => api.post(`/channels/${id}/shipping/rates`, data),
  createShipment: (id: string, data: { orderId: string; warehouseId?: string }) =>
    api.post(`/channels/${id}/shipping/create`, data),
  trackShipment: (id: string, awb: string) => api.get(`/channels/${id}/shipping/track/${awb}`),
  cancelShipment: (id: string, data: { awb?: string; awbs?: string[] }) =>
    api.post(`/channels/${id}/shipping/cancel`, data),
};

export const customerApi = {
  list: (params?: any) => api.get('/customers', { params }),
  get: (id: string) => api.get(`/customers/${id}`),
  create: (data: any) => api.post('/customers', data),
  update: (id: string, data: any) => api.put(`/customers/${id}`, data),
  delete: (id: string) => api.delete(`/customers/${id}`),
};

export const invoiceApi = {
  list: (params?: any) => api.get('/invoices', { params }),
  get: (id: string) => api.get(`/invoices/${id}`),
  pay: (id: string, data: { amount?: number; method?: string; reference?: string }) =>
    api.post(`/invoices/${id}/pay`, data),
  delete: (id: string) => api.delete(`/invoices/${id}`),
};

export const shipmentApi = {
  list: (params?: any) => api.get('/shipments', { params }),
  get: (id: string) => api.get(`/shipments/${id}`),
  create: (data: any) => api.post('/shipments', data),
  updateStatus: (id: string, status: string) =>
    api.patch(`/shipments/${id}/status`, { status }),
  delete: (id: string) => api.delete(`/shipments/${id}`),
};

export const reportApi = {
  sales: (params?: any) => api.get('/reports/sales', { params }),
  inventoryValuation: () => api.get('/reports/inventory-valuation'),
  topProducts: (params?: any) => api.get('/reports/top-products', { params }),
};
