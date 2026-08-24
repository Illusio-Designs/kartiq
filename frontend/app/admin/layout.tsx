'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { Sidebar, type SidebarNavGroup } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { CommandPalette } from '@/components/CommandPalette';
import { ChangelogDrawer } from '@/components/ChangelogDrawer';
import { HelpDrawer } from '@/components/HelpDrawer';
import { InboxDrawer } from '@/components/InboxDrawer';
import {
  LayoutDashboard, Package2, Building2, LifeBuoy, FileText, FileEdit,
  Search, Settings, Activity, Users, BarChart3, Cpu, Inbox, Megaphone,
} from 'lucide-react';

// Admin nav — same visual layout as the tenant sidebar, different items.
const ADMIN_NAV_GROUPS: SidebarNavGroup[] = [
  {
    label: 'Platform',
    items: [
      { label: 'Overview',       href: '/admin',            icon: LayoutDashboard },
      { label: 'Tenants',        href: '/admin/tenants',    icon: Building2 },
      { label: 'Subscriptions',  href: '/admin/plans',      icon: Package2 },
      { label: 'Tickets',        href: '/admin/tickets',    icon: LifeBuoy },
      { label: 'Leads',          href: '/admin/leads',      icon: Inbox },
      { label: 'Analytics',      href: '/admin/analytics',  icon: BarChart3 },
    ],
  },
  {
    label: 'Content',
    items: [
      { label: 'Blog',           href: '/admin/blog',       icon: FileText },
      { label: 'Page Content',   href: '/admin/content',    icon: FileEdit },
      { label: "What's new",     href: '/admin/changelog',  icon: Megaphone },
      { label: 'Help & Support', href: '/admin/help',       icon: LifeBuoy },
      { label: 'SEO',            href: '/admin/seo',        icon: Search },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Audit Log',      href: '/admin/audit',      icon: Activity },
      { label: 'Background jobs', href: '/admin/jobs',      icon: Cpu },
      { label: 'Settings',       href: '/admin/settings',   icon: Settings },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isPlatformAdmin } = useAuthStore();
  // Wait for zustand `persist` to restore the session before guarding — else a
  // full refresh evaluates `user` as null (pre-hydration) and bounces the admin
  // to /login every time.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    if (useAuthStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) { router.replace('/login'); return; }
    if (!isPlatformAdmin()) { router.replace('/dashboard'); }
  }, [hydrated, user, isPlatformAdmin, router]);

  if (!hydrated) return null;
  if (!user || !user.isPlatformAdmin) return null;

  return (
    <div className="flex min-h-screen">
      <Sidebar
        groups={ADMIN_NAV_GROUPS}
        brandName="Kartriq"
        brandSubtitle="Platform Admin"
        showUpgradeCard={false}
      />
      <main className="flex-1 flex flex-col min-w-0 w-full">
        <Topbar />
        {/* Admin pages supply their own inner padding */}
        <div className="flex-1 animate-fade-in">
          {children}
        </div>
        {/* Mount the global topbar drawers — same components used by
            DashboardLayout. The Topbar's megaphone (What's new) and
            help icon dispatch open-changelog / open-help events; without
            the drawers mounted those clicks do nothing. */}
        <CommandPalette />
        <ChangelogDrawer />
        <HelpDrawer />
        <InboxDrawer />
      </main>
    </div>
  );
}
