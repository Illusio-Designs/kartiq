# Flipkart Seller/Marketplace API for order fulfilment

Method note: seller.flipkart.com could not be fetched directly (DNS failure in the sandbox via WebFetch; a direct curl was blocked by the permission classifier and not retried). All findings below come from WebSearch result summaries of the official pages plus third-party pages. None of the official pages was read in full. Request/response field-level shapes are therefore NOT verified; confirm in the live docs.

## 1. Official developer portal, how access works, auth, sandbox

### Takeaway
Flipkart has an official public docs site (Developer API v3.0) at seller.flipkart.com/api-docs. Access is seller self-serve: a seller creates an application under Manage Profile > Developer Access and gets an Application ID/Secret (client_id/secret). Auth is OAuth2 client_credentials with scope Seller_Api. Sandbox is not self-serve; it needs a support ticket.

### Cited Findings
- Official docs entry points: index, Marketplace Seller APIs, Order Management overview/reference, Listing Management overview/reference, changelog, FAQ, glossary — [About](https://seller.flipkart.com/api-docs/index.html), [FMSAPI](https://seller.flipkart.com/api-docs/FMSAPI.html), [OM overview](https://seller.flipkart.com/api-docs/order-api-docs/OMAPIOverview.html), [OM reference](https://seller.flipkart.com/api-docs/order-api-docs/OMAPIRef.html), [Listing overview](https://seller.flipkart.com/api-docs/listing-api-docs/LMAPIOverview.html), [Changelog](https://seller.flipkart.com/api-docs/changelog.html)
- Registration: Seller Dashboard > Manage Profile > Developer Access > Create New Access (name + description); yields an Application ID and Application Secret used as client_id/client_secret — [FMSAPI](https://seller.flipkart.com/api-docs/FMSAPI.html), corroborated by [Browntape](https://help.browntape.com/support/solutions/articles/33000265698-how-to-get-flipkart-api-details-manually-) and [Anchanto](https://support.anchanto.com/hc/en-us/articles/25927739309457-How-to-connect-Flipkart-marketplace-to-SelluSeller)
- Token: client credentials grant, HTTP Basic with app ID/secret, grant_type=client_credentials, scope=Seller_Api; production host api.flipkart.net, sandbox host sandbox-api.flipkart.net; token lifetime "usually 60 days" per docs — [FMSAPI](https://seller.flipkart.com/api-docs/FMSAPI.html), [FAQ source](https://www.seller.flipkart.com/api-docs/_sources/FAQ.rst.txt)
- Sandbox: credentials require raising a ticket via seller/partner portal ("API GA" node); FAQ says registration alone does not give sandbox access; docs say sandbox testing is a prerequisite to going live — [FMSAPI](https://seller.flipkart.com/api-docs/FMSAPI.html), [FAQ](https://www.seller.flipkart.com/api-docs/_sources/FAQ.rst.txt)
- OMS vendors collect the seller's own Application ID/Secret (EasyEcom asks for seller ID, application ID, secret, warehouse invoice series, tax ID; seller ID is taken from browser dev tools on the seller panel) — [EasyEcom](https://support.easyecom.io/portal/en/kb/articles/steps-to-integrate-you-easyecom-account-with-flipkart)
- Flipkart location ID (starts "LOC") is found in seller panel inventory management — [Eshopbox via Auperator](https://auperator.atlassian.net/wiki/spaces/POE/pages/1597636609/Flipkart+Integration+with+Eshopbox) (third party)

### Inferences
- Per-seller credentials (not a single platform OAuth consent app like Amazon SP-API) means a multi-tenant ERP has each tenant paste app ID/secret + location ID; no marketplace-style partner OAuth was found.

### Gaps
- Exact scope list beyond Seller_Api, rate limits (no Flipkart figures found in any search), sandbox approval turnaround, whether any partner-level (ISV) program exists beyond per-seller keys.

## 2. Order fulfilment endpoints and flows

### Takeaway
The v3 Order Management API is shipment-centric: search/filter shipments, request labels (moves to Packed, generates label+invoice), dispatch (RTD), cancel, manifest, handover counts. Two documented fulfilment workflows: Standard (Flipkart logistics) and Self Ship.

### Cited Findings (from search summaries of official pages; shapes unverified)
- Shipment is the unit of work; two workflows via API: Standard Fulfilment (Flipkart logistics; seller packs and hands to Flipkart delivery partner) and Self Ship — [OM overview](https://seller.flipkart.com/api-docs/order-api-docs/OMAPIOverview.html)
- Search: `POST /v3/shipments/filter/` (filters: dates, state, seller SKU, shipmentId; type preDispatch/postDispatch/cancelled; pageSize 1-20; maxDataRetrievalAllowed 5000; next-page URL in response; postDispatch must be requested separately for SELF and NORMAL shipments) — [PostShipmentSearch](https://seller.flipkart.com/api-docs/order-api-docs/v3/PostShipmentSearch.html)
- Order-item level search: `POST /orders/search` by order date, dispatch date, states, SKU — [SearchOrderRef](https://seller.flipkart.com/api-docs/order-api-docs/SearchOrderRef.html)
- Shipment details: `GET https://api.flipkart.net/sellers/v3/shipments?shipmentIds=a,b` (includes dispatchByDate etc.) — [OM reference](https://seller.flipkart.com/api-docs/order-api-docs/OMAPIRef.html)
- Label: `POST /v3/shipments/labels` (shipment IDs + location ID; moves to Packed, generates label and invoice); `GET /v3/shipments/{ids}/labels` to download (PDF/bytes) — [OM reference](https://seller.flipkart.com/api-docs/order-api-docs/OMAPIRef.html), [Glossary](https://www.seller.flipkart.com/api-docs/_sources/glossary.rst.txt)
- Dispatch (RTD): `POST /v3/shipments/dispatch` (shipment IDs + location ID); item goes to "Ready to ship" and logistics is notified — same sources
- Cancel: `POST /v3/shipments/cancel` (shipment IDs, cancellation group IDs, reason from enum e.g. cannot_procure_item, not_enough_inventory, b2b_order); cancellations make the product out of stock and repeated cancels risk seller deactivation — [OM reference](https://seller.flipkart.com/api-docs/order-api-docs/OMAPIRef.html)
- Manifest: `POST /v3/shipments/manifest`; handover counts: `GET /v3/shipments/handover/counts?locationId=` — same
- Notifications service exists (e.g. READY_TO_DISPATCH event) — [NotifRef](https://seller.flipkart.com/api-docs/order-api-docs/NotifRef.html), [NotifIntro](https://seller.flipkart.com/api-docs/order-api-docs/NotifIntro.html)
- Multi-location support (several pickup/self-ship addresses under one seller ID) in changelog — [Changelog](https://seller.flipkart.com/api-docs/changelog.html)
- A Jentic listing mentions /orders/labels and /orders/dispatch (unverified, unofficial) — [Jentic](https://jentic.com/apis/flipkart.com/flipkart.md)

### Inferences
- Flow: filter shipments -> labels (pack) -> label GET -> dispatch (RTD) -> manifest/handover. There is no separate "confirm" or "pack" call beyond labels; tracking after dispatch is Flipkart-side, not pushed via a seller tracking-update endpoint (none found).

### Gaps
- Request/response JSON schemas, Self Ship tracking-number submission details, returns/RTO API endpoints (not found in search), rate limits, Flipkart-arranged Ekart pickup specifics.

## 3. Listing/inventory updates

### Takeaway
v3 Listing API supports SKU-level inventory and price updates per location.

### Cited Findings
- `POST /listings/v3/update/inventory`: batch max 10, per-SKU locations list with non-negative inventory; location ID from Onboarding API; also create/update/get/price endpoints — [UpdateListingsInventoryAPI](https://seller.flipkart.com/api-docs/listing-api-docs/v3/UpdateListingsInventoryAPI.html), [LMAPIRef](https://seller.flipkart.com/api-docs/listing-api-docs/LMAPIRef.html)
- Older tutorial uses different (`stock_count`) format; conflicts with v3 reference — [InventoryTut](https://seller.flipkart.com/api-docs/listing-api-docs/InventoryTut.html)
- Stock update can fail if listing delivery charge exceeds permitted shipping rate — [Browntape](https://help.browntape.com/support/solutions/articles/33000265812-flipkart-delivery-charges-browntape-inventory-sync)

### Gaps
- Rate limits unknown.

## 4. Fulfilment models and OMS vendors

### Takeaway
Smart Fulfilment (Flipkart-warehoused) had no public API for third-party WMS per Increff (dated); newer Seller Fulfilment runs on the standard seller APIs. EasyEcom and Unicommerce support Flipkart; Vinculum not found.

### Cited Findings
- Increff: Smart Fulfilment products can only be processed from the Flipkart WMS panel, no APIs; Flipkart Smart said discontinued 1 Aug 2022; Seller Fulfilment (Smart 3.0) uses Seller Fulfilment APIs; Flipkart gives no support for non-Flipkart-WMS sync issues — [Increff](https://support.increff.com/support/solutions/articles/36000320509-flipkart-dropship-seller-fulfilment-onboarding-process), [Increff Smart](https://increff.atlassian.net/wiki/spaces/IO/pages/333938758/Flipkart+Smart+Integration+Using+Dedicated+Pool)
- EasyEcom has separate guides for Flipkart, Flipkart Smart Fulfillment (asks username/password + seller ID + app ID/secret + location ID), Flipkart Advantage, Health Plus — [EasyEcom Smart](https://support.easyecom.io/portal/en/kb/articles/flipkart-smart-fulfillment)
- Unicommerce: Settings > Channels > Flipkart; Omni needs inventory connector/location ID via Uniware support — [Unicommerce](https://support.unicommerce.com/index.php/knowledge-base/integrating-with-flipkart-com/)

### Gaps
- "Certified" partner status for Unicommerce/Vinculum/EasyEcom: no source found stating a formal Flipkart certification or ISV approval; Vinculum setup not found. Whether anything requires Flipkart partner approval beyond sandbox ticket: not established. Some vendors use seller username/password (possible scraping), which is a contrast to official API.
