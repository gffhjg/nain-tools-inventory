import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, FileText, Trash2, Edit2, Eye, Users, AlertTriangle, MessageCircle, DollarSign, CheckCircle2, IndianRupee, Landmark } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';
import { useStore } from '@/store/AppStore';
import { money } from '@/utils/analytics';
import type { Customer, SaleStatus, PaymentMethod, ChequeRecord } from '@/lib/types';

const empty: Customer = { id: '', name: '', businessName: '', phone: '', gstin: '', email: '', address: '', state: '', stateCode: '', notes: '' };

export default function Customers() {
  const { customers, sales, addCustomer, updateCustomer, deleteCustomer, updateSaleStatus, updateSale, addCheque, cheques } = useStore();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [filterOutstanding, setFilterOutstanding] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<Customer>(empty);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);

  // Quick Payment Modal state
  const [payTarget, setPayTarget] = useState<{ customer: Customer; pendingInvoices: typeof sales } | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [isFullPayment, setIsFullPayment] = useState<boolean>(true);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('Cash');
  const [payChequeNo, setPayChequeNo] = useState('');
  const [payChequeBank, setPayChequeBank] = useState('');
  const [payChequeDate, setPayChequeDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [filterTab, setFilterTab] = useState<'all' | 'overdue' | 'clear'>('all');

  const enriched = useMemo(() => {
    return customers.map((c) => {
      const customerSales = sales.filter((s) => s.customer === c.name);
      const totalPurchases = customerSales.reduce((s, r) => s + r.grandTotal, 0);
      const outstanding = customerSales
        .filter((s) => s.status !== 'paid' && s.status !== 'cancelled' && s.status !== 'draft')
        .reduce((s, r) => s + (r.grandTotal - r.amountPaid), 0);
      const lastSale = customerSales.length > 0
        ? customerSales.sort((a, b) => b.date.localeCompare(a.date))[0]
        : null;
      return { ...c, totalPurchases, outstanding, saleCount: customerSales.length, lastSaleDate: lastSale?.date ?? null };
    });
  }, [customers, sales]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return enriched.filter((c) => {
      if (filterTab === 'overdue' && c.outstanding <= 0) return false;
      if (filterTab === 'clear' && (c.outstanding > 0 || c.saleCount === 0)) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q) || c.gstin.toLowerCase().includes(q);
    });
  }, [enriched, search, filterTab]);

  const totalOutstandingAll = useMemo(
    () => enriched.reduce((acc, c) => acc + c.outstanding, 0),
    [enriched]
  );

  const openAdd = () => {
    setEditing(null);
    setForm(empty);
    setFormOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm(c);
    setFormOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    if (editing) {
      updateCustomer(editing.id, { ...form });
    } else {
      addCustomer({ ...form, id: `c${Date.now()}` });
    }
    setFormOpen(false);
    setEditing(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteCustomer(deleteTarget.id);
    setDeleteTarget(null);
  };

  const openQuickPayment = (c: Customer) => {
    const pending = sales.filter((s) => s.customer === c.name && s.status !== 'paid' && s.status !== 'cancelled' && s.status !== 'draft');
    if (!pending.length) {
      alert('This customer has no pending unpaid invoices.');
      return;
    }
    setPayTarget({ customer: c, pendingInvoices: pending });
    setSelectedInvoiceId(pending[0].id);
    const due = pending[0].grandTotal - (pending[0].amountPaid || 0);
    setPaymentAmount(due);
    setIsFullPayment(true);
    setPayMethod('Cash');
    setPayChequeNo('');
    setPayChequeBank('');
    setPayChequeDate(new Date().toISOString().slice(0, 10));
  };

  const handleRecordPayment = async () => {
    if (!payTarget || !selectedInvoiceId) return;
    const inv = payTarget.pendingInvoices.find((s) => s.id === selectedInvoiceId);
    if (!inv) return;

    const currentPaid = inv.amountPaid || 0;
    const newTotalPaid = currentPaid + paymentAmount;
    let newStatus: SaleStatus = 'partially-paid';
    if (newTotalPaid >= inv.grandTotal) {
      newStatus = 'paid';
    }

    if (payMethod === 'Cheque' && payChequeNo.trim()) {
      const chequeRec: ChequeRecord = {
        id: `chq_cust_${Date.now()}`,
        saleId: inv.id,
        customerId: inv.customerId || payTarget.customer.id,
        customerName: payTarget.customer.name,
        invoiceNumber: inv.invoice,
        chequeNumber: payChequeNo.trim(),
        bankName: payChequeBank.trim() || 'Bank Cheque',
        chequeDate: payChequeDate || new Date().toISOString().slice(0, 10),
        amount: paymentAmount,
        status: 'pending_clearance',
        notes: `Recorded against Invoice #${inv.invoice}`,
      };
      await addCheque(chequeRec);
    }

    const updatedSale = {
      ...inv,
      amountPaid: newTotalPaid,
      status: newStatus,
      paymentMethod: payMethod,
      chequeNo: payMethod === 'Cheque' ? payChequeNo.trim() : inv.chequeNo,
      chequeBank: payMethod === 'Cheque' ? payChequeBank.trim() : inv.chequeBank,
      chequeDate: payMethod === 'Cheque' ? payChequeDate : inv.chequeDate,
      chequeStatus: payMethod === 'Cheque' ? 'pending_clearance' : inv.chequeStatus,
    };
    await updateSale(updatedSale);
    setPayTarget(null);
  };

  const getWhatsAppLink = (phone: string, name: string, outstanding: number) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const msg = `Hello ${name}, your outstanding payment balance with Nain Tools & Bolt Co. is ${money(outstanding)}. Kindly remit payment at your earliest convenience. Thank you!`;
    return `https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`;
  };

  return (
    <div className="animate-fade-in space-y-6 pb-12">
      <PageHeader
        title="Customers"
        subtitle="Manage customer profiles, track receivables, send payment reminders, and record collections."
        actions={
          <button className="btn-primary" onClick={openAdd}>
            <Plus className="h-4 w-4" />
            <span>Add Customer</span>
          </button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <div
          className={`card p-5 cursor-pointer transition-all duration-200 ${
            filterTab === 'all'
              ? 'ring-2 ring-brand-500/80 bg-brand-50/20 border-brand-300 shadow-md'
              : 'hover:border-slate-300 hover:shadow-md'
          }`}
          onClick={() => setFilterTab('all')}
        >
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 font-bold">
              <Users className="h-5 w-5" />
            </div>
            <span className="text-[10.5px] font-extrabold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-md">
              All Profiles
            </span>
          </div>
          <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">{customers.length}</p>
          <p className="mt-1 text-xs text-slate-500 font-semibold">Registered Customers</p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 font-bold">
              <FileText className="h-5 w-5" />
            </div>
            <span className="text-[10.5px] font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
              Order Volume
            </span>
          </div>
          <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">{enriched.reduce((s, c) => s + c.saleCount, 0)}</p>
          <p className="mt-1 text-xs text-slate-500 font-semibold">Total Orders Placed</p>
        </div>

        <div
          className={`card p-5 cursor-pointer transition-all duration-200 ${
            filterTab === 'overdue'
              ? 'ring-2 ring-amber-500/80 bg-amber-50/20 border-amber-300 shadow-md'
              : 'hover:border-slate-300 hover:shadow-md'
          }`}
          onClick={() => setFilterTab('overdue')}
        >
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 font-bold">
              <IndianRupee className="h-5 w-5" />
            </div>
            <span className="text-[10.5px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
              Filter Overdue
            </span>
          </div>
          <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">{money(totalOutstandingAll)}</p>
          <p className="mt-1 text-xs text-amber-600 font-semibold">Overdue Receivables</p>
        </div>

        <div
          className={`card p-5 cursor-pointer transition-all duration-200 ${
            filterTab === 'clear'
              ? 'ring-2 ring-emerald-500/80 bg-emerald-50/20 border-emerald-300 shadow-md'
              : 'hover:border-slate-300 hover:shadow-md'
          }`}
          onClick={() => setFilterTab('clear')}
        >
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 font-bold">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <span className="text-[10.5px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
              Clean Accounts
            </span>
          </div>
          <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">
            {enriched.filter((c) => c.outstanding === 0 && c.saleCount > 0).length}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-semibold">Zero Balance Accounts</p>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customers by name, phone, GSTIN..."
              className="input pl-9"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              onClick={() => setFilterTab('all')}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
                filterTab === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Customers ({customers.length})
            </button>
            <button
              onClick={() => setFilterTab('overdue')}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1 ${
                filterTab === 'overdue' ? 'bg-amber-600 text-white shadow-sm' : 'text-amber-700 hover:bg-amber-50'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Overdue ({enriched.filter((c) => c.outstanding > 0).length})
            </button>
            <button
              onClick={() => setFilterTab('clear')}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1 ${
                filterTab === 'clear' ? 'bg-emerald-600 text-white shadow-sm' : 'text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Clean ({enriched.filter((c) => c.outstanding === 0 && c.saleCount > 0).length})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 font-bold text-slate-600">Customer</th>
                <th className="px-4 py-3 font-bold text-slate-600">Phone</th>
                <th className="px-4 py-3 font-bold text-slate-600">GSTIN</th>
                <th className="px-4 py-3 font-bold text-slate-600">Orders</th>
                <th className="px-4 py-3 font-bold text-slate-600">Total Revenue</th>
                <th className="px-4 py-3 font-bold text-slate-600">Outstanding</th>
                <th className="px-4 py-3 font-bold text-slate-600 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-sm text-slate-400">
                    No customers found matching your search.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">{c.name}</p>
                      {c.businessName && <p className="text-[11px] text-slate-500">{c.businessName}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-700 font-mono">{c.phone || '—'}</td>
                    <td className="px-4 py-3 text-slate-700 font-mono">{c.gstin || '—'}</td>
                    <td className="px-4 py-3 text-slate-700 font-bold">{c.saleCount}</td>
                    <td className="px-4 py-3 font-bold text-slate-900">{money(c.totalPurchases)}</td>
                    <td className="px-4 py-3">
                      {c.outstanding > 0 ? (
                        <span className="font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">
                          {money(c.outstanding)}
                        </span>
                      ) : (
                        <span className="text-emerald-600 font-semibold">Clear (₹0)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {c.outstanding > 0 && c.phone && (
                          <a
                            href={getWhatsAppLink(c.phone, c.name, c.outstanding)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                            title="Send WhatsApp Payment Reminder"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </a>
                        )}
                        {c.outstanding > 0 && (
                          <button
                            onClick={() => openQuickPayment(c)}
                            className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition"
                            title="Record Payment Collection"
                          >
                            <DollarSign className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => navigate(`/customers/${c.id}`)}
                          className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition"
                          title="View Ledger"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openEdit(c)}
                          className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition"
                          title="Edit Customer"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(c)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition"
                          title="Delete Customer"
                        >
                          <Trash2 className="h-4 w-4" />
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

      {/* Add / Edit Customer Modal */}
      {formOpen && (
        <Modal
          title={editing ? 'Edit Customer' : 'Add New Customer'}
          onClose={() => setFormOpen(false)}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Customer Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input"
                placeholder="e.g. Ramesh Hardware Mart"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="input"
                  placeholder="10-digit mobile"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">GSTIN</label>
                <input
                  type="text"
                  value={form.gstin}
                  onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                  className="input"
                  placeholder="22AAAAA0000A1Z5"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input"
                placeholder="customer@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Billing Address</label>
              <textarea
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="input h-20 resize-none"
                placeholder="Street address, city, pin code..."
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <button className="btn-secondary" onClick={() => setFormOpen(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSubmit}>
                Save Customer
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Quick Record Payment Modal */}
      {payTarget && (
        <Modal
          title={`Record Payment — ${payTarget.customer.name}`}
          onClose={() => setPayTarget(null)}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Select Unpaid Invoice</label>
              <select
                value={selectedInvoiceId}
                onChange={(e) => {
                  const invId = e.target.value;
                  setSelectedInvoiceId(invId);
                  const inv = payTarget.pendingInvoices.find((s) => s.id === invId);
                  if (inv) {
                    setPaymentAmount(inv.grandTotal - inv.amountPaid);
                  }
                }}
                className="input"
              >
                {payTarget.pendingInvoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoice} ({inv.date}) — Due: {money(inv.grandTotal - inv.amountPaid)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Payment Amount (₹)</label>
              <input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                className="input font-bold text-emerald-700"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Payment Method</label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                {(['Cash', 'UPI', 'Bank Transfer', 'Cheque'] as PaymentMethod[]).map((pm) => (
                  <button
                    key={pm}
                    type="button"
                    onClick={() => setPayMethod(pm)}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition ${
                      payMethod === pm
                        ? 'bg-brand-600 text-white border-brand-700 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {pm}
                  </button>
                ))}
              </div>
            </div>

            {payMethod === 'Cheque' && (
              <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200 space-y-2.5">
                <span className="font-bold text-xs text-blue-950 flex items-center gap-1.5">
                  <Landmark className="w-3.5 h-3.5 text-blue-600" />
                  Cheque Details & Realisation Date
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Cheque Leaf No. *</label>
                    <input
                      type="text"
                      value={payChequeNo}
                      onChange={(e) => setPayChequeNo(e.target.value)}
                      placeholder="e.g. 004821"
                      className="input bg-white text-xs font-mono font-bold py-1.5 w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Issuing Bank *</label>
                    <input
                      type="text"
                      value={payChequeBank}
                      onChange={(e) => setPayChequeBank(e.target.value)}
                      placeholder="e.g. HDFC / SBI"
                      className="input bg-white text-xs font-semibold py-1.5 w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Claimable Date *</label>
                    <input
                      type="date"
                      value={payChequeDate}
                      onChange={(e) => setPayChequeDate(e.target.value)}
                      className="input bg-white text-xs font-bold py-1.5 w-full"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <button className="btn-secondary" onClick={() => setPayTarget(null)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleRecordPayment}>
                Confirm Collection
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <Modal title="Delete Customer" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm text-slate-600">
            Are you sure you want to delete <span className="font-bold">{deleteTarget.name}</span>? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2 mt-6">
            <button className="btn-secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </button>
            <button className="btn-danger" onClick={confirmDelete}>
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
