'use client';

import { useState } from 'react';

// ── Every single channel supported by Kartriq ──────────────────────────
// Keep this in sync with backend/src/data/channel-catalog.js
// `key` is the local logo filename: /logos/<key>.png
export const ALL_CHANNELS = [
  // ECOM
  { name: 'Amazon',           category: 'ECOM',      color: 'from-orange-400 to-amber-500',     key: 'amazon',       domain: 'amazon.com' },
  { name: 'Flipkart',         category: 'ECOM',      color: 'from-blue-400 to-blue-600',        key: 'flipkart',     domain: 'flipkart.com' },
  { name: 'Myntra',           category: 'ECOM',      color: 'from-pink-500 to-rose-600',        key: 'myntra',       domain: 'myntra.com' },
  { name: 'Meesho',           category: 'ECOM',      color: 'from-fuchsia-500 to-pink-600',     key: 'meesho',       domain: 'meesho.com' },
  { name: 'Nykaa',            category: 'ECOM',      color: 'from-pink-400 to-fuchsia-500',     key: 'nykaa',        domain: 'nykaa.com' },
  { name: 'Ajio',             category: 'ECOM',      color: 'from-slate-700 to-slate-900',      key: 'ajio',         domain: 'ajio.com' },
  { name: 'Tata Cliq',        category: 'ECOM',      color: 'from-red-500 to-rose-600',         key: 'tatacliq',     domain: 'tatacliq.com' },
  { name: 'Snapdeal',         category: 'ECOM',      color: 'from-red-400 to-orange-500',       key: 'snapdeal',     domain: 'snapdeal.com' },
  { name: 'JioMart',          category: 'ECOM',      color: 'from-blue-500 to-indigo-600',      key: 'jiomart',      domain: 'jiomart.com' },
  { name: 'Paytm Mall',       category: 'ECOM',      color: 'from-sky-500 to-blue-600',         key: 'paytm',        domain: 'paytmmall.com' },
  { name: 'GlowRoad',         category: 'ECOM',      color: 'from-violet-400 to-purple-600',    key: 'glowroad',     domain: 'glowroad.com' },
  { name: 'LimeRoad',         category: 'ECOM',      color: 'from-lime-500 to-green-600',       key: 'limeroad',     domain: 'limeroad.com' },
  { name: 'eBay',             category: 'ECOM',      color: 'from-red-500 to-yellow-500',       key: 'ebay',         domain: 'ebay.com' },
  { name: 'Etsy',             category: 'ECOM',      color: 'from-orange-500 to-rose-500',      key: 'etsy',         domain: 'etsy.com' },
  { name: 'FirstCry',         category: 'ECOM',      color: 'from-pink-500 to-rose-500',        key: 'firstcry',     domain: 'firstcry.com' },
  { name: 'Pepperfry',        category: 'ECOM',      color: 'from-amber-500 to-orange-600',     key: 'pepperfry',    domain: 'pepperfry.com' },
  { name: 'Croma',            category: 'ECOM',      color: 'from-emerald-600 to-teal-700',     key: 'croma',        domain: 'croma.com' },
  { name: 'Tata Neu',         category: 'ECOM',      color: 'from-violet-500 to-indigo-600',    key: 'tataneu',      domain: 'tataneu.com' },
  // QUICKCOM
  { name: 'Blinkit',          category: 'QUICKCOM',  color: 'from-yellow-400 to-amber-500',     key: 'blinkit',      domain: 'blinkit.com' },
  { name: 'Swiggy Instamart', category: 'QUICKCOM',  color: 'from-orange-500 to-red-500',       key: 'swiggy',       domain: 'swiggy.com' },
  { name: 'BB Now',           category: 'QUICKCOM',  color: 'from-green-500 to-emerald-600',    key: 'bigbasket',    domain: 'bigbasket.com' },
  // LOGISTICS
  { name: 'Shiprocket',       category: 'LOGISTICS', color: 'from-violet-500 to-indigo-600',    key: 'shiprocket',   domain: 'shiprocket.in' },
  { name: 'Delhivery',        category: 'LOGISTICS', color: 'from-red-500 to-orange-600',       key: 'delhivery',    domain: 'delhivery.com' },
  { name: 'iThink',           category: 'LOGISTICS', color: 'from-sky-500 to-blue-600',         key: 'ithink',       domain: 'ithinklogistics.com' },
  { name: 'Pickrr',           category: 'LOGISTICS', color: 'from-blue-500 to-indigo-600',      key: 'pickrr',       domain: 'pickrr.com' },
  { name: 'NimbusPost',       category: 'LOGISTICS', color: 'from-cyan-500 to-blue-600',        key: 'nimbuspost',   domain: 'nimbuspost.com' },
  { name: 'ClickPost',        category: 'LOGISTICS', color: 'from-indigo-500 to-purple-600',    key: 'clickpost',    domain: 'clickpost.in' },
  { name: 'Shipway',          category: 'LOGISTICS', color: 'from-teal-500 to-cyan-600',        key: 'shipway',      domain: 'shipway.com' },
  { name: 'Fship',            category: 'LOGISTICS', color: 'from-emerald-500 to-teal-600',     key: 'fship',        domain: 'fship.in' },
  { name: 'Ecom Express',     category: 'LOGISTICS', color: 'from-red-500 to-pink-600',         key: 'ecomexpress',  domain: 'ecomexpress.in' },
  { name: 'Xpressbees',       category: 'LOGISTICS', color: 'from-indigo-500 to-blue-600',      key: 'xpressbees',   domain: 'xpressbees.com' },
  { name: 'Shadowfax',        category: 'LOGISTICS', color: 'from-slate-600 to-slate-900',      key: 'shadowfax',    domain: 'shadowfax.in' },
  { name: 'BlueDart',         category: 'LOGISTICS', color: 'from-blue-500 to-sky-600',         key: 'bluedart',     domain: 'bluedart.com' },
  { name: 'DTDC',             category: 'LOGISTICS', color: 'from-red-600 to-rose-700',         key: 'dtdc',         domain: 'dtdc.in' },
  { name: 'FedEx',            category: 'LOGISTICS', color: 'from-purple-500 to-orange-500',    key: 'fedex',        domain: 'fedex.com' },
  { name: 'DHL',              category: 'LOGISTICS', color: 'from-yellow-400 to-red-500',       key: 'dhl',          domain: 'dhl.com' },
  { name: 'UPS',              category: 'LOGISTICS', color: 'from-amber-700 to-yellow-600',     key: 'ups',          domain: 'ups.com' },
  // OWNSTORE
  { name: 'Shopify',          category: 'OWNSTORE',  color: 'from-green-500 to-emerald-600',    key: 'shopify',      domain: 'shopify.com' },
  { name: 'WooCommerce',      category: 'OWNSTORE',  color: 'from-purple-500 to-violet-600',    key: 'woocommerce',  domain: 'woocommerce.com' },
  { name: 'Magento',          category: 'OWNSTORE',  color: 'from-orange-500 to-red-600',       key: 'magento',      domain: 'magento.com' },
  { name: 'Amazon Smart Biz', category: 'OWNSTORE',  color: 'from-amber-500 to-orange-600',     key: 'amazonbiz',    domain: 'business.amazon.in' },
  { name: 'BigCommerce',      category: 'OWNSTORE',  color: 'from-blue-500 to-indigo-600',      key: 'bigcommerce',  domain: 'bigcommerce.com' },
  { name: 'OpenCart',         category: 'OWNSTORE',  color: 'from-sky-500 to-cyan-600',         key: 'opencart',     domain: 'opencart.com' },
  // SOCIAL
  { name: 'Instagram',        category: 'SOCIAL',    color: 'from-pink-500 via-purple-500 to-orange-500', key: 'instagram', domain: 'instagram.com' },
  { name: 'Facebook',         category: 'SOCIAL',    color: 'from-blue-500 to-indigo-600',      key: 'facebook',     domain: 'facebook.com' },
  { name: 'WhatsApp',         category: 'SOCIAL',    color: 'from-green-400 to-emerald-500',    key: 'whatsapp',     domain: 'whatsapp.com' },
  // GLOBAL ECOM — international marketplaces (adapter code shipped, awaiting smoke-test)
  { name: 'Walmart',          category: 'ECOM',      color: 'from-blue-500 to-yellow-400',      key: 'walmart',      domain: 'walmart.com' },
  { name: 'Lazada',           category: 'ECOM',      color: 'from-blue-500 to-orange-500',      key: 'lazada',       domain: 'lazada.com' },
  { name: 'Shopee',           category: 'ECOM',      color: 'from-orange-500 to-red-500',       key: 'shopee',       domain: 'shopee.com' },
  { name: 'Noon',             category: 'ECOM',      color: 'from-yellow-400 to-amber-500',     key: 'noon',         domain: 'noon.com' },
  { name: 'Mercado Libre',    category: 'ECOM',      color: 'from-yellow-400 to-orange-500',    key: 'mercadolibre', domain: 'mercadolibre.com' },
  { name: 'Allegro',          category: 'ECOM',      color: 'from-orange-500 to-red-600',       key: 'allegro',      domain: 'allegro.pl' },
  { name: 'Fruugo',           category: 'ECOM',      color: 'from-violet-500 to-purple-600',    key: 'fruugo',       domain: 'fruugo.com' },
  { name: 'OnBuy',            category: 'ECOM',      color: 'from-indigo-500 to-blue-600',      key: 'onbuy',        domain: 'onbuy.com' },
  { name: 'ManoMano',         category: 'ECOM',      color: 'from-amber-500 to-yellow-600',     key: 'manomano',     domain: 'manomano.com' },
  { name: 'Rakuten',          category: 'ECOM',      color: 'from-red-500 to-rose-600',         key: 'rakuten',      domain: 'rakuten.co.jp' },
  { name: 'Zalando',          category: 'ECOM',      color: 'from-orange-400 to-pink-500',      key: 'zalando',      domain: 'zalando.com' },
  { name: 'Kaufland',         category: 'ECOM',      color: 'from-red-600 to-rose-700',         key: 'kaufland',     domain: 'kaufland.com' },
  { name: 'Wish',             category: 'ECOM',      color: 'from-emerald-500 to-teal-600',     key: 'wish',         domain: 'wish.com' },
];

