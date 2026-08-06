import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, Download, Info, CheckCircle2, AlertTriangle, XCircle, ArrowRight, Trash2, Check, RefreshCw, FileText } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { useStore, type ProductFormData } from '@/store/AppStore';
import { downloadCSV, toCSV } from '@/utils/analytics';

type ImportedRow = {
  id: string;
  name: string;
  category: string;
  supplier: string;
  rackNumber: string;
  size: string;
  cost: number;
  price: number;
  boxCapacity: number;
  reorderLevel: number;
  notes: string;
  initialStock?: number;
  status: 'valid' | 'warning' | 'error';
  issues: string[];
};

const SAMPLE_TEMPLATE_DATA = [
  {
    'Product Name': 'M8 x 25mm Hex Bolt SS304',
    'Category': 'Fasteners',
    'Supplier': 'Nain Fasteners Ltd',
    'Rack Number': 'A-12',
    'Size': 'M8x25',
    'Purchase Price': 4.5,
    'Selling Price': 8.0,
    'Box Capacity': 500,
    'Reorder Level': 100,
    'Notes': 'High grade stainless steel 304',
  },
  {
    'Product Name': 'M10 Nylon Lock Nut SS316',
    'Category': 'Nuts & Washers',
    'Supplier': 'Apex Hardware',
    'Rack Number': 'B-04',
    'Size': 'M10',
    'Purchase Price': 3.2,
    'Selling Price': 6.5,
    'Box Capacity': 1000,
    'Reorder Level': 200,
    'Notes': 'Nylon ring insert',
  },
];

