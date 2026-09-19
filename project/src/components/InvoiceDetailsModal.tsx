import { useState, useEffect, useMemo } from 'react';
import {
  Printer,
  X,
  Calendar,
  User,
  Phone,
  MapPin,
  Hash,
  CreditCard,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Truck,
  RefreshCw,
  PackageCheck,
  Clock,
  ShoppingCart,
} from 'lucide-react';
import Modal from '@/components/Modal';
import StatusBadge from '@/components/StatusBadge';
import { printInvoice } from '@/components/PrintableInvoice';
import { money, nextInvoice, formatRelativeDate, getDaysAgo } from '@/utils/analytics';
import { computeDiscountAmount } from '@/lib/constants';
import { useStore } from '@/store/AppStore';
import type { SaleRecord, CompanySettings } from '@/lib/types';

type InvoiceDetailsModalProps = {
  sale: SaleRecord | null;
  onClose: () => void;
  companySettings?: CompanySettings | null;
};

export default function InvoiceDetailsModal({ sale, onClose, companySettings }: InvoiceDetailsModalProps) {
  if (!sale) return null;

  const { sales, updateSale, updateSaleDocumentType } = useStore();
  const [currentSale, setCurrentSale] = useState<SaleRecord>(sale);
  const [convertModalOpen, setConvertModalOpen] = useState(false);
  const [customInvoiceNumber, setCustomInvoiceNumber] = useState('');
  const [isConverting, setIsConverting] = useState(false);
  const [isUpdatingDate, setIsUpdatingDate] = useState(false);

  const handleUpdateDateToToday = async () => {
    const today = new Date().toISOString().slice(0, 10);
    setIsUpdatingDate(true);
    try {
      const updated = { ...currentSale, date: today };
      await updateSale(updated);
      setCurrentSale(updated);
    } catch (err) {
      alert(`Failed to update date: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsUpdatingDate(false);
    }
  };

  useEffect(() => {
    setCurrentSale(sale);
  }, [sale]);

  const isPi = currentSale.documentType === 'PROFORMA INVOICE' || currentSale.invoice.startsWith('PI-') || Boolean(currentSale.convertedFromPiNumber);
  const isPo = currentSale.documentType === 'PURCHASE ORDER' || currentSale.invoice.startsWith('PO-') || currentSale.invoice.startsWith('CPO-') || Boolean(currentSale.convertedFromPoNumber);
  const isConverted = Boolean(currentSale.convertedFromPiNumber || currentSale.convertedFromPoNumber);
  const canConvert = (isPi || isPo) && !isConverted;

  const suggestedInvoiceNo = useMemo(() => nextInvoice(sales), [sales]);
  const invoiceNoToUse = customInvoiceNumber.trim() || suggestedInvoiceNo;

  const handleConfirmConvert = async () => {
    if (!invoiceNoToUse.trim()) return;
    setIsConverting(true);
    try {
      const origDocNo = currentSale.invoice;
      await updateSaleDocumentType(currentSale.id, 'TAX INVOICE', invoiceNoToUse.trim(), origDocNo, isPo);
      try {
        localStorage.setItem('nain_last_entered_invoice_no', invoiceNoToUse.trim());
      } catch {}
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      setCurrentSale((prev) => ({
        ...prev,
        documentType: 'TAX INVOICE',
        invoice: invoiceNoToUse.trim(),
        status: 'pending',
        date: today,
        convertedAt: today,
        ...(isPo ? { convertedFromPoNumber: origDocNo } : { convertedFromPiNumber: origDocNo }),
      }));
      setConvertModalOpen(false);
    } catch (err) {
      alert(`Conversion failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsConverting(false);
    }
  };

  const totalUnits = currentSale.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  const balanceDue = Math.max(0, currentSale.grandTotal - (Number(currentSale.amountPaid) || 0));
  const isFullyPaid = balanceDue <= 0.01;

  const handlePrint = () => {
    printInvoice(currentSale, undefined, companySettings);
  };

  const modalTitle = isPi
    ? `Proforma Invoice Details — ${currentSale.invoice}`
    : isPo
    ? `Company Purchase Order Details — ${currentSale.invoice}`
    : `Invoice Details — ${currentSale.invoice}`;

  return (
    <>
      <Modal
        open={!!sale}
        onClose={onClose}
        size="3xl"
        title={modalTitle}
        subtitle={`Transaction Date: ${currentSale.date} · Type: ${currentSale.documentType || 'TAX INVOICE'}`}
        footer={
          <div className="flex items-center justify-between w-full gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Invoice ID: <span className="font-mono text-slate-700">{currentSale.id}</span></span>
            </div>
            <div className="flex items-center gap-2">
              {canConvert && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomInvoiceNumber(suggestedInvoiceNo);
                    setConvertModalOpen(true);
                  }}
                  className="btn-primary bg-emerald-600 hover:bg-emerald-700 border-emerald-700 text-xs px-3.5 py-2 flex items-center gap-1.5 font-bold shadow-sm text-white"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>⚡ Convert to Tax Invoice</span>
                </button>
              )}
              <button
                onClick={handlePrint}
                className="btn-primary text-xs px-4 py-2 flex items-center gap-2 shadow-sm hover:shadow transition font-bold"
              >
                <Printer className="h-4 w-4" /> Print / PDF Invoice
              </button>
              <button
                onClick={onClose}
                className="btn-secondary text-xs px-4 py-2"
              >
                Close
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Prominent Conversion Banner */}
          {canConvert && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 border-2 border-emerald-300 shadow-sm">
              <div>
                <span className="font-bold text-xs text-emerald-950 flex items-center gap-1.5">
                  <PackageCheck className="w-4 h-4 text-emerald-600" />
                  {isPo ? 'Ready to Dispatch Goods?' : 'Ready to Bill Client?'}
                </span>
                <p className="text-[11px] text-emerald-800 mt-0.5">
                  Click &ldquo;Convert to Tax Invoice&rdquo; to deduct items from inventory stock and issue the official GST Tax Invoice.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCustomInvoiceNumber(suggestedInvoiceNo);
                  setConvertModalOpen(true);
                }}
                className="btn-primary bg-emerald-600 hover:bg-emerald-700 border-emerald-700 text-xs px-4 py-2 flex items-center gap-1.5 font-bold shadow-md shrink-0 text-white"
              >
                <RefreshCw className="w-4 h-4" />
                <span>⚡ Convert to Tax Invoice</span>
              </button>
            </div>
          )}

          {currentSale.convertedFromPiNumber && (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between font-bold shadow-xs">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Converted from Proforma Quote #{currentSale.convertedFromPiNumber}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-200/80 text-emerald-900 font-extrabold">
                Stock Deducted
              </span>
            </div>
          )}

          {currentSale.convertedFromPoNumber && (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between font-bold shadow-xs">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Converted from Company PO #{currentSale.convertedFromPoNumber}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-200/80 text-emerald-900 font-extrabold">
                Stock Deducted
              </span>
            </div>
          )}

          {/* Purchase & Fulfillment Lifecycle Stepper */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-brand-50/70 via-slate-50 to-emerald-50/50 border border-slate-200/90 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5">
              <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-brand-600" />
                Purchase & Order Lifecycle Tracker
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10.5px] font-bold text-brand-700 bg-brand-100/80 border border-brand-200 px-2.5 py-0.5 rounded-full">
                  Purchased {formatRelativeDate(currentSale.date)} ({currentSale.date})
                </span>
                {currentSale.date !== new Date().toISOString().slice(0, 10) && (
                  <button
                    type="button"
                    disabled={isUpdatingDate}
                    onClick={handleUpdateDateToToday}
                    className="text-[10.5px] font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 px-2.5 py-0.5 rounded-full transition shadow-xs flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    title={`If this was sold today, click to update its date to Today (${new Date().toISOString().slice(0, 10)})`}
                  >
                    <span>⚡ Move Date to Today</span>
                  </button>
                )}
              </div>
            </div>

            <div className="relative pt-1 pb-1">
              {/* Connected progress bar */}
              <div className="absolute top-5 left-8 right-8 h-1 bg-slate-200 rounded-full z-0">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{
                    width:
                      currentSale.status === 'paid'
                        ? '100%'
                        : currentSale.status === 'partially-paid'
                        ? '75%'
                        : '50%',
                  }}
                />
              </div>

              <div className="grid grid-cols-4 gap-2 relative z-10 text-center">
                {/* Step 1: Order / Purchase Placed */}
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-xs ring-4 ring-white">
                    <ShoppingCart className="w-4 h-4" />
                  </div>
                  <span className="mt-1.5 text-[11px] font-extrabold text-slate-800">Purchased</span>
                  <span className="text-[10px] text-slate-600 font-mono font-semibold">{currentSale.date}</span>
                  <span className="text-[9.5px] text-emerald-700 font-bold">{formatRelativeDate(currentSale.date)}</span>
                </div>

                {/* Step 2: Invoice Issued */}
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-xs ring-4 ring-white">
                    <FileText className="w-4 h-4" />
                  </div>
                  <span className="mt-1.5 text-[11px] font-extrabold text-slate-800">Invoiced</span>
                  <span className="text-[10px] text-brand-600 font-mono font-bold">{currentSale.invoice}</span>
                  <span className="text-[9.5px] text-slate-500 font-semibold">{currentSale.documentType || 'Tax Invoice'}</span>
                </div>

                {/* Step 3: Payment Status */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shadow-xs ring-4 ring-white ${
                      currentSale.status === 'paid'
                        ? 'bg-emerald-600 text-white'
                        : currentSale.status === 'partially-paid'
                        ? 'bg-blue-600 text-white'
                        : 'bg-amber-500 text-white'
                    }`}
                  >
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <span className="mt-1.5 text-[11px] font-extrabold text-slate-800">Payment</span>
                  <span className="text-[10px] font-bold text-slate-700">{currentSale.paymentMethod || 'Cash'}</span>
                  <span
                    className={`text-[9.5px] font-extrabold ${
                      currentSale.status === 'paid'
                        ? 'text-emerald-700'
                        : currentSale.status === 'partially-paid'
                        ? 'text-blue-700'
                        : 'text-amber-700'
                    }`}
                  >
                    {currentSale.status === 'paid'
                      ? 'Fully Paid'
                      : currentSale.status === 'partially-paid'
                      ? `Paid ${money(currentSale.amountPaid || 0)}`
                      : currentSale.dueDate
                      ? `Due ${currentSale.dueDate}`
                      : 'Pending'}
                  </span>
                </div>

                {/* Step 4: Fulfillment / Stock */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shadow-xs ring-4 ring-white ${
                      isPi && !isConverted ? 'bg-purple-600 text-white' : 'bg-emerald-600 text-white'
                    }`}
                  >
                    <Truck className="w-4 h-4" />
                  </div>
                  <span className="mt-1.5 text-[11px] font-extrabold text-slate-800">Fulfillment</span>
                  <span className="text-[10px] text-slate-600 font-bold">{totalUnits} units</span>
                  <span className="text-[9.5px] text-slate-500 font-semibold">
                    {isPi && !isConverted ? 'Quote Active' : 'Stock Dispatched'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Top Info Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Customer Details Box */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5">
              <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <User className="h-3.5 w-3.5 text-brand-600" /> Customer Information
              </span>
              {sale.customerGstin && (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-200/80 text-slate-800">
                  GSTIN: {sale.customerGstin}
                </span>
              )}
            </div>
            <p className="text-sm font-bold text-slate-900">{sale.customer}</p>
            <div className="text-xs text-slate-600 space-y-0.5">
              {sale.phone && (
                <p className="flex items-center gap-1.5">
                  <Phone className="h-3 w-3 text-slate-400" /> {sale.phone}
                </p>
              )}
              {(sale.customerAddress || sale.customerState) && (
                <p className="flex items-start gap-1.5">
                  <MapPin className="h-3 w-3 text-slate-400 mt-0.5 shrink-0" />
                  <span>{[sale.customerAddress, sale.customerState].filter(Boolean).join(', ')}</span>
                </p>
              )}
            </div>
          </div>

          {/* Invoice Meta Box */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <FileText className="h-3.5 w-3.5 text-brand-600" /> Voucher & Payment Summary
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs pt-0.5">
              <div>
                <span className="text-slate-400 text-[10.5px] block">Voucher No:</span>
                <span className="font-bold font-mono text-slate-900">{sale.invoice}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10.5px] block">Billing Date:</span>
                <span className="font-semibold text-slate-800">{sale.date}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10.5px] block">Payment Method:</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-slate-200 text-slate-800">
                  {sale.paymentMethod || 'Credit / Pay Later'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 text-[10.5px] block">Invoice Status:</span>
                <StatusBadge status={sale.status} />
              </div>
            </div>
            {sale.convertedFromPiNumber && (
              <div className="mt-1 text-[11px] font-semibold text-purple-700 bg-purple-50 px-2 py-1 rounded border border-purple-200">
                Converted from Proforma: <span className="font-mono font-bold">{sale.convertedFromPiNumber}</span>
              </div>
            )}
          </div>
        </div>

        {/* 4 Financial Highlight Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-3 rounded-xl bg-slate-100/70 border border-slate-200">
            <span className="text-[10.5px] font-bold text-slate-500 uppercase block">Items & Qty</span>
            <p className="text-base font-extrabold text-slate-900 mt-0.5">
              {sale.items.length} <span className="text-xs font-semibold text-slate-500">items</span> · {totalUnits} <span className="text-xs font-semibold text-slate-500">units</span>
            </p>
          </div>
          <div className="p-3 rounded-xl bg-slate-100/70 border border-slate-200">
            <span className="text-[10.5px] font-bold text-slate-500 uppercase block">Subtotal</span>
            <p className="text-base font-extrabold text-slate-900 mt-0.5">{money(sale.subtotal)}</p>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200">
            <span className="text-[10.5px] font-bold text-emerald-700 uppercase block">Total Paid</span>
            <p className="text-base font-extrabold text-emerald-700 mt-0.5">{money(sale.amountPaid)}</p>
          </div>
          <div className={`p-3 rounded-xl border ${isFullyPaid ? 'bg-emerald-50/70 border-emerald-200' : 'bg-amber-50/70 border-amber-200'}`}>
            <span className={`text-[10.5px] font-bold uppercase block ${isFullyPaid ? 'text-emerald-700' : 'text-amber-700'}`}>
              {isFullyPaid ? 'Status: Settled' : 'Balance Due'}
            </span>
            <p className={`text-base font-black mt-0.5 ${isFullyPaid ? 'text-emerald-700' : 'text-amber-700'}`}>
              {isFullyPaid ? '₹0.00 (Fully Paid)' : money(balanceDue)}
            </p>
          </div>
        </div>

        {/* Purchased Items Table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
          <div className="bg-slate-100/80 px-3.5 py-2 border-b border-slate-200 flex justify-between items-center">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Exact Items Purchased on {sale.date}
            </span>
            <span className="text-xs font-semibold text-slate-500">
              {sale.items.length} line item{sale.items.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 font-bold text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 text-center w-10">#</th>
                  <th className="py-2.5 px-3 text-left">Product Name & Specifications</th>
                  <th className="py-2.5 px-3 text-center w-24">HSN Code</th>
                  <th className="py-2.5 px-3 text-right w-20">Quantity</th>
                  <th className="py-2.5 px-3 text-right w-24">Unit Rate (₹)</th>
                  <th className="py-2.5 px-3 text-right w-20">Discount</th>
                  <th className="py-2.5 px-3 text-right w-28">Line Total (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {sale.items.map((item, idx) => {
                  const baseAmount = (Number(item.price) || 0) * (Number(item.qty) || 0);
                  const discountAmt = computeDiscountAmount(baseAmount, item.discount || 0, item.discountType || 'amount');
                  const finalLineTotal = Math.max(0, baseAmount - discountAmt);

                  return (
                    <tr key={idx} className="hover:bg-slate-50/60 transition">
                      <td className="py-2.5 px-3 text-center text-slate-400 font-mono font-medium">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 text-slate-900 font-medium">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold">{item.name}</span>
                          {item.isCustom && (
                            <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              Custom
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-600">
                        {item.hsnCode || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-extrabold text-slate-900 font-mono">
                        {item.qty}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-700">
                        {money(item.price)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                        {item.discount && item.discount > 0 ? (
                          <span className="text-amber-600 font-medium">
                            -{item.discount}{item.discountType === 'percent' ? '%' : '₹'}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        {money(finalLineTotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Calculation & Financial Totals Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left Column: Additional Info & Cheque details */}
          <div className="space-y-2.5 text-xs">
            {sale.notes && (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="font-bold text-slate-600 block mb-0.5">Notes / Terms:</span>
                <p className="text-slate-700 whitespace-pre-wrap">{sale.notes}</p>
              </div>
            )}

            {sale.paymentMethod === 'Cheque' && sale.chequeNo && (
              <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200 space-y-1">
                <span className="font-bold text-blue-900 block">Cheque Payment Information</span>
                <div className="grid grid-cols-2 gap-1 text-[11px] text-blue-800">
                  <div>Cheque No: <span className="font-mono font-bold">{sale.chequeNo}</span></div>
                  <div>Bank: <span className="font-semibold">{sale.chequeBank || '—'}</span></div>
                  <div>Claim Date: <span className="font-semibold">{sale.chequeDate || '—'}</span></div>
                  <div>Status: <span className="font-bold uppercase">{sale.chequeStatus || 'Pending'}</span></div>
                </div>
              </div>
            )}

            {(sale.transportMode || sale.vehicleNumber || sale.ewayBill) && (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="font-bold text-slate-700 flex items-center gap-1">
                  <Truck className="h-3.5 w-3.5 text-slate-500" /> Dispatch / Transport Details
                </span>
                <div className="grid grid-cols-3 gap-1 text-[11px] text-slate-600">
                  <div>Mode: <span className="font-medium text-slate-900">{sale.transportMode || '—'}</span></div>
                  <div>Vehicle: <span className="font-medium text-slate-900">{sale.vehicleNumber || '—'}</span></div>
                  <div>E-Way Bill: <span className="font-medium text-slate-900">{sale.ewayBill || '—'}</span></div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Financial Calculation Card */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal (Items Total):</span>
              <span className="font-mono font-semibold text-slate-900">{money(currentSale.subtotal)}</span>
            </div>

            {currentSale.discount > 0 && (
              <div className="flex justify-between text-amber-700 font-medium">
                <span>Overall Discount ({currentSale.discount}{currentSale.discountType === 'percent' ? '%' : '₹'}):</span>
                <span className="font-mono">
                  -{money(computeDiscountAmount(currentSale.subtotal, currentSale.discount, currentSale.discountType))}
                </span>
              </div>
            )}

            {currentSale.freightCharges && currentSale.freightCharges > 0 ? (
              <div className="flex justify-between text-slate-600">
                <span>Freight / Delivery Charges:</span>
                <span className="font-mono font-semibold text-slate-900">+{money(currentSale.freightCharges)}</span>
              </div>
            ) : null}

            {currentSale.gstAmount > 0 ? (
              <div className="space-y-1 pt-1 border-t border-slate-200/60">
                {currentSale.gstType === 'igst' ? (
                  <div className="flex justify-between text-slate-600">
                    <span>IGST ({currentSale.gstRate}%):</span>
                    <span className="font-mono font-semibold text-slate-900">{money(currentSale.igstAmount || currentSale.gstAmount)}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between text-slate-600">
                      <span>CGST ({currentSale.gstRate / 2}%):</span>
                      <span className="font-mono font-semibold text-slate-900">{money(currentSale.cgstAmount || currentSale.gstAmount / 2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>SGST ({currentSale.gstRate / 2}%):</span>
                      <span className="font-mono font-semibold text-slate-900">{money(currentSale.sgstAmount || currentSale.gstAmount / 2)}</span>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="flex justify-between text-slate-500 italic">
                <span>GST Tax:</span>
                <span>Exempt / Zero Rated (0%)</span>
              </div>
            )}

            <div className="flex justify-between items-center pt-2 border-t-2 border-slate-300 font-bold text-sm text-slate-900">
              <span className="text-base">Grand Total:</span>
              <span className="font-mono text-lg font-black text-brand-700">{money(currentSale.grandTotal)}</span>
            </div>

            <div className="flex justify-between text-emerald-700 font-semibold pt-1 border-t border-slate-200">
              <span>Amount Paid:</span>
              <span className="font-mono">{money(currentSale.amountPaid)}</span>
            </div>

            <div className={`flex justify-between font-bold pt-1 ${balanceDue > 0 ? 'text-amber-700' : 'text-slate-600'}`}>
              <span>Balance Due / Outstanding:</span>
              <span className="font-mono">{money(balanceDue)}</span>
            </div>
          </div>
        </div>
      </div>
    </Modal>

    {/* Confirmation Modal to Convert to Tax Invoice */}
    {convertModalOpen && (
      <Modal
        open={convertModalOpen}
        onClose={() => setConvertModalOpen(false)}
        size="md"
        title={isPo ? 'Convert Company PO to Tax Invoice' : 'Convert Proforma Invoice to Tax Invoice'}
      >
        <div className="space-y-4 text-xs font-sans">
          <p className="text-slate-600">
            You are converting {isPo ? 'Company Purchase Order' : 'Proforma Invoice'}{' '}
            <strong className={isPo ? 'text-blue-700 font-mono' : 'text-purple-700 font-mono'}>
              {currentSale.invoice}
            </strong>{' '}
            for <strong>{currentSale.customer}</strong> into an official Tax Invoice.
          </p>

          <div className="p-3 bg-purple-50/80 rounded-xl border border-purple-200 text-purple-900 text-xs">
            <span className="font-bold flex items-center gap-1.5 mb-1">
              <PackageCheck className="w-4 h-4 text-purple-600" />
              Inventory Stock Movement
            </span>
            <p>
              Upon conversion to Tax Invoice, items on this {isPo ? 'Purchase Order' : 'Proforma Quote'} will be{' '}
              <strong>deducted from inventory stock</strong> and recorded in your sales ledger.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              New Tax Invoice Number *
            </label>
            <input
              type="text"
              value={customInvoiceNumber}
              onChange={(e) => setCustomInvoiceNumber(e.target.value)}
              placeholder="e.g. INV-2042"
              className="input font-mono font-bold text-brand-600 w-full"
              autoFocus
            />
            <p className="text-[11px] text-slate-400 mt-1">You can customize the invoice number if needed.</p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setConvertModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary bg-emerald-600 hover:bg-emerald-700 border-emerald-700 font-bold flex items-center gap-1.5"
              onClick={handleConfirmConvert}
              disabled={isConverting || !invoiceNoToUse.trim()}
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{isConverting ? 'Converting...' : 'Confirm Conversion'}</span>
            </button>
          </div>
        </div>
      </Modal>
    )}
  </>
  );
}
