import { PublicLayout } from '@/components/layout/PublicLayout';
import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service — Kartriq',
  description: 'Terms and conditions for using the Kartriq platform.',
};

export default function TermsPage() {
  return (
    <PublicLayout>
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-6">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight bg-gradient-to-r from-[#06D4B8] to-[#06B6D4] bg-clip-text text-transparent">Terms of Service</h1>
          <p className="mt-3 text-sm text-slate-500">Last updated: April 2026</p>

          <div className="mt-10 prose prose-slate prose-sm max-w-none space-y-8">
            <Section title="1. Acceptance of Terms">
              By accessing or using Kartriq (&quot;the Service&quot;), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service. These terms apply to all users, including tenants, team members, and visitors.
            </Section>

            <Section title="2. Description of Service">
              Kartriq is a multi-tenant SaaS platform for multi-channel inventory management, order management, and commerce operations. The Service includes web applications, APIs, integrations with third-party marketplaces and logistics providers, and related support.
            </Section>

            <Section title="3. Account Registration">
              <ul className="list-disc pl-5 space-y-2 mt-3">
                <li>You must provide accurate and complete information when creating an account.</li>
                <li>You are responsible for maintaining the confidentiality of your credentials.</li>
                <li>You must be at least 18 years old to use the Service.</li>
                <li>One person or legal entity may not maintain more than one free account.</li>
              </ul>
            </Section>

            <Section title="4. Subscription & Billing">
              <ul className="list-disc pl-5 space-y-2 mt-3">
                <li>Paid plans are billed monthly or annually as selected at checkout.</li>
                <li>Prices are in INR and exclusive of applicable taxes (GST).</li>
                <li>Upgrades take effect immediately; downgrades apply at the next billing cycle.</li>
                <li>Pay-as-you-go overages are billed at the rates specified in your plan.</li>
                <li>Failed payments may result in account suspension after a {process.env.BILLING_GRACE_DAYS || '7'}-day grace period.</li>
              </ul>
            </Section>

            <Section title="5. Acceptable Use">
              You agree not to:
              <ul className="list-disc pl-5 space-y-2 mt-3">
                <li>Use the Service for any unlawful purpose or to violate any regulations.</li>
                <li>Attempt to gain unauthorized access to other accounts or our systems.</li>
                <li>Reverse-engineer, decompile, or disassemble any part of the Service.</li>
                <li>Upload malicious code, spam, or content that infringes intellectual property.</li>
                <li>Exceed rate limits or abuse the API in ways that degrade service for others.</li>
              </ul>
            </Section>

            <Section title="6. Data Ownership">
              <ul className="list-disc pl-5 space-y-2 mt-3">
                <li><strong>Your Data:</strong> You retain all ownership rights to the data you upload to Kartriq. We do not claim ownership of your business data.</li>
                <li><strong>License:</strong> You grant us a limited license to process, store, and transmit your data solely to provide the Service.</li>
                <li><strong>Export:</strong> You may export all your data at any time via the dashboard or REST API.</li>
              </ul>
            </Section>

            <Section title="7. Third-Party Integrations">
              The Service connects to third-party marketplaces (Amazon, Flipkart, etc.) and logistics providers. These integrations are governed by their respective terms. Kartriq is not responsible for third-party service outages, API changes, or policy updates.
            </Section>

            <Section title="8. Service Availability">
              We strive for 99.9% uptime but do not guarantee uninterrupted access. Planned maintenance will be communicated in advance. We are not liable for downtime caused by force majeure, third-party failures, or circumstances beyond our control.
            </Section>

            <Section title="9. Limitation of Liability">
              To the maximum extent permitted by law, Kartriq shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or business opportunities arising from use of the Service.
            </Section>

            <Section title="10. Termination">
              <ul className="list-disc pl-5 space-y-2 mt-3">
                <li>You may cancel your account at any time from the Billing settings.</li>
                <li>We may suspend or terminate accounts that violate these terms.</li>
                <li>Upon termination, your data will be retained for 30 days and then permanently deleted.</li>
              </ul>
            </Section>

            <Section title="11. Intellectual Property">
              The Kartriq name, logo, and all related trademarks, designs, and software are our intellectual property. You may not use our branding without prior written consent.
            </Section>

            <Section title="12. Governing Law">
              These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts in Rajkot, Gujarat.
            </Section>

            <Section title="13. Changes to Terms">
              We reserve the right to modify these Terms at any time. Material changes will be communicated via email or in-app notification at least 15 days before taking effect.
            </Section>

            <Section title="14. Contact">
              For questions about these Terms, contact us at:
              <div className="mt-3 space-y-1">
                <p>Email: <a href="mailto:finverasolutionsllp@gmail.com" className="text-emerald-600 hover:underline">finverasolutionsllp@gmail.com</a></p>
                <p>Phone: <a href="tel:+918490009684" className="text-emerald-600 hover:underline">+91 84900 09684</a></p>
                <p>Address: 211-212, Runway Heights, Ayodhya Chowk, 150ft Ring Road, Rajkot 360001, Gujarat, India</p>
              </div>
            </Section>
          </div>

          <div className="mt-12 pt-8 border-t border-slate-200">
            <Link href="/privacy" className="text-sm text-emerald-600 hover:underline font-medium">
              Read our Privacy Policy &rarr;
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-2">{title}</h2>
      <div className="text-slate-600 leading-relaxed">{children}</div>
    </div>
  );
}