export default function ImportProducts() {
  const { products, addProduct } = useStore();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<ImportedRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<number>(0);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'valid' | 'warning' | 'error'>('all');

  const existingProductNames = new Set(products.map((p) => p.name.trim().toLowerCase()));

  const parseFile = (file: File) => {
    setFileName(file.name);
    setImportedCount(null);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const buffer = e.target?.result;
        if (!buffer) return;
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });

        if (!rawJson.length) {
          alert('The uploaded file is empty or contains no readable rows.');
          return;
        }

        const parsedRows: ImportedRow[] = rawJson.map((row, index) => {
          // Normalize header keys (case-insensitive & whitespace trimmed)
          const normalizedKeyMap: Record<string, any> = {};
          Object.keys(row).forEach((key) => {
            const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            normalizedKeyMap[cleanKey] = row[key];
          });

          const getValue = (...possibleKeys: string[]) => {
            for (const pk of possibleKeys) {
              const cleanPk = pk.toLowerCase().replace(/[^a-z0-9]/g, '');
              if (normalizedKeyMap[cleanPk] !== undefined && normalizedKeyMap[cleanPk] !== '') {
                return normalizedKeyMap[cleanPk];
              }
            }
            return '';
          };

          const name = String(getValue('productname', 'product', 'name', 'itemname', 'item')).trim();
          const category = String(getValue('category', 'cat', 'type')).trim() || 'General';
          const supplier = String(getValue('supplier', 'vendor', 'suppliername')).trim() || 'Unassigned';
          const rackNumber = String(getValue('racknumber', 'rack', 'location', 'bin')).trim() || 'A-01';
          const size = String(getValue('size', 'dimensions', 'spec')).trim() || 'Standard';
          const notes = String(getValue('notes', 'description', 'remarks')).trim();

          const costNum = parseFloat(String(getValue('purchaseprice', 'cost', 'costprice', 'buyprice', 'purchase')).replace(/[^0-9.]/g, '')) || 0;
          const priceNum = parseFloat(String(getValue('sellingprice', 'price', 'sellprice', 'mrpi')).replace(/[^0-9.]/g, '')) || 0;
          const boxCapNum = parseInt(String(getValue('boxcapacity', 'boxcap', 'capacity')).replace(/[^0-9]/g, ''), 10) || 500;
          const reorderNum = parseInt(String(getValue('reorderlevel', 'reorder', 'minstock')).replace(/[^0-9]/g, ''), 10) || 50;

          const issues: string[] = [];
          let status: 'valid' | 'warning' | 'error' = 'valid';

          if (!name) {
            status = 'error';
            issues.push('Missing product name');
          } else if (existingProductNames.has(name.toLowerCase())) {
            status = 'warning';
            issues.push('Product name already exists in inventory (will add as duplicate/new entry)');
          }

          if (costNum <= 0 && priceNum <= 0) {
            if (status !== 'error') status = 'warning';
            issues.push('Price/Cost is 0 or unassigned');
          }

          return {
            id: `import-${index}-${Date.now()}`,
            name,
            category,
            supplier,
            rackNumber,
            size,
            cost: costNum,
            price: priceNum,
            boxCapacity: boxCapNum,
            reorderLevel: reorderNum,
            notes,
            status,
            issues,
          };
        });

        setRows(parsedRows);
      } catch (err) {
        console.error('Failed to parse spreadsheet file', err);
        alert('Could not parse the file. Please ensure it is a valid .xlsx or .csv spreadsheet.');
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) parseFile(file);
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRowField = (id: string, field: keyof ImportedRow, value: any) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        const issues: string[] = [];
        let status: 'valid' | 'warning' | 'error' = 'valid';

        if (!updated.name.trim()) {
          status = 'error';
          issues.push('Missing product name');
        } else if (existingProductNames.has(updated.name.trim().toLowerCase())) {
          status = 'warning';
          issues.push('Product name already exists in inventory');
        }
        return { ...updated, status, issues };
      })
    );
  };

  const handleImportAll = async () => {
    const validRows = rows.filter((r) => r.status !== 'error');
    if (!validRows.length) {
      alert('No valid rows available to import.');
      return;
    }

    setImporting(true);
    setImportProgress(0);
    let count = 0;

    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i];
      const data: ProductFormData = {
        name: r.name,
        category: r.category,
        supplier: r.supplier,
        rackNumber: r.rackNumber,
        size: r.size,
        cost: r.cost,
        price: r.price,
        boxCapacity: r.boxCapacity,
        reorderLevel: r.reorderLevel,
        notes: r.notes,
        image: '',
      };
      try {
        await addProduct(data);
        count++;
        setImportProgress(Math.round(((i + 1) / validRows.length) * 100));
      } catch (err) {
        console.error('Failed to import row', r, err);
      }
    }

    setImporting(false);
    setImportedCount(count);
  };

  const downloadXlsxTemplate = () => {
    const ws = XLSX.utils.json_to_sheet(SAMPLE_TEMPLATE_DATA);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Product Import Template');
    XLSX.writeFile(wb, 'Nain_Tools_Product_Import_Template.xlsx');
  };

  const downloadCsvTemplate = () => {
    const csvContent = toCSV(SAMPLE_TEMPLATE_DATA as any);
    downloadCSV('Nain_Tools_Product_Import_Template.csv', csvContent);
  };

  const validCount = rows.filter((r) => r.status === 'valid').length;
  const warningCount = rows.filter((r) => r.status === 'warning').length;
  const errorCount = rows.filter((r) => r.status === 'error').length;

  const filteredRows = rows.filter((r) => {
    if (filterStatus === 'valid') return r.status === 'valid';
    if (filterStatus === 'warning') return r.status === 'warning';
    if (filterStatus === 'error') return r.status === 'error';
    return true;
  });

  return (
    <div className="animate-fade-in space-y-6 pb-12">
      <PageHeader
        title="Import Products"
        subtitle="Bulk import products from Excel (.xlsx) or CSV spreadsheets with real-time validation."
      />

      {importedCount !== null ? (
        <div className="card p-8 text-center animate-scale-in">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <h3 className="mt-4 text-2xl font-bold text-slate-900">Import Successful!</h3>
          <p className="mt-2 text-slate-600">
            Successfully imported <span className="font-semibold text-emerald-600">{importedCount}</span> products into your inventory.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button className="btn-primary" onClick={() => navigate('/products')}>
              View All Products
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                setRows([]);
                setFileName('');
                setImportedCount(null);
              }}
            >
              Import Another File
            </button>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="card p-8">
          {/* Upload Drop Zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="group flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/50 py-16 transition-all hover:border-brand-500 hover:bg-brand-50/30 cursor-pointer"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".xlsx, .xls, .csv"
              className="hidden"
            />
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 shadow-sm transition-transform group-hover:scale-110">
              <FileSpreadsheet className="h-8 w-8" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-slate-800">
              Drop your spreadsheet here, or <span className="text-brand-600 underline">browse</span>
            </h3>
            <p className="mt-1.5 max-w-md text-center text-sm text-slate-500">
              Supports <span className="font-semibold text-slate-700">.xlsx</span>, <span className="font-semibold text-slate-700">.xls</span>, and <span className="font-semibold text-slate-700">.csv</span> files.
            </p>
            <button className="btn-primary mt-6 pointer-events-none">
              <Upload className="h-4 w-4" />
              Select File
            </button>
          </div>

          {/* Info Card */}
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3.5">
            <Info className="h-5 w-5 shrink-0 text-brand-600 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-brand-900">Supported Headers & Automatic Mapping</p>
              <p className="mt-1 text-xs leading-relaxed text-brand-700/90">
                The import tool automatically recognizes standard column headers: <br />
                <code className="font-mono text-brand-900">Product Name</code>, <code className="font-mono text-brand-900">Category</code>, <code className="font-mono text-brand-900">Supplier</code>, <code className="font-mono text-brand-900">Rack Number</code>, <code className="font-mono text-brand-900">Size</code>, <code className="font-mono text-brand-900">Purchase Price</code>, <code className="font-mono text-brand-900">Selling Price</code>, <code className="font-mono text-brand-900">Box Capacity</code>, and <code className="font-mono text-brand-900">Reorder Level</code>.
              </p>
            </div>
          </div>

          {/* Download Templates */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center justify-between rounded-xl border border-slate-200/90 p-4 bg-slate-50/50">
              <div>
                <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  Excel Template (.xlsx)
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Pre-formatted Excel sheet with sample row data.</p>
              </div>
              <button className="btn-secondary" onClick={downloadXlsxTemplate}>
                <Download className="h-4 w-4" />
                Download
              </button>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-200/90 p-4 bg-slate-50/50">
              <div>
                <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-brand-600" />
                  CSV Template (.csv)
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Standard comma-separated template for quick import.</p>
              </div>
              <button className="btn-secondary" onClick={downloadCsvTemplate}>
                <Download className="h-4 w-4" />
                Download
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Preview & Validation Table View */
        <div className="card p-6 space-y-6 animate-fade-in">
          {/* Header Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-brand-600" />
                {fileName}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Total Rows: <span className="font-semibold text-slate-700">{rows.length}</span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                className="btn-secondary"
                onClick={() => {
                  setRows([]);
                  setFileName('');
                }}
              >
                Choose Another File
              </button>
              <button
                className="btn-primary"
                onClick={handleImportAll}
                disabled={importing || validCount + warningCount === 0}
              >
                {importing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Importing ({importProgress}%)
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Import {validCount + warningCount} Products
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Validation Summary Bar */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                filterStatus === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All ({rows.length})
            </button>
            <button
              onClick={() => setFilterStatus('valid')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                filterStatus === 'valid'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Valid ({validCount})
            </button>
            <button
              onClick={() => setFilterStatus('warning')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                filterStatus === 'warning'
                  ? 'bg-amber-600 text-white'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Warnings ({warningCount})
            </button>
            <button
              onClick={() => setFilterStatus('error')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                filterStatus === 'error'
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
              }`}
            >
              <XCircle className="h-3.5 w-3.5" />
              Errors ({errorCount})
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-[500px]">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-100/90 backdrop-blur z-10">
                <tr>
                  <th className="px-3 py-2.5 font-semibold text-slate-600">Status</th>
                  <th className="px-3 py-2.5 font-semibold text-slate-600">Product Name</th>
                  <th className="px-3 py-2.5 font-semibold text-slate-600">Category</th>
                  <th className="px-3 py-2.5 font-semibold text-slate-600">Supplier</th>
                  <th className="px-3 py-2.5 font-semibold text-slate-600">Rack</th>
                  <th className="px-3 py-2.5 font-semibold text-slate-600">Size</th>
                  <th className="px-3 py-2.5 font-semibold text-slate-600">Cost (₹)</th>
                  <th className="px-3 py-2.5 font-semibold text-slate-600">Price (₹)</th>
                  <th className="px-3 py-2.5 font-semibold text-slate-600 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredRows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.status === 'valid' && (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold text-[11px]">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Valid
                        </span>
                      )}
                      {r.status === 'warning' && (
                        <span
                          title={r.issues.join(', ')}
                          className="inline-flex items-center gap-1 text-amber-600 font-semibold text-[11px] cursor-help"
                        >
                          <AlertTriangle className="h-3.5 w-3.5" /> Warning
                        </span>
                      )}
                      {r.status === 'error' && (
                        <span
                          title={r.issues.join(', ')}
                          className="inline-flex items-center gap-1 text-rose-600 font-semibold text-[11px] cursor-help"
                        >
                          <XCircle className="h-3.5 w-3.5" /> Error
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={r.name}
                        onChange={(e) => updateRowField(r.id, 'name', e.target.value)}
                        className={`w-full rounded border px-2 py-1 text-xs focus:outline-none ${
                          !r.name ? 'border-rose-400 bg-rose-50/50' : 'border-slate-200'
                        }`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={r.category}
                        onChange={(e) => updateRowField(r.id, 'category', e.target.value)}
                        className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={r.supplier}
                        onChange={(e) => updateRowField(r.id, 'supplier', e.target.value)}
                        className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2 w-20">
                      <input
                        type="text"
                        value={r.rackNumber}
                        onChange={(e) => updateRowField(r.id, 'rackNumber', e.target.value)}
                        className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2 w-20">
                      <input
                        type="text"
                        value={r.size}
                        onChange={(e) => updateRowField(r.id, 'size', e.target.value)}
                        className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2 w-24">
                      <input
                        type="number"
                        value={r.cost}
                        onChange={(e) => updateRowField(r.id, 'cost', parseFloat(e.target.value) || 0)}
                        className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2 w-24">
                      <input
                        type="number"
                        value={r.price}
                        onChange={(e) => updateRowField(r.id, 'price', parseFloat(e.target.value) || 0)}
                        className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => removeRow(r.id)}
                        className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                        title="Remove row"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
