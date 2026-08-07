import { useState, useMemo } from 'react';
import { Download, Calendar, Printer, TrendingUp, TrendingDown, DollarSign, Package, Percent, ShoppingCart, Truck, FileText, BarChart3, AlertTriangle, Trophy, Wallet, Users, IndianRupee, CheckCircle2, Clock } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import { useStore } from '@/store/AppStore';
import type { SaleRecord, PurchaseRecord, Product } from '@/lib/types';
import { computeDiscountAmount } from '@/lib/constants';
import {
  computeStats, topSellingProducts, filterByDateRange,
  toCSV, downloadCSV, printReport, money, escapeHtml,
  type DateRange,
} from '@/utils/analytics';

type ReportType = 'sales' | 'purchase' | 'inventory' | 'profit' | 'lowstock' | 'topselling' | 'gst' | 'cust-outstanding' | 'sup-outstanding';

const reportTypes: { id: ReportType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'sales', label: 'Sales Report', icon: ShoppingCart },
  { id: 'purchase', label: 'Purchase Report', icon: Truck },
  { id: 'inventory', label: 'Inventory Report', icon: Package },
  { id: 'profit', label: 'Profit / Loss', icon: Wallet },
  { id: 'gst', label: 'GST Report', icon: Percent },
  { id: 'cust-outstanding', label: 'Customer Ledger', icon: Users },
  { id: 'sup-outstanding', label: 'Supplier Ledger', icon: Truck },
  { id: 'lowstock', label: 'Low Stock', icon: AlertTriangle },
  { id: 'topselling', label: 'Top Selling', icon: Trophy },
];

const dateRanges: { id: DateRange; label: string }[] = [
  { id: '7d', label: '7 Days' },
  { id: '30d', label: '30 Days' },
  { id: '90d', label: '90 Days' },
  { id: 'all', label: 'All Time' },
];

