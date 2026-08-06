import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import {
  ShoppingCart, Package, TrendingUp, AlertTriangle, Download, Truck,
  IndianRupee, XCircle, FileText, ClipboardCheck, ArrowRight, Clock,
  PackageCheck, Boxes,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import { useStore } from '@/store/AppStore';
import { moneyShort, downloadCSV, toCSV } from '@/utils/analytics';

export default function Dashboard() {
  const { products, sales, purchases, verifications } = useStore();

  const stats = useMemo(() => {
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
    const outstandingSales = sales
      .filter((s) => s.status !== 'paid' && s.status !== 'cancelled' && s.status !== 'draft')
      .reduce((s, r) => s + (r.grandTotal - r.amountPaid), 0);
    const pendingSupplierPayments = purchases
      .filter((p) => p.paymentStatus === 'Pending')
      .reduce((s, p) => s + p.grandTotal, 0);
    const lowStockCount = products.filter((p) => p.status === 'low-stock').length;
    const outOfStockCount = products.filter((p) => p.status === 'out-of-stock').length;
    return { totalRevenue, totalProfit, outstandingSales, pendingSupplierPayments, lowStockCount, outOfStockCount };
  }, [sales, products, purchases]);

  const pendingPOs = useMemo(
    () => purchases
      .filter((p) => p.status === 'ordered' || p.status === 'partially-received')
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5),
    [purchases],
  );

  const recentPurchases = useMemo(
    () => [...purchases].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    [purchases],
  );

  const pendingCustomerPayments = useMemo(
    () => sales
      .filter((s) => s.status === 'partially-paid' || s.status === 'pending')
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5),
    [sales],
  );

  const recentSales = useMemo(
    () => [...sales].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    [sales],
  );

  const needsVerification = useMemo(() => {
    const today30 = new Date();
    today30.setDate(today30.getDate() - 30);
    const today30ISO = today30.toISOString().slice(0, 10);
    const verifiedIds = new Set(
      verifications.filter((v) => v.date >= today30ISO).map((v) => v.productId),
    );
    return products.filter((p) => !verifiedIds.has(p.id)).slice(0, 6);
  }, [products, verifications]);

  const lowStockItems = useMemo(
    () => products.filter((p) => p.status === 'low-stock' || p.status === 'out-of-stock').slice(0, 6),
    [products],
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
      DiscountType: s.discountType,
    }));
    downloadCSV('dashboard-sales.csv', toCSV(rows));
  };

  const statCards = [
    { label: 'Total Revenue', value: moneyShort(stats.totalRevenue), icon: IndianRupee, tone: 'bg-brand-50 text-brand-600' },
    { label: 'Gross Profit', value: moneyShort(stats.totalProfit), icon: TrendingUp, tone: 'bg-accent-50 text-accent-600' },
    { label: 'Customer Outstanding', value: moneyShort(stats.outstandingSales), icon: Clock, tone: 'bg-warn-50 text-warn-600' },
    { label: 'Supplier Payable', value: moneyShort(stats.pendingSupplierPayments), icon: FileText, tone: 'bg-warn-50 text-warn-600' },
    { label: 'Low Stock', value: String(stats.lowStockCount), icon: AlertTriangle, tone: 'bg-warn-50 text-warn-600' },
    { label: 'Out of Stock', value: String(stats.outOfStockCount), icon: XCircle, tone: 'bg-err-50 text-err-600' },
    { label: 'Total Products', value: String(products.length), icon: Package, tone: 'bg-brand-50 text-brand-600' },
    { label: 'Pending POs', value: String(pendingPOs.length), icon: Truck, tone: 'bg-amber-50 text-amber-600' },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Dashboard"
        subtitle="What needs your attention today?"
        actions={
          <button className="btn-secondary" onClick={handleExport}>
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
        }
      />

      {/* Compact stat cards */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="card flex items-center gap-3 p-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${stat.tone}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-bold tracking-tight text-slate-900">{stat.value}</p>
                <p className="truncate text-xs text-slate-500">{stat.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pending POs + Low Stock row */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Pending Purchase Orders */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <div className="flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-warn-600" />
              <h3 className="font-semibold text-slate-800">Pending Purchase Orders</h3>
            </div>
            <Link to="/purchase" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
              View all
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {pendingPOs.length > 0 ? pendingPOs.map((p) => (
              <Link key={p.id} to={`/purchase/${p.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-slate-50/50">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-brand-600">{p.poNumber}</p>
                  <p className="truncate text-xs text-slate-500">{p.supplier} · {p.items.length} products</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums text-slate-900">{moneyShort(p.grandTotal)}</p>
                  <p className="text-xs text-slate-400">Expected: {p.expectedDelivery || '—'}</p>
                </div>
                <StatusBadge status={p.status} />
              </Link>
            )) : (
              <div className="px-5 py-8 text-center text-sm text-slate-400">No pending orders</div>
            )}
          </div>
        </div>

        {/* Low Stock Alerts */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warn-600" />
              <h3 className="font-semibold text-slate-800">Low Stock Alerts</h3>
            </div>
            <Link to="/products" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
              View all
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {lowStockItems.length > 0 ? lowStockItems.map((p) => (
              <Link key={p.id} to={`/products/${p.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-slate-50/50">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">{p.name}</p>
                  <p className="text-xs text-slate-500">{p.category} · Rack {p.rackNumber}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums text-slate-900">{p.stock.toLocaleString('en-IN')}</p>
                  <p className="text-xs text-slate-400">Reorder at {p.reorderLevel}</p>
                </div>
                <StatusBadge status={p.status} variant="stock" />
              </Link>
            )) : (
              <div className="px-5 py-8 text-center text-sm text-slate-400">All stock levels healthy</div>
            )}
          </div>
        </div>
      </div>

      {/* Pending Customer Payments */}
      {pendingCustomerPayments.length > 0 && (
        <div className="mt-4 card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <div className="flex items-center gap-2">
              <IndianRupee className="h-5 w-5 text-err-600" />
              <h3 className="font-semibold text-slate-800">Pending Customer Payments</h3>
            </div>
            <Link to="/sales" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
              View all
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {pendingCustomerPayments.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-5 py-3 transition hover:bg-slate-50/50">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">{s.invoice}</p>
                  <p className="truncate text-xs text-slate-500">{s.customer} · {s.date}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums text-err-600">₹{(s.grandTotal - s.amountPaid).toFixed(2)}</p>
                  <p className="text-xs text-slate-400">of ₹{s.grandTotal.toFixed(2)}</p>
                </div>
                <StatusBadge status={s.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Purchases + Recent Sales row */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Recent Purchases */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-brand-600" />
              <h3 className="font-semibold text-slate-800">Recent Purchases</h3>
            </div>
            <Link to="/purchase" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
              View all
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {recentPurchases.map((p) => (
              <Link key={p.id} to={`/purchase/${p.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-slate-50/50">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-brand-600">{p.poNumber}</p>
                  <p className="truncate text-xs text-slate-500">{p.supplier} · {p.date}</p>
                </div>
                <p className="text-sm font-semibold tabular-nums text-slate-900">{moneyShort(p.grandTotal)}</p>
                <StatusBadge status={p.status} />
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Sales */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-brand-600" />
              <h3 className="font-semibold text-slate-800">Recent Sales</h3>
            </div>
            <Link to="/sales" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
              View all
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {recentSales.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-5 py-3 transition hover:bg-slate-50/50">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">{s.invoice}</p>
                  <p className="truncate text-xs text-slate-500">{s.customer} · {s.date}</p>
                </div>
                <p className="text-sm font-semibold tabular-nums text-slate-900">{moneyShort(s.grandTotal)}</p>
                <StatusBadge status={s.status} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Needs Verification + Top Selling row */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Products Needing Physical Verification */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-accent-600" />
              <h3 className="font-semibold text-slate-800">Needs Physical Verification</h3>
            </div>
            <Link to="/products" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
              View all
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {needsVerification.length > 0 ? needsVerification.map((p) => (
              <Link key={p.id} to={`/products/${p.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-slate-50/50">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">{p.name}</p>
                  <p className="text-xs text-slate-500">Rack {p.rackNumber} · Est. {p.stock.toLocaleString('en-IN')} pcs</p>
                </div>
                <StatusBadge status={p.boxStatus} variant="box" />
                <ArrowRight className="h-4 w-4 text-slate-300" />
              </Link>
            )) : (
              <div className="px-5 py-8 text-center text-sm text-slate-400">All products verified recently</div>
            )}
          </div>
        </div>

        {/* Top Selling Products */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <div className="flex items-center gap-2">
              <Boxes className="h-5 w-5 text-brand-600" />
              <h3 className="font-semibold text-slate-800">Top Selling Products</h3>
            </div>
            <Link to="/reports" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
              Reports
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {topProducts.length > 0 ? topProducts.map((p, i) => {
              return (
              <Link key={p.productId} to={`/products/${p.productId}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-slate-50/50">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-xs font-bold text-brand-600">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{p.name}</p>
                  <p className="text-xs text-slate-500">{p.sold.toLocaleString('en-IN')} units sold</p>
                </div>
                <p className="text-sm font-semibold tabular-nums text-slate-900">{moneyShort(p.revenue)}</p>
              </Link>
              );
            }) : (
              <div className="px-5 py-8 text-center text-sm text-slate-400">No sales data yet</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
