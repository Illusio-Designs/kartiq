import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token + impersonation tenant id to every request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    const impersonate = localStorage.getItem('impersonate-tenant');
    if (impersonate) config.headers['x-tenant-id'] = impersonate;
  }
  return config;
});

// Handle auth + plan-limit errors globally
type PlanLimitCallback = (info: any) => void;
let onPlanLimitHit: PlanLimitCallback | null = null;
export function setPlanLimitHandler(cb: PlanLimitCallback | null) { onPlanLimitHit = cb; }

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (typeof window !== 'undefined') {
      const status = err.response?.status;
      const url = err.config?.url || '';
      const isAuth = url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/onboard') || url.includes('/auth/google');
      if (status === 401 && !isAuth) {
        localStorage.removeItem('token');
        localStorage.removeItem('kartriq-auth');
        window.location.href = '/login';
      } else if (status === 402 && onPlanLimitHit) {
        onPlanLimitHit(err.response.data || {});
      }
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
  // 2FA / TOTP
  mfaSetup:   () => api.post('/auth/2fa/setup', {}),
  mfaVerify:  (token: string) => api.post('/auth/2fa/verify', { token }),
  mfaDisable: (password: string, token: string) => api.post('/auth/2fa/disable', { password, token }),
  mfaLogin:   (mfaToken: string, token: string) => api.post('/auth/2fa/login', { mfaToken, token }),
  // DPDP / GDPR
  exportMe: () => api.get('/auth/me/export', { responseType: 'blob' }),
  deleteMe: (body: { password?: string; confirmEmail?: string }) =>
    api.post('/auth/me/delete', body),
  // Password reset (public)
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, newPassword: string) =>
    api.post('/auth/reset-password', { token, newPassword }),
};

// ── SaaS: plans (public) ───────────────────────────────────────────
export const planApi = {
  list: () => api.get('/plans'),
  get: (code: string) => api.get(`/plans/${code}`),
};

// ── SaaS: tenant-side billing ──────────────────────────────────────
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
  // Tenant-visible audit log (own tenant only)
  audit: (params?: { limit?: number; action?: string; before?: string }) =>
    api.get('/billing/audit', { params }),
};

// ── OAuth (per-seller channel authorization) ──────────────────────
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
  // Generic poll endpoint — works for every provider
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

