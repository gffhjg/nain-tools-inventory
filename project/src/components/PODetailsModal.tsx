import { Printer, Truck, Calendar, User, Phone, MapPin, Hash, FileText } from 'lucide-react';
import Modal from '@/components/Modal';
import { printPurchase } from '@/components/PrintableInvoice';
import { money } from '@/utils/analytics';
import type { PurchaseRecord, CompanySettings } from '@/lib/types';

type PODetailsModalProps = {
  po: PurchaseRecord | null;
  onClose: () => void;
  companySettings?: CompanySettings | null;
};

export default function PODetailsModal({ po, onClose, companySettings }: PODetailsModalProps) {
  if (!po) return null;

  const totalUnits = po.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

  const handlePrint = () => {
    printPurchase(po, companySettings);
  };

  return (
    <Modal
      open={!!po}
      onClose={onClose}
      size="3xl"
      title={`Purchase Order Details — ${po.poNumber}`}
      subtitle={`PO Date: ${po.date} · Supplier: ${po.supplier}`}
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>PO ID: <span className="font-mono text-slate-700">{po.id}</span></span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="btn-primary text-xs px-4 py-2 flex items-center gap-2 shadow-sm hover:shadow transition font-bold"
            >
              <Printer className="h-4 w-4" /> Print / PDF PO
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
        {/* Top Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <User className="h-3.5 w-3.5 text-brand-600" /> Supplier Information
            </span>
            <p className="text-sm font-bold text-slate-900">{po.supplier}</p>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <FileText className="h-3.5 w-3.5 text-brand-600" /> PO & Status
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs pt-0.5">
              <div>
                <span className="text-slate-400 text-[10.5px] block">PO Number:</span>
                <span className="font-bold font-mono text-slate-900">{po.poNumber}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10.5px] block">Order Date:</span>
                <span className="font-semibold text-slate-800">{po.date}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10.5px] block">Payment Status:</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                  po.paymentStatus === 'Paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {po.paymentStatus || 'Pending'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 text-[10.5px] block">Fulfillment Status:</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-slate-200 text-slate-800">
                  {po.status || 'ordered'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* PO Line Items Table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
          <div className="bg-slate-100/80 px-3.5 py-2 border-b border-slate-200 flex justify-between items-center">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Procured Products & Supplies
            </span>
            <span className="text-xs font-semibold text-slate-500">
              {po.items.length} item{po.items.length !== 1 ? 's' : ''} · {totalUnits} units
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 font-bold text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 text-center w-10">#</th>
                  <th className="py-2.5 px-3 text-left">Product Name</th>
                  <th className="py-2.5 px-3 text-center">HSN</th>
                  <th className="py-2.5 px-3 text-right">Qty</th>
                  <th className="py-2.5 px-3 text-right">Cost Rate (₹)</th>
                  <th className="py-2.5 px-3 text-right">GST %</th>
                  <th className="py-2.5 px-3 text-right">Line Total (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {po.items.map((item, idx) => {
                  const baseAmt = (Number(item.cost) || 0) * (Number(item.qty) || 0);
                  const gstRate = Number(item.gstRate) || 0;
                  const lineTotal = baseAmt * (1 + gstRate / 100);

                  return (
                    <tr key={idx} className="hover:bg-slate-50/60 transition">
                      <td className="py-2.5 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{item.name}</td>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-600">{item.hsnCode || '—'}</td>
                      <td className="py-2.5 px-3 text-right font-extrabold text-slate-900 font-mono">{item.qty}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">{money(item.cost)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">{gstRate}%</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">{money(lineTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 text-xs w-full max-w-xs">
            <div className="flex justify-between font-bold text-sm text-slate-900 pt-1 border-t-2 border-slate-300">
              <span>Grand Total:</span>
              <span className="font-mono text-lg font-black text-brand-700">{money(po.grandTotal)}</span>
            </div>
            {po.notes && (
              <p className="text-[11px] text-slate-600 pt-1 border-t border-slate-200">
                <span className="font-bold">Notes:</span> {po.notes}
              </p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
