import { useParams, useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import {
  ArrowLeft, Truck, ShoppingCart, ClipboardCheck, IndianRupee,
  TrendingUp, Package, AlertTriangle, Boxes, MapPin, Tag,
  Users, BarChart3, TrendingDown, Eye, Settings2,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import VerificationModal from '@/components/VerificationModal';
import { useStore } from '@/store/AppStore';
import { money } from '@/utils/analytics';
import type { VerificationRecord } from '@/lib/types';

export default function ProductHistory() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { products, sales, purchases, verifications, addVerification, updateBoxStatusMode } = useStore();
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [boxModeOpen, setBoxModeOpen] = useState(false);

  const product = useMemo(() => products.find((p) => p.id === id), [products, id]);

  const purchaseHistory = useMemo(
    () =>
      purchases
        .filter((po) => po.items.some((it) => it.productId === id))
        .map((po) => {
          const item = po.items.find((it) => it.productId === id)!;
          return { po, item };
        })
        .sort((a, b) => b.po.date.localeCompare(a.po.date)),
    [purchases, id],
  );

  const salesHistory = useMemo(
    () =>
      sales
        .filter((s) => s.items.some((it) => it.productId === id))
        .map((s) => {
          const item = s.items.find((it) => it.productId === id)!;
          return { sale: s, item };
        })
        .sort((a, b) => b.sale.date.localeCompare(a.sale.date)),
    [sales, id],
  );

  const verificationHistory = useMemo(
    () => verifications.filter((v) => v.productId === id).sort((a, b) => b.date.localeCompare(a.date)),
    [verifications, id],
  );

  const totalPurchased = purchaseHistory.reduce((s, { item }) => s + item.qty, 0);
  const totalSold = salesHistory.reduce((s, { item }) => s + item.qty, 0);
  const calculatedEstimate = Math.max(0, totalPurchased - totalSold);
  const profitPerPiece = product ? product.price - product.cost : 0;
  const lastVerification = verificationHistory[0];

  // Purchase price history (all rates ever paid)
  const purchasePriceHistory = useMemo(() => {
    return purchaseHistory
      .map(({ po, item }) => ({ date: po.date, poNumber: po.poNumber, supplier: po.supplier, cost: item.cost, qty: item.qty }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [purchaseHistory]);

  // Selling price history (all rates ever charged)
  const sellingPriceHistory = useMemo(() => {
    return salesHistory
      .filter(({ sale }) => sale.status !== 'cancelled')
      .map(({ sale, item }) => ({ date: sale.date, invoice: sale.invoice, customer: sale.customer, price: item.price, qty: item.qty }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [salesHistory]);

  // Top customers who buy this product
  const topCustomers = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number; lastDate: string }>();
    for (const { sale, item } of salesHistory) {
      if (sale.status === 'draft' || sale.status === 'cancelled') continue;
      const existing = map.get(sale.customer) ?? { name: sale.customer, qty: 0, revenue: 0, lastDate: sale.date };
      existing.qty += item.qty;
      existing.revenue += item.price * item.qty;
      if (sale.date > existing.lastDate) existing.lastDate = sale.date;
      map.set(sale.customer, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [salesHistory]);

  // Best supplier price analysis
  const supplierRates = useMemo(() => {
    const map = new Map<string, { supplier: string; rates: { date: string; cost: number }[] }>();
    for (const { po, item } of purchaseHistory) {
      const existing = map.get(po.supplier) ?? { supplier: po.supplier, rates: [] };
      existing.rates.push({ date: po.date, cost: item.cost });
      map.set(po.supplier, existing);
    }
    const result: { supplier: string; lastRate: number; avgRate: number; bestRate: number; count: number }[] = [];
    for (const [, val] of map) {
      const sorted = val.rates.sort((a, b) => b.date.localeCompare(a.date));
      const avg = val.rates.reduce((s, r) => s + r.cost, 0) / val.rates.length;
      const best = Math.min(...val.rates.map((r) => r.cost));
      result.push({ supplier: val.supplier, lastRate: sorted[0].cost, avgRate: avg, bestRate: best, count: val.rates.length });
    }
    return result.sort((a, b) => b.count - a.count);
  }, [purchaseHistory]);

  if (!product) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Product Not Found" subtitle="This product may have been deleted." />
        <div className="card flex flex-col items-center py-16">
          <AlertTriangle className="h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">The product you're looking for doesn't exist.</p>
          <button className="btn-primary mt-4" onClick={() => navigate('/products')}>
            <ArrowLeft className="h-4 w-4" />
            Back to Products
          </button>
        </div>
      </div>
    );
  }

  const detailRows = [
    { label: 'Product Name', value: product.name, icon: Package },
    { label: 'Supplier', value: product.supplier, icon: Truck },
    { label: 'Rack Number', value: product.rackNumber, icon: MapPin },
    { label: 'Purchase Price', value: money(product.cost), icon: IndianRupee },
    { label: 'Selling Price', value: money(product.price), icon: IndianRupee },
    { label: 'Profit Per Piece', value: money(profitPerPiece), icon: TrendingUp },
    { label: 'Estimated Stock', value: `${product.stock.toLocaleString('en-IN')} pcs`, icon: Boxes },
    { label: 'Box Capacity', value: `${product.boxCapacity.toLocaleString('en-IN')} pcs`, icon: Package },
    { label: 'Current Box Status', value: product.boxStatus, icon: Boxes },
    { label: 'Last Physical Verification', value: lastVerification?.date ?? 'Never', icon: ClipboardCheck },
    { label: 'Reorder Level', value: `${product.reorderLevel.toLocaleString('en-IN')} pcs`, icon: AlertTriangle },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={product.name}
        subtitle={`Rack ${product.rackNumber} · ${product.supplier}`}
        actions={
          <>
            <button className="btn-secondary" onClick={() => navigate('/products')}>
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back</span>
            </button>
            <button className="btn-primary" onClick={() => setVerifyOpen(true)}>
              <ClipboardCheck className="h-4 w-4" />
              <span className="hidden sm:inline">Physical Verification</span>
            </button>
          </>
        }
      />

      {/* Product Overview */}
      <div className="card overflow-hidden">
        <div className="grid grid-cols-1 gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {detailRows.map((row) => {
            const Icon = row.icon;
            const isProfit = row.label === 'Profit Per Piece';
            const isBoxStatus = row.label === 'Current Box Status';
            return (
              <div key={row.label} className="bg-white p-4">
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Icon className="h-3.5 w-3.5" />
                  {row.label}
                </div>
                {isBoxStatus ? (
                  <div className="mt-1.5"><StatusBadge status={product.boxStatus} variant="box" /></div>
                ) : (
                  <p className={`mt-1 text-base font-bold ${isProfit ? 'text-accent-600' : 'text-slate-900'}`}>
                    {row.value}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Estimate vs Physical Observation */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-brand-600" />
            <h3 className="font-semibold text-slate-800">Estimated Stock</h3>
          </div>
          <p className="mt-2 text-3xl font-bold text-slate-900">{product.stock.toLocaleString('en-IN')} <span className="text-base font-normal text-slate-400">pcs</span></p>
          <p className="mt-1 text-sm text-slate-500">
            Received {totalPurchased.toLocaleString('en-IN')} &minus; Sold {totalSold.toLocaleString('en-IN')} = {calculatedEstimate.toLocaleString('en-IN')}
          </p>
          <p className="mt-1 text-xs text-slate-400">Adjusted by physical verification</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-accent-600" />
              <h3 className="font-semibold text-slate-800">Current Physical Observation</h3>
            </div>
            <button
              onClick={() => setBoxModeOpen((v) => !v)}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              title="Box status settings"
            >
              <Settings2 className="h-4 w-4" />
            </button>
          </div>
          {product.lastPhysicalObservation ? (
            <>
              <p className="mt-2 text-3xl font-bold text-slate-900">{product.lastPhysicalObservation.observedStock.toLocaleString('en-IN')} <span className="text-base font-normal text-slate-400">pcs</span></p>
              <div className="mt-2 flex items-center gap-3">
                <StatusBadge status={product.lastPhysicalObservation.boxStatus} variant="box" />
                <span className="text-xs text-slate-500">{product.lastPhysicalObservation.date} by {product.lastPhysicalObservation.user}</span>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-400">No physical observation recorded yet. Click "Physical Verification" to record one.</p>
          )}
          {boxModeOpen && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 animate-fade-in">
              <p className="text-xs font-semibold text-slate-600">Box Status Mode</p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => updateBoxStatusMode(product.id, 'auto')}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                    product.boxStatusMode === 'auto'
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-slate-200 text-slate-600 hover:bg-white'
                  }`}
                >
                  Auto (from stock %)
                </button>
                <button
                  onClick={() => updateBoxStatusMode(product.id, 'manual')}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                    product.boxStatusMode === 'manual'
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-slate-200 text-slate-600 hover:bg-white'
                  }`}
                >
                  Manual override
                </button>
              </div>
              {product.boxStatusMode === 'manual' && (
                <div className="mt-2">
                  <p className="mb-1.5 text-xs text-slate-500">Select box status:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(['Full', '75% Full', 'Half', 'Very Low', 'Almost Empty', 'Empty'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => updateBoxStatusMode(product.id, 'manual', s)}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                          product.manualBoxStatus === s
                            ? 'border-brand-500 bg-brand-50 text-brand-700'
                            : 'border-slate-200 text-slate-600 hover:bg-white'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <p className="mt-2 text-xs text-slate-400">
                {product.boxStatusMode === 'auto'
                  ? 'Box status is automatically calculated from stock vs box capacity.'
                  : `Manually set to "${product.manualBoxStatus}". This overrides the automatic calculation.`}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* History sections */}
      <div className="mt-4 space-y-4">
        {/* Purchase History */}
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
            <Truck className="h-5 w-5 text-brand-600" />
            <h3 className="font-semibold text-slate-800">Purchase History</h3>
            <span className="badge bg-slate-100 text-slate-600">{purchaseHistory.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="table-th">PO Number</th>
                  <th className="table-th">Date</th>
                  <th className="table-th">Supplier</th>
                  <th className="table-th text-right">Qty</th>
                  <th className="table-th text-right">Unit Cost</th>
                  <th className="table-th text-right">Total</th>
                  <th className="table-th">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {purchaseHistory.map(({ po, item }) => (
                  <tr key={po.id} className="cursor-pointer hover:bg-slate-50/50" onClick={() => navigate(`/purchase/${po.id}`)}>
                    <td className="table-td font-medium text-brand-600">{po.poNumber}</td>
                    <td className="table-td text-slate-600">{po.date}</td>
                    <td className="table-td text-slate-600">{po.supplier}</td>
                    <td className="table-td text-right tabular-nums font-semibold">{item.qty.toLocaleString('en-IN')}</td>
                    <td className="table-td text-right tabular-nums">{money(item.cost)}</td>
                    <td className="table-td text-right tabular-nums font-semibold">{money(item.cost * item.qty)}</td>
                    <td className="table-td"><StatusBadge status={po.status} /></td>
                  </tr>
                ))}
                {purchaseHistory.length === 0 && (
                  <tr><td colSpan={7} className="table-td text-center text-slate-400 py-8">No purchases recorded yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sales History */}
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
            <ShoppingCart className="h-5 w-5 text-brand-600" />
            <h3 className="font-semibold text-slate-800">Sales History</h3>
            <span className="badge bg-slate-100 text-slate-600">{salesHistory.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="table-th">Invoice</th>
                  <th className="table-th">Date</th>
                  <th className="table-th">Customer</th>
                  <th className="table-th text-right">Qty</th>
                  <th className="table-th text-right">Unit Price</th>
                  <th className="table-th text-right">Total</th>
                  <th className="table-th">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {salesHistory.map(({ sale, item }) => (
                  <tr key={sale.id} className="hover:bg-slate-50/50">
                    <td className="table-td font-medium text-slate-800">{sale.invoice}</td>
                    <td className="table-td text-slate-600">{sale.date}</td>
                    <td className="table-td text-slate-600">{sale.customer}</td>
                    <td className="table-td text-right tabular-nums font-semibold">{item.qty.toLocaleString('en-IN')}</td>
                    <td className="table-td text-right tabular-nums">{money(item.price)}</td>
                    <td className="table-td text-right tabular-nums font-semibold">{money(item.price * item.qty)}</td>
                    <td className="table-td"><StatusBadge status={sale.status} /></td>
                  </tr>
                ))}
                {salesHistory.length === 0 && (
                  <tr><td colSpan={7} className="table-td text-center text-slate-400 py-8">No sales recorded yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Customers + Supplier Rate Analysis */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
              <Users className="h-5 w-5 text-brand-600" />
              <h3 className="font-semibold text-slate-800">Top Customers</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="table-th">Customer</th>
                    <th className="table-th text-right">Qty Bought</th>
                    <th className="table-th text-right">Revenue</th>
                    <th className="table-th">Last Bought</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {topCustomers.map((c) => (
                    <tr key={c.name} className="hover:bg-slate-50/50">
                      <td className="table-td font-medium text-slate-800">{c.name}</td>
                      <td className="table-td text-right tabular-nums">{c.qty.toLocaleString('en-IN')}</td>
                      <td className="table-td text-right font-semibold tabular-nums">{money(c.revenue)}</td>
                      <td className="table-td text-slate-500">{c.lastDate}</td>
                    </tr>
                  ))}
                  {topCustomers.length === 0 && (
                    <tr><td colSpan={4} className="table-td text-center text-slate-400 py-8">No customers yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
              <BarChart3 className="h-5 w-5 text-brand-600" />
              <h3 className="font-semibold text-slate-800">Supplier Price Comparison</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="table-th">Supplier</th>
                    <th className="table-th text-right">Last Rate</th>
                    <th className="table-th text-right">Avg Rate</th>
                    <th className="table-th text-right">Best Rate</th>
                    <th className="table-th text-right">Orders</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {supplierRates.map((s) => (
                    <tr key={s.supplier} className="hover:bg-slate-50/50">
                      <td className="table-td font-medium text-slate-800">{s.supplier}</td>
                      <td className="table-td text-right tabular-nums font-semibold">{money(s.lastRate)}</td>
                      <td className="table-td text-right tabular-nums text-slate-600">{money(s.avgRate)}</td>
                      <td className="table-td text-right tabular-nums text-accent-600">{money(s.bestRate)}</td>
                      <td className="table-td text-right tabular-nums text-slate-500">{s.count}</td>
                    </tr>
                  ))}
                  {supplierRates.length === 0 && (
                    <tr><td colSpan={5} className="table-td text-center text-slate-400 py-8">No supplier data yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Purchase Price History + Selling Price History */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
              <TrendingDown className="h-5 w-5 text-brand-600" />
              <h3 className="font-semibold text-slate-800">Purchase Price History</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="table-th">Date</th>
                    <th className="table-th">PO</th>
                    <th className="table-th text-right">Cost</th>
                    <th className="table-th text-right">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {purchasePriceHistory.slice(0, 15).map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50/50">
                      <td className="table-td text-slate-600">{r.date}</td>
                      <td className="table-td font-medium text-brand-600">{r.poNumber}</td>
                      <td className="table-td text-right tabular-nums font-semibold">{money(r.cost)}</td>
                      <td className="table-td text-right tabular-nums">{r.qty.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                  {purchasePriceHistory.length === 0 && (
                    <tr><td colSpan={4} className="table-td text-center text-slate-400 py-8">No purchase price history</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
              <TrendingUp className="h-5 w-5 text-brand-600" />
              <h3 className="font-semibold text-slate-800">Selling Price History</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="table-th">Date</th>
                    <th className="table-th">Invoice</th>
                    <th className="table-th text-right">Price</th>
                    <th className="table-th text-right">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sellingPriceHistory.slice(0, 15).map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50/50">
                      <td className="table-td text-slate-600">{r.date}</td>
                      <td className="table-td font-medium text-slate-800">{r.invoice}</td>
                      <td className="table-td text-right tabular-nums font-semibold">{money(r.price)}</td>
                      <td className="table-td text-right tabular-nums">{r.qty.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                  {sellingPriceHistory.length === 0 && (
                    <tr><td colSpan={4} className="table-td text-center text-slate-400 py-8">No selling price history</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Verification History */}
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
            <ClipboardCheck className="h-5 w-5 text-accent-600" />
            <h3 className="font-semibold text-slate-800">Physical Verification History</h3>
            <span className="badge bg-slate-100 text-slate-600">{verificationHistory.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="table-th">Date</th>
                  <th className="table-th">User</th>
                  <th className="table-th text-right">Previous Estimate</th>
                  <th className="table-th text-right">Observed Estimate</th>
                  <th className="table-th">Box Status</th>
                  <th className="table-th">Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {verificationHistory.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50/50">
                    <td className="table-td text-slate-600">{v.date}</td>
                    <td className="table-td font-medium text-slate-800">{v.user}</td>
                    <td className="table-td text-right tabular-nums text-slate-500">{v.previousEstimate.toLocaleString('en-IN')}</td>
                    <td className="table-td text-right tabular-nums font-semibold text-slate-800">{v.observedEstimate.toLocaleString('en-IN')}</td>
                    <td className="table-td"><StatusBadge status={v.boxStatus} variant="box" /></td>
                    <td className="table-td text-slate-600">{v.remark || '—'}</td>
                  </tr>
                ))}
                {verificationHistory.length === 0 && (
                  <tr><td colSpan={6} className="table-td text-center text-slate-400 py-8">No verifications recorded yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <VerificationModal
        open={verifyOpen}
        product={product}
        onClose={() => setVerifyOpen(false)}
        onSave={(v: VerificationRecord) => addVerification(v)}
      />
    </div>
  );
}
