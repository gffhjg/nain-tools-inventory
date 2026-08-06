import { Upload, FileSpreadsheet, Download, Info } from 'lucide-react';
import PageHeader from '@/components/PageHeader';

export default function ImportProducts() {
  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Import Products"
        subtitle="Bulk import products from an Excel spreadsheet."
      />

      <div className="card p-8">
        {/* Drop zone placeholder */}
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <FileSpreadsheet className="h-8 w-8" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-slate-800">Excel Import Coming Soon</h3>
          <p className="mt-1 max-w-md text-center text-sm text-slate-500">
            Drag and drop an .xlsx or .csv file here, or click to browse. This feature is being prepared
            for a future update.
          </p>
          <button className="btn-primary mt-5 opacity-60" disabled>
            <Upload className="h-4 w-4" />
            Select File
          </button>
        </div>

        {/* Info note */}
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <Info className="h-5 w-5 shrink-0 text-brand-600" />
          <div>
            <p className="text-sm font-medium text-brand-700">How Excel import will work</p>
            <p className="mt-1 text-sm text-brand-600/80">
              The import will accept a spreadsheet with columns: Product Name, Category, Supplier, Rack Number,
              Box Capacity, Purchase Price, Selling Price, Reorder Level, and Notes. Estimated stock will be
              set to zero and adjusted through purchases and physical verification.
            </p>
          </div>
        </div>

        {/* Template download placeholder */}
        <div className="mt-6 flex items-center justify-between rounded-xl border border-slate-200 p-4">
          <div>
            <p className="text-sm font-semibold text-slate-800">Download Template</p>
            <p className="text-sm text-slate-500">Get a blank Excel template with the correct columns pre-filled.</p>
          </div>
          <button className="btn-secondary opacity-60" disabled>
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Download</span>
          </button>
        </div>
      </div>
    </div>
  );
}
