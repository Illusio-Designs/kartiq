# Global omnichannel/multichannel inventory and order management competitors (Zoho Inventory, Linnworks, Rithum/ChannelAdvisor, Brightpearl, Cin7, Extensiv)

Method caveat: vendor domains (zoho.com, linnworks.com, cin7.com, extensiv.com, rithum.com, brightpearl.com) could not be fetched directly (DNS failure in the sandbox). All findings come from WebSearch result summaries, which sometimes quote vendor pages. Coverage is thin and uneven; many requested feature areas are unsourced and listed under Gaps. Nothing below was verified on a live account. Current date context: Oct 2026.

## Which features are table stakes across all of them?

### Takeaway
Only a few items are confirmed from sources: multichannel inventory sync with oversell prevention, order management, purchasing/supplier management, carrier/shipping integration and automation rules. Most other "table stakes" claims (RMA, roles, API) are not confirmed per vendor by what I could retrieve.

### Cited Findings
- Zoho Inventory: stock updates across channels when an order arrives on any one; connects to Amazon; ships via Shiprocket, Delhivery, Blue Dart, FedEx, Ecom Express — [digiwah / third-party summary](https://digiwah.com/zoho-inventory/) (secondary source)
- Zoho + Shiprocket integration can fetch live rates from multiple carriers and generate labels inside Zoho Inventory — [Zoho Shiprocket page](https://www.zoho.com/in/inventory/shiprocket-integration/)
- Zoho Amazon: connect seller account to sync sales, stock and invoicing; choose marketplace and FBA, FBM or both; base currency must match channel currency — [Zoho Amazon help](https://www.zoho.com/ae/inventory/help/marketplaces/amazon.md), [aaxonix guide](https://aaxonix.com/resources/?p=2519)
- Linnworks: described (by a competitor blog, so biased) as having carrier rules engine, automated label generation, rate shopping, warehouse routing, macro automation — [getonecart](https://www.getonecart.com/linnworks-alternatives/)
- Brightpearl: covers financial management, inventory and sales order management, purchasing and supplier management, CRM, fulfillment, warehouse; has an automation engine; a separate "Brightpearl Automation" add-on at extra cost is reported by a reviewer — [ecommercetech.io](https://ecommercetech.io/apps/brightpearl-by-sage), [TrustRadius comparison](https://www.trustradius.com/compare-products/focal-software-vs-brightpearl)
- Cin7 Omni: quote-only, with native EDI, POS and 3PL — [eightx](https://eightx.co/blog/compare/how-much-does-cin7-cost)
- Extensiv Order Manager (ex-Skubana): cross-channel allocation with oversell prevention, demand forecasting, FIFO cost tracking, native USPS/FedEx/UPS, PO and supplier management, advanced routing/processing automation; reorder thresholds — [toolradar](https://toolradar.com/tools/skubana), [Shopify listing](https://apps.shopify.com/skubana), [Extensiv FBA page](https://www.extensiv.com/amazon-fba-inventory-order-management-software)
- Rithum/ChannelAdvisor: a 2019 user review mentions Amazon advertising with auto-bidding rules, repricing and a price grid (OLD, 2019) — [Capterra review](https://www.capterra.pt/software/32810/channeladvisor-enterprise)

### Inferences
- Table stakes (supported by at least several vendors above): real-time multichannel stock sync, central order inbox, carrier integration with label generation, rule-based automation, PO/supplier management, accounting integration (not directly sourced; see Gaps).
- Rate shopping is explicit only for Linnworks and Zoho+Shiprocket; do not assume universal.

### Gaps
- Returns/RMA, bin/multi-warehouse depth, B2B/EDI (other than Cin7 Omni), listing management, repricing (except the 2019 Rithum mention), accounting integrations, API/webhook specifics: no usable primary sources retrieved for any vendor.
- Rithum's current product scope after the 2022 CommerceHub+ChannelAdvisor merger: not retrieved.

## Which are differentiators worth copying by a lean India-focused multi-tenant ERP?

### Takeaway
Evidence is limited; from what was found, the notable differentiators are rule-based carrier selection with rate shopping, SKU-level profitability with FIFO costing, and bundled EDI/POS (Cin7 Omni) — but only the first two are plausible for an India SMB product.

### Cited Findings
- Extensiv markets SKU-level profitability across channels, FIFO costing, inventory aging, inventory value and demand planning reports — [Extensiv FBA page](https://www.extensiv.com/amazon-fba-inventory-order-management-software)
- Extensiv shows COGS history per purchase order, easing quarter/year-end review — same source
- Extensiv users report high price for small businesses and a learning curve — [GetApp](https://www.getapp.com/operations-management-software/a/skubana/reviews/) (via search summary)
- Zoho + Shiprocket live multi-carrier rates and labels in-app — [Zoho](https://www.zoho.com/in/inventory/shiprocket-integration/)
- Cin7 customers report implementation costs (Core $2,000–$4,000 per one consultancy; one anecdote of $2,500 EDI setup fee) — [eightx](https://eightx.co/blog/compare/how-much-does-cin7-cost), [CostBench](https://costbench.com/software/inventory-management/cin7/)
- Reviewers complain of poor guidance and slow support at ChannelAdvisor (2019) — [Capterra](https://www.capterra.pt/software/32810/channeladvisor-enterprise)

### Inferences
- For a lean India ERP: copy (1) courier rate shopping + automatic carrier rules (Shiprocket/Delhivery/iThink already in Kartriq), (2) per-order/SKU true profit incl. marketplace fees, shipping, returns, GST, (3) PO-level costing and reorder-point/forecast reports. Pricing transparency and fast onboarding are a competitive opening given vendor complaints on opaque/quote-only pricing (Linnworks, Brightpearl, Cin7 Omni) and implementation fees.
- Full EDI and enterprise dropship networks (Rithum) are likely poor ROI for the initial India market.

### Gaps
- No confirmed feature data on repricing engines, forecasting algorithms or listing management per vendor.

## How do they handle marketplace-arranged shipping (Amazon Buy Shipping / FBM label flows)?

### Takeaway
I could not find any source documenting Amazon Buy Shipping or Easy Ship label flows for any of the six vendors. Only Zoho's FBM responsibility statement and Shiprocket-based labelling were found.

### Cited Findings
- Zoho Amazon help: under FBM the seller handles storage, packing, shipping, returns and customer service — [Zoho](https://www.zoho.com/ae/inventory/help/marketplaces/amazon.md)
- Zoho labels for India come via third-party carriers/aggregators such as Shiprocket, not shown as Amazon-arranged — [Zoho](https://www.zoho.com/in/inventory/shiprocket-integration/)

### Inferences
- Likely most competitors rely on their own carrier integrations and push tracking back to Amazon rather than buying Amazon-arranged labels; this is an unconfirmed inference. If true, Kartriq's Confirm → Amazon-arranged label (Easy Ship / Buy Shipping) flow would be a differentiator versus Zoho at least.

### Gaps
- Whether Linnworks, Cin7, Brightpearl, Extensiv or Rithum support Amazon Buy Shipping/Easy Ship label purchase: not found. Needs vendor docs (linnworks.com help, Extensiv docs) which were unreachable.

## What security/compliance claims do they publish?

### Takeaway
Confirmed: Cin7 claims SOC 2 Type 1 and Type 2; Linnworks claims ISO 27001. Zoho, Brightpearl, Extensiv and Rithum could not be confirmed.

### Cited Findings
- Cin7 announced SOC 2 Type 1 and Type 2 compliance on 13 Feb 2025; its security page says SOC 2 Type 2 compliant with report available via Trust Center — [Cin7 blog](https://www.cin7.com/blog/cin7-achieves-soc-2-type-1-and-type-2-compliance/), [Cin7 security](https://www.cin7.com/security)
- Cin7 ISO 27001: only claimed by aggregator Nudge Security; unverified — [Nudge](https://security-profiles.nudgesecurity.com/app/cin7-com)
- Linnworks security page: ISO 27001 certified; AES-256 at rest, TLS 1.2+ in transit; mandatory MFA on admin/dev platforms; SAST, vulnerability scans, pen testing; SOC 2 not mentioned — [Linnworks security](https://www.linnworks.com/security/)
- Stacksync pages that mention SOC 2/ISO 27001 describe Stacksync itself, not Linnworks or Cin7 (do not misattribute).

### Inferences
- A SOC 2 / ISO 27001 mention is a trust signal at mid-market; for Kartriq, ISO 27001 or SOC 2 plus Amazon SP-API data-protection controls (already in CLAUDE.md) is a reasonable roadmap.

### Gaps
- Zoho (known publicly for ISO 27001 at company level, but not retrieved here), Brightpearl/Sage, Extensiv, Rithum certifications: no sourced findings (searches returned none; one directory showed SOC 2 blank for Brightpearl).
- Audit logs and role models per vendor: not found.

## Pricing tiers (requested in objective)

### Takeaway
Pricing is mostly quote-based and third-party figures conflict; treat all as unverified.

### Cited Findings
- Zoho Inventory: free plan ~50 orders/month (1 user, 1 location per one source); paid USD tiers per CostBench Standard $29, Premium $79, Plus $129, Enterprise $249 per user/month, with July 2026 top-tier cut from $299 to $249; India reseller lists Standard ₹1,499, Professional ₹2,999, Premium ₹4,999, Enterprise ₹10,999/month; another source lists $39–$249 per organization — conflicting — [CostBench pricing change](https://costbench.com/changelog/zoho-inventory-price-decrease-2026-07/), [itforsme.in reseller](https://itforsme.in/pricing/zoho-inventory-india), [CostBench free plan](https://costbench.com/software/inventory-management/zoho-inventory/free-plan/)
- Linnworks: quote-based, order-volume driven; third-party estimates from ~$200 to $449/month, unverified — [Capterra](https://www.capterra.com/p/116088/Linnworks/pricing/), [getonecart](https://www.getonecart.com/linnworks-alternatives/)
- Cin7 Core: $349 Standard, $599 Pro, and Advanced $999 or $1,199 (sources conflict; newest, Oct 2026, says $1,199) per month; Omni quote-only, estimated $40K–$100K/yr by a consultancy — [Capterra](https://www.capterra.com/p/133038/Cin7-Core/pricing/), [eightx](https://eightx.co/blog/compare/how-much-does-cin7-cost)
- Brightpearl: no public price; third-party TCO estimate $18K–$120K/yr plus $5K–$25K implementation; TrustRadius $99–$999/month tiers conflict (likely outdated) — [erpresearch](https://www.erpresearch.com/pricing/brightpearl), [TrustRadius](https://tr-web.dev.trustradius.com/compare-products/brightpearl-vs-tradegecko)
- Extensiv Order Manager: from $400/month, unlimited users and channels per Shopify listing — [Shopify](https://apps.shopify.com/skubana)
- Rithum: custom pricing only — [GetApp](https://www.getapp.co.uk/software/100221/channeladvisor)

### Inferences
- A transparent INR-priced, unlimited-user plan structure (Kartriq already has no usage limits) undercuts all but Zoho on price clarity.

### Gaps
- Official vendor pricing pages not reachable; "2026 current" numbers rely on aggregators.