export default function Reports() {
  const { products, sales, purchases, customers, suppliers } = useStore();

  const [activeReport, setActiveReport] = useState<ReportType>('sales');
  const [dateRange, setDateRange] = useState<DateRange>('all');

  const filteredSales = useMemo(() => filterByDateRange(sales, dateRange), [sales, dateRange]);
  const filteredPurchases = useMemo(() => filterByDateRange(purchases, dateRange), [purchases, dateRange]);

  const stats = useMemo(() => computeStats(products, filteredSales, filteredPurchases), [products, filteredSales, filteredPurchases]);
  const topProducts = useMemo(() => topSellingProducts(filteredSales, 10), [filteredSales]);

  const kpis = useMemo(() => {
    switch (activeReport) {
      case 'sales':
        return [
          { label: 'Total Sales Revenue', value: money(stats.totalRevenue), icon: DollarSign, tone: 'bg-brand-50 text-brand-600' },
          { label: 'Total Orders', value: String(stats.totalSalesCount), icon: ShoppingCart, tone: 'bg-accent-50 text-accent-600' },
          { label: 'Pending Payments', value: money(stats.pendingPayments), icon: Clock, tone: 'bg-warn-50 text-warn-600' },
          { label: 'Avg. Order Value', value: stats.totalSalesCount > 0 ? money(stats.totalRevenue / stats.totalSalesCount) : '₹0.00', icon: TrendingUp, tone: 'bg-slate-100 text-slate-600' },
        ];
      case 'purchase':
        return [
          { label: 'Total Purchase Value', value: money(stats.totalPurchaseValue), icon: Truck, tone: 'bg-brand-50 text-brand-600' },
          { label: 'Total Orders', value: String(filteredPurchases.length), icon: FileText, tone: 'bg-accent-50 text-accent-600' },
          { label: 'Items Purchased', value: String(filteredPurchases.reduce((s, p) => s + p.itemCount, 0)), icon: Package, tone: 'bg-amber-50 text-amber-600' },
          { label: 'Pending Payments', value: money(filteredPurchases.filter((p) => p.paymentStatus === 'Pending').reduce((s, p) => s + p.grandTotal, 0)), icon: Clock, tone: 'bg-err-50 text-err-600' },
        ];
      case 'inventory':
        return [
          { label: 'Total Estimated Units', value: String(stats.totalUnitsInStock), icon: Package, tone: 'bg-brand-50 text-brand-600' },
          { label: 'Inventory Value (Cost)', value: money(stats.inventoryValue), icon: DollarSign, tone: 'bg-accent-50 text-accent-600' },
          { label: 'Retail Value', value: money(products.reduce((s, p) => s + p.stock * p.price, 0)), icon: TrendingUp, tone: 'bg-amber-50 text-amber-600' },
          { label: 'Total Products', value: String(products.length), icon: BarChart3, tone: 'bg-slate-100 text-slate-600' },
        ];
      case 'profit':
        return [
          { label: 'Net Sales Revenue', value: money(stats.totalRevenue), icon: DollarSign, tone: 'bg-brand-50 text-brand-600' },
          { label: 'Cost of Goods Sold', value: money(stats.totalRevenue - stats.grossProfit - filteredSales.reduce((s, r) => s + r.gstAmount + computeDiscountAmount(r.subtotal, r.discount, r.discountType), 0)), icon: TrendingDown, tone: 'bg-err-50 text-err-600' },
          { label: 'Gross Profit', value: money(stats.grossProfit), icon: TrendingUp, tone: 'bg-accent-50 text-accent-600' },
          { label: 'Profit Margin', value: `${stats.profitMargin.toFixed(1)}%`, icon: Percent, tone: 'bg-amber-50 text-amber-600' },
        ];
      case 'lowstock':
        return [
          { label: 'Low Stock Items', value: String(products.filter((p) => p.status === 'low-stock').length), icon: AlertTriangle, tone: 'bg-warn-50 text-warn-600' },
          { label: 'Out of Stock', value: String(products.filter((p) => p.status === 'out-of-stock').length), icon: AlertTriangle, tone: 'bg-err-50 text-err-600' },
          { label: 'Items Needing Reorder', value: String(stats.lowStockCount), icon: Package, tone: 'bg-brand-50 text-brand-600' },
          { label: 'Healthy Stock', value: String(products.filter((p) => p.status === 'in-stock').length), icon: TrendingUp, tone: 'bg-accent-50 text-accent-600' },
        ];
      case 'topselling':
        return [
          { label: 'Top Product Revenue', value: topProducts.length > 0 ? money(topProducts[0].revenue) : '₹0.00', icon: Trophy, tone: 'bg-amber-50 text-amber-600' },
          { label: 'Total Units Sold', value: String(topProducts.reduce((s, p) => s + p.sold, 0)), icon: Package, tone: 'bg-brand-50 text-brand-600' },
          { label: 'Products Sold', value: String(topProducts.length), icon: BarChart3, tone: 'bg-accent-50 text-accent-600' },
          { label: 'Avg. Revenue / Product', value: topProducts.length > 0 ? money(topProducts.reduce((s, p) => s + p.revenue, 0) / topProducts.length) : '₹0.00', icon: DollarSign, tone: 'bg-slate-100 text-slate-600' },
        ];
      case 'gst':
        return [
          { label: 'Output GST (Sales)', value: money(filteredSales.reduce((s, r) => s + r.gstAmount, 0)), icon: TrendingUp, tone: 'bg-brand-50 text-brand-600' },
          { label: 'Input GST (Purchases)', value: money(filteredPurchases.reduce((s, p) => s + p.gstAmount, 0)), icon: TrendingDown, tone: 'bg-err-50 text-err-600' },
          { label: 'Net GST Payable', value: money(Math.max(0, filteredSales.reduce((s, r) => s + r.gstAmount, 0) - filteredPurchases.reduce((s, p) => s + p.gstAmount, 0))), icon: Wallet, tone: 'bg-accent-50 text-accent-600' },
          { label: 'Total Taxable Value', value: money(filteredSales.reduce((s, r) => s + r.subtotal - computeDiscountAmount(r.subtotal, r.discount, r.discountType), 0) + filteredPurchases.reduce((s, p) => s + p.subtotal, 0)), icon: Percent, tone: 'bg-slate-100 text-slate-600' },
        ];
      case 'cust-outstanding': {
        const totalOutstanding = sales
          .filter((s) => s.status !== 'paid' && s.status !== 'cancelled' && s.status !== 'draft')
          .reduce((sum, s) => sum + (s.grandTotal - s.amountPaid), 0);
        const totalOverdue = sales.filter((s) => s.status === 'pending').length;
        const partiallyPaid = sales.filter((s) => s.status === 'partially-paid').length;
        const totalInvoices = sales.filter((s) => s.status !== 'paid' && s.status !== 'cancelled' && s.status !== 'draft').length;
        return [
          { label: 'Total Outstanding', value: money(totalOutstanding), icon: IndianRupee, tone: 'bg-warn-50 text-warn-600' },
          { label: 'Outstanding Invoices', value: String(totalInvoices), icon: FileText, tone: 'bg-slate-100 text-slate-600' },
          { label: 'Partially Paid', value: String(partiallyPaid), icon: Clock, tone: 'bg-amber-50 text-amber-600' },
          { label: 'Pending (Unpaid)', value: String(totalOverdue), icon: AlertTriangle, tone: 'bg-err-50 text-err-600' },
        ];
      }
      case 'sup-outstanding': {
        const totalPayable = purchases.filter((p) => p.paymentStatus === 'Pending').reduce((sum, p) => sum + p.grandTotal, 0);
        const pendingCount = purchases.filter((p) => p.paymentStatus === 'Pending').length;
        const paidCount = purchases.filter((p) => p.paymentStatus === 'Paid').length;
        const totalPurchases = purchases.length;
        return [
          { label: 'Total Payable', value: money(totalPayable), icon: IndianRupee, tone: 'bg-warn-50 text-warn-600' },
          { label: 'Pending Payments', value: String(pendingCount), icon: Clock, tone: 'bg-err-50 text-err-600' },
          { label: 'Paid Invoices', value: String(paidCount), icon: CheckCircle2, tone: 'bg-accent-50 text-accent-600' },
          { label: 'Total POs', value: String(totalPurchases), icon: FileText, tone: 'bg-slate-100 text-slate-600' },
        ];
      }
    }
  }, [activeReport, stats, filteredSales, filteredPurchases, products, topProducts, sales, purchases]);

  const handleExportCSV = () => {
    let rows: Record<string, string | number>[] = [];
    let filename = 'report.csv';

    switch (activeReport) {
      case 'sales':
        rows = filteredSales.map((s) => ({
          Invoice: s.invoice, Customer: s.customer, Date: s.date,
          Items: s.itemCount, Subtotal: s.subtotal.toFixed(2),
          Discount: s.discount.toFixed(2), DiscountType: s.discountType, GST: s.gstAmount.toFixed(2),
          Total: s.grandTotal.toFixed(2), Payment: s.paymentMethod, Status: s.status,
        }));
        filename = 'sales-report.csv';
        break;
      case 'purchase':
        rows = filteredPurchases.map((p) => ({
          'PO Number': p.poNumber, Supplier: p.supplier, Date: p.date,
          Items: p.itemCount, Subtotal: p.subtotal.toFixed(2),
          GST: p.gstAmount.toFixed(2), Total: p.grandTotal.toFixed(2),
          'Payment Status': p.paymentStatus, 'Payment Method': p.paymentMethod,
        }));
        filename = 'purchase-report.csv';
        break;
      case 'inventory':
        rows = products.map((p) => ({
          Name: p.name, Category: p.category, Supplier: p.supplier,
          Rack: p.rackNumber,
          'Est. Stock': p.stock, 'Box Capacity': p.boxCapacity,
          'Reorder Level': p.reorderLevel,
          'Unit Cost': p.cost.toFixed(2), 'Unit Price': p.price.toFixed(2),
          'Profit / Piece': (p.price - p.cost).toFixed(2),
          'Stock Value': (p.stock * p.cost).toFixed(2),
          'Box Status': p.boxStatus,
          Status: p.status,
        }));
        filename = 'inventory-report.csv';
        break;
      case 'profit':
        rows = filteredSales.map((s) => {
          const cogs = s.items.reduce((sum, item) => {
            const prod = products.find((p) => p.id === item.productId);
            return sum + (prod ? prod.cost * item.qty : 0);
          }, 0);
          const revenue = s.subtotal - computeDiscountAmount(s.subtotal, s.discount, s.discountType);
          return {
            Invoice: s.invoice, Customer: s.customer, Date: s.date,
            Revenue: revenue.toFixed(2), COGS: cogs.toFixed(2),
            Profit: (revenue - cogs).toFixed(2),
            Margin: revenue > 0 ? ((revenue - cogs) / revenue * 100).toFixed(1) + '%' : '0%',
          };
        });
        filename = 'profit-loss-report.csv';
        break;
      case 'lowstock':
        rows = products
          .filter((p) => p.status !== 'in-stock')
          .map((p) => ({
            Name: p.name, Category: p.category,
            Stock: p.stock, 'Reorder Level': p.reorderLevel,
            Supplier: p.supplier, Status: p.status,
          }));
        filename = 'low-stock-report.csv';
        break;
      case 'topselling':
        rows = topProducts.map((p, i) => ({
          Rank: i + 1, Product: p.name, 'Units Sold': p.sold,
          Revenue: p.revenue.toFixed(2),
        }));
        filename = 'top-selling-report.csv';
        break;
      case 'gst':
        rows = [
          { Type: 'Output GST (Sales)', 'Taxable Value': filteredSales.reduce((s, r) => s + r.subtotal - computeDiscountAmount(r.subtotal, r.discount, r.discountType), 0).toFixed(2), 'GST Amount': filteredSales.reduce((s, r) => s + r.gstAmount, 0).toFixed(2) },
          { Type: 'Input GST (Purchases)', 'Taxable Value': filteredPurchases.reduce((s, p) => s + p.subtotal, 0).toFixed(2), 'GST Amount': filteredPurchases.reduce((s, p) => s + p.gstAmount, 0).toFixed(2) },
          { Type: 'Net GST Payable', 'Taxable Value': '', 'GST Amount': Math.max(0, filteredSales.reduce((s, r) => s + r.gstAmount, 0) - filteredPurchases.reduce((s, p) => s + p.gstAmount, 0)).toFixed(2) },
        ];
        filename = 'gst-report.csv';
        break;
      case 'cust-outstanding': {
        const outstandingSales = sales.filter((s) => s.status !== 'paid' && s.status !== 'cancelled' && s.status !== 'draft');
        const byCustomer = new Map<string, { name: string; total: number; paid: number; outstanding: number; count: number }>();
        for (const s of outstandingSales) {
          const existing = byCustomer.get(s.customer) ?? { name: s.customer, total: 0, paid: 0, outstanding: 0, count: 0 };
          existing.total += s.grandTotal;
          existing.paid += s.amountPaid;
          existing.outstanding += s.grandTotal - s.amountPaid;
          existing.count++;
          byCustomer.set(s.customer, existing);
        }
        rows = Array.from(byCustomer.values()).sort((a, b) => b.outstanding - a.outstanding).map((c) => ({
          Customer: c.name, 'Invoices': c.count, 'Total Value': c.total.toFixed(2),
          'Paid': c.paid.toFixed(2), 'Outstanding': c.outstanding.toFixed(2),
        }));
        filename = 'customer-outstanding.csv';
        break;
      }
      case 'sup-outstanding': {
        const pendingPurchases = purchases.filter((p) => p.paymentStatus === 'Pending');
        const bySupplier = new Map<string, { name: string; total: number; count: number }>();
        for (const p of pendingPurchases) {
          const existing = bySupplier.get(p.supplier) ?? { name: p.supplier, total: 0, count: 0 };
          existing.total += p.grandTotal;
          existing.count++;
          bySupplier.set(p.supplier, existing);
        }
        rows = Array.from(bySupplier.values()).sort((a, b) => b.total - a.total).map((s) => ({
          Supplier: s.name, 'Pending POs': s.count, 'Payable Amount': s.total.toFixed(2),
        }));
        filename = 'supplier-outstanding.csv';
        break;
      }
    }

    downloadCSV(filename, toCSV(rows));
  };

  const handlePrint = () => {
    const rangeLabel = dateRanges.find((r) => r.id === dateRange)?.label ?? 'All Time';
    const reportLabel = reportTypes.find((r) => r.id === activeReport)?.label ?? 'Report';
    const subtitle = `Period: ${rangeLabel} · Generated ${new Date().toLocaleDateString()}`;

    let bodyHTML = '';

    // Summary cards in print
    bodyHTML += '<div style="display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap;">';
    for (const k of kpis) {
      bodyHTML += `<div style="flex:1;min-width:140px;border:1px solid #e2e8f0;border-radius:12px;padding:12px;">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">${escapeHtml(k.label)}</div>
        <div style="font-size:20px;font-weight:700;color:#0f172a;margin-top:4px;">${escapeHtml(k.value)}</div>
      </div>`;
    }
    bodyHTML += '</div>';

    switch (activeReport) {
      case 'sales':
        bodyHTML += '<table><thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th>Items</th><th style="text-align:right;">Total</th><th>Status</th></tr></thead><tbody>';
        for (const s of filteredSales) {
          bodyHTML += `<tr><td style="font-weight:600;">${escapeHtml(s.invoice)}</td><td>${escapeHtml(s.customer)}</td><td>${escapeHtml(s.date)}</td><td>${s.itemCount}</td><td style="text-align:right;font-weight:600;">${money(s.grandTotal)}</td><td>${escapeHtml(s.status)}</td></tr>`;
        }
        bodyHTML += '</tbody></table>';
        bodyHTML += `<div class="totals"><div class="totals-row grand"><span>Total Revenue</span><span>${money(stats.totalRevenue)}</span></div></div>`;
        break;
      case 'purchase':
        bodyHTML += '<table><thead><tr><th>PO Number</th><th>Supplier</th><th>Date</th><th>Items</th><th style="text-align:right;">Total</th><th>Status</th></tr></thead><tbody>';
        for (const p of filteredPurchases) {
          bodyHTML += `<tr><td style="font-weight:600;">${escapeHtml(p.poNumber)}</td><td>${escapeHtml(p.supplier)}</td><td>${escapeHtml(p.date)}</td><td>${p.itemCount}</td><td style="text-align:right;font-weight:600;">${money(p.grandTotal)}</td><td>${escapeHtml(p.paymentStatus)}</td></tr>`;
        }
        bodyHTML += '</tbody></table>';
        bodyHTML += `<div class="totals"><div class="totals-row grand"><span>Total Purchases</span><span>${money(stats.totalPurchaseValue)}</span></div></div>`;
        break;
      case 'inventory':
        bodyHTML += '<table><thead><tr><th>Product</th><th>Category</th><th>Est. Stock</th><th>Box Cap.</th><th style="text-align:right;">Cost</th><th style="text-align:right;">Price</th><th style="text-align:right;">Profit</th><th style="text-align:right;">Value</th><th>Status</th></tr></thead><tbody>';
        for (const p of products) {
          bodyHTML += `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.category)}</td><td>${p.stock}</td><td>${p.boxCapacity}</td><td style="text-align:right;">${money(p.cost)}</td><td style="text-align:right;">${money(p.price)}</td><td style="text-align:right;">${money(p.price - p.cost)}</td><td style="text-align:right;">${money(p.stock * p.cost)}</td><td>${escapeHtml(p.status)}</td></tr>`;
        }
        bodyHTML += '</tbody></table>';
        bodyHTML += `<div class="totals"><div class="totals-row grand"><span>Total Inventory Value</span><span>${money(stats.inventoryValue)}</span></div></div>`;
        break;
      case 'profit':
        bodyHTML += '<table><thead><tr><th>Invoice</th><th>Customer</th><th>Revenue</th><th style="text-align:right;">COGS</th><th style="text-align:right;">Profit</th><th style="text-align:right;">Margin</th></tr></thead><tbody>';
        for (const s of filteredSales) {
          const cogs = s.items.reduce((sum, item) => {
            const prod = products.find((p) => p.id === item.productId);
            return sum + (prod ? prod.cost * item.qty : 0);
          }, 0);
          const revenue = s.subtotal - computeDiscountAmount(s.subtotal, s.discount, s.discountType);
          const profit = revenue - cogs;
          bodyHTML += `<tr><td style="font-weight:600;">${escapeHtml(s.invoice)}</td><td>${escapeHtml(s.customer)}</td><td>${money(revenue)}</td><td style="text-align:right;">${money(cogs)}</td><td style="text-align:right;font-weight:600;">${money(profit)}</td><td style="text-align:right;">${revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : '0.0'}%</td></tr>`;
        }
        bodyHTML += '</tbody></table>';
        bodyHTML += `<div class="totals"><div class="totals-row"><span>Gross Profit</span><span>${money(stats.grossProfit)}</span></div><div class="totals-row grand"><span>Profit Margin</span><span>${stats.profitMargin.toFixed(1)}%</span></div></div>`;
        break;
      case 'lowstock':
        bodyHTML += '<table><thead><tr><th>Name</th><th>Stock</th><th>Reorder Level</th><th>Supplier</th><th>Status</th></tr></thead><tbody>';
        for (const p of products.filter((p) => p.status !== 'in-stock')) {
          bodyHTML += `<tr><td>${escapeHtml(p.name)}</td><td>${p.stock}</td><td>${p.reorderLevel}</td><td>${escapeHtml(p.supplier)}</td><td>${escapeHtml(p.status)}</td></tr>`;
        }
        bodyHTML += '</tbody></table>';
        break;
      case 'topselling':
        bodyHTML += '<table><thead><tr><th>#</th><th>Product</th><th style="text-align:right;">Units Sold</th><th style="text-align:right;">Revenue</th></tr></thead><tbody>';
        topProducts.forEach((p, i) => {
          bodyHTML += `<tr><td>${i + 1}</td><td>${escapeHtml(p.name)}</td><td style="text-align:right;">${p.sold}</td><td style="text-align:right;font-weight:600;">${money(p.revenue)}</td></tr>`;
        });
        bodyHTML += '</tbody></table>';
        break;
      case 'gst': {
        bodyHTML += '<table><thead><tr><th>Type</th><th style="text-align:right;">Taxable Value</th><th style="text-align:right;">GST Amount</th></tr></thead><tbody>';
        bodyHTML += `<tr><td>Output GST (Sales)</td><td style="text-align:right;">${money(filteredSales.reduce((s, r) => s + r.subtotal - computeDiscountAmount(r.subtotal, r.discount, r.discountType), 0))}</td><td style="text-align:right;font-weight:600;">${money(filteredSales.reduce((s, r) => s + r.gstAmount, 0))}</td></tr>`;
        bodyHTML += `<tr><td>Input GST (Purchases)</td><td style="text-align:right;">${money(filteredPurchases.reduce((s, p) => s + p.subtotal, 0))}</td><td style="text-align:right;font-weight:600;">${money(filteredPurchases.reduce((s, p) => s + p.gstAmount, 0))}</td></tr>`;
        const netGst = filteredSales.reduce((s, r) => s + r.gstAmount, 0) - filteredPurchases.reduce((s, p) => s + p.gstAmount, 0);
        bodyHTML += `<tr style="font-weight:700;"><td>${netGst >= 0 ? 'Net GST Payable' : 'Net GST Refund'}</td><td></td><td style="text-align:right;">${money(Math.abs(netGst))}</td></tr>`;
        bodyHTML += '</tbody></table>';
        break;
      }
      case 'cust-outstanding': {
        const outstandingSales = sales.filter((s) => s.status !== 'paid' && s.status !== 'cancelled' && s.status !== 'draft');
        const byCustomer = new Map<string, { name: string; phone: string; total: number; paid: number; outstanding: number; count: number; lastDate: string }>();
        for (const s of outstandingSales) {
          const cust = customers.find((c) => c.name === s.customer);
          const existing = byCustomer.get(s.customer) ?? { name: s.customer, phone: cust?.phone ?? '—', total: 0, paid: 0, outstanding: 0, count: 0, lastDate: s.date };
          existing.total += s.grandTotal;
          existing.paid += s.amountPaid;
          existing.outstanding += s.grandTotal - s.amountPaid;
          existing.count++;
          if (s.date > existing.lastDate) existing.lastDate = s.date;
          byCustomer.set(s.customer, existing);
        }
        const rows = Array.from(byCustomer.values()).sort((a, b) => b.outstanding - a.outstanding);
        const totalOutstanding = rows.reduce((s, c) => s + c.outstanding, 0);
        bodyHTML += '<table><thead><tr><th>Customer</th><th>Phone</th><th style="text-align:right;">Invoices</th><th style="text-align:right;">Total Value</th><th style="text-align:right;">Paid</th><th style="text-align:right;">Outstanding</th><th>Last Invoice</th></tr></thead><tbody>';
        for (const c of rows) {
          bodyHTML += `<tr><td style="font-weight:600;">${escapeHtml(c.name)}</td><td>${escapeHtml(c.phone)}</td><td style="text-align:right;">${c.count}</td><td style="text-align:right;">${money(c.total)}</td><td style="text-align:right;">${money(c.paid)}</td><td style="text-align:right;font-weight:600;">${money(c.outstanding)}</td><td>${escapeHtml(c.lastDate)}</td></tr>`;
        }
        bodyHTML += '</tbody></table>';
        bodyHTML += `<div class="totals"><div class="totals-row grand"><span>Total Outstanding</span><span>${money(totalOutstanding)}</span></div></div>`;
        break;
      }
      case 'sup-outstanding': {
        const pendingPurchases = purchases.filter((p) => p.paymentStatus === 'Pending');
        const bySupplier = new Map<string, { name: string; phone: string; total: number; count: number; lastDate: string }>();
        for (const p of pendingPurchases) {
          const sup = suppliers.find((s) => s.name === p.supplier);
          const existing = bySupplier.get(p.supplier) ?? { name: p.supplier, phone: sup?.phone ?? '—', total: 0, count: 0, lastDate: p.date };
          existing.total += p.grandTotal;
          existing.count++;
          if (p.date > existing.lastDate) existing.lastDate = p.date;
          bySupplier.set(p.supplier, existing);
        }
        const rows = Array.from(bySupplier.values()).sort((a, b) => b.total - a.total);
        const totalPayable = rows.reduce((s, c) => s + c.total, 0);
        bodyHTML += '<table><thead><tr><th>Supplier</th><th>Phone</th><th style="text-align:right;">Pending POs</th><th style="text-align:right;">Payable Amount</th><th>Last PO</th></tr></thead><tbody>';
        for (const s of rows) {
          bodyHTML += `<tr><td style="font-weight:600;">${escapeHtml(s.name)}</td><td>${escapeHtml(s.phone)}</td><td style="text-align:right;">${s.count}</td><td style="text-align:right;font-weight:600;">${money(s.total)}</td><td>${escapeHtml(s.lastDate)}</td></tr>`;
        }
        bodyHTML += '</tbody></table>';
        bodyHTML += `<div class="totals"><div class="totals-row grand"><span>Total Payable</span><span>${money(totalPayable)}</span></div></div>`;
        break;
      }
    }

    printReport(reportLabel, subtitle, bodyHTML);
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Reports & Analytics"
        subtitle="Comprehensive business performance insights across sales, purchases, and inventory."
        actions={
          <>
            <button className="btn-secondary" onClick={handlePrint}>
              <Printer className="h-4 w-4" />
              <span className="hidden sm:inline">Print / PDF</span>
            </button>
            <button className="btn-primary" onClick={handleExportCSV}>
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
          </>
        }
      />

      {/* Report type tabs + date range */}
      <div className="sticky top-[8.5rem] z-10 mt-4 -mx-4 px-4 py-3 bg-slate-50/90 backdrop-blur-md rounded-lg lg:-mx-8 lg:px-8">
        <div className="card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {reportTypes.map((r) => {
              const Icon = r.icon;
              return (
                <button
                  key={r.id}
                  onClick={() => setActiveReport(r.id)}
                  className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                    activeReport === r.id
                      ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/20'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{r.label}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-400" />
            <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              {dateRanges.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setDateRange(r.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    dateRange === r.id
                      ? 'bg-white text-brand-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="card p-5">
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${k.tone}`}>
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-4 text-2xl font-bold text-slate-900">{k.value}</p>
              <p className="mt-1 text-sm text-slate-500">{k.label}</p>
            </div>
          );
        })}
      </div>

      {/* Report body */}
      <div className="mt-6">
        {activeReport === 'sales' && <SalesReport sales={filteredSales} />}
        {activeReport === 'purchase' && <PurchaseReport purchases={filteredPurchases} />}
        {activeReport === 'inventory' && <InventoryReport products={products} />}
        {activeReport === 'profit' && <ProfitReport sales={filteredSales} products={products} />}
        {activeReport === 'lowstock' && <LowStockReport products={products} />}
        {activeReport === 'topselling' && <TopSellingReport topProducts={topProducts} />}
        {activeReport === 'gst' && <GSTReport sales={filteredSales} purchases={filteredPurchases} />}
        {activeReport === 'cust-outstanding' && <CustomerOutstandingReport sales={sales} customers={customers} />}
        {activeReport === 'sup-outstanding' && <SupplierOutstandingReport purchases={purchases} suppliers={suppliers} />}
      </div>
    </div>
  );
}

/* ---------- Report sub-components ---------- */

function SalesReport({ sales }: { sales: SaleRecord[] }) {
  if (sales.length === 0) return <EmptyReport />;
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead className="bg-slate-50/80">
            <tr>
              <th className="table-th">Invoice</th>
              <th className="table-th">Customer</th>
              <th className="table-th">Date</th>
              <th className="table-th text-right">Items</th>
              <th className="table-th text-right">Subtotal</th>
              <th className="table-th text-right">Discount</th>
              <th className="table-th text-right">GST</th>
              <th className="table-th text-right">Grand Total</th>
              <th className="table-th">Payment</th>
              <th className="table-th">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sales.map((s) => (
              <tr key={s.id} className="transition hover:bg-slate-50/50">
                <td className="table-td font-semibold text-brand-600">{s.invoice}</td>
                <td className="table-td font-medium text-slate-800">{s.customer}</td>
                <td className="table-td text-slate-600">{s.date}</td>
                <td className="table-td text-right tabular-nums">{s.itemCount}</td>
                <td className="table-td text-right tabular-nums">{money(s.subtotal)}</td>
                <td className="table-td text-right tabular-nums text-err-600">−{money(computeDiscountAmount(s.subtotal, s.discount, s.discountType))}</td>
                <td className="table-td text-right tabular-nums">{money(s.gstAmount)}</td>
                <td className="table-td text-right font-semibold tabular-nums text-slate-900">{money(s.grandTotal)}</td>
                <td className="table-td"><span className="badge bg-slate-100 text-slate-600">{s.paymentMethod}</span></td>
                <td className="table-td"><StatusBadge status={s.status} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50">
              <td colSpan={7} className="table-td text-right font-semibold text-slate-700">Total Revenue:</td>
              <td className="table-td text-right text-lg font-bold text-slate-900">
                {money(sales.reduce((s, r) => s + r.grandTotal, 0))}
              </td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function PurchaseReport({ purchases }: { purchases: PurchaseRecord[] }) {
  if (purchases.length === 0) return <EmptyReport />;
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead className="bg-slate-50/80">
            <tr>
              <th className="table-th">PO Number</th>
              <th className="table-th">Supplier</th>
              <th className="table-th">Date</th>
              <th className="table-th text-right">Items</th>
              <th className="table-th text-right">Subtotal</th>
              <th className="table-th text-right">GST</th>
              <th className="table-th text-right">Grand Total</th>
              <th className="table-th">Payment</th>
              <th className="table-th">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {purchases.map((p) => (
              <tr key={p.id} className="transition hover:bg-slate-50/50">
                <td className="table-td font-semibold text-brand-600">{p.poNumber}</td>
                <td className="table-td font-medium text-slate-800">{p.supplier}</td>
                <td className="table-td text-slate-600">{p.date}</td>
                <td className="table-td text-right tabular-nums">{p.itemCount}</td>
                <td className="table-td text-right tabular-nums">{money(p.subtotal)}</td>
                <td className="table-td text-right tabular-nums">{money(p.gstAmount)}</td>
                <td className="table-td text-right font-semibold tabular-nums text-slate-900">{money(p.grandTotal)}</td>
                <td className="table-td">
                  <div className="flex flex-wrap gap-1">
                    <span className="badge bg-slate-100 text-slate-600">{p.paymentMethod}</span>
                    <span className={`badge ${p.paymentStatus === 'Paid' ? 'bg-accent-100 text-accent-700' : 'bg-warn-100 text-warn-600'}`}>{p.paymentStatus}</span>
                  </div>
                </td>
                <td className="table-td"><StatusBadge status={p.status} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50">
              <td colSpan={6} className="table-td text-right font-semibold text-slate-700">Total Purchases:</td>
              <td className="table-td text-right text-lg font-bold text-slate-900">
                {money(purchases.reduce((s, p) => s + p.grandTotal, 0))}
              </td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function InventoryReport({ products }: { products: Product[] }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead className="bg-slate-50/80">
            <tr>
              <th className="table-th">Product</th>
              <th className="table-th">Category</th>
              <th className="table-th">Supplier</th>
              <th className="table-th">Rack</th>
              <th className="table-th text-right">Est. Stock</th>
              <th className="table-th text-right">Box Cap.</th>
              <th className="table-th text-right">Reorder Level</th>
              <th className="table-th text-right">Unit Cost</th>
              <th className="table-th text-right">Unit Price</th>
              <th className="table-th text-right">Profit / Piece</th>
              <th className="table-th text-right">Stock Value</th>
              <th className="table-th">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.map((p) => (
              <tr key={p.id} className="transition hover:bg-slate-50/50">
                <td className="table-td font-semibold text-slate-800">{p.name}</td>
                <td className="table-td text-slate-600">{p.category}</td>
                <td className="table-td text-slate-600">{p.supplier}</td>
                <td className="table-td text-slate-600">{p.rackNumber}</td>
                <td className="table-td text-right font-semibold tabular-nums">{p.stock}</td>
                <td className="table-td text-right tabular-nums text-slate-500">{p.boxCapacity}</td>
                <td className="table-td text-right tabular-nums text-slate-500">{p.reorderLevel}</td>
                <td className="table-td text-right tabular-nums">{money(p.cost)}</td>
                <td className="table-td text-right tabular-nums">{money(p.price)}</td>
                <td className="table-td text-right tabular-nums font-semibold text-accent-600">{money(p.price - p.cost)}</td>
                <td className="table-td text-right font-semibold tabular-nums text-slate-900">{money(p.stock * p.cost)}</td>
                <td className="table-td"><StatusBadge status={p.status} variant="stock" /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50">
              <td colSpan={10} className="table-td text-right font-semibold text-slate-700">Total Inventory Value:</td>
              <td className="table-td text-right text-lg font-bold text-slate-900">
                {money(products.reduce((s, p) => s + p.stock * p.cost, 0))}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function ProfitReport({ sales, products }: { sales: SaleRecord[]; products: Product[] }) {
  if (sales.length === 0) return <EmptyReport />;

  const rows = sales.map((s) => {
    const cogs = s.items.reduce((sum, item) => {
      const prod = products.find((p) => p.id === item.productId);
      return sum + (prod ? prod.cost * item.qty : 0);
    }, 0);
    const revenue = s.subtotal - computeDiscountAmount(s.subtotal, s.discount, s.discountType);
    const profit = revenue - cogs;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    return { s, cogs, revenue, profit, margin };
  });

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalCOGS = rows.reduce((s, r) => s + r.cogs, 0);
  const totalProfit = rows.reduce((s, r) => s + r.profit, 0);
  const overallMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <div className="flex items-center gap-2 text-slate-500"><DollarSign className="h-4 w-4" /><span className="text-sm">Net Revenue</span></div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{money(totalRevenue)}</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 text-slate-500"><TrendingDown className="h-4 w-4" /><span className="text-sm">Cost of Goods Sold</span></div>
          <p className="mt-2 text-2xl font-bold text-err-600">{money(totalCOGS)}</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 text-slate-500"><TrendingUp className="h-4 w-4" /><span className="text-sm">Gross Profit · {overallMargin.toFixed(1)}%</span></div>
          <p className={`mt-2 text-2xl font-bold ${totalProfit >= 0 ? 'text-accent-600' : 'text-err-600'}`}>{money(totalProfit)}</p>
        </div>
      </div>

      {/* Detail table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="table-th">Invoice</th>
                <th className="table-th">Customer</th>
                <th className="table-th">Date</th>
                <th className="table-th text-right">Revenue</th>
                <th className="table-th text-right">COGS</th>
                <th className="table-th text-right">Profit</th>
                <th className="table-th text-right">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.s.id} className="transition hover:bg-slate-50/50">
                  <td className="table-td font-semibold text-brand-600">{r.s.invoice}</td>
                  <td className="table-td font-medium text-slate-800">{r.s.customer}</td>
                  <td className="table-td text-slate-600">{r.s.date}</td>
                  <td className="table-td text-right tabular-nums">{money(r.revenue)}</td>
                  <td className="table-td text-right tabular-nums text-err-600">{money(r.cogs)}</td>
                  <td className={`table-td text-right font-semibold tabular-nums ${r.profit >= 0 ? 'text-accent-600' : 'text-err-600'}`}>{money(r.profit)}</td>
                  <td className="table-td text-right tabular-nums">
                    <span className={`badge ${r.margin >= 30 ? 'bg-accent-100 text-accent-700' : r.margin >= 15 ? 'bg-warn-100 text-warn-600' : 'bg-err-100 text-err-600'}`}>
                      {r.margin.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function LowStockReport({ products }: { products: Product[] }) {
  const lowStock = products.filter((p) => p.status !== 'in-stock');
  if (lowStock.length === 0) {
    return (
      <div className="card p-12 text-center">
        <TrendingUp className="mx-auto h-10 w-10 text-accent-500" />
        <p className="mt-3 text-base font-semibold text-slate-800">All products are well-stocked</p>
        <p className="text-sm text-slate-500">No items need reordering at this time.</p>
      </div>
    );
  }

  const maxStock = Math.max(...lowStock.map((p) => p.reorderLevel), 1);

  return (
    <div className="space-y-4">
      {lowStock.map((p) => (
        <div key={p.id} className="card p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                {p.image ? (
                  <img src={p.image} alt={p.name} className="h-full w-full object-cover" />
                ) : (
                  <Package className="h-5 w-5 text-slate-300" />
                )}
              </div>
              <div>
                <p className="font-semibold text-slate-800">{p.name}</p>
                <p className="text-xs text-slate-500">{p.category} · {p.supplier}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={p.status} variant="stock" />
              <div className="text-right">
                <p className="text-sm text-slate-500">Current: <span className="font-bold text-slate-900">{p.stock}</span> / {p.reorderLevel}</p>
                <p className="text-xs text-slate-400">Unit cost: {money(p.cost)}</p>
              </div>
            </div>
          </div>
          {/* Stock bar */}
          <div className="mt-3 h-2 w-full rounded-full bg-slate-100">
            <div
              className={`h-2 rounded-full transition-all ${p.status === 'out-of-stock' ? 'bg-err-500' : 'bg-warn-500'}`}
              style={{ width: `${Math.min((p.stock / maxStock) * 100, 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function TopSellingReport({ topProducts }: { topProducts: { name: string; sold: number; revenue: number }[] }) {
  if (topProducts.length === 0) return <EmptyReport />;
  const maxRevenue = Math.max(...topProducts.map((p) => p.revenue), 1);
  const maxSold = Math.max(...topProducts.map((p) => p.sold), 1);

  return (
    <div className="space-y-4">
      {/* Bar chart */}
      <div className="card p-5">
        <h3 className="text-base font-semibold text-slate-900">Revenue by Product</h3>
        <p className="text-sm text-slate-500">Top performers ranked by total revenue</p>
        <div className="mt-5 space-y-4">
          {topProducts.map((p, i) => {
            const pct = (p.revenue / maxRevenue) * 100;
            const soldPct = (p.sold / maxSold) * 100;
            return (
              <div key={p.name}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-xs font-bold text-brand-600">{i + 1}</span>
                    <span className="font-medium text-slate-700">{p.name}</span>
                  </div>
                  <span className="font-semibold text-slate-900">{money(p.revenue)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 flex-1 rounded-full bg-slate-100">
                    <div className="h-3 rounded-full bg-gradient-to-r from-brand-600 to-brand-400 transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-16 shrink-0 text-right text-xs tabular-nums text-slate-500">{p.sold} sold</span>
                  <div className="hidden h-2 w-20 shrink-0 rounded-full bg-slate-100 sm:block">
                    <div className="h-2 rounded-full bg-accent-400 transition-all duration-500" style={{ width: `${soldPct}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px]">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="table-th">#</th>
                <th className="table-th">Product</th>
                <th className="table-th text-right">Units Sold</th>
                <th className="table-th text-right">Revenue</th>
                <th className="table-th text-right">Avg. Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topProducts.map((p, i) => (
                <tr key={p.name} className="transition hover:bg-slate-50/50">
                  <td className="table-td">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-xs font-bold text-brand-600">{i + 1}</span>
                  </td>
                  <td className="table-td font-medium text-slate-800">{p.name}</td>
                  <td className="table-td text-right tabular-nums">{p.sold}</td>
                  <td className="table-td text-right font-semibold tabular-nums text-slate-900">{money(p.revenue)}</td>
                  <td className="table-td text-right tabular-nums text-slate-600">{money(p.sold > 0 ? p.revenue / p.sold : 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function GSTReport({ sales, purchases }: { sales: SaleRecord[]; purchases: PurchaseRecord[] }) {
  const outputGst = sales.reduce((s, r) => s + r.gstAmount, 0);
  const inputGst = purchases.reduce((s, p) => s + p.gstAmount, 0);
  const netGst = Math.max(0, outputGst - inputGst);
  const outputTaxable = sales.reduce((s, r) => s + r.subtotal - computeDiscountAmount(r.subtotal, r.discount, r.discountType), 0);
  const inputTaxable = purchases.reduce((s, p) => s + p.subtotal, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <div className="flex items-center gap-2 text-slate-500"><TrendingUp className="h-4 w-4" /><span className="text-sm">Output GST (Sales)</span></div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{money(outputGst)}</p>
          <p className="mt-1 text-xs text-slate-400">Taxable: {money(outputTaxable)}</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 text-slate-500"><TrendingDown className="h-4 w-4" /><span className="text-sm">Input GST (Purchases)</span></div>
          <p className="mt-2 text-2xl font-bold text-err-600">{money(inputGst)}</p>
          <p className="mt-1 text-xs text-slate-400">Taxable: {money(inputTaxable)}</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 text-slate-500"><Wallet className="h-4 w-4" /><span className="text-sm">Net GST Payable</span></div>
          <p className="mt-2 text-2xl font-bold text-accent-600">{money(netGst)}</p>
          <p className="mt-1 text-xs text-slate-400">Output - Input</p>
        </div>
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="table-th">Type</th>
                <th className="table-th text-right">Taxable Value</th>
                <th className="table-th text-right">GST Rate</th>
                <th className="table-th text-right">GST Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="bg-brand-50/30">
                <td className="table-td font-semibold text-slate-800" colSpan={4}>Output GST (Sales)</td>
              </tr>
              {sales.map((s) => (
                <tr key={s.id} className="transition hover:bg-slate-50/50">
                  <td className="table-td font-medium text-slate-800">{s.invoice} · {s.customer}</td>
                  <td className="table-td text-right tabular-nums">{money(s.subtotal - computeDiscountAmount(s.subtotal, s.discount, s.discountType))}</td>
                  <td className="table-td text-right tabular-nums text-slate-500">{s.gstRate}%</td>
                  <td className="table-td text-right font-semibold tabular-nums text-slate-900">{money(s.gstAmount)}</td>
                </tr>
              ))}
              <tr className="bg-err-50/30">
                <td className="table-td font-semibold text-slate-800" colSpan={4}>Input GST (Purchases)</td>
              </tr>
              {purchases.map((p) => (
                <tr key={p.id} className="transition hover:bg-slate-50/50">
                  <td className="table-td font-medium text-slate-800">{p.poNumber} · {p.supplier}</td>
                  <td className="table-td text-right tabular-nums">{money(p.subtotal)}</td>
                  <td className="table-td text-right tabular-nums text-slate-500">{p.gstRate}%</td>
                  <td className="table-td text-right font-semibold tabular-nums text-slate-900">{money(p.gstAmount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td className="table-td font-semibold text-slate-700">Net GST Payable</td>
                <td colSpan={2}></td>
                <td className="table-td text-right text-lg font-bold text-slate-900">{money(netGst)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function EmptyReport() {
  return (
    <div className="card p-12 text-center">
      <FileText className="mx-auto h-10 w-10 text-slate-300" />
      <p className="mt-3 text-base font-semibold text-slate-700">No data for this period</p>
      <p className="text-sm text-slate-500">Try selecting a different date range.</p>
    </div>
  );
}

function CustomerOutstandingReport({ sales, customers }: { sales: SaleRecord[]; customers: { id: string; name: string; phone: string; gstin: string; address: string; notes: string }[] }) {
  const [selectedCust, setSelectedCust] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  const customerList = useMemo(() => {
    const names = new Set<string>();
    for (const c of customers) if (c.name) names.add(c.name);
    for (const s of sales) if (s.customer) names.add(s.customer);
    return Array.from(names).sort();
  }, [customers, sales]);

  const customerSummaries = useMemo(() => {
    return customerList.map((name) => {
      const custInfo = customers.find((c) => c.name === name);
      const custSales = sales.filter((s) => s.customer === name && s.status !== 'draft' && s.status !== 'cancelled');
      const totalBilled = custSales.reduce((sum, s) => sum + s.grandTotal, 0);
      const totalPaid = custSales.reduce((sum, s) => sum + s.amountPaid, 0);
      const balance = totalBilled - totalPaid;
      const invoiceCount = custSales.length;
      const lastDate = custSales.length > 0 ? custSales.sort((a, b) => b.date.localeCompare(a.date))[0].date : '—';
      return {
        name,
        phone: custInfo?.phone || '—',
        gstin: custInfo?.gstin || '—',
        totalBilled,
        totalPaid,
        balance,
        invoiceCount,
        lastDate,
      };
    }).filter((c) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q) || c.gstin.toLowerCase().includes(q);
    });
  }, [customerList, customers, sales, search]);

  const singleCustomerDetails = useMemo(() => {
    if (selectedCust === 'all') return null;
    const custInfo = customers.find((c) => c.name === selectedCust);
    const custSales = sales
      .filter((s) => s.customer === selectedCust && s.status !== 'draft' && s.status !== 'cancelled')
      .sort((a, b) => a.date.localeCompare(b.date));

    let runningBalance = 0;
    const ledgerRows = custSales.map((s) => {
      const isCreditNote = s.documentType === 'CREDIT NOTE' || s.invoice.startsWith('CN-');
      const debit = isCreditNote ? 0 : s.grandTotal;
      const credit = isCreditNote ? s.grandTotal : s.amountPaid;
      runningBalance += (debit - credit);
      return {
        id: s.id,
        date: s.date,
        voucherNo: s.invoice,
        type: s.documentType || 'Tax Invoice',
        debit,
        credit,
        balance: runningBalance,
        status: s.status,
      };
    });

    const totalBilled = custSales.reduce((sum, s) => sum + (s.documentType === 'CREDIT NOTE' ? 0 : s.grandTotal), 0);
    const totalPaid = custSales.reduce((sum, s) => sum + (s.documentType === 'CREDIT NOTE' ? s.grandTotal : s.amountPaid), 0);

    return {
      custInfo,
      totalBilled,
      totalPaid,
      closingBalance: runningBalance,
      ledgerRows,
    };
  }, [selectedCust, customers, sales]);

  const totalOutstandingAll = customerSummaries.reduce((sum, c) => sum + c.balance, 0);

  return (
    <div className="space-y-4">
      {/* Customer Selection Bar */}
      <div className="card p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1">
          <label className="text-xs font-bold text-slate-700 whitespace-nowrap">Select Customer Ledger:</label>
          <select
            value={selectedCust}
            onChange={(e) => setSelectedCust(e.target.value)}
            className="input text-xs py-1.5 font-semibold"
          >
            <option value="all">-- All Customer Summary --</option>
            {customers.map((c) => {
              const extra = [c.phone, c.gstin ? `GST: ${c.gstin}` : '', c.address].filter(Boolean).join(' · ');
              return (
                <option key={c.id} value={c.name}>
                  {c.name} {extra ? `(${extra})` : ''}
                </option>
              );
            })}
          </select>
        </div>

        {selectedCust === 'all' && (
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer name or phone..."
            className="input text-xs max-w-xs"
          />
        )}

        {selectedCust !== 'all' && (
          <button
            onClick={() => setSelectedCust('all')}
            className="btn-secondary text-xs px-3 py-1.5"
          >
            ← Back to All Customers
          </button>
        )}
      </div>

      {selectedCust === 'all' ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="table-th">Customer Name</th>
                  <th className="table-th">Phone</th>
                  <th className="table-th text-right">Invoices</th>
                  <th className="table-th text-right">Total Billed (₹)</th>
                  <th className="table-th text-right">Total Paid (₹)</th>
                  <th className="table-th text-right">Outstanding (₹)</th>
                  <th className="table-th text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customerSummaries.map((c) => (
                  <tr key={c.name} className="transition hover:bg-slate-50/50">
                    <td className="table-td font-bold text-slate-900">{c.name}</td>
                    <td className="table-td text-slate-600">{c.phone}</td>
                    <td className="table-td text-right tabular-nums">{c.invoiceCount}</td>
                    <td className="table-td text-right tabular-nums font-medium">{money(c.totalBilled)}</td>
                    <td className="table-td text-right tabular-nums text-emerald-600 font-medium">{money(c.totalPaid)}</td>
                    <td className={`table-td text-right font-bold tabular-nums ${c.balance > 0 ? 'text-amber-600' : 'text-slate-700'}`}>
                      {money(c.balance)}
                    </td>
                    <td className="table-td text-right">
                      <button
                        onClick={() => setSelectedCust(c.name)}
                        className="px-2.5 py-1 text-xs font-bold bg-brand-50 text-brand-600 rounded-lg hover:bg-brand-100 transition"
                      >
                        View Ledger
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td colSpan={5} className="table-td text-right font-bold text-slate-800">Total Customer Receivables:</td>
                  <td className="table-td text-right text-base font-black text-amber-600">{money(totalOutstandingAll)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : singleCustomerDetails ? (
        <div className="space-y-4">
          {/* Customer Details Summary Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="card p-4">
              <span className="text-xs text-slate-500 font-semibold uppercase">Total Billed</span>
              <p className="text-xl font-bold text-slate-900 mt-1">{money(singleCustomerDetails.totalBilled)}</p>
            </div>
            <div className="card p-4">
              <span className="text-xs text-slate-500 font-semibold uppercase">Total Paid</span>
              <p className="text-xl font-bold text-emerald-600 mt-1">{money(singleCustomerDetails.totalPaid)}</p>
            </div>
            <div className="card p-4">
              <span className="text-xs text-slate-500 font-semibold uppercase">Closing Balance</span>
              <p className={`text-xl font-bold mt-1 ${singleCustomerDetails.closingBalance > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
                {money(singleCustomerDetails.closingBalance)}
              </p>
            </div>
          </div>

          {/* Ledger Statement Table */}
          <div className="card overflow-hidden">
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <span className="font-bold text-sm text-slate-800">Statement of Account — {selectedCust}</span>
              <button
                onClick={() => {
                  const rows = singleCustomerDetails.ledgerRows.map((r) => ({
                    Date: r.date, VoucherNo: r.voucherNo, Type: r.type,
                    Debit: r.debit.toFixed(2), Credit: r.credit.toFixed(2), Balance: r.balance.toFixed(2),
                  }));
                  downloadCSV(`${selectedCust}-ledger.csv`, toCSV(rows));
                }}
                className="btn-secondary text-xs px-2.5 py-1"
              >
                Export Ledger CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-xs">
                <thead className="bg-slate-100 font-bold text-slate-700">
                  <tr>
                    <th className="p-2.5 text-left">Date</th>
                    <th className="p-2.5 text-left">Particulars / Voucher #</th>
                    <th className="p-2.5 text-left">Voucher Type</th>
                    <th className="p-2.5 text-right">Debit (Billed ₹)</th>
                    <th className="p-2.5 text-right">Credit (Paid ₹)</th>
                    <th className="p-2.5 text-right">Running Balance (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {singleCustomerDetails.ledgerRows.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50/60">
                      <td className="p-2.5 text-slate-600">{r.date}</td>
                      <td className="p-2.5 font-bold text-slate-900">{r.voucherNo}</td>
                      <td className="p-2.5">
                        <span className={`badge text-[10.5px] ${r.type === 'CREDIT NOTE' ? 'bg-rose-100 text-rose-700' : 'bg-indigo-100 text-indigo-700'}`}>
                          {r.type}
                        </span>
                      </td>
                      <td className="p-2.5 text-right font-mono font-medium text-slate-800">
                        {r.debit > 0 ? money(r.debit) : '—'}
                      </td>
                      <td className="p-2.5 text-right font-mono font-medium text-emerald-600">
                        {r.credit > 0 ? money(r.credit) : '—'}
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                        {money(r.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SupplierOutstandingReport({ purchases, suppliers }: { purchases: PurchaseRecord[]; suppliers: { id: string; name: string; phone: string; gstin: string; address: string; notes: string }[] }) {
  const [selectedSup, setSelectedSup] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  const supplierList = useMemo(() => {
    const names = new Set<string>();
    for (const s of suppliers) if (s.name) names.add(s.name);
    for (const p of purchases) if (p.supplier) names.add(p.supplier);
    return Array.from(names).sort();
  }, [suppliers, purchases]);

  const supplierSummaries = useMemo(() => {
    return supplierList.map((name) => {
      const supInfo = suppliers.find((s) => s.name === name);
      const supPurchases = purchases.filter((p) => p.supplier === name && p.status !== 'cancelled');
      const totalPurchased = supPurchases.reduce((sum, p) => sum + p.grandTotal, 0);
      const totalPaid = supPurchases.filter((p) => p.paymentStatus === 'Paid').reduce((sum, p) => sum + p.grandTotal, 0);
      const payable = totalPurchased - totalPaid;
      const poCount = supPurchases.length;
      const lastDate = supPurchases.length > 0 ? supPurchases.sort((a, b) => b.date.localeCompare(a.date))[0].date : '—';
      return {
        name,
        phone: supInfo?.phone || '—',
        gstin: supInfo?.gstin || '—',
        totalPurchased,
        totalPaid,
        payable,
        poCount,
        lastDate,
      };
    }).filter((s) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.phone.toLowerCase().includes(q) || s.gstin.toLowerCase().includes(q);
    });
  }, [supplierList, suppliers, purchases, search]);

  const singleSupplierDetails = useMemo(() => {
    if (selectedSup === 'all') return null;
    const supInfo = suppliers.find((s) => s.name === selectedSup);
    const supPurchases = purchases
      .filter((p) => p.supplier === selectedSup && p.status !== 'cancelled')
      .sort((a, b) => a.date.localeCompare(b.date));

    let runningBalance = 0;
    const ledgerRows = supPurchases.map((p) => {
      const credit = p.grandTotal;
      const debit = p.paymentStatus === 'Paid' ? p.grandTotal : 0;
      runningBalance += (credit - debit);
      return {
        id: p.id,
        date: p.date,
        voucherNo: p.poNumber,
        type: 'Purchase Order',
        credit,
        debit,
        balance: runningBalance,
        status: p.paymentStatus,
      };
    });

    const totalPurchased = supPurchases.reduce((sum, p) => sum + p.grandTotal, 0);
    const totalPaid = supPurchases.filter((p) => p.paymentStatus === 'Paid').reduce((sum, p) => sum + p.grandTotal, 0);

    return {
      supInfo,
      totalPurchased,
      totalPaid,
      closingBalance: runningBalance,
      ledgerRows,
    };
  }, [selectedSup, suppliers, purchases]);

  const totalPayableAll = supplierSummaries.reduce((sum, s) => sum + s.payable, 0);

  return (
    <div className="space-y-4">
      {/* Supplier Selection Bar */}
      <div className="card p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1">
          <label className="text-xs font-bold text-slate-700 whitespace-nowrap">Select Supplier Ledger:</label>
          <select
            value={selectedSup}
            onChange={(e) => setSelectedSup(e.target.value)}
            className="input text-xs py-1.5 font-semibold"
          >
            <option value="all">-- All Supplier Summary --</option>
            {supplierList.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        {selectedSup === 'all' && (
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search supplier name or phone..."
            className="input text-xs max-w-xs"
          />
        )}

        {selectedSup !== 'all' && (
          <button
            onClick={() => setSelectedSup('all')}
            className="btn-secondary text-xs px-3 py-1.5"
          >
            ← Back to All Suppliers
          </button>
        )}
      </div>

      {selectedSup === 'all' ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="table-th">Supplier Name</th>
                  <th className="table-th">Phone</th>
                  <th className="table-th text-right">Orders</th>
                  <th className="table-th text-right">Total Purchased (₹)</th>
                  <th className="table-th text-right">Total Paid (₹)</th>
                  <th className="table-th text-right">Payable Balance (₹)</th>
                  <th className="table-th text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {supplierSummaries.map((s) => (
                  <tr key={s.name} className="transition hover:bg-slate-50/50">
                    <td className="table-td font-bold text-slate-900">{s.name}</td>
                    <td className="table-td text-slate-600">{s.phone}</td>
                    <td className="table-td text-right tabular-nums">{s.poCount}</td>
                    <td className="table-td text-right tabular-nums font-medium">{money(s.totalPurchased)}</td>
                    <td className="table-td text-right tabular-nums text-emerald-600 font-medium">{money(s.totalPaid)}</td>
                    <td className={`table-td text-right font-bold tabular-nums ${s.payable > 0 ? 'text-amber-600' : 'text-slate-700'}`}>
                      {money(s.payable)}
                    </td>
                    <td className="table-td text-right">
                      <button
                        onClick={() => setSelectedSup(s.name)}
                        className="px-2.5 py-1 text-xs font-bold bg-brand-50 text-brand-600 rounded-lg hover:bg-brand-100 transition"
                      >
                        View Ledger
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td colSpan={5} className="table-td text-right font-bold text-slate-800">Total Supplier Payables:</td>
                  <td className="table-td text-right text-base font-black text-amber-600">{money(totalPayableAll)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : singleSupplierDetails ? (
        <div className="space-y-4">
          {/* Supplier Details Summary Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="card p-4">
              <span className="text-xs text-slate-500 font-semibold uppercase">Total Purchased</span>
              <p className="text-xl font-bold text-slate-900 mt-1">{money(singleSupplierDetails.totalPurchased)}</p>
            </div>
            <div className="card p-4">
              <span className="text-xs text-slate-500 font-semibold uppercase">Total Paid</span>
              <p className="text-xl font-bold text-emerald-600 mt-1">{money(singleSupplierDetails.totalPaid)}</p>
            </div>
            <div className="card p-4">
              <span className="text-xs text-slate-500 font-semibold uppercase">Payable Balance</span>
              <p className={`text-xl font-bold mt-1 ${singleSupplierDetails.closingBalance > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
                {money(singleSupplierDetails.closingBalance)}
              </p>
            </div>
          </div>

          {/* Ledger Statement Table */}
          <div className="card overflow-hidden">
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <span className="font-bold text-sm text-slate-800">Supplier Ledger Statement — {selectedSup}</span>
              <button
                onClick={() => {
                  const rows = singleSupplierDetails.ledgerRows.map((r) => ({
                    Date: r.date, VoucherNo: r.voucherNo, Type: r.type,
                    Credit: r.credit.toFixed(2), Debit: r.debit.toFixed(2), Balance: r.balance.toFixed(2),
                  }));
                  downloadCSV(`${selectedSup}-supplier-ledger.csv`, toCSV(rows));
                }}
                className="btn-secondary text-xs px-2.5 py-1"
              >
                Export Ledger CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-xs">
                <thead className="bg-slate-100 font-bold text-slate-700">
                  <tr>
                    <th className="p-2.5 text-left">Date</th>
                    <th className="p-2.5 text-left">Particulars / PO #</th>
                    <th className="p-2.5 text-left">Document Type</th>
                    <th className="p-2.5 text-right">Credit (Purchased ₹)</th>
                    <th className="p-2.5 text-right">Debit (Paid ₹)</th>
                    <th className="p-2.5 text-right">Payable Balance (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {singleSupplierDetails.ledgerRows.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50/60">
                      <td className="p-2.5 text-slate-600">{r.date}</td>
                      <td className="p-2.5 font-bold text-slate-900">{r.voucherNo}</td>
                      <td className="p-2.5">
                        <span className="badge text-[10.5px] bg-blue-100 text-blue-700">
                          {r.type}
                        </span>
                      </td>
                      <td className="p-2.5 text-right font-mono font-medium text-slate-800">
                        {r.credit > 0 ? money(r.credit) : '—'}
                      </td>
                      <td className="p-2.5 text-right font-mono font-medium text-emerald-600">
                        {r.debit > 0 ? money(r.debit) : '—'}
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                        {money(r.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