// ── SaaS: tenant users ─────────────────────────────────────────────
export const userApi = {
  list: () => api.get('/users'),
  create: (data: any) => api.post('/users', data),
  update: (id: string, data: any) => api.put(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
  permissionCatalog: () => api.get('/users/_permissions/catalog'),
  resendInvite: (id: string) => api.post(`/users/${id}/resend-invite`, {}),
};

// Tenant referral / affiliate program
export const referralApi = {
  me: () => api.get('/referrals/me'),
};

// Public — no auth required
export const inviteApi = {
  preview: (token: string) => api.get(`/auth/invite/${encodeURIComponent(token)}`),
  accept: (data: { token: string; password: string; name?: string }) =>
    api.post('/auth/accept-invite', data),
};

// ── SaaS: payments (Razorpay) ──────────────────────────────────────
// Two flows:
//   1. Plan checkout: checkout(planCode) → Razorpay → verify({...resp,planCode})
//   2. Wallet top-up:  walletCheckout(amount) → Razorpay → walletVerify({...resp,amount})
// Saved methods (cards/UPI tokens) drive the autopay job once a user opts in.
export const paymentApi = {
  // Plan upgrade
  checkout: (data: { planCode: string; billingCycle?: string; savePaymentMethod?: boolean }) =>
    api.post('/payments/checkout', data),
  verify: (data: any) => api.post('/payments/verify', data),
  // Wallet top-up
  walletCheckout: (data: { amount: number; savePaymentMethod?: boolean }) =>
    api.post('/payments/wallet-checkout', data),
  walletVerify: (data: any) => api.post('/payments/wallet-verify', data),
  // Saved methods (autopay)
  methods: () => api.get('/payments/methods'),
  setDefaultMethod: (id: string) => api.post(`/payments/methods/${id}/default`, {}),
  deleteMethod: (id: string) => api.delete(`/payments/methods/${id}`),
  // Platform admin one-click test mode
  applyTestConfig: (data: { keyId: string; keySecret: string; webhookSecret?: string }) =>
    api.post('/payments/test-config', data),
};

// ── SaaS: tenant roles & RBAC ──────────────────────────────────────
export const roleApi = {
  list: () => api.get('/roles'),
  create: (data: any) => api.post('/roles', data),
  update: (id: string, data: any) => api.put(`/roles/${id}`, data),
  delete: (id: string) => api.delete(`/roles/${id}`),
  assign: (userId: string, roleId: string) => api.post('/roles/assign', { userId, roleId }),
  unassign: (userId: string, roleId: string) => api.post('/roles/unassign', { userId, roleId }),
};

// ── Platform admin (SaaS founder) ──────────────────────────────────
export const adminApi = {
  stats: () => api.get('/admin/stats'),
  // plans
  plans: () => api.get('/admin/plans'),
  createPlan: (data: any) => api.post('/admin/plans', data),
  updatePlan: (id: string, data: any) => api.put(`/admin/plans/${id}`, data),
  deletePlan: (id: string) => api.delete(`/admin/plans/${id}`),
  // tenants
  tenants: (params?: any) => api.get('/admin/tenants', { params }),
  tenant: (id: string) => api.get(`/admin/tenants/${id}`),
  updateTenant: (id: string, data: any) => api.put(`/admin/tenants/${id}`, data),
  suspendTenant: (id: string) => api.post(`/admin/tenants/${id}/suspend`, {}),
  activateTenant: (id: string) => api.post(`/admin/tenants/${id}/activate`, {}),
  restoreTenant: (id: string) => api.post(`/admin/tenants/${id}/restore`, {}),
  assignPlan: (id: string, data: any) => api.post(`/admin/tenants/${id}/assign-plan`, data),
  // subscriptions
  subscriptions: () => api.get('/admin/subscriptions'),
  // blog
  blog: () => api.get('/admin/blog'),
  createBlog: (data: any) => api.post('/admin/blog', data),
  updateBlog: (id: string, data: any) => api.put(`/admin/blog/${id}`, data),
  deleteBlog: (id: string) => api.delete(`/admin/blog/${id}`),
  // seo
  seo: () => api.get('/admin/seo'),
  upsertSeo: (data: any) => api.put('/admin/seo', data),
  deleteSeo: (id: string) => api.delete(`/admin/seo/${id}`),
  // permissions catalog
  permissions: () => api.get('/admin/permissions'),
  // public content (CMS)
  content: (type?: string) => api.get('/admin/content', { params: type ? { type } : {} }),
  createContent: (data: any) => api.post('/admin/content', data),
  updateContent: (id: string, data: any) => api.put(`/admin/content/${id}`, data),
  deleteContent: (id: string) => api.delete(`/admin/content/${id}`),
  // audit
  audit: (params?: any) => api.get('/admin/audit', { params }),
  // tickets
  tickets: (params?: any) => api.get('/admin/tickets', { params }),
  ticket: (id: string) => api.get(`/admin/tickets/${id}`),
  replyTicket: (id: string, body: string, status?: string) =>
    api.post(`/admin/tickets/${id}/reply`, { body, status }),
  setTicketStatus: (id: string, status: string) =>
    api.put(`/admin/tickets/${id}/status`, { status }),
  // platform settings
  settings: () => api.get('/admin/settings'),
  updateSetting: (key: string, value: string) => api.put(`/admin/settings/${encodeURIComponent(key)}`, { value }),
  updateSettings: (items: { key: string; value: string }[]) => api.put('/admin/settings', items),
  deleteSetting: (key: string) => api.delete(`/admin/settings/${encodeURIComponent(key)}`),
  // background job queue
  jobsStats: () => api.get('/admin/jobs'),
  jobsList: (params?: { status?: string; type?: string; limit?: number }) =>
    api.get('/admin/jobs/list', { params }),
  jobsRetry: (id: string) => api.post(`/admin/jobs/${id}/retry`, {}),
  jobsDiscard: (id: string) => api.delete(`/admin/jobs/${id}`),
  jobsPurge: (body?: { doneOlderThanDays?: number; deadOlderThanDays?: number }) =>
    api.post('/admin/jobs/purge', body || {}),
  // email diagnostics
  emailTest: (to: string) => api.post('/admin/email/test', { to }),
};

// ── Public CMS (blog, seo, sitemap, stats, content) ────────────────
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

// ── Leads / demo requests ──────────────────────────────────────────
// Public POST is unauthenticated; admin endpoints are platform-admin-only.
export type LeadSource = 'demo' | 'contact' | 'pricing' | 'footer' | 'other';
export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'WON' | 'LOST';

export interface LeadInput {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  subject?: string;
  message?: string;
  source?: LeadSource;
  metadata?: Record<string, any>;
}

// ── Help & Support FAQs ────────────────────────────────────────────
// Public GET is unauthenticated; admin endpoints are platform-admin-only.
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
  // Pass audience='tenant' (or 'founder') to receive only rows tagged
  // for that audience, plus universal 'all' rows. Without it the API
  // returns only 'all'.
  faqs: (audience?: ContentAudience) =>
    api.get('/help/faqs', { params: audience ? { audience } : {} }),
  adminFaqs: () => api.get('/help/admin/faqs'),
  adminFaq: (id: string) => api.get(`/help/admin/faqs/${id}`),
  adminCreateFaq: (data: { question: string; answer: string; category?: string | null; sortOrder?: number; isPublished?: boolean; audience?: ContentAudience }) =>
    api.post('/help/admin/faqs', data),
  adminUpdateFaq: (id: string, data: Partial<{ question: string; answer: string; category: string | null; sortOrder: number; isPublished: boolean; audience: ContentAudience }>) =>
    api.patch(`/help/admin/faqs/${id}`, data),
  adminReorderFaqs: (items: { id: string; sortOrder: number }[]) =>
    api.post('/help/admin/faqs/reorder', items),
  adminDeleteFaq: (id: string) => api.delete(`/help/admin/faqs/${id}`),
};