function getInitials(name: string) {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const LOGO_DEV_TOKEN = 'pk_WxT43MWfRoWxBBSZlDWHbg';
const logoDevUrl   = (d: string) => `https://img.logo.dev/${d}?token=${LOGO_DEV_TOKEN}&size=200&format=png&retina=true`;
const iconHorseUrl = (d: string) => `https://icon.horse/icon/${d}`;
const googleFavUrl = (d: string) => `https://www.google.com/s2/favicons?domain=${d}&sz=128`;

function ChannelChip({ name, color, domain }: { name: string; color: string; logoKey?: string; domain: string }) {
  // 0 = logo.dev (brand-grade), 1 = icon.horse, 2 = google favicon, 3 = gradient initials
  const [stage, setStage] = useState<0 | 1 | 2 | 3>(0);

  const src =
    stage === 0 ? logoDevUrl(domain)
    : stage === 1 ? iconHorseUrl(domain)
    : googleFavUrl(domain);

  return (
    <div className="flex items-center gap-3 px-5 py-3 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-lg hover:border-emerald-300 hover:-translate-y-1 hover:bg-emerald-50/30 transition-[transform,box-shadow,border-color,background-color] duration-300 ease-out flex-shrink-0 cursor-default">
      {stage === 3 ? (
        <div
          className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center text-white text-xs font-extrabold tracking-tight shadow-md ring-1 ring-white/40 flex-shrink-0`}
          aria-hidden="true"
        >
          {getInitials(name)}
        </div>
      ) : (
        // Flexible logo box: square marks stay 40×40, wordmarks stretch up to 72×40
        <div className="flex items-center justify-center h-10 min-w-[40px] max-w-[72px] flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={name}
            width={144}
            height={80}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="max-h-10 max-w-[72px] w-auto h-auto object-contain"
            onError={() => setStage((s) => Math.min(3, s + 1) as 0 | 1 | 2 | 3)}
          />
        </div>
      )}
      <span className="text-sm font-bold text-slate-700 whitespace-nowrap">{name}</span>
    </div>
  );
}

export function ChannelMarquee() {
  const half = Math.ceil(ALL_CHANNELS.length / 2);
  const row1 = ALL_CHANNELS.slice(0, half);
  const row2 = ALL_CHANNELS.slice(half);

  return (
    <div className="relative space-y-4 marquee-mask group">
      {/* Row 1 — left */}
      <div className="flex overflow-hidden">
        <div className="flex gap-3 animate-marquee">
          {[...row1, ...row1].map((c, i) => (
            <ChannelChip key={`r1-${i}`} name={c.name} color={c.color} logoKey={c.key} domain={c.domain} />
          ))}
        </div>
      </div>

      {/* Row 2 — right */}
      <div className="flex overflow-hidden">
        <div className="flex gap-3 animate-marquee-reverse">
          {[...row2, ...row2].map((c, i) => (
            <ChannelChip key={`r2-${i}`} name={c.name} color={c.color} logoKey={c.key} domain={c.domain} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Compact single-row marquee — for smaller spaces */
export function ChannelMarqueeCompact() {
  return (
    <div className="relative marquee-mask group">
      <div className="flex overflow-hidden">
        <div className="flex gap-3 animate-marquee">
          {[...ALL_CHANNELS, ...ALL_CHANNELS].map((c, i) => (
            <ChannelChip key={`c-${i}`} name={c.name} color={c.color} logoKey={c.key} domain={c.domain} />
          ))}
        </div>
      </div>
    </div>
  );
}
