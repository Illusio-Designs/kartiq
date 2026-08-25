// Core seed — permissions, plans, founder account, SEO, blog.
// Idempotent (uses upsert). Safe to re-run.

const bcrypt = require('bcryptjs');
require('dotenv').config();
const prisma = require('../utils/prisma');

const PLATFORM_ADMIN_EMAIL    = process.env.PLATFORM_ADMIN_EMAIL    || 'founder@kartriq.com';
const PLATFORM_ADMIN_PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD || 'founder123';
const PLATFORM_ADMIN_NAME     = process.env.PLATFORM_ADMIN_NAME     || 'Platform Founder';

// ───────────────────────────────────────────────
// PERMISSION CATALOG (modules x actions)
// ───────────────────────────────────────────────
const MODULES = {
  products:   ['read', 'create', 'update', 'delete'],
  inventory:  ['read', 'create', 'update', 'delete', 'adjust'],
  orders:     ['read', 'create', 'update', 'delete', 'fulfill', 'cancel'],
  purchases:  ['read', 'create', 'update', 'delete', 'approve'],
  vendors:    ['read', 'create', 'update', 'delete'],
  customers:  ['read', 'create', 'update', 'delete'],
  warehouses: ['read', 'create', 'update', 'delete'],
  channels:   ['read', 'create', 'update', 'delete', 'sync'],
  invoices:   ['read', 'create', 'update', 'delete'],
  reports:    ['read', 'export'],
  returns:    ['read', 'create', 'update', 'approve'],
  shipments:  ['read', 'create', 'update'],
  billing:    ['read', 'manage'],
  users:      ['read', 'create', 'update', 'delete', 'invite'],
  roles:      ['read', 'create', 'update', 'delete'],
  settings:   ['read', 'update'],
};

function buildPermissionCodes() {
  const out = [];
  for (const [mod, actions] of Object.entries(MODULES)) {
    for (const a of actions) out.push({ code: `${mod}.${a}`, module: mod });
  }
  return out;
}

// ───────────────────────────────────────────────
// PLAN CATALOG (matches the public pricing page)
// ───────────────────────────────────────────────
// Plan codes (STANDARD / PROFESSIONAL / BUSINESS / ENTERPRISE) are the
// stable keys referenced everywhere in the codebase (auth.controller,
// billing routes, RBAC etc.). They never change. The `name` field is
// the display label shown on the public pricing page and in-app — that
// IS user-facing, so we use friendlier marketing names here:
//   STANDARD     → Starter
//   PROFESSIONAL → Growth
//   BUSINESS     → Scale
//   ENTERPRISE   → Enterprise
const PLANS = [
  {
    code: 'STANDARD',
    name: 'Starter',
    tagline: 'For micro-businesses launching their first online channels.',
    monthlyPrice: 1499, yearlyPrice: 14990, sortOrder: 1,
    maxFacilities: 1, maxSkus: 10000, maxUserRoles: 3, maxUsers: 2, maxOrdersPerMonth: 500,
    features: {
      maxChannels: 2,
      channelCategories: ['ECOM', 'OWNSTORE', 'CUSTOM', 'LOGISTICS'],
      returns: 'basic', vms: false, paymentReconciliation: true, mobileApp: true,
      purchaseManagement: false, barcoding: false, inwardLogistics: false,
      customReports: false, apiIntegration: false, advancedWarehouseOps: false,
      vendorManagement: false, omniChannel: false, erpIntegration: false,
    },
    meteredRates: { extraOrders: 0.5, extraSkus: 0.1, extraFacilities: 999, extraChannels: 199, extraUsers: 299 },
  },
  {
    code: 'PROFESSIONAL',
    name: 'Growth',
    tagline: 'For growing brands strengthening their multi-channel operations.',
    monthlyPrice: 4999, yearlyPrice: 49990, sortOrder: 2,
    maxFacilities: 2, maxSkus: 50000, maxUserRoles: 5, maxUsers: 5, maxOrdersPerMonth: 2500,
    features: {
      maxChannels: 7,
      channelCategories: ['ECOM', 'OWNSTORE', 'CUSTOM', 'LOGISTICS', 'QUICKCOM', 'SOCIAL'],
      returns: 'enhanced', vms: true, paymentReconciliation: true, mobileApp: true,
      purchaseManagement: true, barcoding: 'sku', inwardLogistics: true,
      customReports: false, apiIntegration: false, advancedWarehouseOps: false,
      vendorManagement: false, omniChannel: false, erpIntegration: false,
    },
    meteredRates: { extraOrders: 0.4, extraSkus: 0.08, extraFacilities: 1499, extraChannels: 149, extraUsers: 249 },
  },
  {
    code: 'BUSINESS',
    name: 'Scale',
    tagline: 'For scaling brands that need full omnichannel coverage and warehouse ops.',
    monthlyPrice: 14999, yearlyPrice: 149990, sortOrder: 3,
    maxFacilities: 5, maxSkus: 200000, maxUserRoles: 10, maxUsers: 15, maxOrdersPerMonth: 10000,
    features: {
      maxChannels: 15,
      channelCategories: ['ECOM', 'OWNSTORE', 'CUSTOM', 'LOGISTICS', 'QUICKCOM', 'SOCIAL', 'B2B'],
      returns: 'enhanced', vms: true, paymentReconciliation: true, mobileApp: true,
      purchaseManagement: true, barcoding: 'sku', inwardLogistics: true,
      customReports: true, apiIntegration: false, advancedWarehouseOps: true,
      vendorManagement: true, omniChannel: true, erpIntegration: false,
    },
    meteredRates: { extraOrders: 0.3, extraSkus: 0.06, extraFacilities: 1999, extraChannels: 99, extraUsers: 199 },
  },
  {
    code: 'ENTERPRISE',
    name: 'Enterprise',
    tagline: 'Custom build for large operations. Contact sales for pricing and onboarding.',
    monthlyPrice: 0, yearlyPrice: 0, sortOrder: 4,
    maxFacilities: null, maxSkus: null, maxUserRoles: null, maxUsers: null, maxOrdersPerMonth: null,
    features: {
      maxChannels: null,
      channelCategories: null, // null = all categories
      contactSales: true,
      returns: 'customized', vms: true, paymentReconciliation: true, mobileApp: true,
      purchaseManagement: true, barcoding: 'item', inwardLogistics: true,
      customReports: true, apiIntegration: true, advancedWarehouseOps: true,
      vendorManagement: true, omniChannel: true, erpIntegration: true,
    },
    meteredRates: {},
  },
];

