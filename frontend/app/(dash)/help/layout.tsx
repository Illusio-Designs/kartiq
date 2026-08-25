import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Help — Kartriq',
  description: 'Find answers to common questions about Kartriq.',
  openGraph: {
    title: 'Help — Kartriq',
    description: 'Find answers to common questions about Kartriq.',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
