import { useState, useMemo, useDeferredValue, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, FileText, Trash2, Edit2, Eye, Truck, Building2, AlertTriangle } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';
import { useStore } from '@/store/AppStore';
import { money } from '@/utils/analytics';
import type { Supplier, PurchaseRecord } from '@/lib/types';

const empty: Supplier = { id: '', name: '', contactPerson: '', phone: '', gstin: '', email: '', address: '', state: '', stateCode: '', notes: '' };

export default function Suppliers() {
  const { suppliers, purchases, addSupplier, updateSupplier, deleteSupplier } = useStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<Supplier>(empty);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);

  const purchasesBySupplier = useMemo(() => {
    const map = new Map<string, PurchaseRecord[]>();
    for (const p of purchases) {
      if (p.supplier) {
        let list = map.get(p.supplier);
        if (!list) { list = []; map.set(p.supplier, list); }
        list.push(p);
      }
    }
    return map;
  }, [purchases]);

  const enriched = useMemo(() => {
    return suppliers.map((s) => {
      const supplierPurchases = purchasesBySupplier.get(s.name) || [];
      const totalSpent = supplierPurchases.reduce((sum, p) => sum + p.grandTotal, 0);
      const outstanding = supplierPurchases
        .filter((p) => p.paymentStatus === 'Pending')
        .reduce((sum, p) => sum + p.grandTotal, 0);
      let latestDate: string | null = null;
      for (const p of supplierPurchases) {
        if (!latestDate || (p.date && p.date > latestDate)) {
          latestDate = p.date;
        }
      }
      return { ...s, totalSpent, outstanding, poCount: supplierPurchases.length, lastPurchaseDate: latestDate };
    });
  }, [suppliers, purchasesBySupplier]);

  const filtered = useMemo(() => {
    const q = deferredSearch.toLowerCase().trim();
    return enriched.filter(
      (s) => s.name.toLowerCase().includes(q) || s.phone.toLowerCase().includes(q) || s.gstin.toLowerCase().includes(q),
    );
  }, [enriched, deferredSearch]);

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedSuppliers = useMemo(() => {
    if (pageSize >= 99999) return filtered;
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const openAdd = () => {
    setEditing(null);
    setForm(empty);
    setFormOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm(s);
    setFormOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    if (editing) {
      updateSupplier(editing.id, { ...form });
    } else {
      addSupplier({ ...form, id: `s${Date.now()}` });
    }
    setFormOpen(false);
    setEditing(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteSupplier(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Suppliers"
        subtitle="Manage supplier accounts, track outstanding payments, and view purchase history."
        actions={
          <button className="btn-primary" onClick={openAdd}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Supplier</span>
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <div className="card p-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Building2 className="h-5 w-5" />
          </div>
          <p className="mt-4 text-2xl font-bold text-slate-900">{suppliers.length}</p>
          <p className="mt-1 text-sm text-slate-500">Total Suppliers</p>
        </div>
        <div className="card p-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
            <Truck className="h-5 w-5" />
          </div>
          <p className="mt-4 text-2xl font-bold text-slate-900">{enriched.reduce((s, c) => s + c.poCount, 0)}</p>
          <p className="mt-1 text-sm text-slate-500">Total Orders</p>
        </div>
        <div className="card p-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-warn-50 text-warn-600">
            <FileText className="h-5 w-5" />
          </div>
          <p className="mt-4 text-2xl font-bold text-slate-900">
            {money(enriched.reduce((s, c) => s + c.outstanding, 0))}
          </p>
          <p className="mt-1 text-sm text-slate-500">Outstanding Payments</p>
        </div>
        <div className="card p-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <FileText className="h-5 w-5" />
          </div>
          <p className="mt-4 text-2xl font-bold text-slate-900">
            {money(enriched.reduce((s, c) => s + c.totalSpent, 0))}
          </p>
          <p className="mt-1 text-sm text-slate-500">Lifetime Purchases</p>
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
          <table className="w-full">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="table-th">Company Name</th>
                <th className="table-th">Phone</th>
                <th className="table-th">GSTIN</th>
                <th className="table-th text-right">Total Spent</th>
                <th className="table-th text-right">Outstanding</th>
                <th className="table-th">Last Purchase</th>
                <th className="table-th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedSuppliers.map((s) => (
                <tr key={s.id} className="cursor-pointer transition hover:bg-slate-50/50" onClick={() => navigate(`/suppliers/${s.id}`)}>
                  <td className="table-td font-semibold text-slate-800">{s.name}</td>
                  <td className="table-td text-slate-600">{s.phone}</td>
                  <td className="table-td text-slate-600">{s.gstin || '—'}</td>
                  <td className="table-td text-right font-semibold tabular-nums text-slate-900">{money(s.totalSpent)}</td>
                  <td className="table-td text-right">
                    {s.outstanding > 0 ? (
                      <span className="font-semibold text-warn-600">{money(s.outstanding)}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="table-td text-slate-600">{s.lastPurchaseDate ?? '—'}</td>
                  <td className="table-td">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/suppliers/${s.id}`); }}
                        className="rounded-lg p-2 text-slate-400 transition hover:bg-brand-50 hover:text-brand-600"
                        title="View Ledger"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); openEdit(s); }}
                        className="rounded-lg p-2 text-slate-400 transition hover:bg-brand-50 hover:text-brand-600"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(s); }}
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
              <Building2 className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-600">No suppliers found</p>
            </div>
          )}
          <div className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-100 px-4 py-3 gap-3">
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <p>
                Showing{' '}
                <span className="font-semibold text-slate-700">
                  {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1}
                </span>{' '}
                to{' '}
                <span className="font-semibold text-slate-700">
                  {Math.min(filtered.length, page * pageSize)}
                </span>{' '}
                of <span className="font-semibold text-slate-700">{filtered.length}</span> suppliers
                {filtered.length !== suppliers.length && (
                  <span className="text-slate-400 ml-1">(filtered from {suppliers.length})</span>
                )}
              </p>
              <div className="flex items-center gap-1.5">
                <span>Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 shadow-xs focus:border-brand-500 focus:outline-none"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                  <option value={99999}>All</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn-secondary px-3 py-1.5 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-xs font-semibold text-slate-600 px-2">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="btn-secondary px-3 py-1.5 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Add/Edit modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit Supplier' : 'Add New Supplier'}
        size="md"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setFormOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSubmit} disabled={!form.name.trim()}>
              {editing ? 'Save Changes' : 'Add Supplier'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Company Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Supplier company name"
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
              placeholder="Supplier reliability, delivery time, preferred products…"
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
        title="Delete Supplier"
        size="md"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button className="btn bg-err-600 text-white hover:bg-err-500" onClick={confirmDelete}>Delete</button>
          </>
        }
      >
        {deleteTarget && (() => {
          const txnCount = enriched.find((c) => c.id === deleteTarget.id)?.poCount ?? 0;
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
                      This supplier has <span className="font-medium">{txnCount}</span> purchase order(s). Deleting them will not remove the purchases, but you will lose the supplier reference. Are you sure you want to continue?
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
