import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, Download, Eye, Truck, PackageCheck, Clock, FileText,
  Trash2, Minus, Printer, CheckCircle2, Package,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import Modal from '@/components/Modal';
import { printPurchase } from '@/components/PrintableInvoice';
import { useStore } from '@/store/AppStore';
import { GST_RATE } from '@/lib/constants';
import { downloadCSV, toCSV } from '@/utils/analytics';
import type { PurchaseRecord, PurchaseLineItem, PurchasePaymentMethod } from '@/lib/types';

const paymentTone: Record<PurchasePaymentMethod, string> = {
  Cash: 'bg-accent-50 text-accent-600',
  UPI: 'bg-brand-50 text-brand-600',
  'Bank Transfer': 'bg-amber-50 text-amber-600',
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nextPONumber(existing: PurchaseRecord[]): string {
  const nums = existing
    .map((p) => parseInt(p.poNumber.replace('PO-', ''), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 3100;
  return `PO-${max + 1}`;
}

type DraftLine = PurchaseLineItem;

export default function Purchase() {
  const { purchases, products, suppliers, addPurchase } = useStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [supplier, setSupplier] = useState('');
  const [supplierInvoice, setSupplierInvoice] = useState('');
  const [phone, setPhone] = useState('');
  const [date, setDate] = useState(todayISO());
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [notes, setNotes] = useState('');
  const [poStatus, setPoStatus] = useState<'draft' | 'ordered' | 'partially-received' | 'received' | 'cancelled'>('received');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [paymentStatus, setPaymentStatus] = useState<'Paid' | 'Pending'>('Paid');
  const [paymentMethod, setPaymentMethod] = useState<PurchasePaymentMethod>('Bank Transfer');
  const [productSearch, setProductSearch] = useState('');

  const poNumber = useMemo(() => nextPONumber(purchases), [purchases]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return purchases.filter(
      (p) =>
        p.poNumber.toLowerCase().includes(q) ||
        p.supplier.toLowerCase().includes(q) ||
        p.supplierInvoice.toLowerCase().includes(q) ||
        p.phone.toLowerCase().includes(q),
    );
  }, [purchases, search]);

  const summary = useMemo(() => {
    const total = purchases.reduce((s, p) => s + p.grandTotal, 0);
    const received = purchases.filter((p) => p.status === 'received').length;
    const pending = purchases.filter((p) => p.status === 'ordered' || p.status === 'partially-received').length;
    const pendingPayment = purchases
      .filter((p) => p.paymentStatus === 'Pending')
      .reduce((s, p) => s + p.grandTotal, 0);
    return { total, received, pending, pendingPayment };
  }, [purchases]);

  const statCards = [
    { label: 'Total Purchase Value', value: `₹${summary.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: Truck, tone: 'bg-brand-50 text-brand-600' },
    { label: 'Received Orders', value: String(summary.received), icon: PackageCheck, tone: 'bg-accent-50 text-accent-600' },
    { label: 'Pending Orders', value: String(summary.pending), icon: Clock, tone: 'bg-warn-50 text-warn-600' },
    { label: 'Pending Payments', value: `₹${summary.pendingPayment.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: FileText, tone: 'bg-slate-100 text-slate-600' },
  ];

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + l.cost * l.qty, 0),
    [lines],
  );
  const gstAmount = +(subtotal * (GST_RATE / 100)).toFixed(2);
  const grandTotal = +(subtotal + gstAmount).toFixed(2);

  const searchResults = useMemo(() => {
    const q = productSearch.toLowerCase().trim();
    if (!q) return [];
    return products
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [productSearch, products]);

  const resetForm = () => {
    setSupplier('');
    setSupplierInvoice('');
    setPhone('');
    setDate(todayISO());
    setExpectedDelivery('');
    setNotes('');
    setPoStatus('received');
    setLines([]);
    setPaymentStatus('Paid');
    setPaymentMethod('Bank Transfer');
    setProductSearch('');
  };

  const poStatusOptions: { value: typeof poStatus; label: string }[] = [
    { value: 'draft', label: 'Draft' },
    { value: 'ordered', label: 'Ordered' },
    { value: 'partially-received', label: 'Partially Received' },
    { value: 'received', label: 'Received' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  const openNewPurchase = () => {
    resetForm();
    setModalOpen(true);
  };

  const onSupplierSelect = (name: string) => {
    setSupplier(name);
    const s = suppliers.find((x) => x.name === name);
    if (s && !phone) setPhone(s.phone);
  };

  const addLine = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === productId);
      if (existing) {
        return prev.map((l) => (l.productId === productId ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...prev,
        { productId: product.id, name: product.name, cost: product.cost, qty: 1, gstRate: GST_RATE },
      ];
    });
    setProductSearch('');
  };

  const updateQty = (productId: string, delta: number) => {
    setLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, qty: Math.max(0, l.qty + delta) } : l)),
    );
  };

  const setQty = (productId: string, raw: string) => {
    const qty = parseInt(raw, 10);
    setLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, qty: isNaN(qty) ? 0 : Math.max(0, qty) } : l)),
    );
  };

  const setCost = (productId: string, cost: number) => {
    setLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, cost: Math.max(0, cost) } : l)),
    );
  };

  const removeLine = (productId: string) => {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  };

  const canSubmit = supplier.trim() !== '' && lines.length > 0;

  const handleSave = () => {
    if (!canSubmit) return;
    const po: PurchaseRecord = {
      id: `po${Date.now()}`,
      poNumber,
      supplier: supplier.trim(),
      supplierInvoice: supplierInvoice.trim(),
      phone: phone.trim() || '—',
      date,
      expectedDelivery: expectedDelivery || '',
      receivedDate: poStatus === 'received' ? date : null,
      items: lines.map((l) => ({ ...l })),
      itemCount: lines.reduce((s, l) => s + l.qty, 0),
      subtotal: +subtotal.toFixed(2),
      gstRate: GST_RATE,
      gstAmount,
      grandTotal,
      paymentStatus,
      paymentMethod,
      status: poStatus,
      notes: notes.trim(),
    };
    addPurchase(po);
    setModalOpen(false);
    resetForm();
  };

  const handleExport = () => {
    const rows = filtered.map((p) => ({
      PO: p.poNumber, Supplier: p.supplier, SupplierInvoice: p.supplierInvoice,
      Phone: p.phone, Date: p.date, Items: p.itemCount,
      Subtotal: p.subtotal.toFixed(2), GST: p.gstAmount.toFixed(2),
      GrandTotal: p.grandTotal.toFixed(2), Payment: p.paymentMethod,
      PaymentStatus: p.paymentStatus, Status: p.status,
    }));
    downloadCSV('purchases.csv', toCSV(rows));
  };

  const handlePrint = (po: PurchaseRecord) => {
    printPurchase(po);
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Purchase Orders"
        subtitle="Manage supplier purchase orders and track deliveries."
        actions={
          <>
            <button className="btn-secondary" onClick={handleExport}>
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export</span>
            </button>
            <button className="btn-primary" onClick={openNewPurchase}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Purchase</span>
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {statCards.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="card p-5">
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${s.tone}`}>
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-4 text-2xl font-bold text-slate-900">{s.value}</p>
              <p className="mt-1 text-sm text-slate-500">{s.label}</p>
            </div>
          );
        })}
      </div>

      <div className="sticky top-[8.5rem] z-10 mt-4 -mx-4 px-4 py-3 bg-slate-50/90 backdrop-blur-md rounded-lg lg:-mx-8 lg:px-8">
        <div className="card p-3">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by PO number, supplier, invoice, or phone…"
              className="input pl-10"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="table-th">PO Number</th>
                <th className="table-th">Supplier</th>
                <th className="table-th">Products</th>
                <th className="table-th">Date</th>
                <th className="table-th">Payment</th>
                <th className="table-th text-right">Grand Total</th>
                <th className="table-th">Status</th>
                <th className="table-th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((p) => (
                <tr key={p.id} className="cursor-pointer transition hover:bg-slate-50/50" onClick={() => navigate(`/purchase/${p.id}`)}>
                  <td className="table-td font-semibold text-brand-600">{p.poNumber}</td>
                  <td className="table-td font-medium text-slate-800">{p.supplier}</td>
                  <td className="table-td">
                    <div className="space-y-0.5">
                      {p.items.slice(0, 2).map((it) => (
                        <div key={it.productId} className="text-xs text-slate-600">
                          <span className="font-medium text-slate-800">{it.name}</span>
                          {' '}
                          <span className="text-slate-400">({it.qty.toLocaleString('en-IN')} pcs)</span>
                        </div>
                      ))}
                      {p.items.length > 2 && (
                        <div className="text-xs text-brand-600">+{p.items.length - 2} more…</div>
                      )}
                    </div>
                  </td>
                  <td className="table-td text-slate-600">{p.date}</td>
                  <td className="table-td">
                    <div className="flex items-center gap-2">
                      <span className={`badge ${paymentTone[p.paymentMethod]}`}>{p.paymentMethod}</span>
                      <span className={`badge ${p.paymentStatus === 'Paid' ? 'bg-accent-100 text-accent-700' : 'bg-warn-100 text-warn-600'}`}>
                        {p.paymentStatus}
                      </span>
                    </div>
                  </td>
                  <td className="table-td text-right font-semibold tabular-nums text-slate-900">
                    ₹{p.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="table-td"><StatusBadge status={p.status} /></td>
                  <td className="table-td" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => navigate(`/purchase/${p.id}`)}
                        className="rounded-lg p-2 text-slate-400 transition hover:bg-brand-50 hover:text-brand-600"
                        title="View Details"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handlePrint(p)}
                        className="rounded-lg p-2 text-slate-400 transition hover:bg-brand-50 hover:text-brand-600"
                        title="Print Purchase Order"
                      >
                        <Printer className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
          <p className="text-sm text-slate-500">
            Showing <span className="font-semibold text-slate-700">{filtered.length}</span> of{' '}
            <span className="font-semibold text-slate-700">{purchases.length}</span> orders
          </p>
          <div className="flex items-center gap-1">
            <button className="btn-secondary px-3 py-1.5 text-xs" disabled>Previous</button>
            <button className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">1</button>
            <button className="btn-secondary px-3 py-1.5 text-xs" disabled>Next</button>
          </div>
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Create New Purchase"
        subtitle={`PO ${poNumber} · ${date}`}
        size="xl"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button
              className="btn-primary"
              disabled={!canSubmit}
              onClick={handleSave}
            >
              <CheckCircle2 className="h-4 w-4" />
              Save Purchase
            </button>
          </>
        }
      >
        <div className="space-y-5">
          {/* Supplier section */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Supplier Name</label>
              <input
                type="text"
                list="supplier-list"
                value={supplier}
                onChange={(e) => onSupplierSelect(e.target.value)}
                placeholder="Select or type supplier"
                className="input"
              />
              <datalist id="supplier-list">
                {suppliers.map((s) => (
                  <option key={s.id} value={s.name} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Supplier Invoice #</label>
              <input
                type="text"
                value={supplierInvoice}
                onChange={(e) => setSupplierInvoice(e.target.value)}
                placeholder="e.g. TVS-INV-5521"
                className="input"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Supplier Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98250 00000"
                className="input"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Purchase Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Expected Delivery</label>
              <input
                type="date"
                value={expectedDelivery}
                onChange={(e) => setExpectedDelivery(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Order Status</label>
              <div className="flex flex-wrap gap-2">
                {poStatusOptions.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setPoStatus(s.value)}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                      poStatus === s.value
                        ? s.value === 'received'
                          ? 'border-accent-500 bg-accent-50 text-accent-700'
                          : s.value === 'cancelled'
                            ? 'border-err-500 bg-err-50 text-err-700'
                            : s.value === 'ordered'
                              ? 'border-brand-500 bg-brand-50 text-brand-700'
                              : 'border-warn-500 bg-warn-50 text-warn-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Add Products</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search by product name…"
                className="input pl-10"
              />
              {productSearch && searchResults.length > 0 && (
                <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
                  {searchResults.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => addLine(p.id)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-brand-50"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                        {p.image ? (
                          <img src={p.image} alt={p.name} className="h-full w-full object-cover" />
                        ) : (
                          <Package className="h-4 w-4 text-slate-300" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">{p.name}</p>
                        <p className="text-xs text-slate-400">Est. Stock: {p.stock} · {p.category}</p>
                      </div>
                      <span className="text-sm font-semibold text-slate-700">₹{p.cost.toFixed(2)}</span>
                      <Plus className="h-4 w-4 text-brand-500" />
                    </button>
                  ))}
                </div>
              )}
              {productSearch && searchResults.length === 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-card">
                  No products found.
                </div>
              )}
            </div>
          </div>

          {lines.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="table-th">Product</th>
                    <th className="table-th text-center">Qty (Pieces)</th>
                    <th className="table-th text-right">Cost / Piece</th>
                    <th className="table-th text-right">GST</th>
                    <th className="table-th text-right">Total</th>
                    <th className="table-th"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((l) => (
                    <tr key={l.productId}>
                      <td className="table-td">
                        <p className="font-medium text-slate-800">{l.name}</p>
                      </td>
                      <td className="table-td">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => updateQty(l.productId, -1)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={l.qty === 0 ? '' : l.qty}
                            onChange={(e) => setQty(l.productId, e.target.value)}
                            className="w-12 rounded-lg border border-slate-200 py-1 text-center text-sm tabular-nums focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                          />
                          <button
                            onClick={() => updateQty(l.productId, 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="table-td text-right">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-slate-400">₹</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={l.cost || ''}
                            onChange={(e) => setCost(l.productId, parseFloat(e.target.value) || 0)}
                            className="w-20 rounded-lg border border-slate-200 py-1 text-right text-sm tabular-nums focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                          />
                        </div>
                      </td>
                      <td className="table-td text-right tabular-nums text-slate-500">{l.gstRate}%</td>
                      <td className="table-td text-right font-semibold tabular-nums text-slate-900">
                        ₹{(l.cost * l.qty).toFixed(2)}
                      </td>
                      <td className="table-td text-right">
                        <button
                          onClick={() => removeLine(l.productId)}
                          className="rounded-lg p-2 text-slate-400 transition hover:bg-err-50 hover:text-err-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center">
              <Package className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm text-slate-500">No products added yet. Search above to add items.</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Payment Status</label>
              <div className="flex gap-2">
                {(['Paid', 'Pending'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setPaymentStatus(s)}
                    className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition ${
                      paymentStatus === s
                        ? s === 'Paid'
                          ? 'border-accent-500 bg-accent-50 text-accent-700'
                          : 'border-warn-500 bg-warn-50 text-warn-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Payment Method</label>
              <div className="flex gap-2">
                {(['Cash', 'UPI', 'Bank Transfer'] as PurchasePaymentMethod[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setPaymentMethod(m)}
                    className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition ${
                      paymentMethod === m
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about this purchase order"
              rows={2}
              className="input"
            />
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <div className="ml-auto max-w-xs space-y-2">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Subtotal</span>
                <span className="tabular-nums font-medium">₹{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-600">
                <span>GST ({GST_RATE}%)</span>
                <span className="tabular-nums font-medium">₹{gstAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-lg font-bold text-slate-900">
                <span>Grand Total</span>
                <span className="tabular-nums">₹{grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {lines.length > 0 && (
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <PackageCheck className="h-4 w-4 text-accent-500" />
              {poStatus === 'received'
                ? 'Estimated Stock will automatically increase for each product when this purchase is saved.'
                : poStatus === 'cancelled'
                  ? 'Cancelled orders do not affect Estimated Stock.'
                  : 'Estimated Stock will not update until this order is marked as Received.'}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
