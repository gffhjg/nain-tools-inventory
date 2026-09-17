import { Link, useNavigate } from 'react-router-dom';
import { useState, useMemo, useCallback } from 'react';
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

  const { todayLocal, todayUtc } = useMemo(() => {
    const d = new Date();
    const todayLocal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const todayUtc = d.toISOString().slice(0, 10);
    return { todayLocal, todayUtc };
  }, []);

  const isToday = useCallback(
    (dateStr?: string) => {
      if (!dateStr) return false;
      const clean = dateStr.slice(0, 10);
      return clean === todayLocal || clean === todayUtc;
    },
    [todayLocal, todayUtc]
  );

  const isSaleToday = useCallback(
    (s: { date?: string; convertedAt?: string }) => {
      return isToday(s.date) || isToday(s.convertedAt);
    },
    [isToday]
  );

  const claimableCheques = useMemo(
    () => (cheques || []).filter((c) => c.status === 'pending_clearance' && (c.chequeDate <= todayLocal || c.chequeDate <= todayUtc)),
    [cheques, todayLocal, todayUtc]
  );
  const claimableTotal = useMemo(
    () => claimableCheques.reduce((sum, c) => sum + c.amount, 0),
    [claimableCheques]
  );

  const stats = useMemo(() => {
    // Today's Sales
    const todaySalesList = sales.filter(
      (s) => isSaleToday(s) && s.status !== 'draft' && s.status !== 'cancelled'
    );
    const todaySalesTotal = todaySalesList.reduce((acc, s) => acc + s.grandTotal, 0);

    // Today's Purchases
    const todayPurchasesList = purchases.filter(
      (p) => isToday(p.date) && p.status !== 'cancelled'
    );
    const todayPurchasesTotal = todayPurchasesList.reduce((acc, p) => acc + p.grandTotal, 0);

    // Today's Collections (Payments collected on sales today)
    const todayCollectionsTotal = sales
      .filter((s) => isSaleToday(s) && s.status !== 'cancelled')
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
  }, [sales, products, purchases, isSaleToday, isToday]);

  // Data lists for modals
  const todaySalesItems = useMemo(
    () => sales.filter((s) => isSaleToday(s) && s.status !== 'draft' && s.status !== 'cancelled'),
    [sales, isSaleToday]
  );

  const todayPurchasesItems = useMemo(
    () => purchases.filter((p) => isToday(p.date) && p.status !== 'cancelled'),
    [purchases, isToday]
  );

  const todayCollectionsItems = useMemo(
    () => sales.filter((s) => isSaleToday(s) && (s.amountPaid || 0) > 0 && s.status !== 'cancelled'),
    [sales, isSaleToday]
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
          <Link
            to={{ pathname: '/sales', search: '?action=new-invoice' }}
            state={{ openNewInvoice: true }}
            className="btn-primary"
            id="dashboard-new-invoice-btn"
          >
            <Plus className="h-4 w-4" />
            New Invoice
          </Link>
          <Link
            to={{ pathname: '/purchase', search: '?action=new-bill' }}
            state={{ openNewBill: true }}
            className="btn-secondary"
            id="dashboard-new-purchase-bill-btn"
          >
            <Truck className="h-4 w-4 text-brand-600" />
            New Purchase Bill
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
        <div className="card-interactive p-4.5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-orange-500/15 border border-amber-500/30 backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-fade-in shadow-xs">
          <div className="flex items-center gap-3.5">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-md shadow-amber-500/25">
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm text-amber-950">
                  {claimableCheques.length} Cheque{claimableCheques.length > 1 ? 's' : ''} Claimable Today ({money(claimableTotal)})
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-200 text-amber-900 uppercase tracking-wide">
                  Action Required
                </span>
              </div>
              <p className="text-xs text-amber-800/90 font-medium mt-0.5">
                Customer cheques have reached their realization date and are ready for bank deposit or clearance confirmation.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/sales')}
            className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md shadow-amber-600/25 transition-all active:scale-95 flex items-center gap-2 whitespace-nowrap cursor-pointer shrink-0"
          >
            <span>Open Cheque Tracker</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Today's High Priority Metrics Banner (Fully Interactive Cards with Staggered Fade-in) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Sales */}
        <div
          onClick={() => setActiveModal('todaySales')}
          className="stagger-1 card-interactive group relative overflow-hidden rounded-2xl bg-white/90 backdrop-blur-md p-5 border border-slate-200/80 shadow-xs cursor-pointer before:absolute before:top-0 before:left-0 before:right-0 before:h-1 before:bg-gradient-to-r before:from-brand-500 before:to-indigo-500"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Today's Sales</p>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 shadow-xs group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
              <ShoppingCart className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black text-slate-900 tracking-tight">{money(stats.todaySalesTotal)}</p>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-slate-500">Gross sales recorded today</p>
            <span className="text-[11px] font-bold text-brand-600 flex items-center gap-1 group-hover:text-brand-700">
              View List <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform duration-200" />
            </span>
          </div>
        </div>

        {/* Today's Purchases */}
        <div
          onClick={() => setActiveModal('todayPurchases')}
          className="stagger-2 card-interactive group relative overflow-hidden rounded-2xl bg-white/90 backdrop-blur-md p-5 border border-slate-200/80 shadow-xs cursor-pointer before:absolute before:top-0 before:left-0 before:right-0 before:h-1 before:bg-gradient-to-r before:from-blue-500 before:to-sky-500"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Today's Purchases</p>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 shadow-xs group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
              <Truck className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black text-slate-900 tracking-tight">{money(stats.todayPurchasesTotal)}</p>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-slate-500">Purchase bills recorded today</p>
            <span className="text-[11px] font-bold text-blue-600 flex items-center gap-1 group-hover:text-blue-700">
              View List <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform duration-200" />
            </span>
          </div>
        </div>

        {/* Today's Collections */}
        <div
          onClick={() => setActiveModal('todayCollections')}
          className="stagger-3 card-interactive group relative overflow-hidden rounded-2xl bg-white/90 backdrop-blur-md p-5 border border-slate-200/80 shadow-xs cursor-pointer before:absolute before:top-0 before:left-0 before:right-0 before:h-1 before:bg-gradient-to-r before:from-emerald-500 before:to-teal-500"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Today's Collections</p>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 shadow-xs group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
              <Wallet className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black text-slate-900 tracking-tight">{money(stats.todayCollectionsTotal)}</p>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-slate-500">Payments collected today</p>
            <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1 group-hover:text-emerald-700">
              View List <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform duration-200" />
            </span>
          </div>
        </div>

        {/* Pending Customer Payments (Who Owes Money) */}
        <div
          onClick={() => setActiveModal('receivables')}
          className="stagger-4 card-interactive group relative overflow-hidden rounded-2xl bg-white/90 backdrop-blur-md p-5 border border-slate-200/80 shadow-xs cursor-pointer before:absolute before:top-0 before:left-0 before:right-0 before:h-1 before:bg-gradient-to-r before:from-amber-500 before:to-orange-500"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Customer Receivables</p>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 shadow-xs group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
              <IndianRupee className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black text-slate-900 tracking-tight">{money(stats.outstandingSales)}</p>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-amber-600 font-semibold">Who owes me money</p>
            <span className="text-[11px] font-bold text-amber-700 flex items-center gap-1 group-hover:text-amber-800">
              Who Owes Me <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform duration-200" />
            </span>
          </div>
        </div>
      </div>

      {/* Secondary Key Metric Cards (Interactive Cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div
          onClick={() => navigate('/reports')}
          className="stagger-2 card-interactive group p-4.5 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200/80 shadow-xs cursor-pointer"
        >
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 shadow-xs group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Profit</p>
              <p className="text-lg font-black text-slate-900">{moneyShort(stats.totalProfit)}</p>
            </div>
          </div>
        </div>

        <div
          onClick={() => setActiveModal('supplierPayables')}
          className="stagger-3 card-interactive group p-4.5 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200/80 shadow-xs cursor-pointer"
        >
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600 shadow-xs group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Supplier Payables</p>
              <p className="text-lg font-black text-slate-900">{moneyShort(stats.pendingSupplierPayments)}</p>
            </div>
          </div>
        </div>

        <div
          onClick={() => setActiveModal('lowStock')}
          className="stagger-4 card-interactive group p-4.5 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200/80 shadow-xs cursor-pointer"
        >
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 shadow-xs group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Low Stock</p>
              <p className="text-lg font-black text-amber-700">{stats.lowStockCount} items</p>
            </div>
          </div>
        </div>

        <div
          onClick={() => setActiveModal('outOfStock')}
          className="stagger-5 card-interactive group p-4.5 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200/80 shadow-xs cursor-pointer"
        >
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 shadow-xs group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
              <XCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Out of Stock</p>
              <p className="text-lg font-black text-rose-600">{stats.outOfStockCount} items</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Recent Sales & Low Stock Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Invoices / Sales (Col 2) */}
        <div className="stagger-4 lg:col-span-2 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200/80 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-brand-50 text-brand-600">
                  <ShoppingCart className="h-4 w-4" />
                </div>
                Recent Invoices & Sales
              </h3>
              <p className="text-xs text-slate-500">Latest sales invoices issued</p>
            </div>
            <Link to="/sales" className="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1 group">
              View All <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform duration-200" />
            </Link>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200/80 shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-bold">Invoice</th>
                  <th className="px-4 py-3 font-bold">Customer</th>
                  <th className="px-4 py-3 font-bold">Date</th>
                  <th className="px-4 py-3 font-bold">Amount</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {recentSales.map((s) => (
                  <tr key={s.id} className="hover:bg-brand-50/30 transition-colors duration-150">
                    <td className="px-4 py-3.5 font-bold text-brand-600">{s.invoice}</td>
                    <td className="px-4 py-3.5 text-slate-800 font-semibold">{s.customer}</td>
                    <td className="px-4 py-3.5 text-slate-500 font-mono">{s.date}</td>
                    <td className="px-4 py-3.5 font-bold text-slate-900">{money(s.grandTotal)}</td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={s.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Low Stock Alerts & Fast Action */}
        <div className="stagger-5 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200/80 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                Stock Attention Needed
              </h3>
              <p className="text-xs text-slate-500">Products near or below reorder level</p>
            </div>
            <Link to="/products" className="text-xs font-bold text-brand-600 hover:text-brand-700">
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
                <div key={p.id} className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-brand-200 hover:shadow-xs transition-all duration-200">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-slate-800">{p.name}</p>
                    <p className="text-[11px] text-slate-500">Rack {p.rackNumber} · Stock: <span className="font-bold text-rose-600">{p.stock}</span> / {p.reorderLevel} min</p>
                  </div>
                  <Link
                    to="/purchase"
                    className="ml-2 rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-brand-700 shadow-xs active:scale-95 transition-all"
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
                            Reorder Stock
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
                            Restock Stock
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
              <button className="btn-primary" onClick={() => { setActiveModal(null); navigate('/purchase'); }}>Go to Purchase Bills</button>
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
                        <td className="px-3.5 py-3 font-bold text-brand-600">
                          <div className="flex items-center gap-1.5">
                            <span>{s.invoice}</span>
                            {s.documentType === 'PROFORMA INVOICE' && (
                              <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[9.5px] font-extrabold text-purple-700">Quote / PI</span>
                            )}
                            {s.documentType === 'PURCHASE ORDER' && (
                              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[9.5px] font-extrabold text-blue-700">Company PO</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3.5 py-3 font-bold text-slate-900">{s.customer}</td>
                        <td className="px-3.5 py-3 font-mono text-slate-600">{s.date}</td>
                        <td className="px-3.5 py-3 font-black text-slate-900">{money(s.grandTotal)}</td>
                        <td className="px-3.5 py-3"><StatusBadge status={s.status} /></td>
                        <td className="px-3.5 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {(s.documentType === 'PROFORMA INVOICE' || s.documentType === 'PURCHASE ORDER') && (
                              <button
                                onClick={() => { setActiveModal(null); navigate('/sales?tab=orders'); }}
                                className="px-2 py-1 rounded-md text-[11px] font-extrabold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200"
                                title="Open in Orders & Estimates"
                              >
                                View Order
                              </button>
                            )}
                            <button onClick={() => printInvoice(s)} className="p-1.5 text-brand-600 hover:bg-brand-50 rounded-lg" title="Print">
                              <Printer className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <span className="text-xs text-slate-500 font-medium">
                💡 Quotes &amp; Purchase Orders are housed in <strong>Orders &amp; Estimates</strong> until converted into tax invoices.
              </span>
              <div className="flex items-center gap-2">
                <button className="btn-secondary" onClick={() => setActiveModal(null)}>Close</button>
                <button
                  className="btn-secondary bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 font-bold"
                  onClick={() => { setActiveModal(null); navigate('/sales?tab=orders'); }}
                >
                  View Orders &amp; Quotes
                </button>
                <button className="btn-primary" onClick={() => { setActiveModal(null); navigate('/sales'); }}>
                  View All Invoices
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* 5. Today's Purchases Modal */}
      {activeModal === 'todayPurchases' && (
        <Modal
          title={`Today's Purchase Bills (${money(stats.todayPurchasesTotal)})`}
          size="xl"
          onClose={() => setActiveModal(null)}
        >
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3.5 py-2.5 font-bold text-slate-600">Bill / PO #</th>
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
                        No purchase bills recorded today yet.
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
              <button className="btn-primary" onClick={() => { setActiveModal(null); navigate('/purchase'); }}>Purchase Bills Page</button>
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
