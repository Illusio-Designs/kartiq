'use client';

import { useState } from 'react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import {
  Sparkles, Mail, MessageCircle, Phone, MapPin, Send, CheckCircle2, AlertCircle,
  Instagram, Facebook,
} from 'lucide-react';
import { leadsApi } from '@/lib/api';
import { collectErrors, validateEmail, validateText } from '@/lib/validators';
import { Select } from '@/components/ui/Select';
import { track, upgradeSession } from '@/lib/analytics';

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string; message?: string }>({});

  const validate = (): boolean => {
    const errs = collectErrors([
      ['name',    validateText(form.name, { required: true, fieldName: 'Name' })],
      ['email',   validateEmail(form.email, { required: true })],
      ['message', validateText(form.message, { required: true, fieldName: 'Message', min: 5, max: 5000 })],
    ]);
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      await leadsApi.submit({
        name: form.name.trim(),
        email: form.email.trim(),
        subject: form.subject || undefined,
        message: form.message.trim() || undefined,
        source: 'contact',
        metadata: typeof window !== 'undefined' ? { path: window.location.pathname } : undefined,
      });
      track('contact_form_submit', {
        subject: form.subject || 'unspecified',
        has_message: !!form.message.trim(),
      });
      upgradeSession('contact_form_submit');
      setSubmitted(true);
      setForm({ name: '', email: '', subject: '', message: '' });
      setFieldErrors({});
    } catch (err: any) {
      const msg = err?.response?.data?.error;
      setError(
        Array.isArray(msg)
          ? msg.map((m: any) => m.message || m).join(', ')
          : (typeof msg === 'string' ? msg : 'Could not send your message. Please try again.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PublicLayout>
      <section className="relative overflow-hidden pt-20 pb-16">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-emerald-50 via-white to-white" />
        <div className="absolute top-20 right-1/3 w-96 h-96 rounded-full bg-emerald-200/40 blur-[120px] -z-10" />

        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 uppercase tracking-wider mb-4">
            <Sparkles size={12} /> Contact
          </div>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-slate-900 leading-tight">
            Let's <span className="gradient-text">talk commerce.</span>
          </h1>
          <p className="mt-5 text-lg text-slate-600 max-w-xl mx-auto">
            Questions? Feedback? Want a demo? Our team usually replies within 2 hours.
          </p>
        </div>
      </section>

      <section className="pb-24">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8 items-start">
          {/* Contact info column */}
          <div className="lg:col-span-2 space-y-3">
            {[
              { icon: Mail, title: 'Email', value: 'finverasolutionsllp@gmail.com', link: 'mailto:finverasolutionsllp@gmail.com' },
              { icon: Phone, title: 'Call', value: '+91 84900 09684', link: 'tel:+918490009684' },
              { icon: MapPin, title: 'Office', value: '211-212, Runway Heights, Ayodhya Chowk, 150ft Ring Road, Rajkot 360001, Gujarat, India', link: null },
              { icon: MessageCircle, title: 'Chat', value: 'Live chat 9am – 9pm IST, Mon–Sat', link: null },
            ].map(c => {
              const Icon = c.icon;
              const inner = (
                <>
                  <div className="w-11 h-11 flex-shrink-0 rounded-xl bg-emerald-50 group-hover:bg-emerald-100 flex items-center justify-center transition-colors">
                    <Icon size={18} className="text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{c.title}</div>
                    <div className="text-sm font-semibold text-slate-900 mt-1 break-words leading-snug">{c.value}</div>
                  </div>
                </>
              );
              const base = 'flex items-start gap-4 p-4 bg-white border border-slate-200 rounded-2xl shadow-sm transition-all group';
              return c.link ? (
                <a key={c.title} href={c.link} className={`${base} hover:border-emerald-200 hover:shadow-md`}>
                  {inner}
                </a>
              ) : (
                <div key={c.title} className={base}>
                  {inner}
                </div>
              );
            })}

            {/* Social / connect block */}
            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Connect with us</div>
              <div className="flex items-center gap-2.5 mt-3">
                {[
                  { icon: Instagram, label: 'Instagram', link: 'https://www.instagram.com/kartriq_ecommerce/' },
                  { icon: Facebook, label: 'Facebook', link: 'https://www.facebook.com/profile.php?id=61589343608997' },
                  { icon: Mail, label: 'Email', link: 'mailto:finverasolutionsllp@gmail.com' },
                ].map(s => {
                  const SIcon = s.icon;
                  const external = s.link.startsWith('http');
                  return (
                    <a
                      key={s.label}
                      href={s.link}
                      aria-label={s.label}
                      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                    >
                      <SIcon size={18} />
                    </a>
                  );
                })}
              </div>
              <div className="text-xs text-slate-500 mt-3">finverasolutionsllp@gmail.com</div>
              <div className="text-xs text-slate-500 mt-1">Managed by Finvera Solutions LLP, Rajkot, India.</div>
            </div>
          </div>

          {/* Contact form */}
          <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 md:p-10 shadow-sm">
            {submitted ? (
              <div className="text-center py-10">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-100 flex items-center justify-center mb-4">
                  <CheckCircle2 size={28} className="text-emerald-600" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900">Message sent!</h3>
                <p className="text-slate-600 mt-2">We'll get back to you within 2 business hours.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">Send us a message</h3>
                  <p className="text-slate-500 text-sm mt-1">Fill out the form below and we'll be in touch soon.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="contact-name" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Name</label>
                    <input
                      id="contact-name"
                      required
                      value={form.name}
                      onChange={e => {
                        setForm({ ...form, name: e.target.value });
                        if (fieldErrors.name) setFieldErrors({ ...fieldErrors, name: undefined });
                      }}
                      className="input-premium"
                      placeholder="Your name"
                    />
                    {fieldErrors.name && <p className="text-xs text-rose-600 mt-1 font-medium">{fieldErrors.name}</p>}
                  </div>
                  <div>
                    <label htmlFor="contact-email" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Email</label>
                    <input
                      id="contact-email"
                      required
                      type="email"
                      value={form.email}
                      onChange={e => {
                        setForm({ ...form, email: e.target.value });
                        if (fieldErrors.email) setFieldErrors({ ...fieldErrors, email: undefined });
                      }}
                      className="input-premium"
                      placeholder="you@company.com"
                    />
                    {fieldErrors.email && <p className="text-xs text-rose-600 mt-1 font-medium">{fieldErrors.email}</p>}
                  </div>
                </div>
                <Select
                  fullWidth
                  label="Subject"
                  placeholder="Select…"
                  value={form.subject}
                  onChange={(v) => setForm({ ...form, subject: v })}
                  options={[
                    { value: 'Sales inquiry',   label: 'Sales inquiry' },
                    { value: 'Product support', label: 'Product support' },
                    { value: 'Partnership',     label: 'Partnership' },
                    { value: 'Careers',         label: 'Careers' },
                    { value: 'Other',           label: 'Other' },
                  ]}
                />
                <div>
                  <label htmlFor="contact-message" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Message</label>
                  <textarea
                    id="contact-message"
                    required
                    rows={5}
                    value={form.message}
                    onChange={e => {
                      setForm({ ...form, message: e.target.value });
                      if (fieldErrors.message) setFieldErrors({ ...fieldErrors, message: undefined });
                    }}
                    className="input-premium"
                    placeholder="Tell us how we can help…"
                  />
                  {fieldErrors.message && <p className="text-xs text-rose-600 mt-1 font-medium">{fieldErrors.message}</p>}
                </div>
                {error && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
                    <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <button type="submit" disabled={submitting} className="btn-primary w-full justify-center py-3 disabled:opacity-60 disabled:cursor-not-allowed">
                  {submitting ? 'Sending…' : (<>Send Message <Send size={14} /></>)}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
