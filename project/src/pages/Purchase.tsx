import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, Download, Eye, Truck, PackageCheck, Clock, FileText,
  Trash2, Minus, Printer, CheckCircle2, Package,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import Modal from '@/components/Modal';
import { printPurchase, printInvoice } from '@/components/PrintableInvoice';
import { useStore } from '@/store/AppStore';
import { GST_RATE, computeDiscountAmount } from '@/lib/constants';
import { downloadCSV, toCSV, money } from '@/utils/analytics';
import type { PurchaseRecord, PurchaseLineItem, PurchasePaymentMethod, SaleRecord, InvoiceLineItem, DiscountType } from '@/lib/types';

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

function nextPurchaseBill(existingSales: SaleRecord[]): string {
  const nums = existingSales
    .filter((s) => s.documentType === 'PURCHASE BILL' || s.invoice.startsWith('PI-') || s.invoice.startsWith('PB-'))
    .map((s) => parseInt(s.invoice.replace(/^(PI|PB)-/, ''), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 3100;
  return `PI-${max + 1}`;
}

type DraftLine = PurchaseLineItem;

export default function Purchase() {
  const { purchases, products, suppliers, sales, addPurchase, addSale, companySettings } = useStore();
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

  // Purchase Bill Modal State (rich Tax Invoice features for Purchase Bill)
  const [pbModalOpen, setPbModalOpen] = useState(false);
  const [pbSupplierId, setPbSupplierId] = useState('');
  const [pbSupplier, setPbSupplier] = useState('');
  const [pbPhone, setPbPhone] = useState('');
  const [pbAddress, setPbAddress] = useState('');
  const [pbGstin, setPbGstin] = useState('');
  const [pbCustomBillNumber, setPbCustomBillNumber] = useState('');
  const [pbDate, setPbDate] = useState(todayISO());
  const [pbPoNumber, setPbPoNumber] = useState('');
  const [pbPoDate, setPbPoDate] = useState('');
  const [pbTransportMode, setPbTransportMode] = useState('');
  const [pbVehicleNumber, setPbVehicleNumber] = useState('');
  const [pbEwayBill, setPbEwayBill] = useState('');
  const [pbVendorCode, setPbVendorCode] = useState('');
  const [pbBankName, setPbBankName] = useState(companySettings?.bankName || 'HDFC BANK');
  const [pbBankAccount, setPbBankAccount] = useState(companySettings?.bankAccount || '50200088182531');
  const [pbBankIfsc, setPbBankIfsc] = useState(companySettings?.bankIfsc || 'HDFC0002034');
  const [pbSellerGstin, setPbSellerGstin] = useState(companySettings?.gstin || '06CCCPK0841B1ZA');
  const [pbSellerPan, setPbSellerPan] = useState(companySettings?.pan || 'CCCPK0841B');
  const [pbApplyGst, setPbApplyGst] = useState(true);
  const [pbGstRate, setPbGstRate] = useState(18);
  const [pbGstTaxType, setPbGstTaxType] = useState<'local' | 'central'>('local');

  useEffect(() => {
    if (companySettings) {
      setPbBankName(companySettings.bankName || 'HDFC BANK');
      setPbBankAccount(companySettings.bankAccount || '50200088182531');
      setPbBankIfsc(companySettings.bankIfsc || 'HDFC0002034');
      setPbSellerGstin(companySettings.gstin || '06CCCPK0841B1ZA');
      setPbSellerPan(companySettings.pan || 'CCCPK0841B');
    }
  }, [companySettings]);
  const [pbDiscount, setPbDiscount] = useState(0);
  const [pbDiscountType, setPbDiscountType] = useState<DiscountType>('percent');
  const [pbLines, setPbLines] = useState<InvoiceLineItem[]>([]);
  const [pbProductSearch, setPbProductSearch] = useState('');
  const [pbViewing, setPbViewing] = useState<SaleRecord | null>(null);
  const [pbPreviewCopyTag, setPbPreviewCopyTag] = useState('Original For Recipient');
  const [pbExportCopies, setPbExportCopies] = useState<Record<string, boolean>>({
    'Original For Recipient': true,
    'Duplicate For Transporter': true,
    'Triplicate For Supplier': true,
    'Extra Copy': true,
  });

  const autoPbNumber = useMemo(() => nextPurchaseBill(sales), [sales]);
  const pbNumber = pbCustomBillNumber.trim() || autoPbNumber;

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

  // Purchase Bill calculations & handlers
  const pbSubtotal = useMemo(
    () => pbLines.reduce((sum, line) => sum + line.price * line.qty, 0),
    [pbLines],
  );
  const pbEffectiveGstRate = pbApplyGst ? pbGstRate : 0;
  const pbDiscountAmount = useMemo(
    () => computeDiscountAmount(pbSubtotal, pbDiscount, pbDiscountType),
    [pbSubtotal, pbDiscount, pbDiscountType],
  );
  const pbTaxableAmount = Math.max(0, pbSubtotal - pbDiscountAmount);
  const pbGstAmount = +(pbTaxableAmount * (pbEffectiveGstRate / 100)).toFixed(2);
  const pbHalfGst = +(pbGstAmount / 2).toFixed(2);
  const pbGrandTotal = +(pbTaxableAmount + pbGstAmount).toFixed(2);

  const pbCgstAmount = pbGstTaxType === 'local' ? pbHalfGst : 0;
  const pbSgstAmount = pbGstTaxType === 'local' ? pbHalfGst : 0;
  const pbIgstAmount = pbGstTaxType === 'central' ? pbGstAmount : 0;

  const pbSearchResults = useMemo(() => {
    const q = pbProductSearch.toLowerCase().trim();
    if (!q) return [];
    return products.filter((p) => p.name.toLowerCase().includes(q) || (p.size && p.size.toLowerCase().includes(q)));
  }, [pbProductSearch, products]);

  const resetPbForm = () => {
    setPbSupplierId('');
    setPbSupplier('');
    setPbPhone('');
    setPbAddress('');
    setPbGstin('');
    setPbCustomBillNumber('');
    setPbDate(todayISO());
    setPbPoNumber('');
    setPbPoDate('');
    setPbTransportMode('');
    setPbVehicleNumber('');
    setPbEwayBill('');
    setPbVendorCode('');
    setPbBankName(companySettings?.bankName || 'HDFC BANK');
    setPbBankAccount(companySettings?.bankAccount || '50200088182531');
    setPbBankIfsc(companySettings?.bankIfsc || 'HDFC0002034');
    setPbSellerGstin(companySettings?.gstin || '06CCCPK0841B1ZA');
    setPbSellerPan(companySettings?.pan || 'CCCPK0841B');
    setPbApplyGst(true);
    setPbGstRate(18);
    setPbGstTaxType('local');
    setPbDiscount(0);
    setPbDiscountType('percent');
    setPbLines([]);
    setPbProductSearch('');
  };

  const openNewPurchaseBill = () => {
    resetPbForm();
    setPbCustomBillNumber(nextPurchaseBill(sales));
    setPbModalOpen(true);
  };

  const handlePbSupplierSelect = (id: string) => {
    setPbSupplierId(id);
    if (!id || id === 'new') {
      if (id === '') {
        setPbSupplier('');
        setPbPhone('');
        setPbAddress('');
        setPbGstin('');
      }
      return;
    }
    const sup = suppliers.find((s) => s.id === id);
    if (sup) {
      setPbSupplier(sup.name);
      setPbPhone(sup.phone || '');
      setPbAddress(sup.address || '');
      setPbGstin(sup.gstin || '');
    }
  };

  const addPbLine = (productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    setPbLines((prev) => {
      const idx = prev.findIndex((l) => l.productId === p.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          price: p.price,
          qty: 1,
          hsnCode: p.hsnCode || '7318150',
        },
      ];
    });
  };

  const updatePbLineQty = (productId: string, delta: number) => {
    setPbLines((prev) =>
      prev
        .map((l) => (l.productId === productId ? { ...l, qty: Math.max(0, l.qty + delta) } : l))
        .filter((l) => l.qty > 0),
    );
  };

  const setPbLineQty = (productId: string, raw: string) => {
    const q = parseInt(raw, 10);
    setPbLines((prev) =>
      prev
        .map((l) => (l.productId === productId ? { ...l, qty: isNaN(q) ? 0 : Math.max(0, q) } : l))
        .filter((l) => l.qty > 0),
    );
  };

  const setPbLinePrice = (productId: string, raw: string) => {
    const val = parseFloat(raw);
    setPbLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, price: isNaN(val) ? 0 : Math.max(0, val) } : l)),
    );
  };

  const setPbLineHsn = (productId: string, hsnCode: string) => {
    setPbLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, hsnCode } : l)),
    );
  };

  const removePbLine = (productId: string) => {
    setPbLines((prev) => prev.filter((l) => l.productId !== productId));
  };

  const pbCanSubmit = pbSupplier.trim() !== '' && pbLines.length > 0;

  const handleSavePurchaseBill = () => {
    if (!pbCanSubmit) return;
    const newBill: SaleRecord = {
      id: `pb-${Date.now()}`,
      invoice: pbNumber,
      customer: pbSupplier.trim(),
      customerId: pbSupplierId || 'sup-custom',
      phone: pbPhone.trim(),
      customerAddress: pbAddress.trim(),
      customerGstin: pbGstin.trim().toUpperCase(),
      customerState: 'HARYANA',
      customerStateCode: '06',
      date: pbDate,
      items: pbLines.map((l) => ({ ...l })),
      itemCount: pbLines.reduce((s, l) => s + l.qty, 0),
      subtotal: +pbSubtotal.toFixed(2),
      discount: pbDiscount,
      discountType: pbDiscountType,
      gstRate: pbEffectiveGstRate,
      gstType: pbGstTaxType === 'local' ? 'cgst-sgst' : 'igst',
      cgstAmount: pbCgstAmount,
      sgstAmount: pbSgstAmount,
      igstAmount: pbIgstAmount,
      gstAmount: pbGstAmount,
      grandTotal: pbGrandTotal,
      amountPaid: pbGrandTotal,
      paymentMethod: 'Cash',
      status: 'paid',
      channel: 'in-store',
      poNumber: pbPoNumber.trim(),
      poDate: pbPoDate.trim(),
      transportMode: pbTransportMode.trim(),
      vehicleNumber: pbVehicleNumber.trim().toUpperCase(),
      ewayBill: pbEwayBill.trim(),
      vendorCode: pbVendorCode.trim(),
      bankName: pbBankName.trim(),
      bankAccount: pbBankAccount.trim(),
      bankIfsc: pbBankIfsc.trim().toUpperCase(),
      sellerGstin: pbSellerGstin.trim().toUpperCase(),
      sellerPan: pbSellerPan.trim().toUpperCase(),
      documentType: 'PURCHASE BILL',
    };

    addSale(newBill);
    setPbModalOpen(false);
    setPbViewing(newBill);
    resetPbForm();
  };

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
        title="Purchase Bills"
        subtitle="Manage supplier purchase bills, purchase orders, and track deliveries."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary" onClick={handleExport}>
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export</span>
            </button>
            <button
              className="btn-secondary bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 font-bold flex items-center gap-1.5"
              onClick={openNewPurchaseBill}
            >
              <Plus className="h-4 w-4 text-indigo-600" />
              <span>+ Purchase Bill</span>
            </button>
            <button className="btn-primary" onClick={openNewPurchase}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Purchase Order</span>
            </button>
          </div>
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

          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={handleSave} disabled={!canSubmit}>
              Save Purchase Order
            </button>
          </div>
        </div>
      </Modal>

      {/* Create Purchase Bill Modal (rich Tax Invoice layout for Purchase Bill) */}
      {pbModalOpen && (
        <Modal
          title={`Create Purchase Bill (${pbNumber})`}
          size="xl"
          onClose={() => setPbModalOpen(false)}
        >
          <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1 text-xs">
            {/* Supplier Selector / Input */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Select Supplier</label>
                <select
                  value={pbSupplierId}
                  onChange={(e) => handlePbSupplierSelect(e.target.value)}
                  className="input"
                >
                  <option value="">-- Select Saved Supplier --</option>
                  <option value="new">+ Enter New Supplier</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.phone ? `(${s.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Supplier Name *</label>
                <input
                  type="text"
                  value={pbSupplier}
                  onChange={(e) => setPbSupplier(e.target.value)}
                  placeholder="Supplier / Firm Name"
                  className="input"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={pbPhone}
                  onChange={(e) => setPbPhone(e.target.value)}
                  placeholder="Mobile number"
                  className="input"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Supplier Address</label>
                <input
                  type="text"
                  value={pbAddress}
                  onChange={(e) => setPbAddress(e.target.value)}
                  placeholder="Billing / Delivery Address"
                  className="input"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Purchase Bill Number *</label>
                <input
                  type="text"
                  value={pbCustomBillNumber}
                  onChange={(e) => setPbCustomBillNumber(e.target.value)}
                  placeholder="e.g. PI-3101"
                  className="input font-mono font-bold text-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Bill Date</label>
                <input
                  type="date"
                  value={pbDate}
                  onChange={(e) => setPbDate(e.target.value)}
                  className="input"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Supplier GSTIN</label>
              <input
                type="text"
                value={pbGstin}
                onChange={(e) => setPbGstin(e.target.value)}
                placeholder="E.G. 07AAAAA0000A1Z5"
                className="input font-mono uppercase"
              />
            </div>

            {/* Transport & Tax Details */}
            <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 space-y-2.5">
              <span className="text-[11px] font-bold text-slate-700">Transport &amp; Tax Details (P.O., Transport, E-Way Bill)</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5">P.O. Number</label>
                  <input
                    type="text"
                    value={pbPoNumber}
                    onChange={(e) => setPbPoNumber(e.target.value)}
                    placeholder="e.g. PO-1029"
                    className="input text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5">P.O. Date</label>
                  <input
                    type="date"
                    value={pbPoDate}
                    onChange={(e) => setPbPoDate(e.target.value)}
                    className="input text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5">E-Way Bill No.</label>
                  <input
                    type="text"
                    value={pbEwayBill}
                    onChange={(e) => setPbEwayBill(e.target.value)}
                    placeholder="12-digit E-Way Bill"
                    className="input text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5">Mode of Transport</label>
                  <input
                    type="text"
                    value={pbTransportMode}
                    onChange={(e) => setPbTransportMode(e.target.value)}
                    placeholder="e.g. Road / Tempo / Hand"
                    className="input text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5">Vehicle Number</label>
                  <input
                    type="text"
                    value={pbVehicleNumber}
                    onChange={(e) => setPbVehicleNumber(e.target.value)}
                    placeholder="E.G. HR-51-AB-1234"
                    className="input text-xs font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5">Vendor Code</label>
                  <input
                    type="text"
                    value={pbVendorCode}
                    onChange={(e) => setPbVendorCode(e.target.value)}
                    placeholder="Vendor / Account Code"
                    className="input text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Product Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Add Products to Purchase Bill</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={pbProductSearch}
                  onChange={(e) => setPbProductSearch(e.target.value)}
                  placeholder="Search products by name or SKU..."
                  className="input pl-9 text-xs"
                />
              </div>

              {pbSearchResults.length > 0 && (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-md divide-y divide-slate-100">
                  {pbSearchResults.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => addPbLine(p.id)}
                      className="flex items-center justify-between p-2.5 hover:bg-indigo-50 cursor-pointer transition text-xs"
                    >
                      <div>
                        <p className="font-bold text-slate-900">{p.name}</p>
                        <p className="text-[11px] text-slate-500 font-mono">Size: {p.size || 'N/A'} | Stock: {p.stock}</p>
                      </div>
                      <span className="font-bold text-indigo-600">₹{p.price.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Line Items Table */}
            {pbLines.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 font-bold text-slate-700">
                    <tr>
                      <th className="p-2">Item</th>
                      <th className="p-2 w-28">HSN Code</th>
                      <th className="p-2 w-24 text-center">Qty</th>
                      <th className="p-2 w-24 text-right">Price (₹)</th>
                      <th className="p-2 w-28 text-right">Total (₹)</th>
                      <th className="p-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pbLines.map((l) => (
                      <tr key={l.productId}>
                        <td className="p-2 font-medium">{l.name}</td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={l.hsnCode || '7318150'}
                            onChange={(e) => setPbLineHsn(l.productId, e.target.value)}
                            className="input p-1 text-[11px] font-mono text-center"
                          />
                        </td>
                        <td className="p-2">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => updatePbLineQty(l.productId, -1)}
                              className="p-1 rounded hover:bg-slate-200"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <input
                              type="number"
                              value={l.qty}
                              onChange={(e) => setPbLineQty(l.productId, e.target.value)}
                              className="w-12 text-center font-bold input p-1"
                              min={1}
                            />
                            <button
                              type="button"
                              onClick={() => updatePbLineQty(l.productId, 1)}
                              className="p-1 rounded hover:bg-slate-200"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                        <td className="p-2 text-right">
                          <input
                            type="number"
                            value={l.price}
                            onChange={(e) => setPbLinePrice(l.productId, e.target.value)}
                            className="w-20 text-right font-semibold input p-1 ml-auto"
                            step="0.01"
                          />
                        </td>
                        <td className="p-2 text-right font-bold text-slate-900">
                          ₹{(l.price * l.qty).toFixed(2)}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            onClick={() => removePbLine(l.productId)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 text-center text-slate-400 border border-dashed border-slate-300 rounded-lg">
                No products added to this purchase bill yet. Search above to add items.
              </div>
            )}

            {/* Calculations Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              <div className="space-y-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700">Apply GST Tax</label>
                  <input
                    type="checkbox"
                    checked={pbApplyGst}
                    onChange={(e) => setPbApplyGst(e.target.checked)}
                    className="h-4 w-4 rounded accent-indigo-600"
                  />
                </div>

                {pbApplyGst && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">GST Rate (%)</label>
                        <select
                          value={pbGstRate}
                          onChange={(e) => setPbGstRate(Number(e.target.value))}
                          className="input p-1.5"
                        >
                          <option value={0}>0% (Nil)</option>
                          <option value={5}>5%</option>
                          <option value={12}>12%</option>
                          <option value={18}>18%</option>
                          <option value={28}>28%</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Tax Type</label>
                        <select
                          value={pbGstTaxType}
                          onChange={(e) => setPbGstTaxType(e.target.value as 'local' | 'central')}
                          className="input p-1.5"
                        >
                          <option value="local">Local (CGST + SGST)</option>
                          <option value="central">Central (IGST)</option>
                        </select>
                      </div>
                    </div>
                  </>
                )}

                <div className="border-t border-slate-200 pt-2">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Discount (%)</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={pbDiscount}
                      onChange={(e) => setPbDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="input p-1.5 w-full text-right font-bold"
                      min={0}
                      max={100}
                      step={0.01}
                      placeholder="0"
                    />
                    <span className="text-xs font-bold text-slate-600">%</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 text-white p-3.5 rounded-lg space-y-1.5 font-mono">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">Subtotal:</span>
                  <span>₹{pbSubtotal.toFixed(2)}</span>
                </div>
                {pbDiscountAmount > 0 && (
                  <div className="flex justify-between text-xs text-amber-400">
                    <span>Discount:</span>
                    <span>-₹{pbDiscountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">Taxable Value:</span>
                  <span>₹{pbTaxableAmount.toFixed(2)}</span>
                </div>
                {pbApplyGst && pbGstTaxType === 'local' && (
                  <>
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>CGST ({(pbGstRate / 2)}%):</span>
                      <span>₹{pbCgstAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>SGST ({(pbGstRate / 2)}%):</span>
                      <span>₹{pbSgstAmount.toFixed(2)}</span>
                    </div>
                  </>
                )}
                {pbApplyGst && pbGstTaxType === 'central' && (
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>IGST ({pbGstRate}%):</span>
                    <span>₹{pbIgstAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold text-emerald-400 border-t border-slate-700 pt-2 mt-2 font-sans">
                  <span>Grand Total:</span>
                  <span>₹{pbGrandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={() => setPbModalOpen(false)}>
                Cancel
              </button>
              <button className="btn-primary bg-indigo-600 hover:bg-indigo-700" onClick={handleSavePurchaseBill} disabled={!pbCanSubmit}>
                Confirm &amp; Issue Purchase Bill
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Purchase Bill View Modal (4 Copies Export & Print) */}
      {pbViewing && (
        <Modal
          title={`Purchase Bill Details — ${pbViewing.invoice}`}
          size="xl"
          onClose={() => setPbViewing(null)}
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
                    onClick={() => setPbPreviewCopyTag(copyTag)}
                    className={`px-2.5 py-1 rounded text-[10.5px] font-bold transition-all ${
                      pbPreviewCopyTag === copyTag
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
                    }`}
                  >
                    {copyTag}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-right text-[10px] font-bold text-slate-900 tracking-wide">{pbPreviewCopyTag}</div>

            {/* Main Frame Box */}
            <div className="border-2 border-black text-black bg-white shadow-sm overflow-hidden">
              <div className="text-center font-bold text-xs border-b border-black py-1 tracking-wider uppercase bg-slate-50">
                {pbViewing.documentType || 'PURCHASE BILL'}
              </div>

              {/* Company Header */}
              <div className="text-center p-3 border-b border-black">
                <h2 className="text-xl font-black uppercase tracking-tight font-sans">{companySettings?.companyName || 'NAIN TOOLS & SS BOLT CO.'}</h2>
                <p className="text-[11px] font-bold mt-0.5">{companySettings?.address || '17/1, INDUSTRIAL AREA WHIRLPOOL CHOWK, NIT FARIDABAD'}</p>
                <p className="text-[10px] text-slate-700 mt-0.5">EMAIL : {companySettings?.email || 'narendernain2011@gmail.com'} &nbsp;|&nbsp; {companySettings?.phone || '9213469582 7053795074 129 4870974'}</p>
                <p className="text-xs font-black mt-1">GSTIN No. {pbViewing.sellerGstin || companySettings?.gstin || '06CCCPK0841B1ZA'}</p>
              </div>

              {/* PAN & Reverse Charge */}
              <div className="flex justify-between px-3 py-1.5 border-b border-black text-[11px] font-bold bg-slate-50/60">
                <div>PAN No. &nbsp;&nbsp;&nbsp;&nbsp; <span className="font-mono">{pbViewing.sellerPan || companySettings?.pan || 'CCCPK0841B'}</span></div>
                <div>Tax is Payable on Reverse Charge : <span>No</span></div>
              </div>

              {/* Two Column Grid */}
              <div className="grid grid-cols-2 border-b border-black divide-x divide-black text-[10px]">
                <div className="p-2 space-y-1">
                  <div className="flex justify-between">
                    <span>Bill No. : &nbsp;&nbsp; <strong>{pbViewing.invoice}</strong></span>
                    <span>Date : &nbsp;&nbsp; <strong>{pbViewing.date}</strong></span>
                  </div>
                  <div className="flex justify-between"><span>P.O. No. :</span> <strong>{pbViewing.poNumber || '—'}</strong></div>
                  <div className="flex justify-between"><span>P.O. Date :</span> <strong>{pbViewing.poDate || '—'}</strong></div>
                </div>
                <div className="p-2 space-y-1">
                  <div className="flex justify-between"><span>Mode of Transport :</span> <strong>{pbViewing.transportMode || '—'}</strong></div>
                  <div className="flex justify-between"><span>Vehicle No. :</span> <strong>{pbViewing.vehicleNumber || '—'}</strong></div>
                  <div className="flex justify-between"><span>Date &amp; Time of Supply :</span> <span>{pbViewing.date} 01:29 PM</span></div>
                </div>
              </div>

              {/* Party Details */}
              <div className="p-2.5 border-b border-black bg-slate-50/30">
                <span className="font-bold text-[10px] text-slate-500 uppercase tracking-wider block mb-0.5">Supplier Details:</span>
                <p className="font-bold text-xs uppercase">{pbViewing.customer}</p>
                <p className="text-[10.5px] font-medium">{pbViewing.customerAddress || 'Haryana, India'}</p>
                <p className="text-[10.5px]">GSTIN / Unique ID : <span className="font-mono font-bold">{pbViewing.customerGstin || '—'}</span></p>
              </div>

              {/* Products Table */}
              <table className="w-full text-left text-[10.5px] border-b border-black">
                {(() => {
                  const isAmountDisc = pbViewing.discountType === 'amount' && pbViewing.discount && pbViewing.discount > 0;
                  const isPercentDisc = pbViewing.discountType === 'percent' && pbViewing.discount && pbViewing.discount > 0;
                  const discHeaderLabel = isAmountDisc ? 'Disc (Rs.)' : 'Disc %';
                  return (
                    <>
                      <thead className="bg-slate-100 border-b border-black font-bold">
                        <tr>
                          <th className="p-1.5 border-r border-black w-8 text-center">S.N.</th>
                          <th className="p-1.5 border-r border-black">Description of Goods</th>
                          <th className="p-1.5 border-r border-black w-16 text-center">HSN Code</th>
                          <th className="p-1.5 border-r border-black w-12 text-center">Qty</th>
                          <th className="p-1.5 border-r border-black w-16 text-right">Rate</th>
                          <th className="p-1.5 border-r border-black w-20 text-right">{discHeaderLabel}</th>
                          <th className="p-1.5 text-right w-20">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/20">
                        {pbViewing.items.map((item, idx) => {
                          const lineTotal = item.price * item.qty;
                          const itemDiscVal = isAmountDisc
                            ? (pbViewing.subtotal > 0 ? (pbViewing.discount * (lineTotal / pbViewing.subtotal)) : 0)
                            : (isPercentDisc ? pbViewing.discount : 0);
                          return (
                            <tr key={idx}>
                              <td className="p-1.5 border-r border-black text-center">{idx + 1}</td>
                              <td className="p-1.5 border-r border-black font-bold">{item.name}</td>
                              <td className="p-1.5 border-r border-black text-center font-mono">{item.hsnCode || '7318150'}</td>
                              <td className="p-1.5 border-r border-black text-center font-bold">{item.qty}</td>
                              <td className="p-1.5 border-r border-black text-right font-mono">₹{item.price.toFixed(2)}</td>
                              <td className="p-1.5 border-r border-black text-right font-mono">{itemDiscVal.toFixed(2)}</td>
                              <td className="p-1.5 text-right font-bold font-mono">₹{lineTotal.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </>
                  );
                })()}
              </table>

              {/* Totals Section */}
              <div className="p-3 bg-slate-50 font-mono text-xs space-y-1 border-t border-black">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>{money(pbViewing.subtotal)}</span>
                </div>
                {pbViewing.discount && pbViewing.discountType !== 'percent' ? (
                  <div className="flex justify-between text-amber-700 font-semibold">
                    <span>Discount (Less):</span>
                    <span>-{money(computeDiscountAmount(pbViewing.subtotal, pbViewing.discount, pbViewing.discountType))}</span>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <span>Taxable Amount:</span>
                  <span>{money(pbViewing.subtotal - computeDiscountAmount(pbViewing.subtotal, pbViewing.discount, pbViewing.discountType))}</span>
                </div>
                <div className="flex justify-between font-bold text-sm border-t border-slate-300 pt-1 mt-1 font-sans">
                  <span>Grand Total:</span>
                  <span>{money(pbViewing.grandTotal)}</span>
                </div>
              </div>
            </div>

            {/* Export Copies Selection */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 text-xs">Select Copies to Export / Print:</span>
                <div className="flex gap-1.5 text-[11px]">
                  <button
                    onClick={() => setPbExportCopies({ 'Original For Recipient': true, 'Duplicate For Transporter': true, 'Triplicate For Supplier': true, 'Extra Copy': true })}
                    className="px-2 py-0.5 bg-indigo-50 text-indigo-700 font-bold rounded hover:bg-indigo-100"
                  >
                    All 4 Copies
                  </button>
                  <button
                    onClick={() => setPbExportCopies({ 'Original For Recipient': true, 'Duplicate For Transporter': false, 'Triplicate For Supplier': false, 'Extra Copy': false })}
                    className="px-2 py-0.5 bg-slate-200 text-slate-800 font-bold rounded hover:bg-slate-300"
                  >
                    Original Only
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                {[
                  'Original For Recipient',
                  'Duplicate For Transporter',
                  'Triplicate For Supplier',
                  'Extra Copy'
                ].map((copyTag) => (
                  <label key={copyTag} className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!pbExportCopies[copyTag]}
                      onChange={(e) => setPbExportCopies((prev) => ({ ...prev, [copyTag]: e.target.checked }))}
                      className="rounded accent-indigo-600"
                    />
                    <span>{copyTag}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-2">
              <button className="btn-secondary" onClick={() => setPbViewing(null)}>
                Close
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const sel = Object.keys(pbExportCopies).filter((k) => pbExportCopies[k]);
                    printInvoice(pbViewing, sel, companySettings);
                  }}
                  className="btn-primary bg-indigo-600 hover:bg-indigo-700 flex items-center gap-1.5"
                >
                  <Printer className="h-4 w-4" />
                  <span>Print Selected Copies ({Object.values(pbExportCopies).filter(Boolean).length})</span>
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