// ── Notifications inbox ───────────────────────────────────────────
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

interface ListParams {
  unreadOnly?: boolean;
  category?: NotificationCategory | '';
  limit?: number;
  offset?: number;
}

export const notificationApi = {
  // Tenant inbox — current user's notifications (broadcast + targeted)
  list: (params: ListParams = {}) =>
    api.get<InboxListResponse>('/notifications', { params }),
  unreadCount: () => api.get<{ count: number }>('/notifications/unread-count'),
  markRead: (id: string) => api.post(`/notifications/${id}/read`, {}),
  markAllRead: () => api.post('/notifications/read-all', {}),
  remove: (id: string) => api.delete(`/notifications/${id}`),
  clearRead: () => api.delete('/notifications'),

  // Platform inbox — founders only
  platformList: (params: ListParams = {}) =>
    api.get<InboxListResponse>('/notifications/platform', { params }),
  platformUnreadCount: () => api.get<{ count: number }>('/notifications/platform/unread-count'),
  platformMarkRead: (id: string) => api.post(`/notifications/platform/${id}/read`, {}),
  platformMarkAllRead: () => api.post('/notifications/platform/read-all', {}),
  platformRemove: (id: string) => api.delete(`/notifications/platform/${id}`),
};

// ── Changelog ("What's new") ───────────────────────────────────────
// Public GET is unauthenticated; admin endpoints are platform-admin-only.
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
}

export const changelogApi = {
  list: (audience?: ContentAudience) =>
    api.get('/changelog', { params: audience ? { audience } : {} }),
  adminList: () => api.get('/changelog/admin'),
  adminGet: (id: string) => api.get(`/changelog/admin/${id}`),
  adminCreate: (data: { title: string; tag: ChangelogTag; highlights: string[]; isPublished?: boolean; publishedAt?: string | null; audience?: ContentAudience }) =>
    api.post('/changelog/admin', data),
  adminUpdate: (id: string, data: Partial<{ title: string; tag: ChangelogTag; highlights: string[]; isPublished: boolean; publishedAt: string | null; audience: ContentAudience }>) =>
    api.patch(`/changelog/admin/${id}`, data),
  adminDelete: (id: string) => api.delete(`/changelog/admin/${id}`),
};

