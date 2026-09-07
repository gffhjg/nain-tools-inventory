import { Link, useNavigate } from 'react-router-dom';
import { useState, useMemo } from 'react';
import {
  ShoppingCart, Package, TrendingUp, AlertTriangle, Download, Truck,
  IndianRupee, XCircle, FileText, ClipboardCheck, ArrowRight, Clock,
  PackageCheck, Boxes, Plus, Users, Building2, CheckCircle2, Wallet,
  MessageCircle, Eye, Printer, ExternalLink, Landmark, RefreshCw
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import Modal from '@/components/Modal';
import { useStore } from '@/store/AppStore';
import { moneyShort, downloadCSV, toCSV, money } from '@/utils/analytics';
import { printInvoice } from '@/components/PrintableInvoice';

export default function Dashboard() {
  const navigate = useNavigate();
  const { products, sales, purchases, verifications, customers, suppliers, cheques, loading, refreshData } = useStore();

  const [activeModal, setActiveModal] = useState<
    'todaySales' | 'todayPurchases' | 'todayCollections' | 'receivables' | 'supplierPayables' | 'lowStock' | 'outOfStock' | null
  >(null);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const claimableCheques = useMemo(
    () => (cheques || []).filter((c) => c.status === 'pending_clearance' && c.chequeDate <= todayStr),
    [cheques, todayStr]
  );
  const claimableTotal = useMemo(
    () => claimableCheques.reduce((sum, c) => sum + c.amount, 0),
    [claimableCheques]
  );

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

  // Data lists for modals
  const todaySalesItems = useMemo(
    () => sales.filter((s) => s.date === todayStr && s.status !== 'cancelled'),
    [sales, todayStr]
  );

  const todayPurchasesItems = useMemo(
    () => purchases.filter((p) => p.date === todayStr && p.status !== 'cancelled'),
    [purchases, todayStr]
  );

  const todayCollectionsItems = useMemo(
    () => sales.filter((s) => s.date === todayStr && (s.amountPaid || 0) > 0),
    [sales, todayStr]
  );

  const receivablesItems = useMemo(
    () => sales.filter((s) => s.status !== 'paid' && s.status !== 'cancelled' && s.status !== 'draft' && (s.grandTotal - s.amountPaid) > 0),
    [sales]
  );

  const supplierPayablesItems = useMemo(
    () => purchases.filter((p) => p.paymentStatus === 'Pending'),
    [purchases]
  );

  const lowStockProducts = useMemo(
    () => products.filter((p) => p.status === 'low-stock' || (p.stock > 0 && p.stock <= p.reorderLevel)),
    [products]
  );

  const outOfStockProducts = useMemo(
    () => products.filter((p) => p.status === 'out-of-stock' || p.stock === 0),
    [products]
  );

  const recentSales = useMemo(
    () => [...sales].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    [sales]
  );

  const lowStockItems = useMemo(
    () => products.filter((p) => p.status === 'low-stock' || p.status === 'out-of-stock').slice(0, 6),
    [products]
  );

  const getWhatsAppReminderLink = (phone: string, customer: string, invoice: string, balance: number) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const msg = `Hello ${customer}, payment reminder for Invoice #${invoice} from Nain Tools & Bolt Co. Balance due: ₹${balance.toFixed(2)}. Please make the payment at your earliest convenience. Thank you!`;
    return `https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`;
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
          <button
            onClick={() => refreshData(true)}
            disabled={loading}
            className="btn-secondary"
            title="Sync / Reload Inventory Data"
          >
            <RefreshCw className={`h-4 w-4 text-slate-600 ${loading ? 'animate-spin text-brand-600' : ''}`} />
            <span className="hidden sm:inline">Refresh Data</span>
          </button>
          <Link to="/sales" className="btn-primary">
            <Plus className="h-4 w-4" />
            New Invoice
          </Link>
          <Link to="/purchase" className="btn-secondary">
            <Truck className="h-4 w-4 text-brand-600" />
            New Purchase PO
          </Link>
        </div>
      </div>

      {/* Sync / Empty State Banner */}
      {!loading && products.length === 0 && (
        <div className="p-5 rounded-2xl bg-amber-500/10 border-2 border-amber-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-fade-in shadow-xs">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-amber-950 text-base">Excel Fastener Inventory Ready to Load</h3>
              <p className="text-sm text-amber-800">Your 997 items, 2,085 purchases, and 44 sales from Excel are ready to populate.</p>
            </div>
          </div>
          <button
            onClick={() => refreshData(true)}
            className="btn-primary bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-2 whitespace-nowrap"
          >
            <RefreshCw className="h-4 w-4" />
            Sync All Data Now
          </button>
        </div>
      )}

      {/* Cheque Deposit & Claimable Alert Banner */}
      {claimableCheques.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in shadow-xs">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black animate-pulse">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm text-amber-950">
                  🔔 {claimableCheques.length} Cheque{claimableCheques.length > 1 ? 's' : ''} Claimable Today ({money(claimableTotal)})
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-200 text-amber-900 uppercase">
                  Action Required
                </span>
              </div>
              <p className="text-xs text-amber-800 font-medium mt-0.5">
                Customer cheques have reached their realization date and are ready for bank deposit or clearance confirmation.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/sales')}
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <span>Open Cheque Tracker</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Today's High Priority Metrics Banner (Fully Interactive Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Sales */}
        <div
          onClick={() => setActiveModal('todaySales')}
          className="card p-5 border-l-4 border-l-brand-600 bg-gradient-to-br from-white to-brand-50/20 cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.01]"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Today's Sales</p>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <ShoppingCart className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black text-slate-900">{money(stats.todaySalesTotal)}</p>
          <div className="mt-1 flex items-center justify-between">
            <p className="text-xs text-slate-500">Gross sales recorded today</p>
            <span className="text-[11px] font-bold text-brand-600 flex items-center gap-0.5 hover:underline">
              View List <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        </div>

        {/* Today's Purchases */}
        <div
          onClick={() => setActiveModal('todayPurchases')}
          className="card p-5 border-l-4 border-l-blue-600 bg-gradient-to-br from-white to-blue-50/20 cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.01]"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Today's Purchases</p>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Truck className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black text-slate-900">{money(stats.todayPurchasesTotal)}</p>
          <div className="mt-1 flex items-center justify-between">
            <p className="text-xs text-slate-500">Stock POs created today</p>
            <span className="text-[11px] font-bold text-blue-600 flex items-center gap-0.5 hover:underline">
              View List <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        </div>

        {/* Today's Collections */}
        <div
          onClick={() => setActiveModal('todayCollections')}
          className="card p-5 border-l-4 border-l-emerald-600 bg-gradient-to-br from-white to-emerald-50/20 cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.01]"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Today's Collections</p>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Wallet className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black text-slate-900">{money(stats.todayCollectionsTotal)}</p>
          <div className="mt-1 flex items-center justify-between">
            <p className="text-xs text-slate-500">Payments collected today</p>
            <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-0.5 hover:underline">
              View List <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        </div>

        {/* Pending Customer Payments (Who Owes Money) */}
        <div
          onClick={() => setActiveModal('receivables')}
          className="card p-5 border-l-4 border-l-amber-500 bg-gradient-to-br from-white to-amber-50/20 cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.01]"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Customer Receivables</p>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <IndianRupee className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black text-slate-900">{money(stats.outstandingSales)}</p>
          <div className="mt-1 flex items-center justify-between">
            <p className="text-xs text-amber-600 font-semibold">Who owes me money</p>
            <span className="text-[11px] font-bold text-amber-700 flex items-center gap-0.5 hover:underline">
              Who Owes Me →
            </span>
          </div>
        </div>
      </div>

      {/* Secondary Key Metric Cards (Fully Interactive Cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div
          onClick={() => navigate('/analytics')}
          className="card p-4 cursor-pointer transition-all duration-200 hover:shadow-md hover:border-emerald-300 hover:scale-[1.01]"
        >
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

        <div
          onClick={() => setActiveModal('supplierPayables')}
          className="card p-4 cursor-pointer transition-all duration-200 hover:shadow-md hover:border-purple-300 hover:scale-[1.01]"
        >
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

        <div
          onClick={() => setActiveModal('lowStock')}
          className="card p-4 cursor-pointer transition-all duration-200 hover:shadow-md hover:border-amber-300 hover:scale-[1.01]"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500">Low Stock</p>
              <p className="text-lg font-bold text-amber-700">{stats.lowStockCount} items</p>
            </div>
          </div>
        </div>

        <div
          onClick={() => setActiveModal('outOfStock')}
          className="card p-4 cursor-pointer transition-all duration-200 hover:shadow-md hover:border-rose-300 hover:scale-[1.01]"
        >
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

      {/* Interactive Detail Modals */}
      {/* 1. Who Owes Me Money (Customer Receivables) */}
      {activeModal === 'receivables' && (
        <Modal
          title={`Customer Receivables - Overdue Balances (${money(stats.outstandingSales)})`}
          size="xl"
          onClose={() => setActiveModal(null)}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-amber-50 p-3 rounded-xl border border-amber-200 text-xs text-amber-800 font-medium">
              <span>List of customers with pending invoice payments. Click the WhatsApp Remind button to send an instant payment reminder.</span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">Invoice #</th>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">Customer</th>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">Date</th>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">Grand Total</th>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">Paid</th>
                    <th className="px-3.5 py-2.5 font-bold text-amber-700">Balance Due</th>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {receivablesItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-xs text-slate-400">
                        No outstanding customer receivables found.
                      </td>
                    </tr>
                  ) : (
                    receivablesItems.map((s) => {
                      const bal = s.grandTotal - (s.amountPaid || 0);
                      return (
                        <tr key={s.id} className="hover:bg-amber-50/40">
                          <td className="px-3.5 py-3 font-bold text-brand-600">{s.invoice}</td>
                          <td className="px-3.5 py-3">
                            <p className="font-bold text-slate-900">{s.customer}</p>
                            {s.phone && <p className="text-[11px] font-mono text-slate-500">{s.phone}</p>}
                          </td>
                          <td className="px-3.5 py-3 font-mono text-slate-600">{s.date}</td>
                          <td className="px-3.5 py-3 font-semibold text-slate-900">{money(s.grandTotal)}</td>
                          <td className="px-3.5 py-3 font-semibold text-emerald-600">{money(s.amountPaid || 0)}</td>
                          <td className="px-3.5 py-3 font-black text-amber-600 text-sm">{money(bal)}</td>
                          <td className="px-3.5 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {s.phone && (
                                <a
                                  href={getWhatsAppReminderLink(s.phone, s.customer, s.invoice, bal)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn-secondary py-1 px-2.5 text-[11px] bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 font-bold flex items-center gap-1"
                                  title="Send WhatsApp Reminder"
                                >
                                  <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                                  <span>Remind</span>
                                </a>
                              )}
                              <button
                                onClick={() => printInvoice(s)}
                                className="p-1.5 text-brand-600 hover:bg-brand-50 rounded-lg transition"
                                title="Print Invoice"
                              >
                                <Printer className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={() => setActiveModal(null)}>Close</button>
              <button className="btn-primary" onClick={() => { setActiveModal(null); navigate('/sales'); }}>Go to Sales Management</button>
            </div>
          </div>
        </Modal>
      )}

      {/* 2. Low Stock Alert Modal */}
      {activeModal === 'lowStock' && (
        <Modal
          title={`Low Stock Products Alert (${lowStockProducts.length} items)`}
          size="xl"
          onClose={() => setActiveModal(null)}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-amber-50 p-3 rounded-xl border border-amber-200 text-xs text-amber-800 font-medium">
              <span>Products currently near or below minimum reorder level. Click Reorder PO to quickly purchase stock.</span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">Product</th>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">Category</th>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">Rack Location</th>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">Current Stock</th>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">Reorder Min</th>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {lowStockProducts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-xs text-slate-400">
                        No low stock items. All inventory levels are healthy!
                      </td>
                    </tr>
                  ) : (
                    lowStockProducts.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="px-3.5 py-3 font-bold text-slate-900">{p.name}</td>
                        <td className="px-3.5 py-3 text-slate-600">{p.category}</td>
                        <td className="px-3.5 py-3 font-mono text-slate-600">Rack {p.rackNumber}</td>
                        <td className="px-3.5 py-3 font-black text-rose-600">{p.stock}</td>
                        <td className="px-3.5 py-3 font-semibold text-slate-700">{p.reorderLevel}</td>
                        <td className="px-3.5 py-3 text-right">
                          <button
                            onClick={() => { setActiveModal(null); navigate('/purchase'); }}
                            className="btn-primary py-1 px-2.5 text-[11px] font-bold"
                          >
                            Reorder PO
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={() => setActiveModal(null)}>Close</button>
              <button className="btn-primary" onClick={() => { setActiveModal(null); navigate('/products'); }}>Manage Products</button>
            </div>
          </div>
        </Modal>
      )}

      {/* 3. Out of Stock / Emptied Modal */}
      {activeModal === 'outOfStock' && (
        <Modal
          title={`Out of Stock / Emptied Products (${outOfStockProducts.length} items)`}
          size="xl"
          onClose={() => setActiveModal(null)}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-rose-50 p-3 rounded-xl border border-rose-200 text-xs text-rose-800 font-medium">
              <span>Products with 0 remaining inventory stock. Immediate restocking required.</span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">Product</th>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">Category</th>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">Rack Location</th>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">Stock Status</th>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {outOfStockProducts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-xs text-slate-400">
                        No products are currently out of stock.
                      </td>
                    </tr>
                  ) : (
                    outOfStockProducts.map((p) => (
                      <tr key={p.id} className="hover:bg-rose-50/30">
                        <td className="px-3.5 py-3 font-bold text-slate-900">{p.name}</td>
                        <td className="px-3.5 py-3 text-slate-600">{p.category}</td>
                        <td className="px-3.5 py-3 font-mono text-slate-600">Rack {p.rackNumber}</td>
                        <td className="px-3.5 py-3">
                          <span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">0 Stock (Emptied)</span>
                        </td>
                        <td className="px-3.5 py-3 text-right">
                          <button
                            onClick={() => { setActiveModal(null); navigate('/purchase'); }}
                            className="btn-primary bg-rose-600 hover:bg-rose-700 py-1 px-2.5 text-[11px] font-bold"
                          >
                            Restock PO
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={() => setActiveModal(null)}>Close</button>
              <button className="btn-primary" onClick={() => { setActiveModal(null); navigate('/purchase'); }}>Go to Purchase PO</button>
            </div>
          </div>
        </Modal>
      )}

      {/* 4. Today's Sales Modal */}
      {activeModal === 'todaySales' && (
        <Modal
          title={`Today's Sales Invoices (${money(stats.todaySalesTotal)})`}
          size="xl"
          onClose={() => setActiveModal(null)}
        >
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">Invoice #</th>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">Customer</th>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">Date</th>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">Total</th>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">Status</th>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {todaySalesItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-xs text-slate-400">
                        No sales invoices recorded today yet.
                      </td>
                    </tr>
                  ) : (
                    todaySalesItems.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="px-3.5 py-3 font-bold text-brand-600">{s.invoice}</td>
                        <td className="px-3.5 py-3 font-bold text-slate-900">{s.customer}</td>
                        <td className="px-3.5 py-3 font-mono text-slate-600">{s.date}</td>
                        <td className="px-3.5 py-3 font-black text-slate-900">{money(s.grandTotal)}</td>
                        <td className="px-3.5 py-3"><StatusBadge status={s.status} /></td>
                        <td className="px-3.5 py-3 text-right">
                          <button onClick={() => printInvoice(s)} className="p-1.5 text-brand-600 hover:bg-brand-50 rounded-lg">
                            <Printer className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={() => setActiveModal(null)}>Close</button>
              <button className="btn-primary" onClick={() => { setActiveModal(null); navigate('/sales'); }}>Sales Page</button>
            </div>
          </div>
        </Modal>
      )}

      {/* 5. Today's Purchases Modal */}
      {activeModal === 'todayPurchases' && (
        <Modal
          title={`Today's Purchase Orders (${money(stats.todayPurchasesTotal)})`}
          size="xl"
          onClose={() => setActiveModal(null)}
        >
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">PO #</th>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">Supplier</th>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">Date</th>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">Grand Total</th>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {todayPurchasesItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-xs text-slate-400">
                        No purchase POs created today yet.
                      </td>
                    </tr>
                  ) : (
                    todayPurchasesItems.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="px-3.5 py-3 font-bold text-blue-600">{p.poNumber}</td>
                        <td className="px-3.5 py-3 font-bold text-slate-900">{p.supplier}</td>
                        <td className="px-3.5 py-3 font-mono text-slate-600">{p.date}</td>
                        <td className="px-3.5 py-3 font-black text-slate-900">{money(p.grandTotal)}</td>
                        <td className="px-3.5 py-3"><StatusBadge status={p.paymentStatus === 'Paid' ? 'paid' : 'pending'} /></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={() => setActiveModal(null)}>Close</button>
              <button className="btn-primary" onClick={() => { setActiveModal(null); navigate('/purchase'); }}>Purchases Page</button>
            </div>
          </div>
        </Modal>
      )}

      {/* 6. Today's Collections Modal */}
      {activeModal === 'todayCollections' && (
        <Modal
          title={`Today's Payment Collections (${money(stats.todayCollectionsTotal)})`}
          size="xl"
          onClose={() => setActiveModal(null)}
        >
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">Invoice #</th>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">Customer</th>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">Payment Mode</th>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">Amount Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {todayCollectionsItems.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-xs text-slate-400">
                        No payment collections recorded today yet.
                      </td>
                    </tr>
                  ) : (
                    todayCollectionsItems.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="px-3.5 py-3 font-bold text-emerald-600">{s.invoice}</td>
                        <td className="px-3.5 py-3 font-bold text-slate-900">{s.customer}</td>
                        <td className="px-3.5 py-3 text-slate-700 font-semibold">{s.paymentMethod}</td>
                        <td className="px-3.5 py-3 font-black text-emerald-600">{money(s.amountPaid || 0)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={() => setActiveModal(null)}>Close</button>
            </div>
          </div>
        </Modal>
      )}

      {/* 7. Supplier Payables Modal */}
      {activeModal === 'supplierPayables' && (
        <Modal
          title={`Pending Supplier Payables (${money(stats.pendingSupplierPayments)})`}
          size="xl"
          onClose={() => setActiveModal(null)}
        >
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">PO #</th>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">Supplier</th>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">Date</th>
                    <th className="px-3.5 py-2.5 font-bold text-purple-700">Pending Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {supplierPayablesItems.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-xs text-slate-400">
                        No pending supplier payables.
                      </td>
                    </tr>
                  ) : (
                    supplierPayablesItems.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="px-3.5 py-3 font-bold text-purple-600">{p.poNumber}</td>
                        <td className="px-3.5 py-3 font-bold text-slate-900">{p.supplier}</td>
                        <td className="px-3.5 py-3 font-mono text-slate-600">{p.date}</td>
                        <td className="px-3.5 py-3 font-black text-purple-700">{money(p.grandTotal)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={() => setActiveModal(null)}>Close</button>
              <button className="btn-primary" onClick={() => { setActiveModal(null); navigate('/purchase'); }}>Go to Purchases</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
