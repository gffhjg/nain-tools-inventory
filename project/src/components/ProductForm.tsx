import { useState, useRef, useEffect, useMemo } from 'react';
import { Upload, Image as ImageIcon, Plus, List } from 'lucide-react';
import { productCategories } from '@/lib/constants';
import type { Product } from '@/lib/types';
import { useStore } from '@/store/AppStore';

export type ProductFormData = Omit<Product, 'id' | 'status' | 'boxStatus' | 'stock' | 'lastPhysicalObservation' | 'boxStatusMode' | 'manualBoxStatus'>;

type ProductFormProps = {
  initial?: Product | null;
  onSubmit: (data: ProductFormData) => void;
  onCancel: () => void;
};

const empty: ProductFormData = {
  name: '',
  supplier: '',
  rackNumber: '',
  size: '',
  cost: 0,
  price: 0,
  boxCapacity: 0,
  reorderLevel: 0,
  notes: '',
  image: '',
  hsnCode: '7318150',
};

export default function ProductForm({ initial, onSubmit, onCancel }: ProductFormProps) {
  const { products } = useStore();
  const [form, setForm] = useState<ProductFormData>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initial) {
      const { id, status, boxStatus, stock, lastPhysicalObservation, ...rest } = initial;
      void id; void status; void boxStatus; void stock; void lastPhysicalObservation;
      setForm(rest);
    } else {
      setForm(empty);
    }
    setErrors({});
  }, [initial]);

  const update = (field: keyof ProductFormData, value: string | number) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: '' }));
  };

  const handleFile = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => update('image', reader.result as string);
    reader.readAsDataURL(file);
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Product name is required';
    if (!form.supplier.trim()) next.supplier = 'Supplier is required';
    if (form.price <= 0) next.price = 'Must be greater than 0';
    if (form.cost < 0) next.cost = 'Cannot be negative';
    if (form.boxCapacity <= 0) next.boxCapacity = 'Must be greater than 0';
    if (form.reorderLevel < 0) next.reorderLevel = 'Cannot be negative';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onSubmit(form);
  };

  const inputCls = (field: string) =>
    `input ${errors[field] ? 'border-err-400 focus:border-err-400 focus:ring-err-500/20' : ''}`;

  return (
    <form id="product-form" onSubmit={handleSubmit} className="space-y-5">
      {/* Image upload */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Product Image</label>
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            {form.image ? (
              <img src={form.image} alt="Preview" className="h-full w-full object-cover" />
            ) : (
              <ImageIcon className="h-7 w-7 text-slate-300" />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="btn-secondary"
            >
              <Upload className="h-4 w-4" />
              Upload Image
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <p className="text-xs text-slate-400">PNG or JPG. Or paste a URL below.</p>
          </div>
        </div>
        <input
          type="url"
          value={form.image.startsWith('data:') ? '' : form.image}
          onChange={(e) => update('image', e.target.value)}
          placeholder="https://image-url.com/photo.jpg"
          className="input mt-3"
        />
      </div>

      {/* Product Name */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Product Name</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          placeholder="e.g. Hex Bolt M12 x 50mm SS 304"
          className={inputCls('name')}
        />
        {errors.name && <p className="mt-1 text-xs text-err-600">{errors.name}</p>}
      </div>

      {/* Supplier + Rack + HSN Code */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Supplier</label>
          <input
            type="text"
            value={form.supplier}
            onChange={(e) => update('supplier', e.target.value)}
            placeholder="e.g. TVS Fasteners Ltd"
            className={inputCls('supplier')}
          />
          {errors.supplier && <p className="mt-1 text-xs text-err-600">{errors.supplier}</p>}
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Rack Number</label>
          <input
            type="text"
            value={form.rackNumber}
            onChange={(e) => update('rackNumber', e.target.value)}
            placeholder="e.g. A-01"
            className="input"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">HSN Code</label>
          <input
            type="text"
            value={form.hsnCode || ''}
            onChange={(e) => update('hsnCode', e.target.value)}
            placeholder="e.g. 7318150"
            className="input font-mono"
          />
        </div>
      </div>

      {/* Prices */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Purchase Price Per Piece (₹)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.cost || ''}
            onChange={(e) => update('cost', parseFloat(e.target.value) || 0)}
            placeholder="0.00"
            className={inputCls('cost')}
          />
          {errors.cost && <p className="mt-1 text-xs text-err-600">{errors.cost}</p>}
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Selling Price Per Piece (₹)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.price || ''}
            onChange={(e) => update('price', parseFloat(e.target.value) || 0)}
            placeholder="0.00"
            className={inputCls('price')}
          />
          {errors.price && <p className="mt-1 text-xs text-err-600">{errors.price}</p>}
        </div>
      </div>

      {/* Box Capacity + Reorder Level */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Box Capacity (Pieces)</label>
          <input
            type="number"
            min="1"
            value={form.boxCapacity || ''}
            onChange={(e) => update('boxCapacity', parseInt(e.target.value, 10) || 0)}
            placeholder="e.g. 5000"
            className={inputCls('boxCapacity')}
          />
          {errors.boxCapacity && <p className="mt-1 text-xs text-err-600">{errors.boxCapacity}</p>}
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Reorder Level (Pieces)</label>
          <input
            type="number"
            min="0"
            value={form.reorderLevel || ''}
            onChange={(e) => update('reorderLevel', parseInt(e.target.value, 10) || 0)}
            placeholder="0"
            className={inputCls('reorderLevel')}
          />
          {errors.reorderLevel && <p className="mt-1 text-xs text-err-600">{errors.reorderLevel}</p>}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Notes (Optional)</label>
        <input
          type="text"
          value={form.notes}
          onChange={(e) => update('notes', e.target.value)}
          placeholder="Any extra notes about this product"
          className="input"
        />
      </div>

      <p className="text-xs text-slate-400">
        Estimated Stock is calculated automatically from purchases and sales. Use Physical Verification to adjust it.
      </p>

      {/* Hidden submit for form Enter key, footer buttons used in modal */}
      <button type="submit" className="hidden" />
      <button type="button" onClick={onCancel} className="hidden" />
    </form>
  );
}
