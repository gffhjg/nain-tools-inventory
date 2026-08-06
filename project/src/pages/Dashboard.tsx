import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import {
  ShoppingCart, Package, TrendingUp, AlertTriangle, Download, Truck,
  IndianRupee, XCircle, FileText, ClipboardCheck, ArrowRight, Clock,
  PackageCheck, Boxes, Plus, FileSpreadsheet, Users, Building2, CheckCircle2, Wallet
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import { useStore } from '@/store/AppStore';
import { moneyShort, downloadCSV, toCSV, money } from '@/utils/analytics';

export default function Dashboard() {
  const { products, sales, purchases, verifications, customers, suppliers } = useStore();

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const stats = useMemo(() => {
    // Today's Sales
    const todaySalesList = sales.filter(
      (s) => s.date === todayStr && s.status !== 'draft' && s.status !== 'cancelled'
    );
    const todaySalesTotal = todaySalesList.reduce((acc, s) => acc + s.grandTotal, 0);

    // Today's Purchases
    const todayPurchasesList = purchases.filter(
      (p) => p.date === todayStr && p.status !== 'cancelled'
    );
    const todayPurchasesTotal = todayPurchasesList.reduce((acc, p) => acc + p.grandTotal, 0);

    // Today's Collections (Payments collected on sales today)
    const todayCollectionsTotal = sales
      .filter((s) => s.date === todayStr && s.status !== 'cancelled')
      .reduce((acc, s) => acc + (s.amountPaid || 0), 0);

    // Total Revenue & Profit
    const totalRevenue = sales
      .filter((s) => s.status !== 'draft' && s.status !== 'cancelled')
      .reduce((s, r) => s + r.grandTotal, 0);

    const totalProfit = sales
      .filter((s) => s.status !== 'draft' && s.status !== 'cancelled')
      .reduce((s, r) => {
        const cogs = r.items.reduce((cs, item) => {
          const prod = products.find((p) => p.id === item.productId);
          return cs + (prod ? prod.cost * item.qty : 0);
        }, 0);
        return s + (r.subtotal - r.discount - cogs);
      }, 0);

    // Pending Customer Payments (Receivables)
    const outstandingSales = sales
      .filter((s) => s.status !== 'paid' && s.status !== 'cancelled' && s.status !== 'draft')
      .reduce((s, r) => s + (r.grandTotal - r.amountPaid), 0);

    // Pending Supplier Payments (Payables)
    const pendingSupplierPayments = purchases
      .filter((p) => p.paymentStatus === 'Pending')
      .reduce((s, p) => s + p.grandTotal, 0);

    const lowStockCount = products.filter((p) => p.status === 'low-stock').length;
    const outOfStockCount = products.filter((p) => p.status === 'out-of-stock').length;

    return {
      todaySalesTotal,
      todayPurchasesTotal,
      todayCollectionsTotal,
      totalRevenue,
      totalProfit,
      outstandingSales,
      pendingSupplierPayments,
      lowStockCount,
      outOfStockCount,
    };
  }, [sales, products, purchases, todayStr]);

  const recentSales = useMemo(
    () => [...sales].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    [sales]
  );

  const pendingCustomerPayments = useMemo(
    () => sales
      .filter((s) => s.status === 'partially-paid' || s.status === 'pending')
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5),
    [sales]
  );

  const lowStockItems = useMemo(
    () => products.filter((p) => p.status === 'low-stock' || p.status === 'out-of-stock').slice(0, 6),
    [products]
  );

  const topProducts = useMemo(() => {
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
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [sales]);

  const handleExport = () => {
    const rows = sales.map((s) => ({
      Invoice: s.invoice, Customer: s.customer, Date: s.date,
      Items: s.itemCount, Total: s.grandTotal.toFixed(2), Status: s.status,
    }));
    downloadCSV('dashboard-sales-summary.csv', toCSV(rows as any));
  };

  return (
    <div className="animate-fade-in space-y-6 pb-12">
      {/* Header with Executive Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader
          title="Executive Dashboard"
          subtitle="Real-time overview of daily sales, inventory levels, collections, and pending balances."
        />
        <div className="flex items-center gap-2.5">
          <Link to="/sales" className="btn-primary">
            <Plus className="h-4 w-4" />
            New Invoice
          </Link>
          <Link to="/purchase" className="btn-secondary">
            <Truck className="h-4 w-4 text-brand-600" />
            New Purchase PO
          </Link>
          <Link to="/import-products" className="btn-secondary">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            Import Products
          </Link>
        </div>
      </div>

      {/* Today's High Priority Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Sales */}
        <div className="card p-5 border-l-4 border-l-brand-600 bg-gradient-to-br from-white to-brand-50/20">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Today's Sales</p>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <ShoppingCart className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black text-slate-900">{money(stats.todaySalesTotal)}</p>
          <p className="mt-1 text-xs text-slate-500">Gross sales recorded today</p>
        </div>

        {/* Today's Purchases */}
        <div className="card p-5 border-l-4 border-l-blue-600 bg-gradient-to-br from-white to-blue-50/20">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Today's Purchases</p>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Truck className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black text-slate-900">{money(stats.todayPurchasesTotal)}</p>
          <p className="mt-1 text-xs text-slate-500">Stock POs created today</p>
        </div>

        {/* Today's Collections */}
        <div className="card p-5 border-l-4 border-l-emerald-600 bg-gradient-to-br from-white to-emerald-50/20">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Today's Collections</p>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Wallet className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black text-slate-900">{money(stats.todayCollectionsTotal)}</p>
          <p className="mt-1 text-xs text-slate-500">Payments collected today</p>
        </div>

        {/* Pending Customer Payments */}
        <div className="card p-5 border-l-4 border-l-amber-500 bg-gradient-to-br from-white to-amber-50/20">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Customer Receivables</p>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <IndianRupee className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black text-slate-900">{money(stats.outstandingSales)}</p>
          <p className="mt-1 text-xs text-amber-600 font-semibold">Total overdue payments</p>
        </div>
      </div>

      {/* Secondary Key Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500">Total Profit</p>
              <p className="text-lg font-bold text-slate-900">{moneyShort(stats.totalProfit)}</p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <Building2 className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500">Supplier Payables</p>
              <p className="text-lg font-bold text-slate-900">{moneyShort(stats.pendingSupplierPayments)}</p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500">Low Stock</p>
              <p className="text-lg font-bold text-slate-900">{stats.lowStockCount} items</p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <XCircle className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500">Out of Stock</p>
              <p className="text-lg font-bold text-rose-600">{stats.outOfStockCount} items</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Recent Sales & Low Stock Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Invoices / Sales (Col 2) */}
        <div className="lg:col-span-2 card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-brand-600" />
                Recent Invoices & Sales
              </h3>
              <p className="text-xs text-slate-500">Latest sales invoices issued</p>
            </div>
            <Link to="/sales" className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1">
              View All <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3.5 py-2.5 font-semibold text-slate-600">Invoice</th>
                  <th className="px-3.5 py-2.5 font-semibold text-slate-600">Customer</th>
                  <th className="px-3.5 py-2.5 font-semibold text-slate-600">Date</th>
                  <th className="px-3.5 py-2.5 font-semibold text-slate-600">Amount</th>
                  <th className="px-3.5 py-2.5 font-semibold text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {recentSales.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-3.5 py-3 font-bold text-brand-600">{s.invoice}</td>
                    <td className="px-3.5 py-3 text-slate-800 font-semibold">{s.customer}</td>
                    <td className="px-3.5 py-3 text-slate-500">{s.date}</td>
                    <td className="px-3.5 py-3 font-bold text-slate-900">{money(s.grandTotal)}</td>
                    <td className="px-3.5 py-3">
                      <StatusBadge status={s.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Low Stock Alerts & Fast Action */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Stock Attention Needed
              </h3>
              <p className="text-xs text-slate-500">Products near or below reorder level</p>
            </div>
            <Link to="/products" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
              Manage
            </Link>
          </div>

          <div className="space-y-2.5">
            {lowStockItems.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500 mb-1" />
                All products are sufficiently stocked.
              </div>
            ) : (
              lowStockItems.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-100/50 transition">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-slate-800">{p.name}</p>
                    <p className="text-[11px] text-slate-500">Rack {p.rackNumber} · Stock: <span className="font-semibold text-rose-600">{p.stock}</span> / {p.reorderLevel} min</p>
                  </div>
                  <Link
                    to="/purchase"
                    className="ml-2 rounded-lg bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-700 transition"
                  >
                    Reorder
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
