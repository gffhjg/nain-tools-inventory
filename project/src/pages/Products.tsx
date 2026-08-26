import { useState, useMemo } from 'react';
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
  const [statusFilter, setStatusFilter] = useState<(typeof statusFilters)[number]>('all');
  const [formOpen, setFormOpen] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [importOpen, setImportOpen] = useState(false);
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
    const q = search.toLowerCase();
    const filteredList = items.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(q) ||
        p.rackNumber.toLowerCase().includes(q) ||
        p.supplier.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
    const sorted = [...filteredList].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'stock': cmp = a.stock - b.stock; break;
        case 'supplier': cmp = a.supplier.localeCompare(b.supplier); break;
        case 'rackNumber': cmp = a.rackNumber.localeCompare(b.rackNumber); break;
        case 'lastVerification':
          cmp = (lastVerificationDate[a.id] ?? '0000').localeCompare(lastVerificationDate[b.id] ?? '0000');
          break;
        case 'reorderLevel': cmp = a.reorderLevel - b.reorderLevel; break;
        case 'boxStatus': cmp = (boxStatusOrder[a.boxStatus] ?? 0) - (boxStatusOrder[b.boxStatus] ?? 0); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [items, search, statusFilter, sortKey, sortDir, lastVerificationDate]);

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
            <button className="btn-secondary" onClick={() => navigate('/import-products')}>
              <Upload className="h-4 w-4 text-emerald-600" />
              <span className="hidden sm:inline">Import Excel/CSV</span>
            </button>
            <button className="btn-secondary" onClick={handleExport}>
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export</span>
            </button>
            <button className="btn-primary" onClick={openAdd}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Product</span>
            </button>
          </>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 xl:grid-cols-3">
        <div className="card p-4">
          <p className="text-sm text-slate-500">Est. Total Pieces</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{summary.totalUnits.toLocaleString('en-IN')}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-slate-500">Low Stock</p>
          <p className="mt-1 text-2xl font-bold text-warn-600">{summary.lowCount}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-slate-500">Out of Stock</p>
          <p className="mt-1 text-2xl font-bold text-err-600">{summary.outCount}</p>
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
          <table className="w-full min-w-[760px]">
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
              {filtered.map((p) => (
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
        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
          <p className="text-sm text-slate-500">
            Showing <span className="font-semibold text-slate-700">{filtered.length}</span> of{' '}
            <span className="font-semibold text-slate-700">{items.length}</span> products
          </p>
          <div className="flex items-center gap-1">
            <button className="btn-secondary px-3 py-1.5 text-xs" disabled>Previous</button>
            <button className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">1</button>
            <button className="btn-secondary px-3 py-1.5 text-xs" disabled>Next</button>
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
          <>
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
          </>
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

      {/* Import modal */}
      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Products"
        subtitle="Bulk import products from an Excel spreadsheet."
        size="md"
        footer={<button className="btn-secondary" onClick={() => setImportOpen(false)}>Close</button>}
      >
        <div className="space-y-4">
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 py-12">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <Upload className="h-7 w-7" />
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-800">Excel Import Coming Soon</p>
            <p className="mt-1 max-w-sm text-center text-xs text-slate-500">
              Drag and drop an .xlsx or .csv file here. The import will accept Product Name, Category, Supplier, Rack Number, Box Capacity, Purchase Price, Selling Price, Reorder Level, and Notes.
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
