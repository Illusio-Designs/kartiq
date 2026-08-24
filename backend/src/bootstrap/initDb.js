// Bootstrap — creates tables + seeds on startup.
// Seed runs ONCE. After all data exists, it never runs again.

async function initDb() {
  const db = require('../utils/db');
  const SCHEMA_SQL = require('../config/schema.sql.js');

  // 1. Create tables (IF NOT EXISTS — safe to re-run)
  console.log('[initDb] ensuring tables exist...');
  await db.raw('SET FOREIGN_KEY_CHECKS = 0');
  const statements = SCHEMA_SQL.split(';').map(s => s.trim()).filter(Boolean);
  for (const sql of statements) {
    await db.raw(sql);
  }
  await db.raw('SET FOREIGN_KEY_CHECKS = 1');
  console.log(`[initDb] ${statements.length} tables ready.`);

  // Lightweight migrations — add columns that are newer than the base schema.sql
  const migrations = [
    { table: 'orders', column: 'rtoScore',        ddl: 'INT DEFAULT NULL' },
    { table: 'orders', column: 'rtoRiskLevel',    ddl: "VARCHAR(16) DEFAULT NULL" },
    { table: 'orders', column: 'rtoFactors',      ddl: 'LONGTEXT DEFAULT NULL' },
    { table: 'orders', column: 'needsApproval',   ddl: 'TINYINT(1) NOT NULL DEFAULT 0' },
    { table: 'orders', column: 'approvedAt',      ddl: 'DATETIME(3) DEFAULT NULL' },
    { table: 'orders', column: 'approvedById',    ddl: 'VARCHAR(191) DEFAULT NULL' },
    { table: 'orders', column: 'rejectedAt',      ddl: 'DATETIME(3) DEFAULT NULL' },
    { table: 'orders', column: 'rejectionReason', ddl: 'TEXT DEFAULT NULL' },

    // Fulfillment model — who physically ships the order
    { table: 'orders', column: 'fulfillmentType',        ddl: "VARCHAR(16) NOT NULL DEFAULT 'SELF'" },
    { table: 'orders', column: 'channelFulfillmentCenter', ddl: 'VARCHAR(191) DEFAULT NULL' },
    { table: 'orders', column: 'awb',                    ddl: 'VARCHAR(191) DEFAULT NULL' },
    { table: 'orders', column: 'courierTrackingUrl',     ddl: 'TEXT DEFAULT NULL' },

    // Data-quality flagging for channels that give incomplete orders
    { table: 'orders', column: 'dataCompleteness', ddl: "VARCHAR(16) DEFAULT 'COMPLETE'" },
    { table: 'orders', column: 'missingFields',    ddl: 'LONGTEXT DEFAULT NULL' },
    { table: 'orders', column: 'enrichedAt',       ddl: 'DATETIME(3) DEFAULT NULL' },
    { table: 'orders', column: 'enrichedById',     ddl: 'VARCHAR(191) DEFAULT NULL' },

    // Per-channel default fulfillment (SELF | CHANNEL | BOTH)
    { table: 'channels', column: 'defaultFulfillmentType', ddl: "VARCHAR(16) NOT NULL DEFAULT 'SELF'" },

    // Per-listing fulfillment model — SELF (merchant/MFN stock we control) vs
    // CHANNEL (FBA/AFN stock Amazon manages). NULL = not yet classified. Used
    // to stop pushing local quantities to FBA listings, which Amazon rejects.
    { table: 'channel_listings', column: 'fulfillmentType', ddl: 'VARCHAR(16) DEFAULT NULL' },

    // User profile extras
    { table: 'users', column: 'phone', ddl: 'VARCHAR(30) DEFAULT NULL' },

    // Subscription auto-renew (charges saved default payment method on
    // currentPeriodEnd). Defaults to false; flipped on when the tenant
    // ticks "Enable Auto Top-up" during plan checkout.
    { table: 'subscriptions', column: 'autoRenew', ddl: 'TINYINT(1) NOT NULL DEFAULT 0' },
    { table: 'subscriptions', column: 'lastRenewalAt', ddl: 'DATETIME(3) DEFAULT NULL' },
    { table: 'subscriptions', column: 'lastRenewalError', ddl: 'TEXT DEFAULT NULL' },
    { table: 'subscriptions', column: 'renewalFailureCount', ddl: 'INT NOT NULL DEFAULT 0' },

    // platform_settings was originally created without createdAt; the prisma
    // shim auto-stamps it on every insert, so existing DBs need this column.
    { table: 'platform_settings', column: 'createdAt', ddl: 'DATETIME(3) NOT NULL DEFAULT current_timestamp(3)' },

    // 2FA / MFA — TOTP secret + flag
    { table: 'users', column: 'totpSecret', ddl: 'VARCHAR(64) DEFAULT NULL' },
    { table: 'users', column: 'mfaEnabled', ddl: 'TINYINT(1) NOT NULL DEFAULT 0' },

    // DPDP / GDPR — soft delete columns
    { table: 'users',   column: 'deletedAt', ddl: 'DATETIME(3) DEFAULT NULL' },
    { table: 'tenants', column: 'deletedAt', ddl: 'DATETIME(3) DEFAULT NULL' },

    // Dunning cadence — last reminder stage sent (0 = none, 1/3/7/14 = day)
    { table: 'subscriptions', column: 'lastDunningStage', ddl: 'INT NOT NULL DEFAULT 0' },
    { table: 'subscriptions', column: 'pastDueSince',     ddl: 'DATETIME(3) DEFAULT NULL' },

    // Referral / affiliate program
    // referralCode    — auto-generated unique code each tenant can share
    // referredByCode  — code that brought the tenant in, set at signup
    { table: 'tenants', column: 'referralCode',    ddl: 'VARCHAR(32) DEFAULT NULL' },
    { table: 'tenants', column: 'referredByCode',  ddl: 'VARCHAR(32) DEFAULT NULL' },

    // Audience targeting for tenant-facing CMS content. 'all' is the
    // default (visible to everyone — public site + tenants + founders),
    // 'tenant' restricts to logged-in tenant users, 'founder' is
    // founder-only content (internal release notes, founder runbooks).
    // The public list endpoints filter by the audience query param so
    // the topbar drawers can ask only for what's relevant to them.
    { table: 'help_faqs',          column: 'audience', ddl: "VARCHAR(16) NOT NULL DEFAULT 'all'" },
    { table: 'changelog_entries',  column: 'audience', ddl: "VARCHAR(16) NOT NULL DEFAULT 'all'" },
  ];

  // Push-notification device registry — one row per (user, expo token).
  // We re-issue tokens cheaply on every cold start, so a token rotating
  // just upserts the row. Tenant id is denormalised onto the row so a
  // simple WHERE tenantId=? returns every device that should receive a
  // tenant-wide notification.
  const deviceTables = [
    `CREATE TABLE IF NOT EXISTS \`push_devices\` (
      \`id\` varchar(191) NOT NULL,
      \`userId\` varchar(191) NOT NULL,
      \`tenantId\` varchar(191) DEFAULT NULL,
      \`token\` varchar(255) NOT NULL,
      \`platform\` varchar(16) NOT NULL DEFAULT 'unknown',
      \`deviceName\` varchar(191) DEFAULT NULL,
      \`lastSeenAt\` datetime(3) NOT NULL DEFAULT current_timestamp(3),
      \`createdAt\` datetime(3) NOT NULL DEFAULT current_timestamp(3),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`push_devices_token_unique\` (\`token\`),
      KEY \`push_devices_user_idx\` (\`userId\`),
      KEY \`push_devices_tenant_idx\` (\`tenantId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ];
  for (const sql of deviceTables) {
    try { await db.raw(sql); } catch (e) { console.warn('[initDb] push_devices:', e.message); }
  }

  // Create wallet tables if they don't exist (separate from column migrations)
  const walletTables = [
    `CREATE TABLE IF NOT EXISTS \`tenant_wallets\` (
      \`id\` varchar(191) NOT NULL,
      \`tenantId\` varchar(191) NOT NULL,
      \`balance\` decimal(12,2) NOT NULL DEFAULT 0.00,
      \`currency\` varchar(8) NOT NULL DEFAULT 'INR',
      \`lowBalanceThreshold\` decimal(12,2) NOT NULL DEFAULT 100.00,
      \`autoTopupEnabled\` tinyint(1) NOT NULL DEFAULT 0,
      \`autoTopupAmount\` decimal(12,2) DEFAULT NULL,
      \`autoTopupTriggerBelow\` decimal(12,2) DEFAULT NULL,
      \`createdAt\` datetime(3) NOT NULL DEFAULT current_timestamp(3),
      \`updatedAt\` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`tenant_wallets_tenantId_unique\` (\`tenantId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS \`wallet_transactions\` (
      \`id\` varchar(191) NOT NULL,
      \`tenantId\` varchar(191) NOT NULL,
      \`walletId\` varchar(191) NOT NULL,
      \`type\` varchar(16) NOT NULL,
      \`amount\` decimal(12,2) NOT NULL,
      \`balanceAfter\` decimal(12,2) NOT NULL,
      \`metric\` varchar(32) DEFAULT NULL,
      \`quantity\` int(11) DEFAULT NULL,
      \`reference\` varchar(191) DEFAULT NULL,
      \`description\` text DEFAULT NULL,
      \`createdById\` varchar(191) DEFAULT NULL,
      \`paymentRef\` varchar(191) DEFAULT NULL,
      \`createdAt\` datetime(3) NOT NULL DEFAULT current_timestamp(3),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`wallet_txn_payment_ref_unique\` (\`tenantId\`, \`paymentRef\`),
      KEY \`wallet_txn_tenant_idx\` (\`tenantId\`, \`createdAt\`),
      KEY \`wallet_txn_wallet_idx\` (\`walletId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    // Saved Razorpay tokens / customer ids per tenant — required for autopay
    // (recurring charges to the wallet without re-prompting the user).
    `CREATE TABLE IF NOT EXISTS \`tenant_payment_methods\` (
      \`id\` varchar(191) NOT NULL,
      \`tenantId\` varchar(191) NOT NULL,
      \`provider\` varchar(32) NOT NULL DEFAULT 'razorpay',
      \`providerCustomerId\` varchar(191) DEFAULT NULL,
      \`providerTokenId\` varchar(191) DEFAULT NULL,
      \`method\` varchar(32) DEFAULT NULL,
      \`brand\` varchar(64) DEFAULT NULL,
      \`last4\` varchar(8) DEFAULT NULL,
      \`expiryMonth\` int(11) DEFAULT NULL,
      \`expiryYear\` int(11) DEFAULT NULL,
      \`upiVpa\` varchar(191) DEFAULT NULL,
      \`label\` varchar(191) DEFAULT NULL,
      \`isDefault\` tinyint(1) NOT NULL DEFAULT 0,
      \`isActive\` tinyint(1) NOT NULL DEFAULT 1,
      \`failureCount\` int(11) NOT NULL DEFAULT 0,
      \`lastUsedAt\` datetime(3) DEFAULT NULL,
      \`lastFailureAt\` datetime(3) DEFAULT NULL,
      \`lastFailureReason\` text DEFAULT NULL,
      \`createdAt\` datetime(3) NOT NULL DEFAULT current_timestamp(3),
      \`updatedAt\` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`pm_provider_token_unique\` (\`tenantId\`, \`providerTokenId\`),
      KEY \`pm_tenant_idx\` (\`tenantId\`, \`isActive\`),
      KEY \`pm_default_idx\` (\`tenantId\`, \`isDefault\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    // Background job queue — durable retry/DLQ without needing Redis.
    // status: pending | running | done | dead.
    // Workers claim a row via UPDATE (atomic) and run the registered handler.
    // Failed jobs reschedule with exponential backoff up to maxAttempts;
    // after that they're marked `dead` and surfaced in /admin/jobs.
    `CREATE TABLE IF NOT EXISTS \`job_queue\` (
      \`id\` varchar(191) NOT NULL,
      \`type\` varchar(64) NOT NULL,
      \`payload\` longtext NOT NULL,
      \`priority\` int(11) NOT NULL DEFAULT 5,
      \`runAt\` datetime(3) NOT NULL,
      \`attempts\` int(11) NOT NULL DEFAULT 0,
      \`maxAttempts\` int(11) NOT NULL DEFAULT 5,
      \`status\` varchar(16) NOT NULL DEFAULT 'pending',
      \`lockedAt\` datetime(3) DEFAULT NULL,
      \`lockedBy\` varchar(191) DEFAULT NULL,
      \`lastError\` text DEFAULT NULL,
      \`createdAt\` datetime(3) NOT NULL DEFAULT current_timestamp(3),
      \`finishedAt\` datetime(3) DEFAULT NULL,
      PRIMARY KEY (\`id\`),
      KEY \`jq_status_runat\` (\`status\`, \`runAt\`),
      KEY \`jq_type\` (\`type\`),
      KEY \`jq_dead_idx\` (\`status\`, \`finishedAt\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    // Referral conversions — one row per (referrer, referred) pair, with
    // the reward state machine: pending → converted (rewarded) | voided.
    `CREATE TABLE IF NOT EXISTS \`referrals\` (
      \`id\` varchar(191) NOT NULL,
      \`referrerTenantId\` varchar(191) NOT NULL,
      \`referredTenantId\` varchar(191) NOT NULL,
      \`code\` varchar(32) NOT NULL,
      \`status\` varchar(16) NOT NULL DEFAULT 'pending',
      \`rewardAmount\` decimal(12,2) NOT NULL DEFAULT 0.00,
      \`rewardCurrency\` varchar(8) NOT NULL DEFAULT 'INR',
      \`walletTransactionId\` varchar(191) DEFAULT NULL,
      \`signedUpAt\` datetime(3) NOT NULL DEFAULT current_timestamp(3),
      \`convertedAt\` datetime(3) DEFAULT NULL,
      \`voidedAt\` datetime(3) DEFAULT NULL,
      \`voidedReason\` varchar(255) DEFAULT NULL,
      \`createdAt\` datetime(3) NOT NULL DEFAULT current_timestamp(3),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`referrals_referred_unique\` (\`referredTenantId\`),
      KEY \`referrals_referrer_idx\` (\`referrerTenantId\`, \`status\`),
      KEY \`referrals_code_idx\` (\`code\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    // Help & Support FAQs — questions/answers shown in the topbar Help
    // drawer. CMS-managed by platform admins via /admin/help. sortOrder
    // controls list ordering; isPublished controls visibility.
    `CREATE TABLE IF NOT EXISTS \`help_faqs\` (
      \`id\` varchar(191) NOT NULL,
      \`question\` varchar(255) NOT NULL,
      \`answer\` longtext NOT NULL,
      \`category\` varchar(64) DEFAULT NULL,
      \`sortOrder\` int(11) NOT NULL DEFAULT 0,
      \`isPublished\` tinyint(1) NOT NULL DEFAULT 1,
      \`createdAt\` datetime(3) NOT NULL DEFAULT current_timestamp(3),
      \`updatedAt\` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
      PRIMARY KEY (\`id\`),
      KEY \`help_faqs_published_idx\` (\`isPublished\`, \`sortOrder\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    // Changelog entries — "What's new" releases shown in the topbar drawer.
    // CMS-managed by platform admins via /admin/changelog so we don't need a
    // code deploy for every release note. Tag controls the badge colour;
    // highlights is a JSON array of bullet strings.
    `CREATE TABLE IF NOT EXISTS \`changelog_entries\` (
      \`id\` varchar(191) NOT NULL,
      \`title\` varchar(191) NOT NULL,
      \`tag\` varchar(16) NOT NULL DEFAULT 'feature',
      \`highlights\` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(\`highlights\`)),
      \`publishedAt\` datetime(3) DEFAULT NULL,
      \`isPublished\` tinyint(1) NOT NULL DEFAULT 0,
      \`createdAt\` datetime(3) NOT NULL DEFAULT current_timestamp(3),
      \`updatedAt\` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
      PRIMARY KEY (\`id\`),
      KEY \`changelog_published_idx\` (\`isPublished\`, \`publishedAt\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    // Marketing leads — captures the demo modal, contact form, and pricing
    // "Talk to Sales" submissions. Public/unauthenticated POST. Status field
    // is the sales-pipeline stage so the founder admin can manage follow-up.
    `CREATE TABLE IF NOT EXISTS \`leads\` (
      \`id\` varchar(191) NOT NULL,
      \`name\` varchar(191) NOT NULL,
      \`email\` varchar(191) NOT NULL,
      \`phone\` varchar(64) DEFAULT NULL,
      \`company\` varchar(191) DEFAULT NULL,
      \`subject\` varchar(191) DEFAULT NULL,
      \`message\` text DEFAULT NULL,
      \`source\` varchar(32) NOT NULL DEFAULT 'demo',
      \`status\` varchar(32) NOT NULL DEFAULT 'NEW',
      \`notes\` text DEFAULT NULL,
      \`metadata\` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(\`metadata\`)),
      \`ip\` varchar(64) DEFAULT NULL,
      \`userAgent\` text DEFAULT NULL,
      \`contactedAt\` datetime(3) DEFAULT NULL,
      \`createdAt\` datetime(3) NOT NULL DEFAULT current_timestamp(3),
      \`updatedAt\` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
      PRIMARY KEY (\`id\`),
      KEY \`leads_status_idx\` (\`status\`),
      KEY \`leads_source_idx\` (\`source\`),
      KEY \`leads_createdAt_idx\` (\`createdAt\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    // Idempotency keys — payment writes cache their response here for 24h
    // so a network-retry of the exact same Idempotency-Key returns the
    // original response instead of double-charging.
    `CREATE TABLE IF NOT EXISTS \`idempotency_keys\` (
      \`key\` varchar(191) NOT NULL,
      \`tenantId\` varchar(191) DEFAULT NULL,
      \`path\` varchar(191) NOT NULL,
      \`statusCode\` int(11) NOT NULL,
      \`response\` longtext NOT NULL,
      \`createdAt\` datetime(3) NOT NULL DEFAULT current_timestamp(3),
      \`expiresAt\` datetime(3) NOT NULL,
      PRIMARY KEY (\`key\`, \`tenantId\`, \`path\`),
      KEY \`idem_expires_idx\` (\`expiresAt\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    // In-app notifications inbox — backs the topbar bell drawer.
    //   scope='tenant'   → tenantId required; userId null = visible to
    //                      all users of that tenant, set to a userId to
    //                      target a single recipient (e.g. ticket-reply
    //                      for the specific user who opened the ticket).
    //   scope='platform' → tenantId null; visible to all platform admins.
    // category drives the filter chips on the drawer (orders / inventory
    // / tickets / leads / payments / signup / system). severity tints the
    // row icon (info | success | warning | error). link is a relative URL
    // that the drawer navigates to on click. metadata is opaque JSON for
    // future enrichment (resource id, before/after, etc.) and is not
    // surfaced in the UI today.
    `CREATE TABLE IF NOT EXISTS \`notifications\` (
      \`id\` varchar(191) NOT NULL,
      \`scope\` varchar(16) NOT NULL DEFAULT 'tenant',
      \`tenantId\` varchar(191) DEFAULT NULL,
      \`userId\` varchar(191) DEFAULT NULL,
      \`type\` varchar(64) NOT NULL,
      \`category\` varchar(32) NOT NULL DEFAULT 'system',
      \`severity\` varchar(16) NOT NULL DEFAULT 'info',
      \`title\` varchar(255) NOT NULL,
      \`body\` text DEFAULT NULL,
      \`link\` varchar(500) DEFAULT NULL,
      \`metadata\` longtext DEFAULT NULL,
      \`isRead\` tinyint(1) NOT NULL DEFAULT 0,
      \`readAt\` datetime(3) DEFAULT NULL,
      \`createdAt\` datetime(3) NOT NULL DEFAULT current_timestamp(3),
      PRIMARY KEY (\`id\`),
      KEY \`notif_tenant_idx\` (\`scope\`, \`tenantId\`, \`isRead\`, \`createdAt\`),
      KEY \`notif_user_idx\` (\`userId\`, \`isRead\`, \`createdAt\`),
      KEY \`notif_platform_idx\` (\`scope\`, \`isRead\`, \`createdAt\`),
      KEY \`notif_type_idx\` (\`type\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ];
  for (const sql of walletTables) {
    try { await db.raw(sql); } catch (e) { console.warn('[initDb] wallet table:', e.message); }
  }
  for (const m of migrations) {
    try {
      const [cols] = await db.raw(
        "SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
        [m.table, m.column]
      );
      const exists = Array.isArray(cols) ? cols.length > 0 : !!cols;
      if (!exists) {
        await db.raw(`ALTER TABLE \`${m.table}\` ADD COLUMN \`${m.column}\` ${m.ddl}`);
        console.log(`[initDb] migrated: ${m.table}.${m.column}`);
      }
    } catch (e) {
      console.warn(`[initDb] migration ${m.table}.${m.column} skipped:`, e.message);
    }
  }

  // Enum extensions — additive only (safe to re-run)
  // Extends `category` on channels & channel_requests with new pending categories.
  const TYPE_ENUM = "ENUM('AMAZON','FLIPKART','MYNTRA','MEESHO','SNAPDEAL','PAYTM_MALL','NYKAA','AJIO','TATA_CLIQ','GLOWROAD','JIOMART','LIMEROAD','EBAY','ETSY','BLINKIT','ZEPTO','SWIGGY_INSTAMART','BB_NOW','AMAZON_SMARTBIZ','SHOPIFY','WOOCOMMERCE','MAGENTO','BIGCOMMERCE','OPENCART','WEBSITE','OFFLINE','POS','SHIPROCKET','DELHIVERY','FSHIP','BLUEDART','DTDC','ECOMEXPRESS','XPRESSBEES','SHADOWFAX','FEDEX','DHL','UPS','ITHINK','PICKRR','SHIPWAY','NIMBUSPOST','CLICKPOST','INSTAGRAM','FACEBOOK','WHATSAPP_BUSINESS','B2B_PORTAL','WHOLESALE','DISTRIBUTOR','CUSTOM_WEBHOOK','OTHER','WALMART','AMAZON_US','AMAZON_UK','AMAZON_UAE','AMAZON_SA','AMAZON_SG','AMAZON_AU','AMAZON_DE','LAZADA','SHOPEE','NOON','MERCADO_LIBRE','ALLEGRO','FRUUGO','ONBUY','MANOMANO','RAKUTEN','ZALANDO','KAUFLAND','WISH','INDIAMART','INDUSTRYBUYING','MOGLIX','PURPLLE','BEWAKOOF','SHOPCLUES','FIRSTCRY','PEPPERFRY','CROMA','TATA_NEU','FLIPKART_MINUTES','TATA_1MG','DUNZO','COUNTRY_DELIGHT','ARAMEX','EKART','INDIA_POST','GATI','SAFEXPRESS','TRACKON','PROFESSIONAL_COURIERS','SMARTR','SHYPLITE','ICARRY','DOTZOT','SHIPDELIGHT','WIX','SQUARESPACE','SALESFORCE_COMMERCE','PRESTASHOP','ECWID','ZOHO_COMMERCE','DUKAAN','SHOOPY','BIKAYI','KARTROCKET','INSTAMOJO_PAGES','TIKTOK_SHOP','PINTEREST','YOUTUBE_SHOPPING','SNAPCHAT','TALLY','TALLY_PRIME','ZOHO_BOOKS','QUICKBOOKS','XERO','SAP_B1','SAP_S4HANA','ERPNEXT','DYNAMICS_365','NETSUITE','ODOO','BUSY','MARG_ERP','LOGIC_ERP','SHOPIFY_POS','SQUARE_POS','LIGHTSPEED_POS','LOYVERSE_POS','GOFRUGAL','POSIST','PETPOOJA','VYAPAR','ZOHO_POS','RAZORPAY','PAYU','CCAVENUE','CASHFREE','STRIPE','PAYPAL','PAYTM_PG','PHONEPE_BUSINESS','INSTAMOJO','CLEARTAX','GSTZEN','TAXCLOUD_IRP','AVALARA','ZOHO_GST','HUBSPOT','SALESFORCE_CRM','ZOHO_CRM','MAILCHIMP','KLAVIYO','SENDINBLUE','WEBENGAGE','MOENGAGE','CLEVERTAP','FRESHDESK','ZENDESK','GORGIAS','RETURN_PRIME','WERETURN','ANCHANTO_RETURNS','EASYVMS','AMAZON_FBA','FLIPKART_SMART_FULFILLMENT','WAREIQ','LOGINEXT','HOLISOL') NOT NULL";
  const enumExtensions = [
    { table: 'channels', column: 'type',     ddl: TYPE_ENUM, sentinel: 'WALMART' },
    {
      table: 'channels',
      column: 'category',
      ddl: "ENUM('ECOM','QUICKCOM','LOGISTICS','OWNSTORE','SOCIAL','B2B','CUSTOM','ACCOUNTING','POS_SYSTEM','PAYMENT','TAX','CRM','RETURNS','FULFILLMENT') NOT NULL DEFAULT 'ECOM'",
      sentinel: 'ACCOUNTING',
    },
    {
      table: 'channel_requests',
      column: 'category',
      ddl: "ENUM('ECOM','QUICKCOM','LOGISTICS','OWNSTORE','SOCIAL','B2B','CUSTOM','ACCOUNTING','POS_SYSTEM','PAYMENT','TAX','CRM','RETURNS','FULFILLMENT') NOT NULL DEFAULT 'CUSTOM'",
      sentinel: 'ACCOUNTING',
    },
    // Tenant lifecycle adds 'DELETED' for self-service account deletion
    // (POST /auth/me/delete). The tenant is preserved with deletedAt set so
    // historical orders / invoices / audit references stay intact — the row
    // is just marked unreachable.
    {
      table: 'tenants',
      column: 'status',
      ddl: "ENUM('TRIAL','ACTIVE','PAST_DUE','SUSPENDED','CANCELLED','DELETED') NOT NULL DEFAULT 'TRIAL'",
      sentinel: 'DELETED',
    },
  ];
  for (const m of enumExtensions) {
    try {
      const [rows] = await db.raw(
        "SELECT COLUMN_TYPE FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
        [m.table, m.column]
      );
      const current = Array.isArray(rows) ? rows[0]?.COLUMN_TYPE : rows?.COLUMN_TYPE;
      const sentinel = (m.sentinel || 'ACCOUNTING').toUpperCase();
      if (current && !current.toUpperCase().includes(sentinel)) {
        await db.raw(`ALTER TABLE \`${m.table}\` MODIFY COLUMN \`${m.column}\` ${m.ddl}`);
        console.log(`[initDb] enum extended: ${m.table}.${m.column}`);
      }
    } catch (e) {
      console.warn(`[initDb] enum extension ${m.table}.${m.column} skipped:`, e.message);
    }
  }

  // Retrofit unique constraints onto existing databases. These guard:
  //  - wallet_transactions: idempotent paymentRef across webhook + sync verify
  //  - tenant_payment_methods: token row uniqueness, prevents webhook dupes
  // ALTER TABLE ADD UNIQUE is rejected by MySQL when duplicates already exist
  // — we de-dupe first so the ALTER succeeds.
  const uniqueIndexes = [
    {
      table: 'wallet_transactions',
      name: 'wallet_txn_payment_ref_unique',
      cols: '(`tenantId`, `paymentRef`)',
      // Deletes older duplicates keeping the lowest id (string sort works for UUID v7-ish)
      dedupe: "DELETE t1 FROM wallet_transactions t1 INNER JOIN wallet_transactions t2 WHERE t1.id > t2.id AND t1.tenantId = t2.tenantId AND t1.paymentRef IS NOT NULL AND t1.paymentRef = t2.paymentRef",
    },
    {
      table: 'tenant_payment_methods',
      name: 'pm_provider_token_unique',
      cols: '(`tenantId`, `providerTokenId`)',
      dedupe: "DELETE t1 FROM tenant_payment_methods t1 INNER JOIN tenant_payment_methods t2 WHERE t1.id > t2.id AND t1.tenantId = t2.tenantId AND t1.providerTokenId IS NOT NULL AND t1.providerTokenId = t2.providerTokenId",
    },
  ];
  for (const idx of uniqueIndexes) {
    try {
      const [existing] = await db.raw(
        "SELECT INDEX_NAME FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?",
        [idx.table, idx.name]
      );
      const has = Array.isArray(existing) ? existing.length > 0 : !!existing;
      if (!has) {
        if (idx.dedupe) await db.raw(idx.dedupe).catch((e) => console.warn(`[initDb] dedupe ${idx.table} skipped:`, e.message));
        await db.raw(`ALTER TABLE \`${idx.table}\` ADD UNIQUE KEY \`${idx.name}\` ${idx.cols}`);
        console.log(`[initDb] unique index added: ${idx.table}.${idx.name}`);
      }
    } catch (e) {
      console.warn(`[initDb] unique index ${idx.name} skipped:`, e.message);
    }
  }

  // 2. Check if seed already ran — if all key tables have data, skip
  const [planRows] = await db.raw("SELECT COUNT(*) as cnt FROM `plans`").catch(() => [{ cnt: 0 }]);
  const [contentRows] = await db.raw("SELECT COUNT(*) as cnt FROM `public_content`").catch(() => [{ cnt: 0 }]);
  const [userRows] = await db.raw("SELECT COUNT(*) as cnt FROM `users`").catch(() => [{ cnt: 0 }]);
  const planCount = Number(planRows?.[0]?.cnt ?? planRows?.cnt ?? 0);
  const contentCount = Number(contentRows?.[0]?.cnt ?? contentRows?.cnt ?? 0);
  const userCount = Number(userRows?.[0]?.cnt ?? userRows?.cnt ?? 0);

  if (planCount > 0 && contentCount > 0 && userCount > 0) {
    console.log('[initDb] data exists -- skipping full seed.');
    // Lightweight plan sync: even when the DB is already populated, we
    // still want the public pricing page + in-app plan picker to
    // reflect any name / price / feature changes that have shipped in
    // seed.js since the last boot. seedPlans uses idempotent upserts
    // keyed by plan.code, so this is safe to run every restart.
    try {
      const { seedPlans } = require('../scripts/seed');
      await seedPlans();
      console.log('[initDb] plan rows synced from seed.js.');
    } catch (e) {
      console.warn('[initDb] plan sync skipped:', e.message);
    }
    return;
  }

  // 3. First run — seed everything
  console.log('[initDb] first run -- seeding...');
  const { run: seed } = require('../scripts/seed');
  await seed();
  console.log('[initDb] seed complete.');
}

module.exports = { initDb };
