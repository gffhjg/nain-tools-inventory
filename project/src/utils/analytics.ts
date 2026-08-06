import type { Product, SaleRecord, PurchaseRecord } from '@/lib/types';

export type DateRange = '7d' | '30d' | '90d' | 'all';

export function filterByDateRange<T extends { date: string }>(items: T[], range: DateRange): T[] {
  if (range === 'all') return items;
  const now = new Date();
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return items.filter((i) => i.date >= cutoffStr);
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
  const totalRevenue = sales
    .filter((s) => s.status !== 'draft' && s.status !== 'cancelled')
    .reduce((s, r) => s + r.grandTotal, 0);
  const totalSalesCount = sales.length;
  const totalUnitsInStock = products.reduce((s, p) => s + p.stock, 0);
  const lowStockItems = products.filter((p) => p.status === 'low-stock' || p.status === 'out-of-stock');
  const totalPurchaseValue = purchases.reduce((s, p) => s + p.grandTotal, 0);
  const inventoryValue = products.reduce((s, p) => s + p.stock * p.cost, 0);
  const pendingPayments = sales
    .filter((s) => s.status !== 'paid' && s.status !== 'cancelled' && s.status !== 'draft')
    .reduce((s, r) => s + (r.grandTotal - r.amountPaid), 0);

  // Profit = sales revenue (subtotal minus discount) - cost of goods sold
  const costOfGoods = sales
    .filter((s) => s.status !== 'draft' && s.status !== 'cancelled')
    .reduce((sum, sale) => {
    return sum + sale.items.reduce((s, item) => {
      const product = products.find((p) => p.id === item.productId);
      return s + (product ? product.cost * item.qty : 0);
    }, 0);
  }, 0);
  const netSalesRevenue = sales
    .filter((s) => s.status !== 'draft' && s.status !== 'cancelled')
    .reduce((s, r) => s + r.subtotal - r.discount, 0);
  const grossProfit = netSalesRevenue - costOfGoods;
  const profitMargin = netSalesRevenue > 0 ? (grossProfit / netSalesRevenue) * 100 : 0;

  return {
    totalRevenue,
    totalSalesCount,
    totalUnitsInStock,
    lowStockCount: lowStockItems.length,
    lowStockItems,
    totalPurchaseValue,
    inventoryValue,
    pendingPayments,
    grossProfit,
    profitMargin,
  };
}

export function topSellingProducts(sales: SaleRecord[], limit = 5) {
  const map = new Map<string, { productId: string; name: string; sold: number; revenue: number }>();
  for (const sale of sales) {
    if (sale.status === 'draft' || sale.status === 'cancelled') continue;
    for (const item of sale.items) {
      const existing = map.get(item.productId) ?? { productId: item.productId, name: item.name, sold: 0, revenue: 0 };
      existing.sold += item.qty;
      existing.revenue += item.price * item.qty;
      map.set(item.productId, existing);
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
  const map = new Map<string, { category: string; count: number; revenue: number }>();
  for (const sale of sales) {
    if (sale.status === 'draft' || sale.status === 'cancelled') continue;
    for (const item of sale.items) {
      const product = products.find((p) => p.id === item.productId);
      const category = product?.category ?? 'Other';
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