export const leadsApi = {
  // Public — no auth required
  submit: (data: LeadInput) => api.post('/leads', data),
  // Admin — platform-admin only
  list: (params?: { search?: string; status?: LeadStatus | ''; source?: LeadSource | ''; page?: number; limit?: number }) =>
    api.get('/leads/admin', { params }),
  get: (id: string) => api.get(`/leads/admin/${id}`),
  update: (id: string, data: { status?: LeadStatus; notes?: string | null }) =>
    api.patch(`/leads/admin/${id}`, data),
  delete: (id: string) => api.delete(`/leads/admin/${id}`),
};

export const dashboardApi = {
  get: () => api.get('/dashboard'),
};

export const productApi = {
  list: (params?: any) => api.get('/products', { params }),
  get: (id: string) => api.get(`/products/${id}`),
  create: (data: any) => api.post('/products', data),
  update: (id: string, data: any) => api.put(`/products/${id}`, data),
  delete: (id: string) => api.delete(`/products/${id}`),
  addVariant: (id: string, data: any) => api.post(`/products/${id}/variants`, data),
  categories: () => api.get('/products/categories'),
  brands: () => api.get('/products/brands'),
  // Push product changes (title, price, stock, images) to every channel it's listed on
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
  // Review requests — triggered N hours after delivery
  requestReview: (id: string) => api.post(`/orders/${id}/request-review`, {}),
  processReviewQueue: (body?: { delayHours?: number; limit?: number }) =>
    api.post('/orders/process-review-queue', body || {}),
  // Warehouse routing
  routingSuggestion: (id: string) => api.get(`/orders/${id}/routing`),
  assignWarehouse: (id: string, body: { warehouseId?: string; auto?: boolean }) =>
    api.patch(`/orders/${id}/warehouse`, body),
  // RTO risk scoring + approval
  scoreRto: (id: string) => api.post(`/orders/${id}/rto/score`, {}),
  approve: (id: string) => api.post(`/orders/${id}/approve`, {}),
  reject: (id: string, reason?: string) => api.post(`/orders/${id}/reject`, { reason }),
  enrich: (id: string, body: any) => api.patch(`/orders/${id}/enrich`, body),
  setFulfillment: (id: string, body: { fulfillmentType: 'SELF' | 'CHANNEL' | 'DROPSHIP'; channelFulfillmentCenter?: string }) =>
    api.patch(`/orders/${id}/fulfillment`, body),
};

export const warehouseApi = {
  list: () => api.get('/warehouses'),
  get: (id: string) => api.get(`/warehouses/${id}`),
  create: (data: any) => api.post('/warehouses', data),
  update: (id: string, data: any) => api.put(`/warehouses/${id}`, data),
  delete: (id: string) => api.delete(`/warehouses/${id}`),
};

export const shipmentApi = {
  list: (params?: any) => api.get('/shipments', { params }),
  get: (id: string) => api.get(`/shipments/${id}`),
  create: (data: any) => api.post('/shipments', data),
  updateStatus: (id: string, status: string) => api.patch(`/shipments/${id}/status`, { status }),
  delete: (id: string) => api.delete(`/shipments/${id}`),
};

