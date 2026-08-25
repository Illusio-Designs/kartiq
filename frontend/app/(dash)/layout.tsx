import { DashboardLayout } from '@/components/layout/DashboardLayout';

// Route-group layout for all tenant dashboard pages. Because this is a Next.js
// layout (not rendered inside each page), the DashboardLayout instance — and
// therefore the whole chrome (sidebar, topbar, auth guard, drawers) — stays
// MOUNTED across client-side navigations between these routes. Only the page
// segment ({children}) swaps, so moving between /orders, /products, /channels,
// etc. no longer remounts or "reloads" the layout. Pages under this group must
// return just their content and must NOT wrap themselves in <DashboardLayout>.
export default function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
