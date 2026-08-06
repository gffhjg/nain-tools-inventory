import { useState, useMemo, useEffect } from 'react';
import {
  Plus, Search, Download, Eye, ShoppingCart, TrendingUp, Clock, CheckCircle2,
  Trash2, Minus, Printer, Package, AlertTriangle,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import Modal from '@/components/Modal';
import { printInvoice } from '@/components/PrintableInvoice';
import { useStore } from '@/store/AppStore';
import { GST_RATE, computeGrandTotal } from '@/lib/constants';
import { downloadCSV, toCSV } from '@/utils/analytics';
import type { SaleRecord, SaleStatus, InvoiceLineItem, PaymentMethod, DiscountType } from '@/lib/types';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nextInvoice(existing: SaleRecord[]): string {
  const nums = existing
    .map((s) => parseInt(s.invoice.replace('INV-', ''), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 2040;
  return `INV-${max + 1}`;
}

type DraftLine = InvoiceLineItem;

export default function Sales() {
  const { sales, products, addSale } = useStore();
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [date, setDate] = useState(todayISO());
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<DiscountType>('amount');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [saleStatus, setSaleStatus] = useState<SaleStatus>('paid');
  const [amountPaid, setAmountPaid] = useState(0);
  const [productSearch, setProductSearch] = useState('');

  const saleStatusOptions: { value: SaleStatus; label: string }[] = [
    { value: 'draft', label: 'Draft' },
    { value: 'paid', label: 'Paid' },
    { value: 'partially-paid', label: 'Partially Paid' },
    { value: 'pending', label: 'Pending' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  const [viewing, setViewing] = useState<SaleRecord | null>(null);
  const [stockError, setStockError] = useState('');

  const invoiceNumber = useMemo(() => nextInvoice(sales), [sales]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return sales.filter(
      (s) =>
        s.invoice.toLowerCase().includes(q) ||
        s.customer.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q),
    );
  }, [sales, search]);

  const summary = useMemo(() => {
    const total = sales.reduce((s, r) => s + r.grandTotal, 0);
    const paid = sales.filter((s) => s.status === 'paid').reduce((s, r) => s + r.grandTotal, 0);
    const outstanding = sales
      .filter((s) => s.status !== 'paid' && s.status !== 'cancelled' && s.status !== 'draft')
      .reduce((s, r) => s + (r.grandTotal - r.amountPaid), 0);
    const count = sales.length;
    return { total, paid, outstanding, count };
  }, [sales]);

  const statCards = [
    { label: 'Total Sales Revenue', value: `₹${summary.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: ShoppingCart, tone: 'bg-brand-50 text-brand-600' },
    { label: 'Paid Invoices', value: `₹${summary.paid.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: CheckCircle2, tone: 'bg-accent-50 text-accent-600' },
    { label: 'Outstanding Amount', value: `₹${summary.outstanding.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: Clock, tone: 'bg-warn-50 text-warn-600' },
    { label: 'Total Orders', value: String(summary.count), icon: TrendingUp, tone: 'bg-slate-100 text-slate-600' },
  ];

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + l.price * l.qty, 0),
    [lines],
  );
  const { discountAmount, gstAmount, grandTotal } = computeGrandTotal(subtotal, discount, discountType, GST_RATE);

  const searchResults = useMemo(() => {
    const q = productSearch.toLowerCase().trim();
    if (!q) return products.slice(0, 5);
    return products
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [productSearch, products]);

  const resetForm = () => {
    setCustomer('');
    setPhone('');
    setDate(todayISO());
    setLines([]);
    setDiscount(0);
    setDiscountType('amount');
    setPaymentMethod('Cash');
    setSaleStatus('paid');
    setAmountPaid(0);
    setProductSearch('');
  };

  const openNewSale = () => {
    resetForm();
    setModalOpen(true);
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
        { productId: product.id, name: product.name, price: product.price, qty: 1 },
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

  const setPrice = (productId: string, price: number) => {
    setLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, price: Math.max(0, price) } : l)),
    );
  };

  const removeLine = (productId: string) => {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  };

  const canSubmit = customer.trim() !== '' && lines.length > 0 && lines.every((l) => l.qty > 0);

  const stockCheck = useMemo(() => {
    for (const l of lines) {
      if (l.qty <= 0) continue;
      const product = products.find((p) => p.id === l.productId);
      if (product && l.qty > product.stock) {
        return { ok: false, name: l.name, available: product.stock, requested: l.qty };
      }
    }
    return { ok: true };
  }, [lines, products]);

  useEffect(() => {
    if (!stockCheck.ok) {
      setStockError(`Insufficient estimated stock available. ${stockCheck.name}: ${stockCheck.available} estimated, ${stockCheck.requested} requested.`);
    } else {
      setStockError('');
    }
  }, [stockCheck]);

  const handleExport = () => {
    const rows = filtered.map((s) => ({
      Invoice: s.invoice, Customer: s.customer, Phone: s.phone, Date: s.date,
      Items: s.itemCount, Subtotal: s.subtotal.toFixed(2),
      Discount: s.discount.toFixed(2), DiscountType: s.discountType,
      GST: s.gstAmount.toFixed(2), GrandTotal: s.grandTotal.toFixed(2),
      AmountPaid: s.amountPaid.toFixed(2), Payment: s.paymentMethod,
      Status: s.status,
    }));
    downloadCSV('sales.csv', toCSV(rows));
  };

  const handleCreate = () => {
    if (!canSubmit || !stockCheck.ok) return;
    const sale: SaleRecord = {
      id: `s${Date.now()}`,
      invoice: invoiceNumber,
      customer: customer.trim(),
      customerId: '',
      phone: phone.trim() || '—',
      customerGstin: '',
      customerState: '',
      customerStateCode: '',
      date,
      items: lines.map((l) => ({ ...l })),
      itemCount: lines.reduce((s, l) => s + l.qty, 0),
      subtotal: +subtotal.toFixed(2),
      discount: +discount.toFixed(2),
      discountType,
      gstRate: GST_RATE,
      gstType: 'auto',
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      gstAmount,
      grandTotal,
      amountPaid: saleStatus === 'paid' ? grandTotal : saleStatus === 'cancelled' || saleStatus === 'draft' ? 0 : Math.min(amountPaid, grandTotal),
      paymentMethod,
      status: saleStatus,
      channel: 'in-store',
    };
    addSale(sale);
    setModalOpen(false);
    resetForm();
  };

  const handlePrint = (sale: SaleRecord) => {
    printInvoice(sale);
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Sales"
        subtitle="Track invoices, customer orders, and payment status."
        actions={
          <>
            <button className="btn-secondary" onClick={handleExport}>
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export</span>
            </button>
            <button className="btn-primary" onClick={openNewSale}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Sale</span>
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
              placeholder="Search by invoice, customer, or phone…"
              className="input pl-10"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="table-th">Invoice</th>
                <th className="table-th">Customer</th>
                <th className="table-th">Date</th>
                <th className="table-th text-right">Total</th>
                <th className="table-th text-right">Outstanding</th>
                <th className="table-th">Status</th>
                <th className="table-th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((s) => (
                <tr key={s.id} className="transition hover:bg-slate-50/50">
                  <td className="table-td font-semibold text-brand-600">{s.invoice}</td>
                  <td className="table-td font-medium text-slate-800">{s.customer}</td>
                  <td className="table-td text-slate-600">{s.date}</td>
                  <td className="table-td text-right font-semibold tabular-nums text-slate-900">
                    ₹{s.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="table-td text-right tabular-nums">
                    {s.status === 'paid' || s.status === 'cancelled' || s.status === 'draft' ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span className="font-semibold text-warn-600">₹{(s.grandTotal - s.amountPaid).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    )}
                  </td>
                  <td className="table-td"><StatusBadge status={s.status} /></td>
                  <td className="table-td">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setViewing(s)}
                        className="rounded-lg p-2 text-slate-400 transition hover:bg-brand-50 hover:text-brand-600"
                        title="View"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handlePrint(s)}
                        className="rounded-lg p-2 text-slate-400 transition hover:bg-brand-50 hover:text-brand-600"
                        title="Print Invoice"
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
            <span className="font-semibold text-slate-700">{sales.length}</span> orders
          </p>
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Create New Sale"
        subtitle={`Invoice ${invoiceNumber} · ${date}`}
        size="lg"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button
              className="btn-primary"
              disabled={!canSubmit || !stockCheck.ok}
              onClick={handleCreate}
            >
              <CheckCircle2 className="h-4 w-4" />
              Complete Sale
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Customer Name</label>
              <input
                type="text"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                placeholder="Customer or company name"
                className="input"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Customer Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98250 00000"
                className="input"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Invoice Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input"
              />
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
                      <span className="text-sm font-semibold text-slate-700">₹{p.price.toFixed(2)}</span>
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

          {stockError && (
            <div className="flex items-center gap-2.5 rounded-xl border border-err-200 bg-err-50 px-4 py-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-err-600" />
              <p className="text-sm font-medium text-err-700">{stockError}</p>
            </div>
          )}

          {lines.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="table-th">Product</th>
                    <th className="table-th text-center">Qty</th>
                    <th className="table-th text-right">Price</th>
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
                            min="0"
                            value={l.qty === 0 ? '' : l.qty}
                            onChange={(e) => setQty(l.productId, e.target.value)}
                            className="w-14 rounded-lg border border-slate-200 py-1 text-center text-sm tabular-nums focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
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
                            value={l.price || ''}
                            onChange={(e) => setPrice(l.productId, parseFloat(e.target.value) || 0)}
                            className="w-20 rounded-lg border border-slate-200 py-1 text-right text-sm tabular-nums focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                          />
                        </div>
                      </td>
                      <td className="table-td text-right font-semibold tabular-nums text-slate-900">
                        ₹{(l.price * l.qty).toFixed(2)}
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
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Discount</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discount || ''}
                  onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder="0.00"
                  className="input flex-1"
                />
                <select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                  className="input w-auto"
                >
                  <option value="amount">₹ Amount</option>
                  <option value="percent">% Percentage</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Payment Method</label>
              <div className="flex gap-2">
                {(['Cash', 'UPI', 'Card'] as PaymentMethod[]).map((m) => (
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Invoice Status</label>
              <div className="flex flex-wrap gap-2">
                {saleStatusOptions.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setSaleStatus(s.value)}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                      saleStatus === s.value
                        ? s.value === 'paid'
                          ? 'border-accent-500 bg-accent-50 text-accent-700'
                          : s.value === 'cancelled'
                            ? 'border-err-500 bg-err-50 text-err-700'
                            : s.value === 'pending'
                              ? 'border-warn-500 bg-warn-50 text-warn-700'
                              : 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            {saleStatus === 'partially-paid' && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Amount Paid (₹)</label>
                <input
                  type="number"
                  min="0"
                  max={grandTotal}
                  step="0.01"
                  value={amountPaid || ''}
                  onChange={(e) => setAmountPaid(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="input"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Outstanding: ₹{(grandTotal - Math.min(amountPaid, grandTotal)).toFixed(2)}
                </p>
              </div>
            )}
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <div className="ml-auto max-w-xs space-y-2">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Subtotal</span>
                <span className="tabular-nums font-medium">₹{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-600">
                <span>Discount {discountType === 'percent' ? `(${discount}%)` : ''}</span>
                <span className="tabular-nums font-medium text-err-600">−₹{discountAmount.toFixed(2)}</span>
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
        </div>
      </Modal>

      <ViewInvoiceModal sale={viewing} onClose={() => setViewing(null)} onPrint={handlePrint} />
    </div>
  );
}

function ViewInvoiceModal({
  sale,
  onClose,
  onPrint,
}: {
  sale: SaleRecord | null;
  onClose: () => void;
  onPrint: (s: SaleRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(!!sale);
  }, [sale]);

  if (!sale) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Invoice ${sale.invoice}`}
      subtitle={`${sale.customer} · ${sale.date}`}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Close</button>
          <button className="btn-primary" onClick={() => onPrint(sale)}>
            <Printer className="h-4 w-4" />
            Print Invoice
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-400">Customer</p>
            <p className="mt-0.5 font-semibold text-slate-800">{sale.customer}</p>
            <p className="text-sm text-slate-500">{sale.phone}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-400">Payment</p>
            <p className="mt-0.5 font-semibold text-slate-800">{sale.paymentMethod}</p>
            <p className="text-sm text-slate-500 capitalize">{sale.status}</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="table-th">Product</th>
                <th className="table-th text-center">Qty</th>
                <th className="table-th text-right">Price</th>
                <th className="table-th text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sale.items.map((it) => (
                <tr key={it.productId}>
                  <td className="table-td">
                    <p className="font-medium text-slate-800">{it.name}</p>
                  </td>
                  <td className="table-td text-center tabular-nums">{it.qty}</td>
                  <td className="table-td text-right tabular-nums">₹{it.price.toFixed(2)}</td>
                  <td className="table-td text-right font-semibold tabular-nums">
                    ₹{(it.price * it.qty).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl bg-slate-50 p-4">
          <div className="ml-auto max-w-xs space-y-2">
            <div className="flex justify-between text-sm text-slate-600">
              <span>Subtotal</span>
              <span className="tabular-nums">₹{sale.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-600">
              <span>Discount {sale.discountType === 'percent' ? `(${sale.discount}%)` : ''}</span>
              <span className="tabular-nums text-err-600">−₹{sale.discountType === 'percent' ? (sale.subtotal * sale.discount / 100).toFixed(2) : sale.discount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-600">
              <span>GST ({sale.gstRate}%)</span>
              <span className="tabular-nums">₹{sale.gstAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-lg font-bold text-slate-900">
              <span>Grand Total</span>
              <span className="tabular-nums">₹{sale.grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
