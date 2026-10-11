# Seller/partner API access for order fulfilment: Ajio, Nykaa, Tata CLiQ, JioMart, Shopify (India, as of 2026)

Method note: shopify.dev was unreachable from the fetch tool (DNS failure), so Shopify details come from search snippets and are partly marked UNVERIFIED. Marketplace facts come from OMS-vendor help pages (secondary); no official public developer portal was found for Ajio, Nykaa, Tata CLiQ or JioMart. About 9 searches run, few pages fully fetched.

## Which marketplaces can a small SaaS integrate with without a commercial agreement?

### Takeaway
Only Shopify has a self-serve public API. Ajio, Nykaa, Tata CLiQ and JioMart showed no public developer portal; every vendor guide says credentials are issued by the marketplace's account/category manager, so access is gated by the marketplace relationship (closed or partner-gated, not self-serve). Whether a SaaS can get such credentials without a commercial agreement is not documented anywhere I found.

### Cited Findings
- Ajio: seller obtains a POB user ID starting with "DV" from Ajio; Base also needs separate shipping API access confirmed with the Ajio account manager — [Base](https://base.com/en-EN/help/knowledgebase/ajio-integration-with-base/); [Uniware Ajio KB](https://support.unicommerce.com/?p=1269)
- Ajio: Increff says its integration uses Ajio's Vendor Management System (VMS) APIs, with the seller sharing Ajio panel credentials — [Increff](https://support.increff.com/support/solutions/articles/36000237862-ajio-dropship-via-vms-integration)
- Nykaa: API username, password and Seller ID must be requested from the Nykaa team — [EasyEcom Nykaa](https://support.easyecom.io/portal/en/kb/articles/integrating-nykaa-with-easyecom); [Base Nykaa](https://base.com/en-EN/help/knowledgebase/nykaa-marketplace-integration/)
- Tata CLiQ: username/password collected from the seller's SPOC (Category Manager); EasyEcom and Vinculum also need a Slave ID (and API key or SFTP for Vinculum) — [Uniware](https://support.unicommerce.com/index.php/knowledge-base/integrating-with-tata-cliq/); [EasyEcom](https://support.easyecom.io/portal/en/kb/articles/integrating-tata-cliq-with-easyecom); [Vinculum](https://docs.vineretail.com/tata-cliq-integration-with-vin-e-retail/)
- JioMart: sellers contact the JioMart category manager for connector credentials; LocationId per warehouse is issued by category managers — [Uniware JioMart KB](https://support.unicommerce.com/?p=9291)
- JioMart: Jio Commerce publishes a "Unicommerce Extension" using Inventory and Order APIs (v3) and an ecosystem page of partner extensions, which suggests an official partner-extension programme rather than an open API — [Jio Commerce extension](https://www.jiocommerce.io/updatelog/unicommerce-extension); [ecosystem](https://www.jiocommerce.io/eco-systems)
- Shopify: custom-distribution apps need no app review; public App Store apps need approval; protected customer data is requested separately and reviewed for public apps (sourced from third-party/community posts, not official docs) — [Stacksync](https://docs.stacksync.com/connectors/shopify/access-protected-customer-data-in-shopify); [Shopify community](https://community.shopify.dev/t/possible-to-embed-custom-app-without-shopify-app-store/2804). Official page named but not read: shopify.dev/docs/apps/launch/protected-customer-data

### Inferences
- Classification: Shopify = open/self-serve; Ajio, Nykaa, Tata CLiQ, JioMart = credential-gated by marketplace manager (effectively partner/seller-relationship only). A small SaaS would likely need each seller to obtain credentials on their behalf, as OMS vendors do, which avoids a direct commercial agreement with the marketplace but depends on the marketplace agreeing to issue them. (Inference, not confirmed.)
- Ajio's VMS API and Jio's extension programme hint at formal partner onboarding for new vendors; unverified.

### Gaps
- No official API docs or partner-programme terms for Ajio, Nykaa, Tata CLiQ, JioMart were found; no evidence on whether those marketplaces refuse credentials to new SaaS vendors.
- Vendor guides do not list API rate limits, fees, or certification steps.

## Which fulfilment steps can software perform (per marketplace)?

### Takeaway
Shopify supports the full flow via public GraphQL. For the four marketplaces, OMS-vendor docs show order pull, pack/invoice/label, shipment, inventory and status sync are possible, but exact per-step capability is only partly documented.

### Cited Findings
- Shopify: `fulfillmentCreate` takes `notifyCustomer` (Boolean, default false), `trackingCompany`, `trackingNumber`; Shopify builds the tracking URL where the carrier is supported; a missing tracking number caused a reported no-email case; the `message` argument did not appear in notification emails — [OrderCreateFulfillmentInput (2026-04)](https://shopify.dev/docs/api/admin-graphql/2026-04/input-objects/OrderCreateFulfillmentInput); [community: notifyCustomer](https://community.shopify.dev/t/no-effect-of-notifycustomer-on-fulfillmenttrackinginfoupdate/33242); [community: message](https://community.shopify.dev/t/fulfillmentcreate-optional-message/31968)
- Shopify docs exist for API versions 2025-10, 2026-04, 2026-07 (pin a version) — same OrderCreateFulfillmentInput URLs with 2025-10 / 2026-07
- Ajio (Uniware): channels for JIT B2C, Dropship, B2B; catalog, inventory, order sync; statuses for cancelled/delivered/returns; manifest PDF and documents pulled after manifest close; JIT limited to Fashion and Luxury, Professional/Enterprise accounts; scanning mandatory for picklist; one channel per POB + store code — [Uniware Ajio](https://support.unicommerce.com/?p=1269); [Uniware Ajio B2B](https://support.unicommerce.com/index.php/knowledge-base/integration-with-ajio-b2b/)
- Ajio (Vinculum): JIT guide covers product sync, inventory sync, order fulfilment; B2B flag set YES — [Vinculum Ajio JIT](https://docs.vineretail.com/?p=1228)
- Ajio Dropship is B2B2C: Ajio raises a B2B purchase order per packed order, then a B2C invoice to consumer — [Increff](https://support.increff.com/support/solutions/articles/36000237862-ajio-dropship-via-vms-integration)
- Nykaa: separate models (Nykaa, Nykaa Fashion, Nykaa B2B JIT, Omni multi-store); Uniware username numeric prefixes 50/53/57 by model; Omni only on Enterprise tenants; EasyEcom B2B JIT can create Ekart shipments and receive status; Base polls new orders every 10 minutes — [Uniware Nykaa](https://support.unicommerce.com/?p=10366); [EasyEcom Nykaa B2B JIT](https://support.easyecom.io/portal/en/kb/articles/integrating-nykaa-b2b-with-easyecom); [Base](https://base.com/en-EN/help/knowledgebase/nykaa-marketplace-integration/)
- Tata CLiQ (Vinculum): order pull/fetch, order pack (invoice/shipping label generation), shipment label prefetch, order shipment, inventory sync and reconciliation — [Vinculum](https://docs.vineretail.com/tata-cliq-integration-with-vin-e-retail/); Omni multi-store hoppable orders Enterprise-only in Uniware — [Uniware](https://support.unicommerce.com/index.php/knowledge-base/tata-cliq-omni-integration/)
- JioMart (Uniware): location-wise inventory, order and return sync, facility-code map required — [Uniware](https://support.unicommerce.com/?p=9291)

### Inferences
- Shopify flow (from training knowledge, UNVERIFIED in this session since shopify.dev was unreachable): query `fulfillmentOrders` on the order; for merchant-managed locations use `fulfillmentCreate` with `lineItemsByFulfillmentOrder`, `trackingInfo{company,number,url}`, `notifyCustomer`; update tracking later with `fulfillmentTrackingInfoUpdate`; for fulfilment-service apps, request/accept fulfillment requests. Likely scopes: `read_orders` (+`read_all_orders` beyond 60 days), `read_merchant_managed_fulfillment_orders`, `write_merchant_managed_fulfillment_orders`, `write_assigned_fulfillment_orders`, `read_inventory`/`write_inventory`, `read_products`. Verify exact names on shopify.dev before building.
- Ajio/Nykaa/Tata CLiQ B2B-JIT-style models imply the marketplace controls the shipment/manifest in places; software confirms/packs/uploads invoices but returns handling detail is not documented in what I found.

### Gaps
- Per-step matrix (accept, RTD, label, returns/RVP, invoice upload) per marketplace is not confirmed from primary sources.
- Shopify scopes, rate limits, app review process not verified from shopify.dev.

## How do major OMS vendors list support?

### Takeaway
Unicommerce and Vinculum (Vin eRetail) list Ajio and Tata CLiQ; Unicommerce and EasyEcom list Nykaa; Unicommerce lists JioMart (EasyEcom changelog also lists it); Vinculum's JioMart and Nykaa support was not confirmed.

### Cited Findings
- Unicommerce: Ajio, Nykaa (incl. Fashion, B2B, International), Tata CLiQ (incl. Omni), JioMart KB pages (URLs above; Nykaa International: https://support.unicommerce.com/index.php/knowledge-base/integration-with-nykaa-international/)
- Vinculum: Ajio JIT and Tata CLiQ docs exist — [Ajio](https://docs.vineretail.com/?p=1228); [Tata CLiQ](https://docs.vineretail.com/tata-cliq-integration-with-vin-e-retail/). JioMart: listed on Jio Commerce ecosystem page only as "Coming soon" — [Jio Commerce](https://www.jiocommerce.io/eco-systems)
- EasyEcom: Nykaa, Nykaa Fashion, Nykaa B2B JIT, Tata CLiQ guides (URLs above); JioMart integration announced in changelog dated 19 Apr 2023 — [EasyEcom changelog](https://easyecom.io/whatsnew-category/integrations). Ajio on EasyEcom: not found in my searches.
- Others with Ajio: Increff, Fynd Konnect, Base — [Fynd](https://documentation.fynd.com/konnect/channels/marketplaces-webstores/ajio); [Base](https://base.com/en-EN/help/knowledgebase/ajio-integration-with-base/). Eshopbox, Browntape list JioMart/Tata CLiQ — [Eshopbox](https://www.eshopbox.com/jiomart-integration)
- Tata CLiQ and Unicommerce partnership dates to 2018 — [YourStory](https://ts.yourstory.com/2018/01/tata-groups-tatacliq-ties-up-with-unicommerce-for-omnichannel)

### Inferences
- Vendor pages indicate these integrations are mature, but "listed" does not prove current live status; EasyEcom JioMart (2023) and Vinculum Nykaa/JioMart need confirmation.

### Gaps
- Vinculum Nykaa page, EasyEcom Ajio page not found; no vendor pricing/inclusion per channel.

## Ranking by feasibility and seller demand

### Takeaway
Feasibility (best to worst, my judgement): 1 Shopify (open API, self-testable); 2 JioMart (Jio Commerce has an extension/ecosystem programme, v3 APIs); 3 Tata CLiQ (credentials via category manager, widely documented by vendors); 4 Nykaa (multiple business models, Enterprise gating at Unicommerce); 5 Ajio (VMS APIs, POB credentials, JIT/dropship/B2B variants, scanning-mandatory flows). Demand ranking is NOT supported by any data I found.

### Cited Findings
- No source found with seller-count or GMV shares for these marketplaces; demand ranking uncited.

### Inferences
- Demand (unsupported judgement from general market knowledge): Shopify is common among D2C brands; Ajio and Nykaa are key for fashion/beauty brands; JioMart and Tata CLiQ are secondary. Treat as a hypothesis to validate.
- Feasibility order above is inference from vendor docs complexity and credential gating, not from any marketplace statement.

### Gaps
- Seller demand data (seller counts, share of orders), and a test/sandbox availability for each marketplace, were not found.
