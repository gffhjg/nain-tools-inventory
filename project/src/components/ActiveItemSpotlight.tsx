import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Package,
  Plus,
  Minus,
  Trash2,
  Search,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Layers,
  X,
  CornerDownLeft,
  Edit3,
} from 'lucide-react';
import { money } from '@/utils/analytics';
import { smartFilterItems } from '@/utils/search';
import type { Product, DiscountType } from '@/lib/types';

export interface ActiveItemData {
  productId: string;
  name: string;
  price: number;
  cost?: number;
  qty: number;
  discount?: number;
  discountType?: DiscountType | 'fixed' | 'percent';
  isCustom?: boolean;
  hsnCode?: string;
}

export interface ActiveItemSpotlightProps {
  activeItem?: ActiveItemData | null;
  product?: Product | null;
  mode?: 'sale' | 'purchase';
  lineNumber?: number;
  isJustAdded?: boolean;
  onUpdateName?: (name: string) => void;
  onUpdateHsn?: (hsn: string) => void;
  onUpdateQty?: (qty: number) => void;
  onUpdatePrice?: (price: number) => void;
  onUpdateDiscount?: (discount: number) => void;
  onRemove?: () => void;
  emptyMessage?: string;
}

/**
 * Clean, Unified Industrial ERP Active Item Command Bar
 * Displays live selected item details and allows instant inline editing
 * of Item Name, HSN Code, Quantity, Rate, and Discount %.
 */
