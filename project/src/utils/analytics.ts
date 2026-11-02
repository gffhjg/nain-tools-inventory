import type { Product, SaleRecord, PurchaseRecord } from '@/lib/types';

export type DateRange = 'today' | '3d' | '7d' | '14d' | '30d' | '90d' | 'all';

export type PeriodFilterMode = 'date' | 'month' | 'year' | 'all';

export interface PeriodFilter {
  mode: PeriodFilterMode;
  date: string;  // YYYY-MM-DD
  month: string; // YYYY-MM
  year: string;  // YYYY
}

export function getTodayISO(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getCurrentMonthISO(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function getCurrentYearISO(): string {
  return String(new Date().getFullYear());
}

export function shiftISODate(dateStr: string, days: number): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    d.setDate(d.getDate() + days);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return dateStr;
  }
}

export function shiftISOMonth(monthStr: string, months: number): string {
  try {
    const [y, m] = monthStr.split('-').map(Number);
    const d = new Date(y, m - 1 + months, 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  } catch {
    return monthStr;
  }
}

export function shiftISOYear(yearStr: string, years: number): string {
  try {
    const y = parseInt(yearStr, 10);
    if (isNaN(y)) return yearStr;
    return String(y + years);
  } catch {
    return yearStr;
  }
}

export function formatFriendlyDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function formatFriendlyMonth(monthStr: string): string {
  if (!monthStr) return '';
  try {
    const [y, m] = monthStr.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    if (isNaN(d.getTime())) return monthStr;
    return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  } catch {
    return monthStr;
  }
}

export function getPeriodFilterLabel(filter: PeriodFilter): string {
  if (filter.mode === 'all') return 'All Time';
  if (filter.mode === 'date') {
    if (!filter.date) return 'Select Date';
    const today = getTodayISO();
    if (filter.date === today) {
      return `Today (${formatFriendlyDate(filter.date)})`;
    }
    const yesterday = shiftISODate(today, -1);
    if (filter.date === yesterday) {
      return `Yesterday (${formatFriendlyDate(filter.date)})`;
    }
    return formatFriendlyDate(filter.date);
  }
  if (filter.mode === 'month') {
    return formatFriendlyMonth(filter.month);
  }
  if (filter.mode === 'year') {
    return `Year ${filter.year}`;
  }
  return 'All Time';
}

export function filterByPeriod<T extends { date?: string; convertedAt?: string }>(
  items: T[],
  filter: PeriodFilter
): T[] {
  if (filter.mode === 'all') return items;
  if (filter.mode === 'date') {
    const target = filter.date;
    if (!target) return items;
    return items.filter((i) => {
      const d = (i.date || i.convertedAt || '').slice(0, 10);
      return d === target;
    });
  }
  if (filter.mode === 'month') {
    const target = filter.month;
    if (!target) return items;
    return items.filter((i) => {
      const d = (i.date || i.convertedAt || '').slice(0, 7);
      return d === target;
    });
  }
  if (filter.mode === 'year') {
    const target = filter.year;
    if (!target) return items;
    return items.filter((i) => {
      const d = (i.date || i.convertedAt || '').slice(0, 4);
      return d === target;
    });
  }
  return items;
}

export function getDaysAgo(dateStr: string): number {
  if (!dateStr) return 0;
  const now = new Date();
  const d = new Date(dateStr + (dateStr.length <= 10 ? 'T00:00:00' : ''));
  const diffTime = now.getTime() - d.getTime();
  return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
}

export function formatRelativeDate(dateStr: string): string {
  if (!dateStr) return '';
  const days = getDaysAgo(dateStr);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

export function getDateRangeBounds(range: DateRange): { fromDate: string; toDate: string; days: number | null } {
  const now = new Date();
  const toDate = now.toISOString().slice(0, 10);
  if (range === 'all') {
    return { fromDate: '1970-01-01', toDate, days: null };
  }
  if (range === 'today') {
    return { fromDate: toDate, toDate, days: 0 };
  }
  const days = range === '3d' ? 3 : range === '7d' ? 7 : range === '14d' ? 14 : range === '30d' ? 30 : 90;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  const fromDate = cutoff.toISOString().slice(0, 10);
  return { fromDate, toDate, days };
}

export function getDateRangeLabel(range: DateRange): string {
  if (range === 'all') return 'All Time';
  const bounds = getDateRangeBounds(range);
  if (range === 'today') {
    const todayObj = new Date(bounds.toDate + 'T00:00:00');
    return `Today (${todayObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })})`;
  }
  const fromDateObj = new Date(bounds.fromDate + 'T00:00:00');
  const toDateObj = new Date(bounds.toDate + 'T00:00:00');
  const fromStr = fromDateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const toStr = toDateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${fromStr} – ${toStr} (${bounds.days} Days)`;
}

export function filterByDateRange<T extends { date: string; convertedAt?: string }>(items: T[], range: DateRange): T[] {
  if (range === 'all') return items;
  const { fromDate } = getDateRangeBounds(range);
  return items.filter((i) => {
    if (i.date && i.date >= fromDate) return true;
    if (i.convertedAt && i.convertedAt.slice(0, 10) >= fromDate) return true;
    return false;
  });
}

export function money(n: number): string {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function moneyShort(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}k`;
  return `₹${n.toFixed(0)}`;
}

export function computeStats(products: Product[], sales: SaleRecord[], purchases: PurchaseRecord[]) {
  // Pre-index product cost for O(1) lookup (avoids 300M+ operations on 12k sales x 6k products)
  const productCostMap = new Map<string, number>();
  let totalUnitsInStock = 0;
  let inventoryValue = 0;
  const lowStockItems: Product[] = [];

  for (const p of products) {
    productCostMap.set(p.id, p.cost);
    totalUnitsInStock += p.stock;
    inventoryValue += p.stock * p.cost;
    if (p.status === 'low-stock' || p.status === 'out-of-stock') {
      lowStockItems.push(p);
    }
  }

  let totalRevenue = 0;
  let pendingPayments = 0;
  let costOfGoods = 0;
  let netSalesRevenue = 0;

  // Single-pass computation over sales
  for (const sale of sales) {
    if (sale.status === 'draft' || sale.status === 'cancelled') continue;

    totalRevenue += sale.grandTotal;
    netSalesRevenue += (sale.subtotal - sale.discount);

    if (sale.status !== 'paid') {
      pendingPayments += (sale.grandTotal - sale.amountPaid);
    }

    for (const item of sale.items) {
      if (item.isCustom || (item.cost !== undefined && item.cost > 0)) {
        costOfGoods += (item.cost || 0) * item.qty;
      } else {
        const cost = productCostMap.get(item.productId) ?? 0;
        costOfGoods += cost * item.qty;
      }
    }
  }

  let totalPurchaseValue = 0;
  for (const p of purchases) {
    totalPurchaseValue += p.grandTotal;
  }

  const grossProfit = netSalesRevenue - costOfGoods;
  const profitMargin = netSalesRevenue > 0 ? (grossProfit / netSalesRevenue) * 100 : 0;

  return {
    totalRevenue,
    totalSalesCount: sales.length,
    totalUnitsInStock,
    lowStockCount: lowStockItems.length,
    lowStockItems,
    totalPurchaseValue,
    inventoryValue,
    pendingPayments,
    costOfGoods,
    grossProfit,
    profitMargin,
  };
}

export function topSellingProducts(sales: SaleRecord[], limit = 5) {
  const map = new Map<string, { productId: string; name: string; sold: number; revenue: number }>();
  for (const sale of sales) {
    if (sale.status === 'draft' || sale.status === 'cancelled') continue;
    for (const item of sale.items) {
      const key = item.isCustom ? `custom_${item.name}` : item.productId;
      const existing = map.get(key) ?? { productId: key, name: item.name, sold: 0, revenue: 0 };
      existing.sold += item.qty;
      existing.revenue += item.price * item.qty;
      map.set(key, existing);
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export function salesByMonth(sales: SaleRecord[]): { month: string; value: number }[] {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const map = new Map<string, number>();
  for (const s of sales) {
    const d = new Date(s.date + 'T00:00:00');
    const key = `${months[d.getMonth()]}`;
    map.set(key, (map.get(key) ?? 0) + s.grandTotal);
  }
  // Return in calendar order, only months that have data
  return months
    .filter((m) => map.has(m))
    .map((m) => ({ month: m, value: map.get(m)! }));
}

export function categoryBreakdownFromSales(sales: SaleRecord[], products: Product[]) {
  // Pre-index product categories for O(1) lookup
  const categoryMap = new Map<string, string>();
  for (const p of products) {
    categoryMap.set(p.id, p.category || 'Other');
  }

  const map = new Map<string, { category: string; count: number; revenue: number }>();
  for (const sale of sales) {
    if (sale.status === 'draft' || sale.status === 'cancelled') continue;
    for (const item of sale.items) {
      const category = item.isCustom ? 'Custom & Sourced' : (categoryMap.get(item.productId) ?? 'Other');
      const existing = map.get(category) ?? { category, count: 0, revenue: 0 };
      existing.count += item.qty;
      existing.revenue += item.price * item.qty;
      map.set(category, existing);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

export function buildRecentActivity(
  sales: SaleRecord[],
  purchases: PurchaseRecord[],
  products: Product[],
): {
  id: string;
  type: 'sale' | 'purchase' | 'stock' | 'alert';
  title: string;
  detail: string;
  time: string;
  date: string;
}[] {
  const events: { id: string; type: 'sale' | 'purchase' | 'stock' | 'alert'; title: string; detail: string; time: string; date: string }[] = [];

  for (const s of sales.slice(0, 4)) {
    events.push({
      id: `act-s-${s.id}`,
      type: 'sale',
      title: 'Sale completed',
      detail: `${s.invoice} · ${s.customer} · ${money(s.grandTotal)}`,
      time: s.date,
      date: s.date,
    });
  }
  for (const p of purchases.slice(0, 3)) {
    events.push({
      id: `act-p-${p.id}`,
      type: 'purchase',
      title: `Purchase ${p.status === 'received' ? 'received' : 'order placed'}`,
      detail: `${p.poNumber} · ${p.supplier} · ${money(p.grandTotal)}`,
      time: p.date,
      date: p.date,
    });
  }
  const todayStr = new Date().toISOString().slice(0, 10);
  for (const p of products.filter((p) => p.status === 'out-of-stock').slice(0, 2)) {
    events.push({
      id: `act-o-${p.id}`,
      type: 'alert',
      title: 'Out of stock',
      detail: `${p.name} depleted`,
      time: '',
      date: todayStr,
    });
  }
  for (const p of products.filter((p) => p.status === 'low-stock').slice(0, 2)) {
    events.push({
      id: `act-l-${p.id}`,
      type: 'alert',
      title: 'Low stock alert',
      detail: `${p.name} below reorder level`,
      time: '',
      date: todayStr,
    });
  }

  return events.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
}

export function toCSV(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(
      headers
        .map((h) => {
          const val = row[h];
          const str = String(val ?? '');
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(','),
    );
  }
  return lines.join('\n');
}

export function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function printReport(title: string, subtitle: string, bodyHTML: string) {
  const win = window.open('', '_blank', 'width=820,height=900');
  if (!win) return;
  win.document.write(`<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>${escapeHtml(title)} — Nain Tools</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#334155;background:#fff;padding:32px;}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1a52f5;padding-bottom:16px;margin-bottom:24px;}
  .brand{font-size:20px;font-weight:700;color:#0f172a;}.brand-sub{font-size:12px;color:#64748b;}
  .report-title{font-size:18px;font-weight:600;color:#1a52f5;text-align:right;}
  .report-sub{font-size:13px;color:#64748b;text-align:right;margin-top:4px;}
  table{width:100%;border-collapse:collapse;margin-top:16px;}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;padding:10px 8px;border-bottom:2px solid #e2e8f0;text-align:left;}
  td{padding:10px 8px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#334155;}
  .totals{margin-top:20px;text-align:right;}
  .totals-row{display:flex;justify-content:flex-end;gap:24px;padding:6px 0;font-size:14px;color:#475569;}
  .totals-row.grand{border-top:2px solid #e2e8f0;margin-top:8px;padding-top:12px;font-size:18px;font-weight:700;color:#0f172a;}
  .footer{margin-top:32px;border-top:1px solid #f1f5f9;padding-top:16px;text-align:center;font-size:12px;color:#94a3b8;}
  @media print{body{padding:0;}}
</style></head><body>
<div class="header">
  <div><div class="brand">Nain Tools & Bolt Co.</div><div class="brand-sub">Stainless Steel Fastener Specialists</div></div>
  <div><div class="report-title">${escapeHtml(title)}</div><div class="report-sub">${escapeHtml(subtitle)}</div></div>
</div>
${bodyHTML}
<div class="footer">Generated on ${new Date().toLocaleDateString()} by Nain Tools & Bolt Co.</div>
<script>window.onload=function(){window.print();};</script>
</body></html>`);
  win.document.close();
}

/**
 * Takes an invoice string (e.g. "INV-2046", "00744", "NT/24-25/012", "105", "INV-0099")
 * and returns the next invoice number with the same prefix and padding incremented by 1.
 */
export function incrementInvoiceNumber(inv: string): string {
  if (!inv || !inv.trim()) {
    return 'INV-2041';
  }
  const trimmed = inv.trim();

  // Match: (prefix)(trailing digits)
  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (!match) {
    return `${trimmed}-1`;
  }

  const [, prefix, numStr] = match;
  const num = parseInt(numStr, 10);
  const nextNum = num + 1;

  // Preserve leading zero padding if the original had leading zeros (e.g. "00744" has length 5 -> "00745")
  const padded = String(nextNum).padStart(numStr.length, '0');
  return `${prefix}${padded}`;
}

export function nextInvoice(existing: { invoice: string; documentType?: string }[], docType: string = 'TAX INVOICE'): string {
  const existingInvoices = new Set(existing.map((s) => s.invoice.trim().toLowerCase()));

  // 1. Check if user recently entered a custom invoice number in localStorage
  try {
    const lastEntered = localStorage.getItem('nain_last_entered_invoice_no');
    if (lastEntered && lastEntered.trim()) {
      let candidate = incrementInvoiceNumber(lastEntered.trim());
      let attempts = 0;
      while (existingInvoices.has(candidate.toLowerCase()) && attempts < 1000) {
        candidate = incrementInvoiceNumber(candidate);
        attempts++;
      }
      return candidate;
    }
  } catch {
    // ignore localStorage errors
  }

  // 2. Find the latest invoice from matching document type or general invoices
  const relevant = existing.filter((s) => !s.documentType || s.documentType === docType || s.documentType === 'TAX INVOICE');
  if (relevant.length > 0 && relevant[0]?.invoice) {
    let candidate = incrementInvoiceNumber(relevant[0].invoice);
    let attempts = 0;
    while (existingInvoices.has(candidate.toLowerCase()) && attempts < 1000) {
      candidate = incrementInvoiceNumber(candidate);
      attempts++;
    }
    return candidate;
  }

  // 3. Check any existing invoice
  if (existing.length > 0 && existing[0]?.invoice) {
    let candidate = incrementInvoiceNumber(existing[0].invoice);
    let attempts = 0;
    while (existingInvoices.has(candidate.toLowerCase()) && attempts < 1000) {
      candidate = incrementInvoiceNumber(candidate);
      attempts++;
    }
    return candidate;
  }

  return 'INV-2041';
}



