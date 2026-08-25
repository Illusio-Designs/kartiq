import { PublicLayout } from '@/components/layout/PublicLayout';
import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy — Kartriq',
  description: 'How Kartriq collects, uses, and protects your data.',
};

export default function PrivacyPage() {
  return (
    <PublicLayout>
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-6">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight bg-gradient-to-r from-[#06D4B8] to-[#06B6D4] bg-clip-text text-transparent">Privacy Policy</h1>
          <p className="mt-3 text-sm text-slate-500">Last updated: April 2026</p>

          <div className="mt-10 prose prose-slate prose-sm max-w-none space-y-8">
            <Section title="1. Introduction">
              Kartriq (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates the kartriq.vercel.app website and the Kartriq SaaS platform. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service.
            </Section>

            <Section title="2. Information We Collect">
              <ul className="list-disc pl-5 space-y-2 mt-3">
                <li><strong>Account Information:</strong> Name, email address, phone number, company name, and GST number when you register.</li>
                <li><strong>Business Data:</strong> Products, inventory, orders, vendor details, and channel credentials you store on our platform.</li>
                <li><strong>Payment Information:</strong> Billing details processed securely through Razorpay. We do not store your card numbers.</li>
                <li><strong>Usage Data:</strong> Pages visited, features used, browser type, IP address, and device information collected automatically.</li>
                <li><strong>Cookies:</strong> Session cookies for authentication and analytics cookies for improving our service.</li>
              </ul>
            </Section>

            <Section title="3. How We Use Your Information">
              <ul className="list-disc pl-5 space-y-2 mt-3">
                <li>Provide, operate, and maintain the Kartriq platform.</li>
                <li>Process transactions and send billing-related communications.</li>
                <li>Respond to support requests and communicate service updates.</li>
                <li>Monitor usage patterns to improve features and performance.</li>
                <li>Prevent fraud and enforce our Terms of Service.</li>
              </ul>
            </Section>

            <Section title="4. Data Security">
              We implement industry-standard security measures including:
              <ul className="list-disc pl-5 space-y-2 mt-3">
                <li>AES-256-GCM encryption for channel credentials at rest.</li>
                <li>JWT-based authentication with HTTPS for all API communications.</li>
                <li>Role-based access control (RBAC) to limit data exposure.</li>
                <li>Regular security audits and automated vulnerability scanning.</li>
              </ul>
            </Section>

            <Section title="5. Data Sharing">
              We do not sell, trade, or rent your personal data. We may share data with:
              <ul className="list-disc pl-5 space-y-2 mt-3">
                <li><strong>Service Providers:</strong> Payment processors (Razorpay), email services, and hosting providers who assist in operating our platform.</li>
                <li><strong>Channel Integrations:</strong> Marketplace and logistics APIs you explicitly connect (e.g., Amazon, Flipkart, Shiprocket).</li>
                <li><strong>Legal Compliance:</strong> When required by law, regulation, or legal process.</li>
              </ul>
            </Section>

            <Section title="6. Data Retention &amp; Account Deletion">
              <p>We retain your data for as long as your account is active or as needed to provide our services. When you delete your account from <strong>Settings &rarr; Security &rarr; Delete my account</strong>:</p>
              <ul className="list-disc pl-5 space-y-2 mt-3">
                <li><strong>Login is disabled at once</strong> — both password and Google sign-in stop working immediately, and your workspace status is set to DELETED so the team loses access.</li>
                <li><strong>30-day recovery window</strong> — your name, email, and phone are kept on file for 30 days so you can ask us to undo the deletion if you change your mind. Email <a href="mailto:privacy@kartriq.com" className="text-emerald-600 hover:underline">privacy@kartriq.com</a> from the same email address you signed up with to request a restore.</li>
                <li><strong>After 30 days, personal identifiers are scrubbed</strong> — name, email, phone, password, avatar, and OAuth identifiers are removed permanently. Restoration is no longer possible after this point.</li>
                <li><strong>Business records are retained</strong> — invoices, orders, audit logs, and tax-relevant documents are preserved as required by Indian GST and accounting regulations (typically 8 years). They&apos;re <em>de-linked from your personal identifiers</em> but remain in our records to satisfy legal and audit obligations.</li>
                <li><strong>You can request a full erasure</strong> in writing to <a href="mailto:privacy@kartriq.com" className="text-emerald-600 hover:underline">privacy@kartriq.com</a> at any time — we&apos;ll review against our legal retention duties and respond within 30 days.</li>
              </ul>
            </Section>

            <Section title="7. Your Rights">
              <p>Under the Indian DPDP Act 2023 and applicable international laws (GDPR, CCPA), you have the right to:</p>
              <ul className="list-disc pl-5 space-y-2 mt-3">
                <li><strong>Access &amp; correct</strong> your personal data from <strong>Settings &rarr; Profile</strong>.</li>
                <li><strong>Export</strong> your full tenant data as JSON from <strong>Settings &rarr; Security &rarr; Download my data</strong>.</li>
                <li><strong>Delete your account</strong> from <strong>Settings &rarr; Security &rarr; Delete my account</strong> (see Section 6 for what happens).</li>
                <li><strong>Opt out</strong> of non-essential communications via the unsubscribe link in any marketing email.</li>
                <li><strong>Withdraw consent</strong> for data processing — note that some processing (e.g. tax records) is required by law and cannot be withdrawn.</li>
                <li><strong>Lodge a complaint</strong> with the Data Protection Board of India if you believe your rights have been violated.</li>
              </ul>
            </Section>

            <Section title="8. Third-Party Links">
              Our platform may contain links to third-party websites. We are not responsible for the privacy practices of these external sites.
            </Section>

            <Section title="9. Changes to This Policy">
              We may update this Privacy Policy from time to time. We will notify you of significant changes via email or an in-app notification. Continued use of the Service after changes constitutes acceptance.
            </Section>

            <Section title="10. Contact Us">
              If you have questions about this Privacy Policy, contact us at:
              <div className="mt-3 space-y-1">
                <p>Email: <a href="mailto:finverasolutionsllp@gmail.com" className="text-emerald-600 hover:underline">finverasolutionsllp@gmail.com</a></p>
                <p>Phone: <a href="tel:+918490009684" className="text-emerald-600 hover:underline">+91 84900 09684</a></p>
                <p>Address: 211-212, Runway Heights, Ayodhya Chowk, 150ft Ring Road, Rajkot 360001, Gujarat, India</p>
              </div>
            </Section>
          </div>

          <div className="mt-12 pt-8 border-t border-slate-200">
            <Link href="/terms" className="text-sm text-emerald-600 hover:underline font-medium">
              Read our Terms of Service &rarr;
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