async function seedPermissions() {
  const codes = buildPermissionCodes();
  for (const p of codes) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { module: p.module },
      create: { code: p.code, module: p.module },
    });
  }
  console.log(`  [seed] ${codes.length} permissions`);
}

async function seedPlans() {
  for (const p of PLANS) {
    await prisma.plan.upsert({
      where: { code: p.code },
      update: {
        name: p.name, tagline: p.tagline, monthlyPrice: p.monthlyPrice,
        yearlyPrice: p.yearlyPrice, sortOrder: p.sortOrder,
        maxFacilities: p.maxFacilities, maxSkus: p.maxSkus,
        maxUserRoles: p.maxUserRoles, maxUsers: p.maxUsers,
        maxOrdersPerMonth: p.maxOrdersPerMonth,
        features: p.features, meteredRates: p.meteredRates,
      },
      create: p,
    });
  }
  console.log(`  [seed] ${PLANS.length} plans`);
}

// ───────────────────────────────────────────────
// PUBLIC CONTENT (landing, nav, footer, etc.)
// ───────────────────────────────────────────────
function mkSlug(type, idx, title) {
  return `${type}-${idx}-${title}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 120);
}

const CONTENT = [
  // ─── Landing page: Business Challenges ─────────────────────────
  { type: 'LANDING_CHALLENGE', title: 'Scattered Data', icon: 'Eye', subtitle: 'Managing massive amounts of data is overwhelming — disconnected sources and complex systems slow you down.' },
  { type: 'LANDING_CHALLENGE', title: 'Manual Workflows', icon: 'Clock', subtitle: 'Teams spend hours on manual order processing, inventory updates, and reconciliation — time that should be spent scaling.', data: { accent: true } },
  { type: 'LANDING_CHALLENGE', title: 'Missed Opportunities', icon: 'AlertTriangle', subtitle: 'Without the right tools, trends and insights get missed. Platforms like ours turn data into action.' },

  // ─── Landing page: Feature Tools ───────────────────────────────
  { type: 'LANDING_FEATURE_TOOL', title: 'AI-Powered Insights', subtitle: 'Leverage cutting-edge AI to uncover hidden patterns and trends in your data, helping you make smarter, data-driven decisions with ease.', data: { visual: 'chart' } },
  { type: 'LANDING_FEATURE_TOOL', title: 'Real-Time Visibility', subtitle: 'Interact with dynamic charts, graphs, and dashboards that update in real-time, offering instant clarity and actionable insights.', data: { visual: 'bar', highlight: true } },
  { type: 'LANDING_FEATURE_TOOL', title: 'Easy Integration', subtitle: 'Seamlessly connect with 56+ tools like Amazon, Flipkart, Shopify and more — smooth data flow across all your favorite platforms.', data: { visual: 'network' } },

  // ─── Landing page: FAQs ────────────────────────────────────────
  { type: 'LANDING_FAQ', title: 'What types of channels can I connect?', body: 'Over 56+ channels including Amazon, Flipkart, Myntra, Meesho, Nykaa, Blinkit, Zepto, Swiggy Instamart, BB Now, Shopify, WooCommerce, Magento, and 16 logistics providers like Shiprocket, Delhivery, iThink, Pickrr, NimbusPost, and ClickPost.' },
  { type: 'LANDING_FAQ', title: 'How secure is my data?', body: 'All credentials are encrypted at rest using AES-256-GCM encryption. Every request uses JWT authentication and HTTPS. You own your data — we never share it with third parties.' },
  { type: 'LANDING_FAQ', title: "What's the difference between Standard, Professional and Enterprise plans?", body: 'Standard suits micro-businesses with 1 facility and basic automation. Professional unlocks purchase management, 2 facilities and 9 user roles. Enterprise adds advanced warehouse ops, custom reports, API integration and vendor management.' },
  { type: 'LANDING_FAQ', title: 'How easy is it to get started?', body: 'Connect your first channel in under 5 minutes — no developers needed. Our setup wizard walks you through authentication, SKU mapping, and initial sync.' },
  { type: 'LANDING_FAQ', title: 'Can I integrate with my existing team tools?', body: 'Yes. Kartriq offers a REST API, webhooks, and native integrations with Slack, Gmail, and popular accounting platforms.' },
  { type: 'LANDING_FAQ', title: 'What support options are available?', body: 'Email support on all plans, priority support on Professional, and 24/7 dedicated account manager on Enterprise. Plus a full help center and community.' },

  // ─── Features page ─────────────────────────────────────────────
  { type: 'FEATURE', title: 'Multi-channel order sync', icon: 'ShoppingCart', subtitle: 'One inbox for every order. Amazon, Flipkart, Myntra, Meesho, Shopify, WooCommerce and 40+ more.', category: 'CORE' },
  { type: 'FEATURE', title: 'Real-time inventory', icon: 'Warehouse', subtitle: 'Live stock levels across every warehouse and every channel. Oversells become impossible.', category: 'CORE' },
  { type: 'FEATURE', title: 'Smart reconciliation', icon: 'Wallet', subtitle: 'Match marketplace payouts to orders automatically. Catch every missing rupee.', category: 'FINANCE' },
  { type: 'FEATURE', title: 'Returns management', icon: 'RotateCcw', subtitle: 'Track returns across channels, generate RMAs, and reconcile refunds in one place.', category: 'OPS' },
  { type: 'FEATURE', title: 'Purchase management', icon: 'TrendingUp', subtitle: 'Create POs, manage vendors, track receipts. Tied directly to inventory forecasts.', category: 'PROCUREMENT' },
  { type: 'FEATURE', title: 'Video management (VMS)', icon: 'Video', subtitle: 'Record packing and dispatch for every order. Dispute-proof your operations.', category: 'OPS' },
  { type: 'FEATURE', title: 'Mobile app', icon: 'Smartphone', subtitle: 'Scan, pick, pack and ship from a handheld. Offline-first.', category: 'OPS' },
  { type: 'FEATURE', title: 'Advanced warehouse ops', icon: 'Boxes', subtitle: 'FIFO picking, cycle counting, bin locations, handheld integration. Built for scale.', category: 'CORE' },
  { type: 'FEATURE', title: 'Custom reports', icon: 'BarChart2', subtitle: 'Build reports by channel, SKU, warehouse, campaign. Export as CSV, Excel or API.', category: 'ANALYTICS' },
  { type: 'FEATURE', title: 'API + webhooks', icon: 'Cable', subtitle: 'Full REST API and webhook subscriptions for every event. Integrate anything.', category: 'DEVELOPER' },
  { type: 'FEATURE', title: 'Role-based access control', icon: 'Shield', subtitle: 'Granular permissions per user. Restrict warehouses, channels, financial data.', category: 'SECURITY' },
  { type: 'FEATURE', title: 'ERP integration', icon: 'Link', subtitle: 'Two-way sync with Tally, Zoho Books, QuickBooks and custom ERPs.', category: 'FINANCE' },

  // ─── Solutions page ────────────────────────────────────────────
  { type: 'SOLUTION', title: 'D2C brands', icon: 'Sparkles', subtitle: 'Unify your Shopify store, marketplace listings, and quick-commerce outlets in one dashboard.', href: '/solutions/d2c', data: { gradient: 'from-emerald-400 to-teal-600' } },
  { type: 'SOLUTION', title: 'Marketplaces', icon: 'ShoppingBag', subtitle: 'Sell on every Indian marketplace — Amazon, Flipkart, Myntra, Meesho, Nykaa — from one hub.', href: '/solutions/marketplaces', data: { gradient: 'from-emerald-500 to-green-600' } },
  { type: 'SOLUTION', title: 'Quick commerce', icon: 'Zap', subtitle: 'Plug into Blinkit, Zepto, Swiggy Instamart and BB Now. Live stock sync across dark stores.', href: '/solutions/quick-commerce', data: { gradient: 'from-teal-400 to-emerald-600' } },
  { type: 'SOLUTION', title: 'Multi-warehouse 3PL', icon: 'Warehouse', subtitle: 'Run fulfilment across multiple warehouses with smart routing, cycle counts and MCF support.', href: '/solutions/3pl', data: { gradient: 'from-green-400 to-emerald-500' } },
  { type: 'SOLUTION', title: 'Beauty & personal care', icon: 'Flower2', subtitle: 'Batch tracking, expiry management, and luxury marketplace integration (Nykaa, Tira, Tata CLiQ).', href: '/solutions/beauty', data: { gradient: 'from-pink-400 to-emerald-500' } },
  { type: 'SOLUTION', title: 'Fashion & apparel', icon: 'Shirt', subtitle: 'Size matrix support, season tagging, returns management, and Myntra/Ajio integration.', href: '/solutions/fashion', data: { gradient: 'from-emerald-400 to-teal-500' } },

  // ─── About page ────────────────────────────────────────────────
  { type: 'ABOUT_SECTION', title: 'Our story', subtitle: 'Built by sellers, for sellers.', body: 'Kartriq was born when a team of ex-Amazon, Flipkart and Shopify engineers watched their friends — indie D2C founders — wrestle with spreadsheets, broken SDK integrations, and payment reconciliation nightmares. We decided to build the tool we wished existed when we were the ones drowning in ops.', icon: 'Heart' },
  { type: 'ABOUT_SECTION', title: 'Our mission', subtitle: "Make multi-channel commerce boringly reliable.", body: 'Sellers shouldn\'t lose sleep over oversells, missed payouts or stock discrepancies. We automate the tedious parts so you can focus on what matters: building great products and serving customers.', icon: 'Target' },
  { type: 'ABOUT_VALUE', title: 'Seller-first', icon: 'Users', subtitle: 'Every feature ships because a real seller asked for it. No vanity metrics, no theoretical use cases.' },
  { type: 'ABOUT_VALUE', title: 'Radical transparency', icon: 'Eye', subtitle: 'Open pricing, open roadmap, open API. No sales calls required to see what you\'re buying.' },
  { type: 'ABOUT_VALUE', title: 'Reliable > flashy', icon: 'Shield', subtitle: 'We\'d rather be the boring tool that never loses your data than the flashy one that does.' },
  { type: 'ABOUT_VALUE', title: 'Built in public', icon: 'MessageSquare', subtitle: 'Public changelog, public metrics, public incident post-mortems. What you see is what you get.' },
  { type: 'ABOUT_TIMELINE', title: '2023 Q1', subtitle: 'Founded. First 10 beta users on Shopify + Amazon.', data: { year: '2023' } },
  { type: 'ABOUT_TIMELINE', title: '2023 Q4', subtitle: '100 paying brands. Added Flipkart, Myntra, Meesho.', data: { year: '2023' } },
  { type: 'ABOUT_TIMELINE', title: '2024 Q3', subtitle: 'Launched quick-commerce integrations (Blinkit, Zepto).', data: { year: '2024' } },
  { type: 'ABOUT_TIMELINE', title: '2025 Q2', subtitle: 'Crossed 1M orders processed. Launched AI forecasting.', data: { year: '2025' } },
  { type: 'ABOUT_TIMELINE', title: '2026 Q1', subtitle: 'Public multi-tenant SaaS launch with 56+ channel integrations.', data: { year: '2026' } },

  // ─── Help center ───────────────────────────────────────────────
  { type: 'HELP_CATEGORY', title: 'Getting started', icon: 'Rocket', subtitle: 'Account setup, onboarding wizard, first channel connection.', href: '/resources/help?topic=getting-started' },
  { type: 'HELP_CATEGORY', title: 'Channels & integrations', icon: 'Plug', subtitle: 'Connecting Amazon, Shopify, Shiprocket and 56+ channels.', href: '/resources/help?topic=channels' },
  { type: 'HELP_CATEGORY', title: 'Orders & fulfilment', icon: 'ShoppingCart', subtitle: 'Syncing orders, printing labels, managing returns.', href: '/resources/help?topic=orders' },
  { type: 'HELP_CATEGORY', title: 'Inventory & warehouses', icon: 'Warehouse', subtitle: 'Stock adjustments, transfers, cycle counts, low-stock alerts.', href: '/resources/help?topic=inventory' },
  { type: 'HELP_CATEGORY', title: 'Billing & subscriptions', icon: 'CreditCard', subtitle: 'Plans, upgrades, invoices, pay-as-you-go metering.', href: '/resources/help?topic=billing' },
  { type: 'HELP_CATEGORY', title: 'API & webhooks', icon: 'Code', subtitle: 'REST API reference, webhook payloads, authentication.', href: '/resources/help?topic=api' },
  { type: 'HELP_FAQ', title: 'How do I connect my first channel?', body: 'Go to Dashboard > Channels > pick a channel > click Connect. For Amazon use the one-click OAuth flow; for other channels paste your API credentials.', category: 'getting-started' },
  { type: 'HELP_FAQ', title: 'Why are my orders not syncing?', body: 'Check the channel detail page — any sync errors show up in a red banner. Common causes: expired credentials, IP whitelisting, or rate limits. Click Test Connection to diagnose.', category: 'orders' },
  { type: 'HELP_FAQ', title: 'How do SKU mappings work?', body: 'Each channel listing maps a marketplace SKU to your Kartriq variant. When an order arrives, we look up the mapping to find the right variant and decrement the right inventory row.', category: 'channels' },
  { type: 'HELP_FAQ', title: 'What happens when I hit my plan limit?', body: 'If pay-as-you-go is enabled, extra orders/SKUs are billed at your plan\'s overage rate. Otherwise you\'ll be blocked until you upgrade or the next billing period starts.', category: 'billing' },
  { type: 'HELP_FAQ', title: 'How do I upgrade or downgrade my plan?', body: 'Dashboard > Billing > click the target plan > complete checkout. Upgrades take effect immediately; downgrades apply at the next billing cycle.', category: 'billing' },
  { type: 'HELP_FAQ', title: 'Can I export my data?', body: 'Yes — every table page has a CSV export button. For bulk or automated exports, use the REST API with an API key from Settings.', category: 'api' },

  // ─── Resources ─────────────────────────────────────────────────
  { type: 'RESOURCE_TILE', title: 'Blog', icon: 'FileText', subtitle: 'Growth playbooks, product updates, industry insights.', href: '/resources/blog', data: { gradient: 'from-emerald-400 to-teal-600' } },
  { type: 'RESOURCE_TILE', title: 'Case studies', icon: 'Award', subtitle: 'How real brands grew GMV 3x with Kartriq.', href: '/resources/cases', data: { gradient: 'from-emerald-500 to-green-600' } },
  { type: 'RESOURCE_TILE', title: 'Video tutorials', icon: 'Play', subtitle: 'Watch setup walkthroughs and feature deep dives.', href: '/resources/videos', data: { gradient: 'from-teal-400 to-emerald-600' } },
  { type: 'RESOURCE_TILE', title: 'Help center', icon: 'HelpCircle', subtitle: 'Searchable knowledge base and FAQs.', href: '/resources/help', data: { gradient: 'from-green-400 to-teal-600' } },
  { type: 'VIDEO', title: 'Getting started in 5 minutes', subtitle: 'End-to-end tour of onboarding, your first channel, and first order sync.', data: { duration: '5:12', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', level: 'Beginner' } },
  { type: 'VIDEO', title: 'Connecting Amazon Smart Biz', subtitle: 'Step-by-step walkthrough of the SP-API OAuth flow for Amazon Smart Biz.', data: { duration: '7:48', url: '', level: 'Beginner' } },
  { type: 'VIDEO', title: 'Multi-warehouse inventory', subtitle: 'How to set up multiple warehouses, transfer stock, and enable smart routing.', data: { duration: '9:22', url: '', level: 'Intermediate' } },
  { type: 'VIDEO', title: 'Returns management', subtitle: 'Handling returns across every marketplace with automated reconciliation.', data: { duration: '6:15', url: '', level: 'Intermediate' } },
  { type: 'VIDEO', title: 'Custom reports with the API', subtitle: 'Use the REST API to build custom dashboards in your BI tool of choice.', data: { duration: '11:30', url: '', level: 'Advanced' } },
  { type: 'CASE_STUDY', title: 'Bloom & Bee: 3x GMV in 6 months', subtitle: 'How a D2C beauty brand moved from spreadsheets to unified operations.', body: 'Bloom & Bee was selling on Amazon, Nykaa and Shopify with three separate spreadsheets. After switching to Kartriq they saw a 3x increase in GMV, 60% less time on reconciliation, and zero oversells in 6 months.', data: { industry: 'Beauty', region: 'India', metric: '3x GMV' } },
  { type: 'CASE_STUDY', title: 'NorthStar Apparel: Unified fashion ops', subtitle: 'Running 8,000 SKUs across 12 channels with 2 warehouse staff.', body: 'NorthStar Apparel scaled from 400 SKUs to 8,000 without adding warehouse headcount, thanks to barcoding, FIFO picking and automated reconciliation.', data: { industry: 'Fashion', region: 'India', metric: '20x SKUs' } },
  { type: 'CASE_STUDY', title: 'GreenLeaf Organics: Quick commerce launch', subtitle: 'Going live on Blinkit, Zepto and Swiggy Instamart in 3 weeks.', body: 'GreenLeaf Organics used Kartriq\'s quick-commerce integrations to launch on Blinkit, Zepto and Swiggy Instamart simultaneously, syncing inventory across all three without manual intervention.', data: { industry: 'Grocery', region: 'India', metric: '3 channels in 3 weeks' } },

  // ─── Landing hero ────────────────────────────────────────────────
  { type: 'HERO', title: 'Data-Driven Commerce', subtitle: 'Powered by AI', body: 'Effortlessly manage every channel, uncover trends, and make smarter decisions in minutes — not weeks.', data: { badge: 'Now connecting 56+ channels', ctaPrimary: { label: 'Try for Free', href: '/onboarding' }, ctaSecondary: { label: 'Schedule a Demo', href: '/contact' } } },

  // ─── Navigation ────────────────────────────────────────────────
  { type: 'NAV_LINK', category: 'main', title: 'Home', href: '/' },
  { type: 'NAV_LINK', category: 'main', title: 'Features', href: '/features' },
  { type: 'NAV_LINK', category: 'main', title: 'Integrations', href: '/integrations' },
  { type: 'NAV_LINK', category: 'main', title: 'Pricing', href: '/pricing' },
  { type: 'NAV_LINK', category: 'solutions', title: 'Multi-channel Selling', href: '/solutions#multichannel', icon: 'Globe', subtitle: 'Sell on Amazon, Flipkart, Myntra & 56+ more' },
  { type: 'NAV_LINK', category: 'solutions', title: 'Inventory Management', href: '/solutions#inventory', icon: 'Package', subtitle: 'Real-time stock across every warehouse' },
  { type: 'NAV_LINK', category: 'solutions', title: 'Order Management', href: '/solutions#orders', icon: 'ShoppingCart', subtitle: 'Unified inbox for every order' },
  { type: 'NAV_LINK', category: 'solutions', title: 'Warehouse Operations', href: '/solutions#warehouse', icon: 'Warehouse', subtitle: 'Pick, pack, ship from any location' },
  { type: 'NAV_LINK', category: 'solutions', title: 'Shipping & Logistics', href: '/solutions#shipping', icon: 'Truck', subtitle: '16+ courier partners in one API' },
  { type: 'NAV_LINK', category: 'solutions', title: 'Returns & Refunds', href: '/solutions#returns', icon: 'RotateCcw', subtitle: 'Automated RMA workflows' },
  { type: 'NAV_LINK', category: 'solutions', title: 'Reports & Analytics', href: '/solutions#analytics', icon: 'BarChart3', subtitle: 'AI-powered business insights' },
  { type: 'NAV_LINK', category: 'resources', title: 'Blog', href: '/resources/blog', icon: 'BookOpen', subtitle: 'Commerce tips & trends' },
  { type: 'NAV_LINK', category: 'resources', title: 'Case Studies', href: '/resources/cases', icon: 'FileText', subtitle: 'How brands grew with Kartriq' },
  { type: 'NAV_LINK', category: 'resources', title: 'Help Center', href: '/resources/help', icon: 'HelpCircle', subtitle: 'Guides & documentation' },
  { type: 'NAV_LINK', category: 'resources', title: 'Webinars', href: '/resources/videos', icon: 'Video', subtitle: 'Live product demos' },
  { type: 'NAV_LINK', category: 'company', title: 'About', href: '/about', icon: 'Sparkles', subtitle: 'Our mission & story' },
  { type: 'NAV_LINK', category: 'company', title: 'Careers', href: '/about#careers', icon: 'Briefcase', subtitle: "We're hiring" },
  { type: 'NAV_LINK', category: 'company', title: 'Contact', href: '/contact', icon: 'Users', subtitle: 'Get in touch' },

  // ─── Footer ────────────────────────────────────────────────────
  { type: 'FOOTER_LINK', category: 'solutions', title: 'Multi-channel', href: '/solutions#multichannel' },
  { type: 'FOOTER_LINK', category: 'solutions', title: 'Inventory', href: '/solutions#inventory' },
  { type: 'FOOTER_LINK', category: 'solutions', title: 'Orders', href: '/solutions#orders' },
  { type: 'FOOTER_LINK', category: 'solutions', title: 'Shipping', href: '/solutions#shipping' },
  { type: 'FOOTER_LINK', category: 'solutions', title: 'Analytics', href: '/solutions#analytics' },
  { type: 'FOOTER_LINK', category: 'product', title: 'Features', href: '/features' },
  { type: 'FOOTER_LINK', category: 'product', title: 'Channels', href: '/dashboard/channels' },
  { type: 'FOOTER_LINK', category: 'product', title: 'Pricing', href: '/pricing' },
  { type: 'FOOTER_LINK', category: 'product', title: 'Changelog', href: '/resources/blog' },
  { type: 'FOOTER_LINK', category: 'product', title: 'Roadmap', href: '#' },
  { type: 'FOOTER_LINK', category: 'resources', title: 'Blog', href: '/resources/blog' },
  { type: 'FOOTER_LINK', category: 'resources', title: 'Case Studies', href: '/resources/cases' },
  { type: 'FOOTER_LINK', category: 'resources', title: 'Help Center', href: '/resources/help' },
  { type: 'FOOTER_LINK', category: 'resources', title: 'API Docs', href: '/resources/help?topic=api' },
  { type: 'FOOTER_LINK', category: 'resources', title: 'Status', href: '#' },
  { type: 'FOOTER_LINK', category: 'company', title: 'About', href: '/about' },
  { type: 'FOOTER_LINK', category: 'company', title: 'Careers', href: '/about#careers' },
  { type: 'FOOTER_LINK', category: 'company', title: 'Contact', href: '/contact' },
  { type: 'FOOTER_LINK', category: 'company', title: 'Privacy', href: '/privacy' },
  { type: 'FOOTER_LINK', category: 'company', title: 'Terms', href: '/terms' },

  // ─── Testimonials ────────────────────────────────────────────────
  { type: 'TESTIMONIAL', title: 'Priya Mehta', subtitle: 'Founder, Bloom & Bee', body: 'We went from juggling 6 seller panels to one dashboard. Order processing time dropped 70%.', data: { avatar: 'PM', rating: 5 } },
  { type: 'TESTIMONIAL', title: 'Arjun Kapoor', subtitle: 'Ops Head, Urbanly', body: 'Finally, an ERP that feels like a modern SaaS — not a 2005 spreadsheet. The team loves it.', data: { avatar: 'AK', rating: 5 } },
  { type: 'TESTIMONIAL', title: 'Rhea Shah', subtitle: 'CEO, Kale Kitchen', body: 'Connected to Blinkit, Zepto and Shopify in one afternoon. Sales pipeline visible end-to-end.', data: { avatar: 'RS', rating: 5 } },
];

async function seedContent() {
  const typeIdx = {};
  const slugs = [];
  let count = 0;
  for (const entry of CONTENT) {
    typeIdx[entry.type] = (typeIdx[entry.type] || 0) + 1;
    const sortOrder = typeIdx[entry.type];
    const slug = mkSlug(entry.type, sortOrder, entry.title);
    slugs.push(slug);
    await prisma.publicContent.upsert({
      where: { slug },
      update: { ...entry, slug, sortOrder, data: entry.data || {} },
      create: { ...entry, slug, sortOrder, data: entry.data || {} },
    });
    count++;
  }
  // Prune stale rows left over from a previous CONTENT ordering/size. The slug
  // encodes a positional sortOrder, so reordering CONTENT changes an item's
  // slug and would otherwise leave the old row behind — surfacing as duplicate
  // nav/footer entries. Deleting everything not in the current slug set keeps
  // public_content an exact mirror of CONTENT.
  let pruned = 0;
  try {
    const res = await prisma.publicContent.deleteMany({ where: { slug: { notIn: slugs } } });
    pruned = res?.count ?? 0;
  } catch (e) {
    console.warn('  [seed] public content prune skipped:', e.message);
  }
  console.log(`  [seed] ${count} public content rows (${pruned} stale pruned)`);
}

async function run() {
  console.log('[seed] seeding all data...');

  await seedPermissions();
  await seedPlans();

  // Platform founder
  const admin = await prisma.user.upsert({
    where: { email: PLATFORM_ADMIN_EMAIL },
    update: {
      isPlatformAdmin: true,
      password: await bcrypt.hash(PLATFORM_ADMIN_PASSWORD, 12),
      name: PLATFORM_ADMIN_NAME,
    },
    create: {
      name: PLATFORM_ADMIN_NAME,
      email: PLATFORM_ADMIN_EMAIL,
      password: await bcrypt.hash(PLATFORM_ADMIN_PASSWORD, 12),
      role: 'SUPER_ADMIN',
      isPlatformAdmin: true,
      emailVerified: true,
    },
  });
  console.log(`  [seed] founder: ${admin.email}`);

  // SEO defaults
  await prisma.seoSetting.upsert({
    where: { path: '/' },
    update: {},
    create: {
      path: '/',
      title: 'Kartriq — Multi-channel Inventory & Order Management',
      description: 'Kartriq is an EasyEcom-style ERP for D2C, marketplaces and warehouses. Manage inventory, orders, returns and reconciliation in one place.',
      keywords: 'inventory management, OMS, WMS, multi-channel, returns, reconciliation',
      ogTitle: 'Kartriq — Run your entire ecommerce backend',
      robots: 'index,follow',
    },
  });
  await prisma.seoSetting.upsert({
    where: { path: '/pricing' },
    update: {},
    create: {
      path: '/pricing',
      title: 'Pricing — Kartriq',
      description: 'Standard, Professional and Enterprise plans. Pay-as-you-go available.',
      robots: 'index,follow',
    },
  });
  console.log('  [seed] SEO settings');

  // Blog
  await prisma.blogPost.upsert({
    where: { slug: 'welcome-to-kartriq' },
    update: {},
    create: {
      slug: 'welcome-to-kartriq',
      title: 'Welcome to Kartriq',
      excerpt: 'A quick tour of what Kartriq can do for your ecommerce operations.',
      content: '# Welcome\n\nKartriq helps you run inventory, orders and returns across every channel.',
      authorName: 'Kartriq Team',
      tags: [],
      status: 'PUBLISHED',
      publishedAt: new Date(),
      metaTitle: 'Welcome to Kartriq',
      metaDescription: 'Quick tour of Kartriq features.',
    },
  });
  console.log('  [seed] blog post');

  // Public content
  await seedContent();

  console.log('[seed] done.');
}

// Allow running standalone: node src/scripts/seed.js
if (require.main === module) {
  run().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
}

module.exports = { run, seedPlans };
