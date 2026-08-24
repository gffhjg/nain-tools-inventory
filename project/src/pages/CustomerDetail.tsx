import { useParams, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import {
  ArrowLeft, Phone, MapPin, FileText, IndianRupee, TrendingUp,
  ShoppingCart, Clock, Tag, StickyNote, Landmark, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import { useStore } from '@/store/AppStore';
import { money } from '@/utils/analytics';

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { customers, sales, products, cheques } = useStore();

  const customer = useMemo(() => customers.find((c) => c.id === id), [customers, id]);

  const customerSales = useMemo(
    () => sales.filter((s) => s.customer === customer?.name).sort((a, b) => b.date.localeCompare(a.date)),
    [sales, customer],
  );

  const customerCheques = useMemo(
    () =>
      cheques
        .filter((c) => (c.customerId && c.customerId === customer?.id) || c.customerName === customer?.name)
        .sort((a, b) => b.chequeDate.localeCompare(a.chequeDate)),
    [cheques, customer],
  );

  const businessSummary = useMemo(() => {
    const validSales = customerSales.filter((s) => s.status !== 'draft' && s.status !== 'cancelled');
    const totalPurchases = validSales.reduce((s, r) => s + r.grandTotal, 0);
    const totalPaid = validSales.reduce((s, r) => s + r.amountPaid, 0);
    const outstanding = validSales.reduce((s, r) => s + (r.grandTotal - r.amountPaid), 0);
    const totalItems = validSales.reduce((s, r) => s + r.itemCount, 0);
    const avgOrder = validSales.length > 0 ? totalPurchases / validSales.length : 0;
    const lastSale = validSales[0];
    return { totalPurchases, totalPaid, outstanding, totalItems, avgOrder, lastSale, invoiceCount: validSales.length };
  }, [customerSales]);

  const productsPurchased = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number; lastDate: string }>();
    for (const sale of customerSales) {
      if (sale.status === 'draft' || sale.status === 'cancelled') continue;
      for (const item of sale.items) {
        const existing = map.get(item.productId) ?? { name: item.name, qty: 0, revenue: 0, lastDate: sale.date };
        existing.qty += item.qty;
        existing.revenue += item.price * item.qty;
        if (sale.date > existing.lastDate) existing.lastDate = sale.date;
        map.set(item.productId, existing);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [customerSales]);

  const priceHistory = useMemo(() => {
    const rows: { date: string; invoice: string; product: string; price: number; qty: number }[] = [];
    for (const sale of customerSales) {
      if (sale.status === 'cancelled') continue;
      for (const item of sale.items) {
        rows.push({ date: sale.date, invoice: sale.invoice, product: item.name, price: item.price, qty: item.qty });
      }
    }
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [customerSales]);

  const paymentHistory = useMemo(() => {
    return customerSales
      .filter((s) => s.status !== 'draft' && s.status !== 'cancelled')
      .map((s) => ({
        id: s.id, invoice: s.invoice, date: s.date, grandTotal: s.grandTotal,
        amountPaid: s.amountPaid, outstanding: s.grandTotal - s.amountPaid,
        paymentMethod: s.paymentMethod, status: s.status,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [customerSales]);

  if (!customer) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Customer Not Found" subtitle="This customer may have been deleted." />
        <div className="card flex flex-col items-center py-16">
          <p className="mt-3 text-sm text-slate-500">The customer you're looking for doesn't exist.</p>
          <button className="btn-primary mt-4" onClick={() => navigate('/customers')}>
            <ArrowLeft className="h-4 w-4" /> Back to Customers
          </button>
        </div>
      </div>
    );
  }

  const summaryCards = [
    { label: 'Lifetime Revenue', value: money(businessSummary.totalPurchases), icon: IndianRupee, tone: 'bg-brand-50 text-brand-600' },
    { label: 'Total Paid', value: money(businessSummary.totalPaid), icon: TrendingUp, tone: 'bg-accent-50 text-accent-600' },
    { label: 'Outstanding', value: money(businessSummary.outstanding), icon: Clock, tone: businessSummary.outstanding > 0 ? 'bg-warn-50 text-warn-600' : 'bg-accent-50 text-accent-600' },
    { label: 'Total Invoices', value: String(businessSummary.invoiceCount), icon: FileText, tone: 'bg-slate-100 text-slate-600' },
    { label: 'Items Purchased', value: businessSummary.totalItems.toLocaleString('en-IN'), icon: ShoppingCart, tone: 'bg-brand-50 text-brand-600' },
    { label: 'Avg. Order Value', value: money(businessSummary.avgOrder), icon: Tag, tone: 'bg-slate-100 text-slate-600' },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={customer.name}
        subtitle={`${customer.phone}${customer.gstin ? ' · GSTIN: ' + customer.gstin : ''}`}
        actions={
          <button className="btn-secondary" onClick={() => navigate('/customers')}>
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
              <span className="text-slate-700">{customer.phone}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Tag className="h-4 w-4 text-slate-400" />
              <span className="text-slate-700">{customer.gstin || 'No GSTIN'}</span>
            </div>
            {customer.address && (
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span className="text-slate-700">{customer.address}</span>
              </div>
            )}
          </div>
          {customer.notes && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3">
              <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p className="text-xs text-amber-700">{customer.notes}</p>
            </div>
          )}
        </div>
        <div className="card p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-800">Business Summary</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
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

      {/* Invoice Timeline */}
      <div className="mt-4 card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
          <FileText className="h-5 w-5 text-brand-600" />
          <h3 className="font-semibold text-slate-800">Invoice Timeline</h3>
          <span className="badge bg-slate-100 text-slate-600">{customerSales.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="table-th">Invoice</th>
                <th className="table-th">Date</th>
                <th className="table-th text-right">Items</th>
                <th className="table-th text-right">Grand Total</th>
                <th className="table-th text-right">Paid</th>
                <th className="table-th text-right">Outstanding</th>
                <th className="table-th">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customerSales.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/50">
                  <td className="table-td font-medium text-slate-800">{s.invoice}</td>
                  <td className="table-td text-slate-600">{s.date}</td>
                  <td className="table-td text-right tabular-nums">{s.itemCount}</td>
                  <td className="table-td text-right font-semibold tabular-nums">{money(s.grandTotal)}</td>
                  <td className="table-td text-right tabular-nums text-accent-600">{money(s.amountPaid)}</td>
                  <td className="table-td text-right tabular-nums">
                    {s.grandTotal - s.amountPaid > 0 ? (
                      <span className="font-semibold text-warn-600">{money(s.grandTotal - s.amountPaid)}</span>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="table-td"><StatusBadge status={s.status} /></td>
                </tr>
              ))}
              {customerSales.length === 0 && (
                <tr><td colSpan={7} className="table-td text-center text-slate-400 py-8">No invoices yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Products Purchased + Payment History */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
            <ShoppingCart className="h-5 w-5 text-brand-600" />
            <h3 className="font-semibold text-slate-800">Products Purchased</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="table-th">Product</th>
                  <th className="table-th text-right">Qty</th>
                  <th className="table-th text-right">Revenue</th>
                  <th className="table-th">Last Bought</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {productsPurchased.map((p) => (
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
                    <td className="table-td text-right font-semibold tabular-nums">{money(p.revenue)}</td>
                    <td className="table-td text-slate-500">{p.lastDate}</td>
                  </tr>
                ))}
                {productsPurchased.length === 0 && (
                  <tr><td colSpan={4} className="table-td text-center text-slate-400 py-8">No purchases yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
            <IndianRupee className="h-5 w-5 text-brand-600" />
            <h3 className="font-semibold text-slate-800">Payment History</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="table-th">Invoice</th>
                  <th className="table-th">Date</th>
                  <th className="table-th text-right">Total</th>
                  <th className="table-th text-right">Outstanding</th>
                  <th className="table-th">Method</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paymentHistory.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/50">
                    <td className="table-td font-medium text-slate-800">{p.invoice}</td>
                    <td className="table-td text-slate-600">{p.date}</td>
                    <td className="table-td text-right tabular-nums">{money(p.grandTotal)}</td>
                    <td className="table-td text-right tabular-nums">
                      {p.outstanding > 0 ? <span className="font-semibold text-warn-600">{money(p.outstanding)}</span> : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="table-td text-slate-500">{p.paymentMethod}</td>
                  </tr>
                ))}
                {paymentHistory.length === 0 && (
                  <tr><td colSpan={5} className="table-td text-center text-slate-400 py-8">No payments yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Cheques In Hand & Realisation History */}
      <div className="mt-4 card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-brand-600" />
            <h3 className="font-semibold text-slate-800">Cheques & Realisation History</h3>
          </div>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
            {customerCheques.length} Cheques Recorded
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="table-th">Cheque #</th>
                <th className="table-th">Issuing Bank</th>
                <th className="table-th">Claimable / Realisation Date</th>
                <th className="table-th">Invoice #</th>
                <th className="table-th text-right">Amount</th>
                <th className="table-th text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customerCheques.map((chq) => {
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
                            Claimable Today
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
                          <Clock className="w-3 h-3" /> In Hand (Pending)
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {customerCheques.length === 0 && (
                <tr>
                  <td colSpan={6} className="table-td text-center text-slate-400 py-8">
                    No cheque payments recorded for this customer yet.
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
          <TrendingUp className="h-5 w-5 text-brand-600" />
          <h3 className="font-semibold text-slate-800">Price History — What They Paid</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="table-th">Date</th>
                <th className="table-th">Invoice</th>
                <th className="table-th">Product</th>
                <th className="table-th text-right">Qty</th>
                <th className="table-th text-right">Unit Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {priceHistory.slice(0, 30).map((r, i) => (
                <tr key={i} className="hover:bg-slate-50/50">
                  <td className="table-td text-slate-600">{r.date}</td>
                  <td className="table-td font-medium text-slate-800">{r.invoice}</td>
                  <td className="table-td text-slate-700">{r.product}</td>
                  <td className="table-td text-right tabular-nums">{r.qty.toLocaleString('en-IN')}</td>
                  <td className="table-td text-right tabular-nums font-semibold">{money(r.price)}</td>
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
