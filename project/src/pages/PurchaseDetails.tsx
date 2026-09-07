import { useParams, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import {
  ArrowLeft, Truck, Printer, CheckCircle2, Clock, FileText, MapPin, Phone,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { printPurchase } from '@/components/PrintableInvoice';
import { useStore } from '@/store/AppStore';
import { money } from '@/utils/analytics';

export default function PurchaseDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { purchases, suppliers, markPurchaseReceived, updatePurchaseStatus, companySettings } = useStore();

  const po = useMemo(() => purchases.find((p) => p.id === id), [purchases, id]);
  const supplierInfo = useMemo(
    () => (po ? suppliers.find((s) => s.name === po.supplier) : null),
    [suppliers, po],
  );

  if (!po) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Purchase Bill Not Found" subtitle="This bill may have been deleted." />
        <div className="card flex flex-col items-center py-16">
          <FileText className="h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">The purchase bill you're looking for doesn't exist.</p>
          <button className="btn-primary mt-4" onClick={() => navigate('/purchase')}>
            <ArrowLeft className="h-4 w-4" />
            Back to Purchases
          </button>
        </div>
      </div>
    );
  }

  const billNumber = po.poNumber.startsWith('PO-') ? 'PB-' + po.poNumber.slice(3) : po.poNumber;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={`Purchase Bill ${billNumber}`}
        subtitle={`${po.supplier} · ${po.date}`}
        actions={
          <>
            <button className="btn-secondary" onClick={() => navigate('/purchase')}>
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back</span>
            </button>
            <button className="btn-secondary" onClick={() => printPurchase(po, companySettings)}>
              <Printer className="h-4 w-4" />
              <span className="hidden sm:inline">Print</span>
            </button>
            {po.status !== 'received' && po.status !== 'cancelled' && (
              <button className="btn-primary" onClick={() => markPurchaseReceived(po.id)}>
                <CheckCircle2 className="h-4 w-4" />
                <span className="hidden sm:inline">Mark Received</span>
              </button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Bill metadata */}
        <div className="card p-5 lg:col-span-1">
          <h3 className="mb-4 text-base font-semibold text-slate-900">Bill Details</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-slate-500">Supplier Invoice #</span>
              <span className="text-sm font-medium text-slate-800">{po.supplierInvoice || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-500">Purchase Date</span>
              <span className="text-sm font-medium text-slate-800">{po.date}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-500">Expected Delivery</span>
              <span className="text-sm font-medium text-slate-800">{po.expectedDelivery || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-500">Received Date</span>
              <span className="text-sm font-medium text-slate-800">{po.receivedDate ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-500">Payment Status</span>
              <span className={`badge ${po.paymentStatus === 'Paid' ? 'bg-accent-100 text-accent-700' : 'bg-warn-100 text-warn-600'}`}>
                {po.paymentStatus}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-500">Payment Method</span>
              <span className="text-sm font-medium text-slate-800">{po.paymentMethod}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Status</span>
              <select
                value={po.status}
                onChange={(e) => updatePurchaseStatus(po.id, e.target.value as 'draft' | 'ordered' | 'partially-received' | 'received' | 'cancelled')}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="draft">Draft</option>
                <option value="ordered">Ordered</option>
                <option value="partially-received">Partially Received</option>
                <option value="received">Received</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          {po.notes && (
            <div className="mt-4 rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-400">Notes</p>
              <p className="mt-1 text-sm text-slate-600">{po.notes}</p>
            </div>
          )}
          {supplierInfo && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold uppercase text-slate-400">Supplier Contact</p>
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Phone className="h-4 w-4 text-slate-400" />
                  {supplierInfo.phone}
                </div>
                {supplierInfo.gstin && (
                  <p className="text-sm text-slate-600">GSTIN: {supplierInfo.gstin}</p>
                )}
                {supplierInfo.address && (
                  <div className="flex items-start gap-2 text-sm text-slate-600">
                    <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                    {supplierInfo.address}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Items + totals */}
        <div className="card overflow-hidden lg:col-span-2">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
            <Truck className="h-5 w-5 text-brand-600" />
            <h3 className="font-semibold text-slate-800">Purchased Items</h3>
            <span className="badge bg-slate-100 text-slate-600">{po.items.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="table-th">Product</th>
                  <th className="table-th text-right">Qty (Pieces)</th>
                  <th className="table-th text-right">Unit Cost</th>
                  <th className="table-th text-right">GST</th>
                  <th className="table-th text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {po.items.map((it) => (
                  <tr key={it.productId} className="hover:bg-slate-50/50">
                    <td className="table-td font-medium text-slate-800">{it.name}</td>
                    <td className="table-td text-right tabular-nums">{it.qty.toLocaleString('en-IN')}</td>
                    <td className="table-td text-right tabular-nums">{money(it.cost)}</td>
                    <td className="table-td text-right tabular-nums text-slate-500">{it.gstRate}%</td>
                    <td className="table-td text-right font-semibold tabular-nums text-slate-900">
                      {money(it.cost * it.qty)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 p-4">
            <div className="ml-auto max-w-xs space-y-2">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Subtotal</span>
                <span className="tabular-nums">{money(po.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-600">
                <span>GST ({po.gstRate}%)</span>
                <span className="tabular-nums">{money(po.gstAmount)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-lg font-bold text-slate-900">
                <span>Grand Total</span>
                <span className="tabular-nums">{money(po.grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {po.status !== 'received' && po.status !== 'cancelled' && (
        <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-warn-200 bg-warn-50 px-4 py-3">
          <Clock className="h-5 w-5 shrink-0 text-warn-600" />
          <p className="text-sm font-medium text-warn-700">
            This purchase is not yet received. Estimated Stock will not update until you mark it as received.
          </p>
        </div>
      )}
    </div>
  );
}