export function ActiveItemSpotlight({
  activeItem,
  product,
  mode = 'sale',
  lineNumber,
  isJustAdded = false,
  onUpdateName,
  onUpdateHsn,
  onUpdateQty,
  onUpdatePrice,
  onUpdateDiscount,
  onRemove,
  emptyMessage = 'Search above or click any row below to edit details here.',
}: ActiveItemSpotlightProps) {
  if (!activeItem) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-3.5 py-2.5 flex items-center justify-between gap-3 text-slate-500 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-slate-200/80 flex items-center justify-center text-slate-500 shrink-0">
            <Package className="w-3.5 h-3.5" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-700">No Item Selected</p>
            <p className="text-[11px] text-slate-400">{emptyMessage}</p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1 text-[11px] font-medium text-slate-400 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
          <CornerDownLeft className="w-3 h-3" />
          <span>Click any line item below to view or edit</span>
        </div>
      </div>
    );
  }

  const rate = activeItem.price ?? (activeItem.cost || 0);
  const qty = activeItem.qty || 1;
  const discPct = activeItem.discount || 0;
  const netRate = mode === 'sale' ? rate * (1 - discPct / 100) : rate;
  const lineTotal = +(qty * netRate).toFixed(2);

  const availStock = product ? product.stock : undefined;
  const isOverStock = mode === 'sale' && !activeItem.isCustom && availStock !== undefined && qty > availStock;

  return (
    <div
      className={`rounded-xl border transition-all p-3 shadow-sm bg-white ${
        isJustAdded
          ? 'border-indigo-400 ring-2 ring-indigo-100 bg-indigo-50/20'
          : 'border-slate-300 bg-white'
      }`}
    >
      {/* Top Meta Bar */}
      <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-100 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1 ${
              isJustAdded ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-white'
            }`}
          >
            {isJustAdded ? (
              <>
                <Sparkles className="w-2.5 h-2.5" />
                <span>Just Added</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-2.5 h-2.5" />
                <span>Selected Item</span>
              </>
            )}
            {lineNumber !== undefined && <span>· Line #{lineNumber}</span>}
          </span>

          {product?.rackNumber && (
            <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200/80">
              Rack: {product.rackNumber}
            </span>
          )}

          {availStock !== undefined && (
            <span
              className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                isOverStock
                  ? 'bg-rose-100 text-rose-800 border border-rose-300 font-extrabold animate-pulse'
                  : availStock <= 10
                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}
            >
              {isOverStock ? <AlertTriangle className="w-3 h-3 text-rose-600" /> : <Layers className="w-3 h-3 text-emerald-600" />}
              <span>
                {mode === 'sale' ? 'Avail Stock:' : 'Current Stock:'} {availStock} pcs
                {isOverStock && ' (Exceeds stock!)'}
              </span>
            </span>
          )}

          {activeItem.isCustom && (
            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200">
              Custom Product
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
          <Edit3 className="w-3 h-3 text-slate-500" />
          <span>Edit details inline &middot; Auto-updates table</span>
        </div>
      </div>

      {/* Editable Input Row (Full control over 1-2 details on the fly) */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
        {/* Item Name (Fully editable text field) */}
        <div className="sm:col-span-4">
          <label className="block text-[10.5px] font-bold text-slate-600 mb-0.5">
            Item Name / Description *
          </label>
          <input
            type="text"
            value={activeItem.name}
            onChange={(e) => onUpdateName?.(e.target.value)}
            disabled={!onUpdateName}
            placeholder="Item Name"
            className="input py-1 px-2.5 text-xs font-bold text-slate-900 bg-white border border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 rounded-lg w-full"
          />
        </div>

        {/* HSN Code (Fully editable) */}
        <div className="sm:col-span-2">
          <label className="block text-[10.5px] font-bold text-slate-600 mb-0.5">
            HSN Code
          </label>
          <input
            type="text"
            value={activeItem.hsnCode || ''}
            onChange={(e) => onUpdateHsn?.(e.target.value)}
            disabled={!onUpdateHsn}
            placeholder="7318150"
            className="input py-1 px-2 text-xs font-mono text-center text-slate-800 bg-white border border-slate-300 focus:border-indigo-500 rounded-lg w-full"
          />
        </div>

        {/* Quantity (Stepper + direct edit) */}
        <div className="sm:col-span-2">
          <label className="block text-[10.5px] font-bold text-slate-600 mb-0.5 text-center">
            Quantity
          </label>
          <div className="flex items-center gap-1">
            {onUpdateQty && (
              <button
                type="button"
                onClick={() => onUpdateQty(Math.max(1, qty - 1))}
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs transition shrink-0"
                title="Decrease Qty"
              >
                <Minus className="w-3 h-3" />
              </button>
            )}
            <input
              type="number"
              min="1"
              value={qty}
              onChange={(e) => onUpdateQty?.(Math.max(1, parseInt(e.target.value, 10) || 1))}
              disabled={!onUpdateQty}
              className="w-full text-center font-extrabold text-xs py-1 px-1 rounded-lg border border-slate-300 bg-white focus:border-indigo-500"
            />
            {onUpdateQty && (
              <button
                type="button"
                onClick={() => onUpdateQty(qty + 1)}
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs transition shrink-0"
                title="Increase Qty"
              >
                <Plus className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Rate (₹) */}
        <div className="sm:col-span-2">
          <label className="block text-[10.5px] font-bold text-slate-600 mb-0.5 text-right">
            {mode === 'purchase' ? 'Cost Rate (₹)' : 'Rate (₹)'}
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={rate}
            onChange={(e) => onUpdatePrice?.(Math.max(0, parseFloat(e.target.value) || 0))}
            disabled={!onUpdatePrice}
            className="w-full font-mono font-bold text-xs py-1 px-2 rounded-lg border border-slate-300 text-right bg-white focus:border-indigo-500"
          />
        </div>

        {/* Discount % (Sale only) */}
        {mode === 'sale' && onUpdateDiscount ? (
          <div className="sm:col-span-1">
            <label className="block text-[10.5px] font-bold text-slate-600 mb-0.5 text-right">
              Disc %
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={discPct}
              onChange={(e) => onUpdateDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full font-mono font-bold text-xs py-1 px-1 rounded-lg border border-slate-300 text-right bg-white focus:border-indigo-500"
            />
          </div>
        ) : null}

        {/* Line Total & Remove Action */}
        <div className={`flex items-center justify-end gap-2 ${mode === 'sale' ? 'sm:col-span-1' : 'sm:col-span-2'}`}>
          <div className="text-right">
            <span className="block text-[9.5px] font-bold text-slate-400 uppercase">Total</span>
            <span className="text-xs font-black font-mono text-emerald-700 block whitespace-nowrap">
              {money(lineTotal)}
            </span>
          </div>

          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition shrink-0 border border-transparent hover:border-rose-200"
              title="Remove this item from list"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export interface FastItemEntryBarProps {
  products: Product[];
  mode?: 'sale' | 'purchase';
  onAddItem: (item: {
    productId: string;
    name: string;
    price: number;
    cost?: number;
    qty: number;
    discount?: number;
    hsnCode?: string;
    isCustom?: boolean;
  }) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * High-Speed ERP Item Search & Autocomplete Bar
 * Clean, compact, no Category/Size distractions.
 */
export function FastItemEntryBar({
  products,
  mode = 'sale',
  onAddItem,
  placeholder = 'Type product name, rack #, or HSN to search...',
  autoFocus = false,
}: FastItemEntryBarProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState('1');
  const [rate, setRate] = useState('');
  const [discount, setDiscount] = useState('0');

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);

  // Filter products matching search term (Name, Rack, HSN, Supplier)
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) {
      return products.slice(0, 12);
    }
    return smartFilterItems(
      products,
      searchTerm.trim(),
      (p) => [p.name, p.rackNumber, p.hsnCode, p.supplier]
    ).slice(0, 16);
  }, [products, searchTerm]);

  // Handle outside click to close dropdown
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectProduct = (p: Product) => {
    setSelectedProduct(p);
    setSearchTerm(p.name);
    setRate(String(mode === 'purchase' ? p.cost || p.price : p.price));
    setIsOpen(false);
    setTimeout(() => {
      qtyInputRef.current?.focus();
      qtyInputRef.current?.select();
    }, 50);
  };

  const handleAdd = () => {
    const qtyVal = Math.max(1, parseInt(qty, 10) || 1);
    const rateVal = parseFloat(rate) || 0;
    const discVal = parseFloat(discount) || 0;

    if (selectedProduct) {
      onAddItem({
        productId: selectedProduct.id,
        name: selectedProduct.name,
        price: mode === 'purchase' ? (selectedProduct.price || rateVal) : rateVal,
        cost: mode === 'purchase' ? rateVal : selectedProduct.cost,
        qty: qtyVal,
        discount: discVal,
        hsnCode: selectedProduct.hsnCode || '7318150',
        isCustom: false,
      });
    } else if (searchTerm.trim()) {
      // Add custom line item
      const customId = `custom_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      onAddItem({
        productId: customId,
        name: searchTerm.trim(),
        price: rateVal,
        cost: mode === 'purchase' ? rateVal : 0,
        qty: qtyVal,
        discount: discVal,
        hsnCode: '7318150',
        isCustom: true,
      });
    } else {
      searchInputRef.current?.focus();
      return;
    }

    // Reset entry bar and return focus to search input
    setSelectedProduct(null);
    setSearchTerm('');
    setQty('1');
    setRate('');
    setDiscount('0');
    setIsOpen(false);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setIsOpen(true);
      return;
    }

    if (isOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredProducts.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredProducts.length) % Math.max(1, filteredProducts.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredProducts[selectedIndex]) {
          handleSelectProduct(filteredProducts[selectedIndex]);
        } else {
          handleAdd();
        }
      } else if (e.key === 'Escape') {
        setIsOpen(false);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div
      ref={containerRef}
      className="rounded-xl border border-slate-300 bg-white p-2.5 shadow-2xs space-y-2 relative z-30"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Search className="w-3.5 h-3.5 text-indigo-600" />
          <label className="text-xs font-bold text-slate-800">
            Fast Item Entry (ERP Inline Selector)
          </label>
        </div>
        <span className="text-[10.5px] text-slate-400 font-medium hidden sm:inline">
          Type to search &rarr; Select item &rarr; Enter Qty/Rate &rarr; Press Enter
        </span>
      </div>

      {/* Input Row */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
        {/* Item search combobox */}
        <div className="relative sm:col-span-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              autoFocus={autoFocus}
              value={searchTerm}
              onFocus={() => setIsOpen(true)}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setIsOpen(true);
                setSelectedIndex(0);
                if (selectedProduct && e.target.value !== selectedProduct.name) {
                  setSelectedProduct(null);
                }
              }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="input pl-8 pr-7 py-1.5 text-xs bg-slate-50 focus:bg-white font-medium w-full border border-slate-300 focus:border-indigo-500 rounded-lg"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedProduct(null);
                  setRate('');
                  setIsOpen(false);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Autocomplete Dropdown */}
          {isOpen && filteredProducts.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl border border-slate-200 shadow-xl max-h-60 overflow-y-auto z-50 divide-y divide-slate-100">
              <div className="px-3 py-1 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase flex justify-between">
                <span>Matching Products ({filteredProducts.length})</span>
                <span>Use &uarr;&darr; to navigate &middot; Enter to pick</span>
              </div>
              {filteredProducts.map((p, idx) => {
                const isSelected = idx === selectedIndex;
                const defaultRate = mode === 'purchase' ? p.cost || p.price : p.price;
                return (
                  <div
                    key={p.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectProduct(p);
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`px-3 py-2 cursor-pointer transition flex items-center justify-between gap-2 ${
                      isSelected ? 'bg-indigo-50 text-indigo-950 font-bold' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-900 truncate font-semibold">{p.name}</p>
                      <div className="flex items-center gap-2 text-[10.5px] text-slate-400">
                        {p.rackNumber && <span>Rack: <strong className="text-slate-600">{p.rackNumber}</strong></span>}
                        {p.hsnCode && <span>HSN: {p.hsnCode}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-mono font-bold text-slate-800 block">
                        ₹{defaultRate.toFixed(2)}
                      </span>
                      <span className={`text-[10px] ${p.stock <= 10 ? 'text-amber-600 font-bold' : 'text-slate-400'}`}>
                        Stock: {p.stock}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Qty */}
        <div className="sm:col-span-2">
          <input
            ref={qtyInputRef}
            type="number"
            min="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder="Qty"
            className="input py-1.5 px-2 text-xs font-bold text-center w-full border border-slate-300 rounded-lg"
          />
        </div>

        {/* Rate (₹) */}
        <div className="sm:col-span-2">
          <input
            type="number"
            step="0.01"
            min="0"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder={mode === 'purchase' ? 'Cost Rate (₹)' : 'Rate (₹)'}
            className="input py-1.5 px-2 text-xs font-mono font-bold text-right w-full border border-slate-300 rounded-lg"
          />
        </div>

        {/* Disc % (Sale only) */}
        {mode === 'sale' ? (
          <div className="sm:col-span-1">
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              placeholder="Disc %"
              className="input py-1.5 px-1 text-xs font-mono font-bold text-right w-full border border-slate-300 rounded-lg"
            />
          </div>
        ) : null}

        {/* Add Button */}
        <div className={mode === 'sale' ? 'sm:col-span-2' : 'sm:col-span-3'}>
          <button
            type="button"
            onClick={handleAdd}
            className="btn-primary w-full py-1.5 px-3 text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Item</span>
          </button>
        </div>
      </div>
    </div>
  );
}