// ─── Channels ──────────────────────────────────────────────────────────────
// Covers: CRUD, global catalog browser, integration requests, connect/test,
// order/inventory sync, listings (SKU mappings), shipping operations.
export const channelApi = {
  // Connected channels CRUD
  list: (params?: { category?: string }) => api.get('/channels', { params }),
  get: (id: string) => api.get(`/channels/${id}`),
  create: (data: { name: string; type: string; category?: string }) =>
    api.post('/channels', data),
  update: (id: string, data: any) => api.put(`/channels/${id}`, data),
  delete: (id: string) => api.delete(`/channels/${id}`),

  // Global catalog — all channels in the market + connection status
  catalog: (params?: { category?: string }) => api.get('/channels/catalog', { params }),
  catalogEntry: (type: string) => api.get(`/channels/catalog/${type}`),
  requestIntegration: (type: string, data?: { notes?: string; name?: string }) =>
    api.post(`/channels/catalog/${type}/request`, data || {}),

  // Integration requests (admin/user workflow)
  listRequests: (params?: { status?: string; type?: string; category?: string }) =>
    api.get('/channels/requests', { params }),
  getRequest: (id: string) => api.get(`/channels/requests/${id}`),
  updateRequest: (id: string, data: { status?: string; adminNotes?: string }) =>
    api.patch(`/channels/requests/${id}`, data),
  deleteRequest: (id: string) => api.delete(`/channels/requests/${id}`),

  // Credentials & connection
  connect: (id: string, credentials: Record<string, any>) =>
    api.post(`/channels/${id}/connect`, credentials),
  test: (id: string) => api.get(`/channels/${id}/test`),

  // Order & inventory sync
  syncOrders: (id: string, body?: { since?: string }) =>
    api.post(`/channels/${id}/sync/orders`, body || {}),
  syncInventory: (id: string) => api.post(`/channels/${id}/sync/inventory`, {}),
  pullCatalog: (id: string) => api.post(`/channels/${id}/pull-catalog`, {}),

  // SKU mappings (ChannelListing)
  listListings: (id: string) => api.get(`/channels/${id}/listings`),
  createListing: (id: string, data: any) => api.post(`/channels/${id}/listings`, data),
  deleteListing: (id: string, sku: string) => api.delete(`/channels/${id}/listings/${sku}`),

  // Shipping channels
  shippingRates: (id: string, data: any) => api.post(`/channels/${id}/shipping/rates`, data),
  createShipment: (id: string, data: { orderId: string; warehouseId?: string }) =>
    api.post(`/channels/${id}/shipping/create`, data),
  trackShipment: (id: string, awb: string) => api.get(`/channels/${id}/shipping/track/${awb}`),
  cancelShipment: (id: string, data: { awb?: string; awbs?: string[] }) =>
    api.post(`/channels/${id}/shipping/cancel`, data),
  pickupLocations: (id: string) => api.get(`/channels/${id}/shipping/pickups`),

  // Amazon MCF (Smart Biz)
  mcfFulfill: (id: string, orderId: string) =>
    api.post(`/channels/${id}/mcf/fulfill`, { orderId }),
  mcfTrack: (id: string, orderNumber: string) => api.get(`/channels/${id}/mcf/track/${orderNumber}`),
  mcfCancel: (id: string, orderNumber: string) =>
    api.post(`/channels/${id}/mcf/cancel`, { orderNumber }),
  mcfInventory: (id: string) => api.get(`/channels/${id}/mcf/inventory`),

  // Finances / settlements (payouts) — Amazon SP-API financialEventGroups
  financesSync: (id: string, body?: { since?: string }) =>
    api.post(`/channels/${id}/finances/sync`, body || {}),
  finances: (id: string, params?: { limit?: number }) =>
    api.get(`/channels/${id}/finances`, { params }),

  // Returns (read-only) — Amazon merchant returns report
  returnsSync: (id: string, body?: { since?: string }) =>
    api.post(`/channels/${id}/returns/sync`, body || {}),
  returns: (id: string, params?: { limit?: number }) =>
    api.get(`/channels/${id}/returns`, { params }),
};

export const customerApi = {
  list: (params?: any) => api.get('/customers', { params }),
  get: (id: string) => api.get(`/customers/${id}`),
  create: (data: any) => api.post('/customers', data),
  update: (id: string, data: any) => api.put(`/customers/${id}`, data),
  delete: (id: string) => api.delete(`/customers/${id}`),
};

export const reportApi = {
  sales: (params?: any) => api.get('/reports/sales', { params }),
  inventoryValuation: () => api.get('/reports/inventory-valuation'),
  topProducts: (params?: any) => api.get('/reports/top-products', { params }),
};
