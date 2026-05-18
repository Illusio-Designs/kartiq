import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { Poppins } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/layout/Providers';
import { PageLoader } from '@/components/PageLoader';
import { Analytics } from '@/components/Analytics';
import { CookieConsent } from '@/components/CookieConsent';
import { ThemeProvider } from '@/components/ThemeProvider';
import { WebVitalsReporter } from '@/components/WebVitalsReporter';
import { loadSeo } from '@/lib/seo';

// Brand display font — Agency, served from /public/font/agency.otf.
// Used for headings (Tailwind `font-display`). Wrapped in next/font/local
// so Next handles preloading + size-adjust to minimise CLS.
const agency = localFont({
  src: '../public/font/agency.otf',
  variable: '--font-agency',
  display: 'swap',
});

// Body / UI font — Poppins. Tailwind's `font-sans` points at this, so it
// is the default for all text; headings opt back into Agency via globals.css.
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://kartriq.vercel.app';

// ── Viewport (separate export in Next 14+) ──
export const viewport: Viewport = {
  themeColor: '#06D4B8',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

// ── Global metadata ──
const FALLBACK: Metadata = {
  title: {
    default: 'Kartriq — Multi-channel Inventory & Order Management',
    template: '%s | Kartriq',
  },
  description: 'One platform for all your channels. Manage inventory, orders, returns and reconciliation across Amazon, Flipkart, Shopify and 56+ channels.',
  keywords: [
    'inventory management', 'order management', 'multi-channel', 'ecommerce',
    'OMS', 'WMS', 'Amazon', 'Flipkart', 'Shopify', 'returns management',
    'reconciliation', 'D2C', 'warehouse management', 'SaaS ERP',
  ],
  authors: [{ name: 'Kartriq', url: SITE_URL }],
  creator: 'Kartriq',
  publisher: 'Kartriq',
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: SITE_URL,
    siteName: 'Kartriq',
    title: 'Kartriq — Multi-channel Inventory & Order Management',
    description: 'Manage inventory, orders, returns and reconciliation across 56+ channels from one platform.',
    images: [
      {
        url: `${SITE_URL}/og-image.svg`,
        width: 1200,
        height: 630,
        alt: 'Kartriq — Everything Commerce',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kartriq — Multi-channel Commerce Platform',
    description: 'Manage inventory, orders, returns and reconciliation across 56+ channels.',
    images: [`${SITE_URL}/og-image.svg`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
  verification: {
    // Add your verification codes here when ready
    // google: 'your-google-verification-code',
    // yandex: 'your-yandex-verification-code',
    other: {
      // Meta Business Manager → Brand Safety → Domains → Verify domain.
      // Required so the Pixel can run with full attribution under iOS
      // 14.5+ aggregated event measurement.
      'facebook-domain-verification': '6v9j078wu7fhfd6hpqucu8mvndweit',
    },
  },
  category: 'technology',
};

export async function generateMetadata(): Promise<Metadata> {
  const dynamic = await loadSeo('/');
  return { ...FALLBACK, ...dynamic };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${agency.variable} ${poppins.variable}`}>
      <head>
        {/* Structured data — Organization */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'Kartriq',
              applicationCategory: 'BusinessApplication',
              operatingSystem: 'Web',
              url: SITE_URL,
              description: 'Multi-channel inventory and order management platform for D2C brands, marketplaces and warehouses.',
              offers: {
                '@type': 'AggregateOffer',
                lowPrice: '2499',
                highPrice: '19999',
                priceCurrency: 'INR',
                offerCount: '3',
              },
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: '4.8',
                ratingCount: '150',
              },
            }),
          }}
        />
        {/* Pre-hydration theme apply — avoids the light→dark flash on
            page load when the user has chosen Dark or has system dark on. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k='kartriq.theme';var p=localStorage.getItem(k);if(p!=='light'&&p!=='dark'&&p!=='system')p='system';var dark=p==='dark'||(p==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;if(dark)r.classList.add('dark');r.style.colorScheme=dark?'dark':'light';}catch(e){}})();`,
          }}
        />
      </head>
      <body className="font-sans">
        <a href="#main-content" className="skip-link">Skip to content</a>
        <Analytics />
        <WebVitalsReporter />
        <ThemeProvider>
          <Providers>
            <PageLoader />
            <div id="main-content">{children}</div>
          </Providers>
          <CookieConsent />
        </ThemeProvider>
      </body>
    </html>
  );
}
