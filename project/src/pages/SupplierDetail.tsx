import { useParams, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import {
  ArrowLeft, Phone, MapPin, FileText, IndianRupee, TrendingDown,
  Truck, Clock, Tag, StickyNote, BarChart3, Landmark, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import { useStore } from '@/store/AppStore';
import { money } from '@/utils/analytics';

export default function SupplierDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { suppliers, purchases, products, cheques } = useStore();

  const supplier = useMemo(() => suppliers.find((s) => s.id === id), [suppliers, id]);

  const supplierPurchases = useMemo(
    () => purchases.filter((p) => p.supplier === supplier?.name).sort((a, b) => b.date.localeCompare(a.date)),
    [purchases, supplier],
  );

  const supplierCheques = useMemo(
    () =>
      cheques
        .filter((c) => (c.supplierId && c.supplierId === supplier?.id) || c.supplierName === supplier?.name || c.customerName === supplier?.name)
        .sort((a, b) => b.chequeDate.localeCompare(a.chequeDate)),
    [cheques, supplier],
  );

  const businessSummary = useMemo(() => {
    const totalSpent = supplierPurchases.reduce((s, p) => s + p.grandTotal, 0);
    const outstanding = supplierPurchases
      .filter((p) => p.paymentStatus === 'Pending')
      .reduce((s, p) => s + p.grandTotal, 0);
    const totalItems = supplierPurchases.reduce((s, p) => s + p.itemCount, 0);
    const lastPurchase = supplierPurchases[0];
    return { totalSpent, outstanding, totalItems, lastPurchase, poCount: supplierPurchases.length };
  }, [supplierPurchases]);

  const productsSupplied = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; totalCost: number; lastDate: string }>();
    for (const po of supplierPurchases) {
      for (const item of po.items) {
        const existing = map.get(item.productId) ?? { name: item.name, qty: 0, totalCost: 0, lastDate: po.date };
        existing.qty += item.qty;
        existing.totalCost += item.cost * item.qty;
        if (po.date > existing.lastDate) existing.lastDate = po.date;
        map.set(item.productId, existing);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty);
  }, [supplierPurchases]);

  const priceHistory = useMemo(() => {
    const rows: { date: string; poNumber: string; product: string; cost: number; qty: number }[] = [];
    for (const po of supplierPurchases) {
      for (const item of po.items) {
        rows.push({ date: po.date, poNumber: po.poNumber, product: item.name, cost: item.cost, qty: item.qty });
      }
    }
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [supplierPurchases]);

  const perProductRates = useMemo(() => {
    const map = new Map<string, { name: string; rates: { date: string; cost: number }[] }>();
    for (const po of supplierPurchases) {
      for (const item of po.items) {
        const existing = map.get(item.productId) ?? { name: item.name, rates: [] };
        existing.rates.push({ date: po.date, cost: item.cost });
        map.set(item.productId, existing);
      }
    }
    const result: { name: string; avgRate: number; lastRate: number; lastDate: string; bestRate: number; count: number }[] = [];
    for (const [, val] of map) {
      const sorted = val.rates.sort((a, b) => b.date.localeCompare(a.date));
      const avg = val.rates.reduce((s, r) => s + r.cost, 0) / val.rates.length;
      const best = Math.min(...val.rates.map((r) => r.cost));
      result.push({ name: val.name, avgRate: avg, lastRate: sorted[0].cost, lastDate: sorted[0].date, bestRate: best, count: val.rates.length });
    }
    return result.sort((a, b) => b.count - a.count);
  }, [supplierPurchases]);

  if (!supplier) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Supplier Not Found" subtitle="This supplier may have been deleted." />
        <div className="card flex flex-col items-center py-16">
          <p className="mt-3 text-sm text-slate-500">The supplier you're looking for doesn't exist.</p>
          <button className="btn-primary mt-4" onClick={() => navigate('/suppliers')}>
            <ArrowLeft className="h-4 w-4" /> Back to Suppliers
          </button>
        </div>
      </div>
    );
  }

  const summaryCards = [
    { label: 'Lifetime Purchases', value: money(businessSummary.totalSpent), icon: IndianRupee, tone: 'bg-brand-50 text-brand-600' },
    { label: 'Outstanding Payments', value: money(businessSummary.outstanding), icon: Clock, tone: businessSummary.outstanding > 0 ? 'bg-warn-50 text-warn-600' : 'bg-accent-50 text-accent-600' },
    { label: 'Total POs', value: String(businessSummary.poCount), icon: FileText, tone: 'bg-slate-100 text-slate-600' },
    { label: 'Items Supplied', value: businessSummary.totalItems.toLocaleString('en-IN'), icon: Truck, tone: 'bg-brand-50 text-brand-600' },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={supplier.name}
        subtitle={`${supplier.phone}${supplier.gstin ? ' · GSTIN: ' + supplier.gstin : ''}`}
        actions={
          <button className="btn-secondary" onClick={() => navigate('/suppliers')}>
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </button>
        }
      />

      {/* Profile + Summary */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-800">Profile</h3>
          <div className="mt-3 space-y-2.5">
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-slate-400" />
              <span className="text-slate-700">{supplier.phone}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Tag className="h-4 w-4 text-slate-400" />
              <span className="text-slate-700">{supplier.gstin || 'No GSTIN'}</span>
            </div>
            {supplier.address && (
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span className="text-slate-700">{supplier.address}</span>
              </div>
            )}
          </div>
          {supplier.notes && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3">
              <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p className="text-xs text-amber-700">{supplier.notes}</p>
            </div>
          )}
        </div>
        <div className="card p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-800">Business Summary</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {summaryCards.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="rounded-xl border border-slate-100 p-3">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${s.tone}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="mt-2 text-base font-bold text-slate-900">{s.value}</p>
                  <p className="text-xs text-slate-500">{s.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Purchase Timeline */}
      <div className="mt-4 card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
          <Truck className="h-5 w-5 text-brand-600" />
          <h3 className="font-semibold text-slate-800">Purchase Timeline</h3>
          <span className="badge bg-slate-100 text-slate-600">{supplierPurchases.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="table-th">PO Number</th>
                <th className="table-th">Supplier Invoice</th>
                <th className="table-th">Date</th>
                <th className="table-th text-right">Items</th>
                <th className="table-th text-right">Grand Total</th>
                <th className="table-th">Payment</th>
                <th className="table-th">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {supplierPurchases.map((p) => (
                <tr
                  key={p.id}
                  className="cursor-pointer hover:bg-slate-50/50"
                  onClick={() => navigate(`/purchase/${p.id}`)}
                >
                  <td className="table-td font-medium text-brand-600">{p.poNumber}</td>
                  <td className="table-td text-slate-600">{p.supplierInvoice || '—'}</td>
                  <td className="table-td text-slate-600">{p.date}</td>
                  <td className="table-td text-right tabular-nums">{p.itemCount}</td>
                  <td className="table-td text-right font-semibold tabular-nums">{money(p.grandTotal)}</td>
                  <td className="table-td">
                    <span className={`badge ${p.paymentStatus === 'Paid' ? 'bg-accent-100 text-accent-700' : 'bg-warn-100 text-warn-600'}`}>
                      {p.paymentStatus}
                    </span>
                  </td>
                  <td className="table-td"><StatusBadge status={p.status} /></td>
                </tr>
              ))}
              {supplierPurchases.length === 0 && (
                <tr><td colSpan={7} className="table-td text-center text-slate-400 py-8">No purchases yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Products Supplied + Purchase Rate Analysis */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
            <Truck className="h-5 w-5 text-brand-600" />
            <h3 className="font-semibold text-slate-800">Products Supplied</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="table-th">Product</th>
                  <th className="table-th text-right">Qty Supplied</th>
                  <th className="table-th text-right">Total Cost</th>
                  <th className="table-th">Last Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {productsSupplied.map((p) => (
                  <tr
                    key={p.name}
                    className="cursor-pointer hover:bg-slate-50/50"
                    onClick={() => {
                      const prod = products.find((x) => x.name === p.name);
                      if (prod) navigate(`/products/${prod.id}`);
                    }}
                  >
                    <td className="table-td font-medium text-slate-800">{p.name}</td>
                    <td className="table-td text-right tabular-nums">{p.qty.toLocaleString('en-IN')}</td>
                    <td className="table-td text-right font-semibold tabular-nums">{money(p.totalCost)}</td>
                    <td className="table-td text-slate-500">{p.lastDate}</td>
                  </tr>
                ))}
                {productsSupplied.length === 0 && (
                  <tr><td colSpan={4} className="table-td text-center text-slate-400 py-8">No products supplied yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
            <BarChart3 className="h-5 w-5 text-brand-600" />
            <h3 className="font-semibold text-slate-800">Purchase Rate Analysis</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="table-th">Product</th>
                  <th className="table-th text-right">Last Rate</th>
                  <th className="table-th text-right">Avg Rate</th>
                  <th className="table-th text-right">Best Rate</th>
                  <th className="table-th text-right">Orders</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {perProductRates.map((r) => (
                  <tr key={r.name} className="hover:bg-slate-50/50">
                    <td className="table-td font-medium text-slate-800">{r.name}</td>
                    <td className="table-td text-right tabular-nums font-semibold">{money(r.lastRate)}</td>
                    <td className="table-td text-right tabular-nums text-slate-600">{money(r.avgRate)}</td>
                    <td className="table-td text-right tabular-nums text-accent-600">{money(r.bestRate)}</td>
                    <td className="table-td text-right tabular-nums text-slate-500">{r.count}</td>
                  </tr>
                ))}
                {perProductRates.length === 0 && (
                  <tr><td colSpan={5} className="table-td text-center text-slate-400 py-8">No rate data yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Cheques Issued to Supplier */}
      <div className="mt-4 card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-brand-600" />
            <h3 className="font-semibold text-slate-800">Cheques Issued & Settlement Tracker</h3>
          </div>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
            {supplierCheques.length} Cheques Issued
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="table-th">Cheque #</th>
                <th className="table-th">Bank Name</th>
                <th className="table-th">Due / Realisation Date</th>
                <th className="table-th">PO / Bill #</th>
                <th className="table-th text-right">Amount</th>
                <th className="table-th text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {supplierCheques.map((chq) => {
                const isCleared = chq.status === 'cleared';
                const isBounced = chq.status === 'bounced';
                const isClaimableToday = chq.status === 'pending_clearance' && chq.chequeDate <= new Date().toISOString().slice(0, 10);
                return (
                  <tr key={chq.id} className="hover:bg-slate-50/50">
                    <td className="table-td font-mono font-bold text-slate-800">#{chq.chequeNumber}</td>
                    <td className="table-td font-medium text-slate-700">{chq.bankName}</td>
                    <td className="table-td text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <span>{chq.chequeDate}</span>
                        {isClaimableToday && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 animate-pulse">
                            Due Today
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="table-td text-slate-500">{chq.invoiceNumber || '—'}</td>
                    <td className="table-td text-right font-bold tabular-nums text-slate-900">{money(chq.amount)}</td>
                    <td className="table-td text-center">
                      {isCleared && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" /> Cleared
                        </span>
                      )}
                      {isBounced && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200" title={chq.bounceReason}>
                          <AlertTriangle className="w-3 h-3" /> Bounced ({chq.bounceReason || 'Dishonoured'})
                        </span>
                      )}
                      {!isCleared && !isBounced && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock className="w-3 h-3" /> Issued (Pending Clearing)
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {supplierCheques.length === 0 && (
                <tr>
                  <td colSpan={6} className="table-td text-center text-slate-400 py-8">
                    No outward cheques recorded for this supplier yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Price History */}
      <div className="mt-4 card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
          <TrendingDown className="h-5 w-5 text-brand-600" />
          <h3 className="font-semibold text-slate-800">Purchase Price History — What We Paid</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="table-th">Date</th>
                <th className="table-th">PO Number</th>
                <th className="table-th">Product</th>
                <th className="table-th text-right">Qty</th>
                <th className="table-th text-right">Unit Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {priceHistory.slice(0, 30).map((r, i) => (
                <tr key={i} className="hover:bg-slate-50/50">
                  <td className="table-td text-slate-600">{r.date}</td>
                  <td className="table-td font-medium text-brand-600">{r.poNumber}</td>
                  <td className="table-td text-slate-700">{r.product}</td>
                  <td className="table-td text-right tabular-nums">{r.qty.toLocaleString('en-IN')}</td>
                  <td className="table-td text-right tabular-nums font-semibold">{money(r.cost)}</td>
                </tr>
              ))}
              {priceHistory.length === 0 && (
                <tr><td colSpan={5} className="table-td text-center text-slate-400 py-8">No price history yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
