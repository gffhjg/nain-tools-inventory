import { useState, useMemo, useDeferredValue, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Filter, Download, Edit2, Trash2, Package, AlertTriangle, ImageOff, ClipboardCheck, History as HistoryIcon, Upload, ArrowUp, ArrowDown } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import Modal from '@/components/Modal';
import ProductForm, { type ProductFormData } from '@/components/ProductForm';
import VerificationModal from '@/components/VerificationModal';
import { productCategories } from '@/lib/constants';
import type { Product, VerificationRecord } from '@/lib/types';
import { useStore } from '@/store/AppStore';
import { downloadCSV, toCSV } from '@/utils/analytics';
import { smartSearchMatch } from '@/utils/search';

const statusFilters = ['all', 'in-stock', 'low-stock', 'out-of-stock'] as const;

type SortKey = 'name' | 'stock' | 'supplier' | 'rackNumber' | 'lastVerification' | 'reorderLevel' | 'boxStatus';
type SortDir = 'asc' | 'desc';

const boxStatusOrder: Record<string, number> = {
  'Full': 0, '75% Full': 1, 'Half': 2, 'Very Low': 3, 'Almost Empty': 4, 'Empty': 5,
};

export default function Products() {
  const { products: items, verifications, addProduct, updateProduct, deleteProduct, addVerification } = useStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [statusFilter, setStatusFilter] = useState<(typeof statusFilters)[number]>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [hasProductDraft, setHasProductDraft] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('nain_product_form_draft');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.name?.trim() || parsed.supplier?.trim() || parsed.price > 0 || parsed.cost > 0)) {
          setHasProductDraft(true);
          return;
        }
      }
      setHasProductDraft(false);
    } catch {
      setHasProductDraft(false);
    }
  }, [formOpen]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [verifyTarget, setVerifyTarget] = useState<Product | null>(null);

  const lastVerificationDate = useMemo(() => {
    const map: Record<string, string> = {};
    for (const v of verifications) {
      if (!map[v.productId] || v.date > map[v.productId]) {
        map[v.productId] = v.date;
      }
    }
    return map;
  }, [verifications]);

  const filtered = useMemo(() => {
    const hasSearch = deferredSearch.trim().length > 0;
    const scoredList: { product: Product; score: number }[] = [];

    for (const p of items) {
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
      if (!matchesStatus) continue;

      if (!hasSearch) {
        scoredList.push({ product: p, score: 0 });
      } else {
        const match = smartSearchMatch([p.name, p.rackNumber, p.supplier, p.hsnCode], deferredSearch);
        if (match.matched) {
          scoredList.push({ product: p, score: match.score });
        }
      }
    }

    const sorted = [...scoredList].sort((a, b) => {
      // If user typed a search query, prioritize best matching score first
      if (hasSearch && Math.abs(b.score - a.score) >= 15) {
        return b.score - a.score;
      }
      let cmp = 0;
      switch (sortKey) {
        case 'name': cmp = a.product.name.localeCompare(b.product.name); break;
        case 'stock': cmp = a.product.stock - b.product.stock; break;
        case 'supplier': cmp = a.product.supplier.localeCompare(b.product.supplier); break;
        case 'rackNumber': cmp = a.product.rackNumber.localeCompare(b.product.rackNumber); break;
        case 'lastVerification':
          cmp = (lastVerificationDate[a.product.id] ?? '0000').localeCompare(lastVerificationDate[b.product.id] ?? '0000');
          break;
        case 'reorderLevel': cmp = a.product.reorderLevel - b.product.reorderLevel; break;
        case 'boxStatus': cmp = (boxStatusOrder[a.product.boxStatus] ?? 0) - (boxStatusOrder[b.product.boxStatus] ?? 0); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted.map((s) => s.product);
  }, [items, deferredSearch, statusFilter, sortKey, sortDir, lastVerificationDate]);

  // Reset page when filter or search changes
  useEffect(() => {
    setPage(1);
  }, [deferredSearch, statusFilter, sortKey, sortDir, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedProducts = useMemo(() => {
    if (pageSize >= 9999) return filtered;
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const summary = useMemo(() => {
    const totalUnits = items.reduce((s, p) => s + p.stock, 0);
    const lowCount = items.filter((p) => p.status === 'low-stock').length;
    const outCount = items.filter((p) => p.status === 'out-of-stock').length;
    return { totalUnits, lowCount, outCount };
  }, [items]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === 'asc' ? <ArrowUp className="ml-1 inline h-3 w-3" /> : <ArrowDown className="ml-1 inline h-3 w-3" />;
  };

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setFormOpen(true);
  };

  const handleSubmit = async (data: ProductFormData) => {
    try {
      if (editing) {
        await updateProduct(editing.id, data);
      } else {
        await addProduct(data);
        try {
          localStorage.removeItem('nain_product_form_draft');
        } catch {}
        setHasProductDraft(false);
      }
      setFormOpen(false);
      setEditing(null);
    } catch (err) {
      console.error('Failed to save product:', err);
      alert(`Failed to save product: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteProduct(deleteTarget.id);
    setDeleteTarget(null);
  };

  const handleExport = () => {
    const rows = filtered.map((p) => ({
      Name: p.name, Supplier: p.supplier,
      Rack: p.rackNumber, EstStock: p.stock, BoxCapacity: p.boxCapacity,
      BoxStatus: p.boxStatus, BoxStatusMode: p.boxStatusMode,
      Cost: p.cost.toFixed(2), Price: p.price.toFixed(2),
      ProfitPerPiece: (p.price - p.cost).toFixed(2),
      ReorderLevel: p.reorderLevel, Status: p.status,
      LastVerification: lastVerificationDate[p.id] ?? '',
    }));
    downloadCSV('products.csv', toCSV(rows));
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Products"
        subtitle="Manage your catalog, stock levels, and supplier information."
        actions={
          <>
            <button className="btn-secondary" onClick={handleExport}>
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export</span>
            </button>
            <button className="btn-secondary" onClick={() => navigate('/import')}>
              <Upload className="h-4 w-4 text-emerald-600" />
              <span className="hidden sm:inline">Import Excel</span>
            </button>
            <button
              className={`btn-primary flex items-center gap-1.5 shadow-sm ${
                hasProductDraft ? 'ring-2 ring-amber-400/80 bg-gradient-to-r from-amber-600 to-brand-600' : ''
              }`}
              onClick={openAdd}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">{hasProductDraft ? 'Resume Product (Draft)' : 'Add Product'}</span>
              <span className="sm:hidden">{hasProductDraft ? 'Draft' : 'Add'}</span>
              {hasProductDraft && (
                <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-200 text-amber-900 animate-pulse">
                  DRAFT
                </span>
              )}
            </button>
          </>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stagger-1 card-interactive group relative overflow-hidden rounded-2xl bg-white/90 backdrop-blur-md p-5 border border-slate-200/80 shadow-xs before:absolute before:top-0 before:left-0 before:right-0 before:h-1 before:bg-gradient-to-r before:from-brand-500 before:to-indigo-500">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Est. Total Pieces</p>
          <p className="mt-2 text-2xl font-black text-slate-900 tracking-tight">{summary.totalUnits.toLocaleString('en-IN')}</p>
          <p className="mt-1 text-xs text-slate-500 font-medium">Across all warehouse inventory</p>
        </div>
        <div className="stagger-2 card-interactive group relative overflow-hidden rounded-2xl bg-white/90 backdrop-blur-md p-5 border border-slate-200/80 shadow-xs before:absolute before:top-0 before:left-0 before:right-0 before:h-1 before:bg-gradient-to-r before:from-amber-500 before:to-orange-500">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Low Stock</p>
          <p className="mt-2 text-2xl font-black text-amber-700 tracking-tight">{summary.lowCount} items</p>
          <p className="mt-1 text-xs text-amber-600 font-medium">Near or below reorder level</p>
        </div>
        <div className="stagger-3 card-interactive group relative overflow-hidden rounded-2xl bg-white/90 backdrop-blur-md p-5 border border-slate-200/80 shadow-xs before:absolute before:top-0 before:left-0 before:right-0 before:h-1 before:bg-gradient-to-r before:from-rose-500 before:to-red-600">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Out of Stock</p>
          <p className="mt-2 text-2xl font-black text-rose-600 tracking-tight">{summary.outCount} items</p>
          <p className="mt-1 text-xs text-rose-500 font-medium">Urgent purchase required</p>
        </div>
      </div>

      <p className="mt-2 text-xs text-slate-400">Estimated from purchase and sales records. Use Physical Verification to adjust.</p>

      {/* Filters */}
      <div className="sticky top-[8.5rem] z-10 mt-4 -mx-4 px-4 py-3 bg-slate-50/90 backdrop-blur-md rounded-lg lg:-mx-8 lg:px-8">
        <div className="card p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products by name, rack, or supplier…"
              className="input pl-10"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              {statusFilters.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                    statusFilter === s
                      ? 'bg-white text-brand-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {s.replace('-', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>

      {/* Table */}
      <div className="mt-4 card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="table-th w-10"><input type="checkbox" className="rounded border-slate-300" /></th>
                <th className="table-th cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort('name')}>Product Name <SortIcon col="name" /></th>
                <th className="table-th cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort('supplier')}>Supplier <SortIcon col="supplier" /></th>
                <th className="table-th cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort('rackNumber')}>Rack <SortIcon col="rackNumber" /></th>
                <th className="table-th cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort('stock')}>Est. Stock <SortIcon col="stock" /></th>
                <th className="table-th cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort('boxStatus')}>Box <SortIcon col="boxStatus" /></th>
                <th className="table-th text-right">Selling</th>
                <th className="table-th text-right">Profit</th>
                <th className="table-th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedProducts.map((p) => (
                <tr key={p.id} className="transition hover:bg-slate-50/50">
                  <td className="table-td"><input type="checkbox" className="rounded border-slate-300" /></td>
                  <td className="table-td">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                        {p.image ? (
                          <img src={p.image} alt={p.name} className="h-full w-full object-cover" />
                        ) : (
                          <ImageOff className="h-4 w-4 text-slate-300" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800">{p.name}</p>
                        {p.notes && <p className="truncate text-xs text-slate-400">{p.notes}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="table-td text-slate-600">{p.supplier}</td>
                  <td className="table-td text-slate-600">{p.rackNumber}</td>
                  <td className="table-td text-right">
                    <div>
                      <span className="font-bold tabular-nums text-slate-900">{p.stock.toLocaleString('en-IN')}</span>
                      <span className="text-[11px] text-slate-400"> / min {p.reorderLevel.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-1 max-w-[100px] ml-auto">
                      <div
                        className={`h-full rounded-full transition-all ${
                          p.stock === 0
                            ? 'bg-rose-500'
                            : p.stock <= p.reorderLevel
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(8, (p.stock / (p.boxCapacity || 1000)) * 100))}%` }}
                      />
                    </div>
                  </td>
                  <td className="table-td"><StatusBadge status={p.boxStatus} variant="box" /></td>
                  <td className="table-td text-right font-semibold tabular-nums text-slate-800">₹{p.price.toFixed(2)}</td>
                  <td className="table-td text-right tabular-nums font-semibold text-accent-600">
                    ₹{(p.price - p.cost).toFixed(2)}
                  </td>
                  <td className="table-td">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => navigate(`/products/${p.id}`)}
                        className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                        title="History"
                      >
                        <HistoryIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setVerifyTarget(p)}
                        className="rounded-lg p-2 text-slate-400 transition hover:bg-accent-50 hover:text-accent-600"
                        title="Physical Verification"
                      >
                        <ClipboardCheck className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => openEdit(p)}
                        className="rounded-lg p-2 text-slate-400 transition hover:bg-brand-50 hover:text-brand-600"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(p)}
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
        </div>
        {filtered.length === 0 && (
          <div className="py-16 text-center">
            <Package className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-600">No products found</p>
            <p className="text-sm text-slate-400">Try adjusting your search or filters.</p>
          </div>
        )}
        {/* Interactive Pagination */}
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
              of <span className="font-semibold text-slate-700">{filtered.length}</span> products
              {filtered.length !== items.length && (
                <span className="text-slate-400 ml-1">(filtered from {items.length})</span>
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
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = idx + 1;
                } else if (page <= 3) {
                  pageNum = idx + 1;
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + idx;
                } else {
                  pageNum = page - 2 + idx;
                }
                const isActive = pageNum === page;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`h-7 min-w-7 rounded-lg px-2 text-xs font-bold transition ${
                      isActive
                        ? 'bg-brand-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              {totalPages > 5 && page < totalPages - 2 && (
                <span className="px-1 text-xs text-slate-400">…</span>
              )}
            </div>
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

      {/* Add / Edit modal */}
      <Modal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        title={editing ? 'Edit Product' : 'Add New Product'}
        subtitle={editing ? `Updating ${editing.name}` : 'Fill in the details below to add a product to your catalog.'}
        size="lg"
        footer={
          <div className="flex items-center justify-between w-full">
            {!editing && hasProductDraft ? (
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.removeItem('nain_product_form_draft');
                  } catch {}
                  setHasProductDraft(false);
                  setFormOpen(false);
                  setEditing(null);
                }}
                className="btn-secondary text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
              >
                Discard Draft
              </button>
            ) : <div />}
            <div className="flex gap-2">
              <button
                className="btn-secondary"
                onClick={() => { setFormOpen(false); setEditing(null); }}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="product-form"
                className="btn-primary"
              >
                {editing ? 'Save Changes' : 'Add Product'}
              </button>
            </div>
          </div>
        }
      >
        <ProductForm
          initial={editing}
          onSubmit={handleSubmit}
          onCancel={() => { setFormOpen(false); setEditing(null); }}
        />
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Product"
        size="md"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button className="btn bg-err-600 text-white hover:bg-err-500" onClick={confirmDelete}>
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-err-50 text-err-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-slate-600">
              Are you sure you want to delete{' '}
              <span className="font-semibold text-slate-900">{deleteTarget?.name}</span>? This action
              cannot be undone.
            </p>
          </div>
        </div>
      </Modal>


      {/* Physical Verification modal */}
      <VerificationModal
        open={!!verifyTarget}
        product={verifyTarget}
        onClose={() => setVerifyTarget(null)}
        onSave={(v: VerificationRecord) => addVerification(v)}
      />
    </div>
  );
}
