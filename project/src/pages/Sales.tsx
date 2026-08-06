import { useState, useMemo, useEffect } from 'react';
import {
  Plus, Search, Download, Eye, ShoppingCart, TrendingUp, Clock, CheckCircle2,
  Trash2, Minus, Printer, Package, AlertTriangle, MessageCircle, UserPlus, Check
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import Modal from '@/components/Modal';
import { printInvoice } from '@/components/PrintableInvoice';
import { useStore } from '@/store/AppStore';
import { GST_RATE, computeGrandTotal, computeDiscountAmount } from '@/lib/constants';
import { downloadCSV, toCSV, money } from '@/utils/analytics';
import type { SaleRecord, SaleStatus, InvoiceLineItem, PaymentMethod, DiscountType, Customer } from '@/lib/types';

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

function nextDebitNote(existing: SaleRecord[]): string {
  const nums = existing
    .filter((s) => s.documentType === 'DEBIT NOTE' || s.invoice.startsWith('DN-'))
    .map((s) => parseInt(s.invoice.replace('DN-', ''), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 1000;
  return `DN-${max + 1}`;
}

type DraftLine = InvoiceLineItem;

export default function Sales() {
  const { sales, products, customers, addSale, addCustomer } = useStore();
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [date, setDate] = useState(todayISO());
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<DiscountType>('amount');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [saleStatus, setSaleStatus] = useState<SaleStatus>('paid');
  const [amountPaid, setAmountPaid] = useState(0);
  const [productSearch, setProductSearch] = useState('');

  const [viewing, setViewing] = useState<SaleRecord | null>(null);
  const [stockError, setStockError] = useState('');

  const autoInvoiceNumber = useMemo(() => nextInvoice(sales), [sales]);
  const [customInvoiceNumber, setCustomInvoiceNumber] = useState('');
  const invoiceNumber = customInvoiceNumber.trim() || autoInvoiceNumber;

  const [poNumber, setPoNumber] = useState('');
  const [poDate, setPoDate] = useState('');
  const [transportMode, setTransportMode] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [ewayBill, setEwayBill] = useState('');
  const [vendorCode, setVendorCode] = useState('');

  const [bankName, setBankName] = useState('HDFC BANK');
  const [bankAccount, setBankAccount] = useState('50200088182531');
  const [bankIfsc, setBankIfsc] = useState('HDFC0002034');

  const [sellerGstin, setSellerGstin] = useState('06CCCPK0841B1ZA');
  const [sellerPan, setSellerPan] = useState('CCCPK0841B');
  const [documentType, setDocumentType] = useState<'TAX INVOICE' | 'DEBIT NOTE'>('TAX INVOICE');

  const [previewCopyTag, setPreviewCopyTag] = useState('Original For Recipient');
  const [exportCopies, setExportCopies] = useState<Record<string, boolean>>({
    'Original For Recipient': true,
    'Duplicate For Transporter': true,
    'Triplicate For Supplier': true,
    'Extra Copy': true,
  });

  const [applyGst, setApplyGst] = useState(true);
  const [gstRate, setGstRate] = useState<number>(18);
  const [gstTaxType, setGstTaxType] = useState<'local' | 'central'>('local');

  // Global Keyboard Shortcuts (F2 for New Invoice)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        openNewSale();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return sales.filter(
      (s) =>
        s.invoice.toLowerCase().includes(q) ||
        s.customer.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q)
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

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + l.price * l.qty, 0),
    [lines]
  );
  
  const effectiveGstRate = applyGst ? gstRate : 0;
  const splitRate = (gstRate / 2).toFixed(1).replace(/\.0$/, '');
  const { discountAmount, gstAmount, grandTotal } = computeGrandTotal(subtotal, discount, discountType, effectiveGstRate);

  // Delhi GST Formulas with dynamic rate:
  // Local (Intra-state): CGST @ (Rate/2)% + SGST @ (Rate/2)%
  // Central (Inter-state): IGST @ Rate%
  const cgstAmount = applyGst && gstTaxType === 'local' ? +(gstAmount / 2).toFixed(2) : 0;
  const sgstAmount = applyGst && gstTaxType === 'local' ? +(gstAmount / 2).toFixed(2) : 0;
  const igstAmount = applyGst && gstTaxType === 'central' ? +gstAmount.toFixed(2) : 0;

  const searchResults = useMemo(() => {
    const q = productSearch.toLowerCase().trim();
    if (!q) return [];
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.rackNumber.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [products, productSearch]);

  const [customerGstin, setCustomerGstin] = useState('');

  const handleCustomerSelect = (custObjId: string) => {
    setSelectedCustomerId(custObjId);
    if (custObjId === '' || custObjId === 'new') {
      setCustomer('');
      setPhone('');
      setAddress('');
      setCustomerGstin('');
      return;
    }
    const found = customers.find((c) => c.id === custObjId);
    if (found) {
      setCustomer(found.name);
      setPhone(found.phone);
      setAddress(found.address || '');
      setCustomerGstin(found.gstin || '');
    }
  };

  const resetForm = () => {
    setSelectedCustomerId('');
    setCustomer('');
    setPhone('');
    setAddress('');
    setCustomerGstin('');
    setCustomInvoiceNumber('');
    setPoNumber('');
    setPoDate('');
    setTransportMode('');
    setVehicleNumber('');
    setEwayBill('');
    setVendorCode('');
    setBankName('HDFC BANK');
    setBankAccount('50200088182531');
    setBankIfsc('HDFC0002034');
    setSellerGstin('06CCCPK0841B1ZA');
    setSellerPan('CCCPK0841B');
    setDocumentType('TAX INVOICE');
    setPreviewCopyTag('Original For Recipient');
    setDate(todayISO());
    setLines([]);
    setDiscount(0);
    setDiscountType('amount');
    setPaymentMethod('Cash');
    setSaleStatus('paid');
    setAmountPaid(0);
    setProductSearch('');
    setApplyGst(true);
    setGstRate(18);
    setGstTaxType('local');
  };

  const openNewSale = () => {
    resetForm();
    setDocumentType('TAX INVOICE');
    setCustomInvoiceNumber(nextInvoice(sales));
    setModalOpen(true);
  };

  const openNewDebitNote = () => {
    resetForm();
    setDocumentType('DEBIT NOTE');
    setCustomInvoiceNumber(nextDebitNote(sales));
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
        { productId: product.id, name: product.name, price: product.price, qty: 1, hsnCode: product.hsnCode || '7318150' },
      ];
    });
    setProductSearch('');
  };

  const updateQty = (productId: string, delta: number) => {
    setLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, qty: Math.max(0, l.qty + delta) } : l))
    );
  };

  const setQty = (productId: string, raw: string) => {
    const qty = parseInt(raw, 10);
    setLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, qty: isNaN(qty) ? 0 : Math.max(0, qty) } : l))
    );
  };

  const setPrice = (productId: string, price: number) => {
    setLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, price: Math.max(0, price) } : l))
    );
  };

  const removeLine = (productId: string) => {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  };

  const canSubmit = customer.trim() !== '' && invoiceNumber.trim() !== '' && lines.length > 0 && lines.every((l) => l.qty > 0);

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
      setStockError(`Insufficient stock available. ${stockCheck.name}: ${stockCheck.available} in stock, ${stockCheck.requested} requested.`);
    } else {
      setStockError('');
    }
  }, [stockCheck]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (!stockCheck.ok) {
      alert(`Cannot create sale. ${stockError}`);
      return;
    }

    const effectivePaid =
      saleStatus === 'paid'
        ? grandTotal
        : saleStatus === 'draft' || saleStatus === 'cancelled'
        ? 0
        : amountPaid;

    const newSale: SaleRecord = {
      id: `s${Date.now()}`,
      invoice: invoiceNumber,
      customer: customer.trim(),
      customerId: selectedCustomerId !== 'new' ? selectedCustomerId : '',
      phone: phone.trim(),
      customerAddress: address.trim(),
      customerGstin: customerGstin.trim().toUpperCase(),
      customerState: gstTaxType === 'local' ? 'Delhi' : 'Other State',
      customerStateCode: gstTaxType === 'local' ? '07' : '99',
      date,
      items: lines,
      itemCount: lines.reduce((s, l) => s + l.qty, 0),
      subtotal,
      discount,
      discountType,
      gstRate: applyGst ? gstRate : 0,
      gstType: !applyGst ? 'exempt' : (gstTaxType === 'local' ? 'cgst-sgst' : 'igst'),
      cgstAmount,
      sgstAmount,
      igstAmount,
      gstAmount: applyGst ? gstAmount : 0,
      grandTotal,
      amountPaid: Math.min(grandTotal, Math.max(0, effectivePaid)),
      paymentMethod,
      status: saleStatus,
      channel: 'in-store',
      poNumber: poNumber.trim(),
      poDate: poDate.trim(),
      transportMode: transportMode.trim(),
      vehicleNumber: vehicleNumber.trim().toUpperCase(),
      ewayBill: ewayBill.trim(),
      vendorCode: vendorCode.trim(),
      bankName: bankName.trim(),
      bankAccount: bankAccount.trim(),
      bankIfsc: bankIfsc.trim().toUpperCase(),
      sellerGstin: sellerGstin.trim().toUpperCase(),
      sellerPan: sellerPan.trim().toUpperCase(),
      documentType,
    };

    // Auto-save new customer profile if name is not in existing database
    const existingCust = customers.find((c) => c.name.toLowerCase() === customer.trim().toLowerCase());
    if (!existingCust && customer.trim()) {
      try {
        await addCustomer({
          id: `c${Date.now()}`,
          name: customer.trim(),
          phone: phone.trim(),
          businessName: '',
          gstin: '',
          email: '',
          address: '',
          state: '',
          stateCode: '',
          notes: 'Auto-added from Invoice creation',
        });
      } catch (err) {
        console.error('Failed to auto-add customer profile', err);
      }
    }

    await addSale(newSale);
    setModalOpen(false);
    setViewing(newSale);
  };

  const getWhatsAppInvoiceLink = (s: SaleRecord) => {
    const cleanPhone = s.phone.replace(/[^0-9]/g, '');
    const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const msg = `Hello ${s.customer}, thank you for your business! Your Invoice #${s.invoice} dated ${s.date} for total ${money(s.grandTotal)} is confirmed. Nain Tools & Bolt Co.`;
    return `https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`;
  };

  return (
    <div className="animate-fade-in space-y-6 pb-12">
      <PageHeader
        title="Sales & Invoicing"
        subtitle="Create GST compliant tax invoices, track sales history, and process customer billing."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-secondary bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 font-bold"
              onClick={openNewDebitNote}
            >
              <Plus className="h-4 w-4 text-indigo-600" />
              <span>New Debit Note</span>
            </button>
            <button className="btn-primary" onClick={openNewSale} title="Press F2 anywhere for quick invoice creation">
              <Plus className="h-4 w-4" />
              <span>New Tax Invoice (F2)</span>
            </button>
          </div>
        }
      />

      {/* Metric Cards */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <div className="card p-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <ShoppingCart className="h-5 w-5" />
          </div>
          <p className="mt-4 text-2xl font-black text-slate-900">{money(summary.total)}</p>
          <p className="mt-1 text-xs text-slate-500 font-medium">Total Sales Revenue</p>
        </div>

        <div className="card p-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <p className="mt-4 text-2xl font-black text-slate-900">{money(summary.paid)}</p>
          <p className="mt-1 text-xs text-slate-500 font-medium">Total Payments Collected</p>
        </div>

        <div className="card p-5 border-l-4 border-l-amber-500">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <Clock className="h-5 w-5" />
          </div>
          <p className="mt-4 text-2xl font-black text-slate-900">{money(summary.outstanding)}</p>
          <p className="mt-1 text-xs text-amber-600 font-semibold">Overdue Sales Receivables</p>
        </div>

        <div className="card p-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <TrendingUp className="h-5 w-5" />
          </div>
          <p className="mt-4 text-2xl font-black text-slate-900">{summary.count}</p>
          <p className="mt-1 text-xs text-slate-500 font-medium">Total Invoices Issued</p>
        </div>
      </div>

      {/* Sales List Table */}
      <div className="card p-6 space-y-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoices by invoice number, customer, phone..."
            className="input pl-9"
          />
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 font-bold text-slate-600">Invoice #</th>
                <th className="px-4 py-3 font-bold text-slate-600">Customer</th>
                <th className="px-4 py-3 font-bold text-slate-600">Date</th>
                <th className="px-4 py-3 font-bold text-slate-600">Items</th>
                <th className="px-4 py-3 font-bold text-slate-600">Total</th>
                <th className="px-4 py-3 font-bold text-slate-600">Status</th>
                <th className="px-4 py-3 font-bold text-slate-600 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-sm text-slate-400">
                    No sales invoices found.
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-bold text-brand-600">{s.invoice}</td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">{s.customer}</p>
                      {s.phone && <p className="text-[11px] text-slate-500 font-mono">{s.phone}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-mono">{s.date}</td>
                    <td className="px-4 py-3 text-slate-700 font-semibold">{s.itemCount} items</td>
                    <td className="px-4 py-3 font-black text-slate-900">{money(s.grandTotal)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {s.phone && (
                          <a
                            href={getWhatsAppInvoiceLink(s)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                            title="Share Invoice via WhatsApp"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </a>
                        )}
                        <button
                          onClick={() => setViewing(s)}
                          className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition"
                          title="View Invoice"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => printInvoice(s)}
                          className="p-1.5 text-brand-600 hover:bg-brand-50 rounded-lg transition"
                          title="Print Tax Invoice"
                        >
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
      </div>

      {/* New Invoice / Debit Note Modal */}
      {modalOpen && (
        <Modal
          title={`${documentType === 'DEBIT NOTE' ? 'Create Debit Note' : 'Create Tax Invoice'} (${invoiceNumber})`}
          size="xl"
          onClose={() => setModalOpen(false)}
        >
          <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
            {/* Customer Selector / Input */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Select Customer</label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => handleCustomerSelect(e.target.value)}
                  className="input"
                >
                  <option value="">-- Select Saved Customer --</option>
                  <option value="new">+ Enter New Customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Customer Name *</label>
                <input
                  type="text"
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  placeholder="Customer / Firm Name"
                  className="input"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Mobile number for WhatsApp"
                  className="input"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Customer Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Billing / Delivery Address"
                  className="input"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {documentType === 'DEBIT NOTE' ? 'Debit Note Number *' : 'Invoice Number *'}
                </label>
                <input
                  type="text"
                  value={customInvoiceNumber}
                  onChange={(e) => setCustomInvoiceNumber(e.target.value)}
                  placeholder={documentType === 'DEBIT NOTE' ? 'e.g. DN-1001' : 'e.g. INV-2046 or 00744'}
                  className="input font-mono font-bold text-brand-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Invoice Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="input"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">GST Number (GSTIN)</label>
                <input
                  type="text"
                  value={customerGstin}
                  onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
                  placeholder="e.g. 07AAAAA0000A1Z5"
                  className="input font-mono uppercase"
                />
              </div>
            </div>

            {/* Optional Tax & Transport Metadata section */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
              <label className="block text-xs font-bold text-slate-700">Transport & Tax Details (P.O., Transport, E-Way Bill)</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">P.O. Number</label>
                  <input
                    type="text"
                    value={poNumber}
                    onChange={(e) => setPoNumber(e.target.value)}
                    placeholder="e.g. PO-1029"
                    className="input py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">P.O. Date</label>
                  <input
                    type="date"
                    value={poDate}
                    onChange={(e) => setPoDate(e.target.value)}
                    className="input py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">E-Way Bill No.</label>
                  <input
                    type="text"
                    value={ewayBill}
                    onChange={(e) => setEwayBill(e.target.value)}
                    placeholder="12-digit E-Way Bill"
                    className="input py-1 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Mode of Transport</label>
                  <input
                    type="text"
                    value={transportMode}
                    onChange={(e) => setTransportMode(e.target.value)}
                    placeholder="e.g. Road / Tempo / Hand"
                    className="input py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Vehicle Number</label>
                  <input
                    type="text"
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                    placeholder="e.g. HR-51-AB-1234"
                    className="input py-1 text-xs font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Vendor Code</label>
                  <input
                    type="text"
                    value={vendorCode}
                    onChange={(e) => setVendorCode(e.target.value)}
                    placeholder="Vendor / Account Code"
                    className="input py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Bank Name</label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="Bank Name"
                    className="input py-1 text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Bank Account No.</label>
                  <input
                    type="text"
                    value={bankAccount}
                    onChange={(e) => setBankAccount(e.target.value)}
                    placeholder="Account Number"
                    className="input py-1 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Bank IFSC Code</label>
                  <input
                    type="text"
                    value={bankIfsc}
                    onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                    placeholder="IFSC Code"
                    className="input py-1 text-xs font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Your GST Number</label>
                  <input
                    type="text"
                    value={sellerGstin}
                    onChange={(e) => setSellerGstin(e.target.value.toUpperCase())}
                    placeholder="Seller GSTIN"
                    className="input py-1 text-xs font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Your PAN Number</label>
                  <input
                    type="text"
                    value={sellerPan}
                    onChange={(e) => setSellerPan(e.target.value.toUpperCase())}
                    placeholder="Seller PAN No."
                    className="input py-1 text-xs font-mono uppercase"
                  />
                </div>
              </div>
            </div>

            {/* Item Search & Selection */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-3">
              <label className="block text-xs font-bold text-slate-700">Add Products to Invoice</label>
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search products by name or rack..."
                className="input bg-white"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                {searchResults.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addLine(p.id)}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-white hover:border-brand-500 hover:bg-brand-50/30 text-left transition"
                  >
                    <div>
                      <p className="text-xs font-bold text-slate-800">{p.name}</p>
                      <p className="text-[11px] text-slate-500">Rack {p.rackNumber} · Stock: {p.stock}</p>
                    </div>
                    <span className="text-xs font-bold text-brand-600">{money(p.price)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Line Items Table */}
            {lines.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-3 py-2 font-bold text-slate-600">Product</th>
                      <th className="px-3 py-2 font-bold text-slate-600 w-24">Qty</th>
                      <th className="px-3 py-2 font-bold text-slate-600 w-28">Price (₹)</th>
                      <th className="px-3 py-2 font-bold text-slate-600 w-28">Total (₹)</th>
                      <th className="px-3 py-2 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {lines.map((l) => (
                      <tr key={l.productId}>
                        <td className="px-3 py-2 font-bold text-slate-800">{l.name}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            value={l.qty}
                            onChange={(e) => setQty(l.productId, e.target.value)}
                            className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-bold"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            value={l.price}
                            onChange={(e) => setPrice(l.productId, parseFloat(e.target.value) || 0)}
                            className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2 font-bold text-slate-900">
                          {money(l.price * l.qty)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => removeLine(l.productId)}
                            className="text-slate-400 hover:text-rose-600 p-1"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Calculations & GST */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 text-xs">
              {/* Checkbox, Editable GST Rate & Tax Type Selection */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-slate-200/80">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={applyGst}
                      onChange={(e) => setApplyGst(e.target.checked)}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 h-4 w-4"
                    />
                    <span>Apply GST</span>
                  </label>

                  {applyGst && (
                    <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-xs">
                      <span className="text-[11px] font-semibold text-slate-500">Rate:</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={gstRate}
                        onChange={(e) => setGstRate(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-14 rounded border border-slate-200 px-1.5 py-0.5 text-center text-xs font-bold text-brand-600 focus:border-brand-500 focus:outline-none"
                      />
                      <span className="text-xs font-bold text-slate-600">%</span>
                    </div>
                  )}
                </div>

                {applyGst && (
                  <div className="flex items-center gap-3 font-semibold text-slate-700 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-xs">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="gstTaxType"
                        value="local"
                        checked={gstTaxType === 'local'}
                        onChange={() => setGstTaxType('local')}
                        className="text-brand-600 focus:ring-brand-500"
                      />
                      <span>Local (CGST {splitRate}% + SGST {splitRate}%)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="gstTaxType"
                        value="central"
                        checked={gstTaxType === 'central'}
                        onChange={() => setGstTaxType('central')}
                        className="text-brand-600 focus:ring-brand-500"
                      />
                      <span>Central (IGST {gstRate}%)</span>
                    </label>
                  </div>
                )}
              </div>

              <div className="flex justify-between font-semibold text-slate-700">
                <span>Subtotal</span>
                <span>{money(subtotal)}</span>
              </div>

              {/* Discount Controls */}
              <div className="pt-2 border-t border-slate-200/80 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800">Discount</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={discount}
                      onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-24 rounded border border-slate-200 px-2 py-1 text-right text-xs font-bold text-slate-900 focus:border-brand-500 focus:outline-none"
                      placeholder="0"
                    />
                    <select
                      value={discountType}
                      onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                      className="rounded border border-slate-200 px-2 py-1 text-xs font-bold text-slate-700 bg-white focus:border-brand-500 focus:outline-none"
                    >
                      <option value="amount">Amount (₹)</option>
                      <option value="percent">Percent (%)</option>
                    </select>
                  </div>
                </div>

                {discountAmount > 0 && (
                  <div className="flex justify-between font-semibold text-amber-600 pl-2">
                    <span>Discount Deduction</span>
                    <span>-{money(discountAmount)}</span>
                  </div>
                )}
              </div>

              {applyGst ? (
                gstTaxType === 'local' ? (
                  <>
                    <div className="flex justify-between font-medium text-slate-600 pl-2">
                      <span>Central GST (CGST @ {splitRate}%)</span>
                      <span>{money(cgstAmount)}</span>
                    </div>
                    <div className="flex justify-between font-medium text-slate-600 pl-2">
                      <span>State GST (SGST @ {splitRate}%)</span>
                      <span>{money(sgstAmount)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-slate-800 border-t border-slate-200/60 pt-1">
                      <span>Total GST ({gstRate}%)</span>
                      <span>{money(gstAmount)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between font-medium text-slate-600 pl-2">
                      <span>Central Integrated GST (IGST @ {gstRate}%)</span>
                      <span>{money(igstAmount)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-slate-800 border-t border-slate-200/60 pt-1">
                      <span>Total GST ({gstRate}%)</span>
                      <span>{money(gstAmount)}</span>
                    </div>
                  </>
                )
              ) : (
                <div className="flex justify-between font-medium text-slate-400">
                  <span>GST (Exempt / Not Applied)</span>
                  <span>{money(0)}</span>
                </div>
              )}

              <div className="flex justify-between font-black text-sm text-slate-900 border-t border-slate-200 pt-2">
                <span>Grand Total</span>
                <span className="text-brand-600">{money(grandTotal)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSubmit} disabled={!canSubmit}>
                {documentType === 'DEBIT NOTE' ? 'Confirm & Issue Debit Note' : 'Confirm & Issue Invoice'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Invoice / Debit Note View Modal */}
      {viewing && (
        <Modal
          title={`${viewing.documentType === 'DEBIT NOTE' ? 'Debit Note Details' : 'Invoice Details'} — ${viewing.invoice}`}
          size="xl"
          onClose={() => setViewing(null)}
        >
          <div className="space-y-3.5 text-xs font-sans">
            {/* Copy Selector Tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-slate-100 p-1.5 rounded-lg border border-slate-200 gap-2">
              <span className="text-[11px] font-bold text-slate-700 pl-1">Preview Copy:</span>
              <div className="flex flex-wrap gap-1">
                {[
                  'Original For Recipient',
                  'Duplicate For Transporter',
                  'Triplicate For Supplier',
                  'Extra Copy'
                ].map((copyTag) => (
                  <button
                    key={copyTag}
                    onClick={() => setPreviewCopyTag(copyTag)}
                    className={`px-2.5 py-1 rounded text-[10.5px] font-bold transition-all ${
                      previewCopyTag === copyTag
                        ? 'bg-brand-600 text-white shadow-xs'
                        : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
                    }`}
                  >
                    {copyTag}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-right text-[10px] font-bold text-slate-900 tracking-wide">{previewCopyTag}</div>

            {/* Main Border Frame Box */}
            <div className="border-2 border-black text-black bg-white shadow-sm overflow-hidden">
              <div className="text-center font-bold text-xs border-b border-black py-1 tracking-wider uppercase bg-slate-50">
                {viewing.documentType || 'TAX INVOICE'}
              </div>

              {/* Company Header */}
              <div className="text-center p-3 border-b border-black">
                <h2 className="text-xl font-black uppercase tracking-tight font-sans">NAIN TOOLS & SS BOLT CO.</h2>
                <p className="text-[11px] font-bold mt-0.5">17/1, INDUSTRIAL AREA WHIRLPOOL CHOWK, NIT FARIDABAD</p>
                <p className="text-[10px] text-slate-700 mt-0.5">EMAIL : narendernain2011@gmail.com &nbsp;|&nbsp; 9213469582 7053795074 129 4870974</p>
                <p className="text-xs font-black mt-1">GSTIN No. {viewing.sellerGstin || '06CCCPK0841B1ZA'}</p>
              </div>

              {/* PAN & Reverse Charge */}
              <div className="flex justify-between px-3 py-1.5 border-b border-black text-[11px] font-bold bg-slate-50/60">
                <div>PAN No. &nbsp;&nbsp;&nbsp;&nbsp; <span className="font-mono">{viewing.sellerPan || 'CCCPK0841B'}</span></div>
                <div>Tax is Payable on Reverse Charge : <span>No</span></div>
              </div>

              {/* Two Column Grid: Invoice Meta & Transport */}
              <div className="grid grid-cols-2 border-b border-black divide-x divide-black text-[10px]">
                <div className="p-2 space-y-1">
                  <div className="flex justify-between">
                    <span>{viewing.documentType === 'DEBIT NOTE' ? 'Debit Note No. :' : 'Invoice No. :'} &nbsp;&nbsp; <strong>{viewing.invoice}</strong></span>
                    <span>Date : &nbsp;&nbsp; <strong>{viewing.date}</strong></span>
                  </div>
                  <div className="flex justify-between"><span>P.O. No. :</span> <strong>{viewing.poNumber || '—'}</strong></div>
                  <div className="flex justify-between"><span>P.O. Date :</span> <strong>{viewing.poDate || '—'}</strong></div>
                </div>
                <div className="p-2 space-y-1">
                  <div className="flex justify-between"><span>Mode of Transport :</span> <strong>{viewing.transportMode || '—'}</strong></div>
                  <div className="flex justify-between"><span>Vehicle No. :</span> <strong>{viewing.vehicleNumber || '—'}</strong></div>
                  <div className="flex justify-between"><span>Date & Time of Supply :</span> <span>{viewing.date} 01:29 PM</span></div>
                  <div className="flex justify-between"><span>Place of Supply :</span> <strong>{(viewing.customerState || 'HARYANA').toUpperCase()}</strong></div>
                </div>
              </div>

              {/* Two Column Grid: Party Details */}
              <div className="grid grid-cols-2 border-b border-black divide-x divide-black text-[10px]">
                <div className="p-2.5">
                  <div className="flex justify-between font-bold underline mb-1">
                    <span>Receiver Details (Billed to)</span>
                    <span>Vendor Code : <strong>{viewing.vendorCode || '—'}</strong></span>
                  </div>
                  <div className="font-bold text-xs uppercase text-slate-900">{viewing.customer}</div>
                  <div className="text-slate-700 mt-0.5">{viewing.customerAddress || 'FARIDABAD, HARYANA'}</div>
                  <div className="mt-3 space-y-0.5 text-slate-900 font-semibold">
                    <div>GSTIN No. : &nbsp;&nbsp;&nbsp;&nbsp; <strong className="font-mono">{viewing.customerGstin || '06AAECA0878K1ZJ'}</strong></div>
                    <div>State : &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <strong>{viewing.customerState || 'Haryana'}</strong> &nbsp;&nbsp; Code : <strong>{viewing.customerStateCode || '06'}</strong></div>
                  </div>
                </div>
                <div className="p-2.5">
                  <div className="font-bold underline mb-1">Consignee Details (Shipped to)</div>
                  <div className="font-bold text-xs uppercase text-slate-900">{viewing.customer}</div>
                  <div className="text-slate-700 mt-0.5">{viewing.customerAddress || 'FARIDABAD, HARYANA'}</div>
                  <div className="mt-3 space-y-0.5 text-slate-900 font-semibold">
                    <div>GSTIN No. : &nbsp;&nbsp;&nbsp;&nbsp; <strong className="font-mono">{viewing.customerGstin || '06AAECA0878K1ZJ'}</strong></div>
                    <div>State : &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <strong>{viewing.customerState || 'Haryana'}</strong> &nbsp;&nbsp; Code : <strong>{viewing.customerStateCode || '06'}</strong></div>
                  </div>
                </div>
              </div>

              {/* Table Grid */}
              <div className="border-b border-black overflow-x-auto min-h-[160px]">
                <table className="w-full text-left border-collapse text-[10.5px]">
                  {(() => {
                    const isAmountDisc = viewing.discountType === 'amount' && viewing.discount && viewing.discount > 0;
                    const isPercentDisc = viewing.discountType === 'percent' && viewing.discount && viewing.discount > 0;
                    const discHeaderLabel = isAmountDisc ? 'Disc (Rs.)' : 'Disc %';
                    return (
                      <>
                        <thead>
                          <tr className="border-b border-black text-center font-bold bg-slate-50">
                            <th className="border-r border-black p-1.5 w-10">Sr No</th>
                            <th className="border-r border-black p-1.5 text-left pl-3">Description of Goods</th>
                            <th className="border-r border-black p-1.5 w-20">HSN Code</th>
                            <th className="border-r border-black p-1.5 w-20">Qty</th>
                            <th className="border-r border-black p-1.5 w-20">Rate (Rs.)</th>
                            <th className="border-r border-black p-1.5 w-20">{discHeaderLabel}</th>
                            <th className="p-1.5 w-24 text-right pr-3">Amount (Rs.)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/40">
                          {viewing.items.map((it, idx) => {
                            const lineTotal = it.price * it.qty;
                            const itemDiscVal = isAmountDisc
                              ? (viewing.subtotal > 0 ? (viewing.discount * (lineTotal / viewing.subtotal)) : 0)
                              : (isPercentDisc ? viewing.discount : 0);
                            return (
                              <tr key={idx} className="align-top">
                                <td className="border-r border-black p-1.5 text-center">{idx + 1}</td>
                                <td className="border-r border-black p-1.5 font-bold pl-3">{it.name}</td>
                                <td className="border-r border-black p-1.5 text-center font-mono">{it.hsnCode || '7318150'}</td>
                                <td className="border-r border-black p-1.5 text-right font-mono">{it.qty.toFixed(2)} PCS</td>
                                <td className="border-r border-black p-1.5 text-right font-mono">{it.price.toFixed(2)}</td>
                                <td className="border-r border-black p-1.5 text-right font-mono">{itemDiscVal.toFixed(2)}</td>
                                <td className="p-1.5 text-right font-mono pr-3 font-semibold">{lineTotal.toFixed(2)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </>
                    );
                  })()}
                </table>
              </div>

              {/* Bottom Summary Grid */}
              <div className="grid grid-cols-12 divide-x divide-black text-[10px]">
                <div className="col-span-7 p-2.5 flex flex-col justify-between">
                  <div>
                    <div className="font-bold mb-1.5">E-Way Bill No : <strong>{viewing.ewayBill || '—'}</strong></div>
                    <div className="font-bold underline mb-0.5">Bank Details :</div>
                    <div className="font-bold space-y-0.5 text-slate-800">
                      <div>{viewing.bankName || 'HDFC BANK'}</div>
                      <div>{viewing.bankAccount || '50200088182531'}</div>
                      <div>IFSC CODE :{viewing.bankIfsc || 'HDFC0002034'}</div>
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-black/20">
                    <div className="text-[9px] text-slate-700 font-semibold italic">
                      Certified that the Particulars given above are true and correct
                    </div>
                    <div className="font-bold underline mt-1 mb-0.5">Terms & Conditions :</div>
                    <ol className="text-[8.5px] text-slate-700 space-y-0.5">
                      <li>1. Interest @ 24% p.a. will be charged for delayed payments</li>
                      <li>2. Our risk & responsibility ceases as soon as Goods leave our factory</li>
                      <li>3. All disputes are subject to Faridabad Jurisdiction only.</li>
                      <li>4. E&OE</li>
                    </ol>

                    <div className="flex justify-between items-end mt-4 pt-2 font-bold text-[10px]">
                      <div>Receiver's Signature</div>
                      <div className="text-right">
                        <div>For <strong>NAIN TOOLS & SS BOLT CO.</strong></div>
                        <div className="mt-5">Authorised Signatory</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="col-span-5 flex flex-col justify-between font-bold divide-y divide-black">
                  <div className="p-2 flex justify-between">
                    <span>Total Amount</span>
                    <span className="font-mono">{viewing.subtotal.toFixed(2)}</span>
                  </div>
                  {viewing.discount && viewing.discountType !== 'percent' ? (
                    <div className="p-2 flex justify-between text-amber-700 bg-amber-50/50">
                      <span>Discount (Less)</span>
                      <span className="font-mono">-{computeDiscountAmount(viewing.subtotal, viewing.discount, viewing.discountType).toFixed(2)}</span>
                    </div>
                  ) : null}
                  <div className="p-2 flex justify-between">
                    <span>Taxable Amount</span>
                    <span className="font-mono">{(viewing.subtotal - computeDiscountAmount(viewing.subtotal, viewing.discount, viewing.discountType)).toFixed(2)}</span>
                  </div>
                  {viewing.gstType === 'igst' ? (
                    <div className="p-2 flex justify-between">
                      <span>IGST @ &nbsp;&nbsp;&nbsp;&nbsp; {(viewing.gstRate || 18).toFixed(2)} %</span>
                      <span className="font-mono">{viewing.gstAmount.toFixed(2)}</span>
                    </div>
                  ) : (
                    <>
                      <div className="p-2 flex justify-between">
                        <span>CGST @ &nbsp;&nbsp;&nbsp;&nbsp; {(((viewing.gstRate || 18) / 2)).toFixed(2)} %</span>
                        <span className="font-mono">{(viewing.cgstAmount || viewing.gstAmount / 2).toFixed(2)}</span>
                      </div>
                      <div className="p-2 flex justify-between">
                        <span>SGST @ &nbsp;&nbsp;&nbsp;&nbsp; {(((viewing.gstRate || 18) / 2)).toFixed(2)} %</span>
                        <span className="font-mono">{(viewing.sgstAmount || viewing.gstAmount / 2).toFixed(2)}</span>
                      </div>
                    </>
                  )}
                  <div className="p-2 flex justify-between text-xs bg-slate-50 font-black">
                    <span>Invoice Amount (Rs.)</span>
                    <span className="font-mono text-black">{viewing.grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Copy Selector & Export Options */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-slate-800">Select Copies to Export / Print:</span>
                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  <button
                    onClick={() =>
                      setExportCopies({
                        'Original For Recipient': true,
                        'Duplicate For Transporter': true,
                        'Triplicate For Supplier': true,
                        'Extra Copy': true,
                      })
                    }
                    className="px-2 py-0.5 rounded bg-white hover:bg-slate-200 border border-slate-300 font-semibold text-slate-700"
                  >
                    All 4 Copies
                  </button>
                  <button
                    onClick={() =>
                      setExportCopies({
                        'Original For Recipient': true,
                        'Duplicate For Transporter': false,
                        'Triplicate For Supplier': false,
                        'Extra Copy': false,
                      })
                    }
                    className="px-2 py-0.5 rounded bg-white hover:bg-slate-200 border border-slate-300 font-semibold text-slate-700"
                  >
                    Original Only (1 Copy)
                  </button>
                  <button
                    onClick={() =>
                      setExportCopies({
                        'Original For Recipient': true,
                        'Duplicate For Transporter': true,
                        'Triplicate For Supplier': false,
                        'Extra Copy': false,
                      })
                    }
                    className="px-2 py-0.5 rounded bg-white hover:bg-slate-200 border border-slate-300 font-semibold text-slate-700"
                  >
                    Original + Duplicate (2 Copies)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-200/80">
                {[
                  'Original For Recipient',
                  'Duplicate For Transporter',
                  'Triplicate For Supplier',
                  'Extra Copy'
                ].map((copyTag) => (
                  <label key={copyTag} className="flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={!!exportCopies[copyTag]}
                      onChange={(e) =>
                        setExportCopies((prev) => ({
                          ...prev,
                          [copyTag]: e.target.checked,
                        }))
                      }
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className={exportCopies[copyTag] ? 'text-brand-700 font-bold' : 'text-slate-500'}>{copyTag}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={() => setViewing(null)}>
                Close
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  const selectedList = Object.keys(exportCopies).filter((k) => exportCopies[k]);
                  printInvoice(viewing, selectedList.length > 0 ? selectedList : undefined);
                }}
              >
                <Printer className="h-4 w-4" /> Print / Export Selected ({Object.values(exportCopies).filter(Boolean).length} {Object.values(exportCopies).filter(Boolean).length === 1 ? 'Copy' : 'Copies'})
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
