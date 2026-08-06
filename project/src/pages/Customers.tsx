import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, FileText, Trash2, Edit2, Eye, Users, AlertTriangle } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';
import { useStore } from '@/store/AppStore';
import { money } from '@/utils/analytics';
import type { Customer } from '@/lib/types';

const empty: Customer = { id: '', name: '', businessName: '', phone: '', gstin: '', email: '', address: '', state: '', stateCode: '', notes: '' };

export default function Customers() {
  const { customers, sales, addCustomer, updateCustomer, deleteCustomer } = useStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<Customer>(empty);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);

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
    const q = search.toLowerCase();
    return enriched.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q) || c.gstin.toLowerCase().includes(q),
    );
  }, [enriched, search]);

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

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Customers"
        subtitle="Manage customer accounts, track outstanding balances, and view purchase history."
        actions={
          <button className="btn-primary" onClick={openAdd}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Customer</span>
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <div className="card p-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Users className="h-5 w-5" />
          </div>
          <p className="mt-4 text-2xl font-bold text-slate-900">{customers.length}</p>
          <p className="mt-1 text-sm text-slate-500">Total Customers</p>
        </div>
        <div className="card p-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
            <FileText className="h-5 w-5" />
          </div>
          <p className="mt-4 text-2xl font-bold text-slate-900">{enriched.reduce((s, c) => s + c.saleCount, 0)}</p>
          <p className="mt-1 text-sm text-slate-500">Total Orders</p>
        </div>
        <div className="card p-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-warn-50 text-warn-600">
            <FileText className="h-5 w-5" />
          </div>
          <p className="mt-4 text-2xl font-bold text-slate-900">
            {money(enriched.reduce((s, c) => s + c.outstanding, 0))}
          </p>
          <p className="mt-1 text-sm text-slate-500">Outstanding Amount</p>
        </div>
        <div className="card p-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <FileText className="h-5 w-5" />
          </div>
          <p className="mt-4 text-2xl font-bold text-slate-900">
            {money(enriched.reduce((s, c) => s + c.totalPurchases, 0))}
          </p>
          <p className="mt-1 text-sm text-slate-500">Lifetime Revenue</p>
        </div>
      </div>

      <div className="sticky top-[8.5rem] z-10 mt-4 -mx-4 px-4 py-3 bg-slate-50/90 backdrop-blur-md rounded-lg lg:-mx-8 lg:px-8">
        <div className="card p-3">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, phone, or GSTIN…"
              className="input pl-10"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="table-th">Customer Name</th>
                <th className="table-th">Phone</th>
                <th className="table-th">GSTIN</th>
                <th className="table-th text-right">Total Purchases</th>
                <th className="table-th text-right">Outstanding</th>
                <th className="table-th">Last Purchase</th>
                <th className="table-th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((c) => (
                <tr key={c.id} className="cursor-pointer transition hover:bg-slate-50/50" onClick={() => navigate(`/customers/${c.id}`)}>
                  <td className="table-td font-semibold text-slate-800">{c.name}</td>
                  <td className="table-td text-slate-600">{c.phone}</td>
                  <td className="table-td text-slate-600">{c.gstin || '—'}</td>
                  <td className="table-td text-right font-semibold tabular-nums text-slate-900">{money(c.totalPurchases)}</td>
                  <td className="table-td text-right">
                    {c.outstanding > 0 ? (
                      <span className="font-semibold text-warn-600">{money(c.outstanding)}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="table-td text-slate-600">{c.lastSaleDate ?? '—'}</td>
                  <td className="table-td">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/customers/${c.id}`); }}
                        className="rounded-lg p-2 text-slate-400 transition hover:bg-brand-50 hover:text-brand-600"
                        title="View Ledger"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); openEdit(c); }}
                        className="rounded-lg p-2 text-slate-400 transition hover:bg-brand-50 hover:text-brand-600"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(c); }}
                        className="rounded-lg p-2 text-slate-400 transition hover:bg-err-50 hover:text-err-600"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-16 text-center">
              <Users className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-600">No customers found</p>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit Customer' : 'Add New Customer'}
        size="md"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setFormOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSubmit} disabled={!form.name.trim()}>
              {editing ? 'Save Changes' : 'Add Customer'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Customer Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Customer or company name"
              className="input"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+91 98250 00000"
                className="input"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">GSTIN</label>
              <input
                type="text"
                value={form.gstin}
                onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                placeholder="24ABCDE1234F1Z5"
                className="input"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Address</label>
            <textarea
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Full address"
              rows={2}
              className="input"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Payment habits, preferences, delivery instructions…"
              rows={2}
              className="input"
            />
          </div>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Customer"
        size="md"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button className="btn bg-err-600 text-white hover:bg-err-500" onClick={confirmDelete}>Delete</button>
          </>
        }
      >
        {deleteTarget && (() => {
          const txnCount = enriched.find((c) => c.id === deleteTarget.id)?.saleCount ?? 0;
          return (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Are you sure you want to delete <span className="font-semibold text-slate-900">{deleteTarget.name}</span>? This action cannot be undone.
              </p>
              {txnCount > 0 && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <div>
                    <p className="text-sm font-semibold text-amber-900">Transaction History Exists</p>
                    <p className="mt-0.5 text-xs text-amber-700">
                      This customer has <span className="font-medium">{txnCount}</span> sale record(s). Deleting them will not remove the sales, but you will lose the customer reference. Are you sure you want to continue?
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </Modal>

    </div>
  );
}
