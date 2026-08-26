import { redirect } from 'next/navigation';

// Inventory now lives as a tab inside the Catalog page. Keep this route as a
// redirect so existing links (e.g. the low-stock notification) still land on
// the inventory view — forwarding the lowStock filter when present.
export default function InventoryRedirect({ searchParams }: { searchParams?: { lowStock?: string } }) {
  const low = searchParams?.lowStock === 'true';
  redirect(`/products?view=inventory${low ? '&lowStock=true' : ''}`);
}
