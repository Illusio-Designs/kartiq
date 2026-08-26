import { redirect } from 'next/navigation';

// Inventory now lives as a tab inside the Catalog page. Keep this route as a
// permanent redirect so existing links (e.g. the low-stock notification) still
// land on the inventory view.
export default function InventoryRedirect() {
  redirect('/products?view=inventory');
}
