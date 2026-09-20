import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Plus,
  Minus,
  Trash2,
  Search,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Package,
  X,
  Edit3,
  ShoppingCart,
} from 'lucide-react';
import { money } from '@/utils/analytics';
import { smartFilterItems } from '@/utils/search';
import type { Product, DiscountType } from '@/lib/types';
import Modal from '@/components/Modal';
import ProductForm, { type ProductFormData } from '@/components/ProductForm';
import { useStore } from '@/store/AppStore';
import { handleNumericFocus, handleNumericClick, handleNumericKeyDown, cleanLeadingZeros } from '@/utils/numberInput';

export interface ERPLineItem {
  productId: string;
  name: string;
  price: number; // Rate for sale, Cost rate for purchase
  cost?: number;
  qty: number;
  discount?: number;
  discountType?: DiscountType | 'fixed' | 'percent';
  isCustom?: boolean;
  hsnCode?: string;
  rackNumber?: string;
}

export interface ERPProductItemsManagerProps {
  title?: string;
  mode?: 'sale' | 'purchase';
  items: ERPLineItem[];
  products: Product[];
  onAddItem: (productId: string, product?: Product) => void;
  onUpdateQty: (productId: string, qty: number) => void;
  onUpdatePrice: (productId: string, price: number) => void;
  onUpdateDiscount?: (productId: string, discount: number) => void;
  onUpdateName?: (productId: string, name: string) => void;
  onUpdateHsn?: (productId: string, hsn: string) => void;
  onRemoveItem: (productId: string) => void;
  onQuickEditProduct?: (product: Product) => void;
  onOpenCustomModal?: () => void;
  onOpenProductMasterModal?: () => void;
  searchPlaceholder?: string;
  hideMasterShortcut?: boolean;
}

/**
 * High-Speed Industrial ERP Product Selector & Items Manager
 *
 * Requirements:
 * 1. Product Selector INITIAL POSITION: at the VERY TOP when items.length === 0.
 * 2. When a product is selected/added:
 *    - The selected product(s) are at the TOP in a clear, editable table.
 *    - The selection bar MOVES DOWN directly below the added products table.
 *    - Eliminates scrolling to see previously added items.
 * 3. Product Master Button is a clean shortcut:
 *    - Single "+" icon (no "+ + Add New Product Master").
 *    - Opens the standard Product Master modal to add products directly to the main inventory catalog.
 */
export function ERPProductItemsManager({
  title,
  mode = 'sale',
  items,
  products,
  onAddItem,
  onUpdateQty,
  onUpdatePrice,
  onUpdateDiscount,
  onUpdateName,
  onUpdateHsn,
  onRemoveItem,
  onQuickEditProduct,
  onOpenCustomModal,
  onOpenProductMasterModal,
  searchPlaceholder,
  hideMasterShortcut = false,
}: ERPProductItemsManagerProps) {
  const { addProduct } = useStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Shortcut Product Master Modal State
  const [isMasterModalOpen, setIsMasterModalOpen] = useState(false);
  const [masterInitialName, setMasterInitialName] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter products matching search term (Name, Rack, HSN, Supplier)
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) {
      return products.slice(0, 10);
    }
    return smartFilterItems(
      products,
      searchTerm.trim(),
      (p) => [p.name, p.rackNumber, p.hsnCode, p.supplier]
    ).slice(0, 15);
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

  // Keyboard navigation for search input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setIsOpen(true);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < filteredProducts.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredProducts.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredProducts.length > 0 && selectedIndex < filteredProducts.length) {
        const picked = filteredProducts[selectedIndex];
        onAddItem(picked.id, picked);
        setSearchTerm('');
        setIsOpen(false);
        setSelectedIndex(0);
        searchInputRef.current?.focus();
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setSearchTerm('');
    }
  };

  const handleSelectProduct = (product: Product) => {
    onAddItem(product.id, product);
    setSearchTerm('');
    setIsOpen(false);
    setSelectedIndex(0);
    searchInputRef.current?.focus();
  };

  const handleSaveMasterProduct = async (formData: ProductFormData) => {
    try {
      const created = await addProduct(formData);
      setIsMasterModalOpen(false);
      setMasterInitialName('');
      setToastMsg(`✓ "${created.name}" added to Product Master!`);
      setTimeout(() => setToastMsg(null), 4000);
      // Auto add to list
      onAddItem(created.id, created);
    } catch (err: any) {
      alert(err?.message || 'Failed to add product to catalog');
    }
  };

  // Subtotal calculation
  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const rate = item.price || 0;
      const netRate = mode === 'sale' ? rate * (1 - (item.discount || 0) / 100) : rate;
      return sum + (item.qty || 0) * netRate;
    }, 0);
  }, [items, mode]);

  const totalUnits = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.qty || 0), 0);
  }, [items]);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-3">
      {/* Toast Feedback */}
      {toastMsg && (
        <div className="bg-emerald-600 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center justify-between shadow-sm animate-fade-in">
          <span>{toastMsg}</span>
          <button
            type="button"
            onClick={() => setToastMsg(null)}
            className="text-emerald-100 hover:text-white p-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <ShoppingCart className="w-4 h-4 text-indigo-600" />
            <span>{title || (mode === 'purchase' ? 'Items Added to Order' : 'Items Added to Invoice')}</span>
          </label>
          {items.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-200">
              {items.length} {items.length === 1 ? 'item' : 'items'} ({totalUnits} pcs)
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!hideMasterShortcut && (
            <button
              type="button"
              onClick={() => {
                if (onOpenProductMasterModal) {
                  onOpenProductMasterModal();
                } else {
                  setMasterInitialName(searchTerm.trim());
                  setIsMasterModalOpen(true);
                }
              }}
              className="text-xs font-bold px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition flex items-center gap-1.5 shadow-2xs"
              title="Shortcut to quickly add a product into the main inventory catalog"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-600" />
              <span>Add to Product Master</span>
            </button>
          )}

          {onOpenCustomModal && (
            <button
              type="button"
              onClick={onOpenCustomModal}
              className="text-xs font-bold px-3 py-1.5 rounded-lg border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 transition flex items-center gap-1.5 shadow-2xs"
              title="Add custom / outsourced non-inventory product"
            >
              <Plus className="w-3.5 h-3.5 text-purple-600" />
              <span>Custom / Direct-Sourced</span>
            </button>
          )}
        </div>
      </div>

      {/* 
        LAYOUT BEHAVIOR:
        1. If items.length > 0:
           Selected Products Table renders AT THE TOP!
           Selection Search Bar moves DOWN below the Table!
        2. If items.length === 0:
           Selection Search Bar renders AT THE TOP (Initial Position)!
      */}

      {/* 1. SELECTED PRODUCTS TABLE (At the top once products are selected) */}
      {items.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50/90 text-[11px] font-bold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-2.5 py-2 text-center w-10">Sr.</th>
                  <th className="px-3 py-2 min-w-[200px]">Product / Description</th>
                  <th className="px-3 py-2 w-28 text-center">HSN Code</th>
                  <th className="px-3 py-2 w-32 text-center">Quantity</th>
                  <th className="px-3 py-2 w-28 text-right">
                    {mode === 'purchase' ? 'Cost Rate (₹)' : 'Rate (₹)'}
                  </th>
                  {mode === 'sale' && (
                    <th className="px-3 py-2 w-20 text-right">Disc %</th>
                  )}
                  <th className="px-3 py-2 w-28 text-right">Total (₹)</th>
                  <th className="px-2 py-2 text-center w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {items.map((line, idx) => {
                  const prod = products.find((p) => p.id === line.productId);
                  const rate = line.price || 0;
                  const qty = line.qty || 1;
                  const disc = line.discount || 0;
                  const netRate = mode === 'sale' ? rate * (1 - disc / 100) : rate;
                  const lineTotal = +(qty * netRate).toFixed(2);
                  const isOverStock =
                    mode === 'sale' &&
                    !line.isCustom &&
                    prod !== undefined &&
                    qty > prod.stock;

                  return (
                    <tr
                      key={`${line.productId}-${idx}`}
                      className={`hover:bg-slate-50/80 transition ${
                        isOverStock ? 'bg-rose-50/40' : ''
                      }`}
                    >
                      {/* Sr. No */}
                      <td className="px-2.5 py-2 text-center font-bold text-slate-500">
                        {idx + 1}
                      </td>

                      {/* Product Name & Location / Stock */}
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-between gap-1">
                          {onUpdateName ? (
                            <input
                              type="text"
                              value={line.name}
                              onChange={(e) => onUpdateName(line.productId, e.target.value)}
                              className="font-bold text-slate-900 bg-transparent hover:bg-slate-100/70 px-1 py-0.5 rounded text-xs w-full focus:bg-white focus:ring-1 focus:ring-indigo-400"
                            />
                          ) : (
                            <span className="font-bold text-slate-900">{line.name}</span>
                          )}

                          {line.isCustom && (
                            <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200 shrink-0">
                              Custom
                            </span>
                          )}

                          {prod && onQuickEditProduct && (
                            <button
                              type="button"
                              onClick={() => onQuickEditProduct(prod)}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition shrink-0"
                              title="Edit product details in Master Catalog"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        {/* Rack and Available Stock Indicators */}
                        <div className="flex items-center gap-2 mt-0.5 text-[10.5px] flex-wrap">
                          {(prod?.rackNumber || line.rackNumber) && (
                            <span className="text-slate-500 font-medium">
                              Rack:{' '}
                              <strong className="text-slate-700">
                                {prod?.rackNumber || line.rackNumber}
                              </strong>
                            </span>
                          )}

                          {prod && !line.isCustom && (
                            <span>
                              {mode === 'sale' ? (
                                isOverStock ? (
                                  <span className="font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" />
                                    Avail: {prod.stock} pcs (Exceeds stock!)
                                  </span>
                                ) : (
                                  <span className="text-slate-500">
                                    Avail Stock:{' '}
                                    <strong
                                      className={
                                        prod.stock <= 0
                                          ? 'text-rose-600'
                                          : 'text-emerald-700'
                                      }
                                    >
                                      {prod.stock} pcs
                                    </strong>
                                  </span>
                                )
                              ) : (
                                <span className="text-slate-500">
                                  Current Stock:{' '}
                                  <strong className="text-slate-700">
                                    {prod.stock} pcs
                                  </strong>
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* HSN Code */}
                      <td className="px-3 py-2 text-center">
                        {onUpdateHsn ? (
                          <input
                            type="text"
                            value={line.hsnCode || ''}
                            onChange={(e) => onUpdateHsn(line.productId, e.target.value)}
                            placeholder="7318150"
                            className="input font-mono text-center text-xs py-1 px-1 bg-white border border-slate-200 w-24 rounded"
                          />
                        ) : (
                          <span className="font-mono text-slate-500 text-xs">
                            {line.hsnCode || '—'}
                          </span>
                        )}
                      </td>

                      {/* Quantity with - / + */}
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => onUpdateQty(line.productId, Math.max(1, qty - 1))}
                            className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs transition shrink-0"
                            title="Decrease Qty"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={qty}
                            onFocus={handleNumericFocus}
                            onClick={handleNumericClick}
                            onKeyDown={handleNumericKeyDown}
                            onChange={(e) => {
                              const clean = cleanLeadingZeros(e.target.value);
                              e.target.value = clean;
                              onUpdateQty(
                                line.productId,
                                clean === '' ? 1 : Math.max(1, parseInt(clean, 10) || 1)
                              );
                            }}
                            className="w-16 text-center font-extrabold text-xs py-1 px-1 rounded-md border border-slate-300 bg-white focus:border-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={() => onUpdateQty(line.productId, qty + 1)}
                            className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs transition shrink-0"
                            title="Increase Qty"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </td>

                      {/* Rate */}
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={rate}
                          onFocus={handleNumericFocus}
                          onClick={handleNumericClick}
                          onKeyDown={handleNumericKeyDown}
                          onChange={(e) => {
                            const clean = cleanLeadingZeros(e.target.value);
                            e.target.value = clean;
                            onUpdatePrice(
                              line.productId,
                              clean === '' ? 0 : Math.max(0, parseFloat(clean) || 0)
                            );
                          }}
                          className="w-24 font-mono font-bold text-xs py-1 px-2 rounded-md border border-slate-300 text-right bg-white focus:border-indigo-500"
                        />
                      </td>

                      {/* Discount % (Sale only) */}
                      {mode === 'sale' && (
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={disc}
                            onFocus={handleNumericFocus}
                            onClick={handleNumericClick}
                            onKeyDown={handleNumericKeyDown}
                            onChange={(e) => {
                              const clean = cleanLeadingZeros(e.target.value);
                              e.target.value = clean;
                              onUpdateDiscount?.(
                                line.productId,
                                clean === '' ? 0 : Math.max(0, parseFloat(clean) || 0)
                              );
                            }}
                            disabled={!onUpdateDiscount}
                            className="w-16 font-mono font-bold text-xs py-1 px-1 rounded-md border border-slate-300 text-right bg-white focus:border-indigo-500"
                          />
                        </td>
                      )}

                      {/* Total */}
                      <td className="px-3 py-2 text-right">
                        <span className="font-mono font-bold text-xs text-slate-900 block">
                          {money(lineTotal)}
                        </span>
                      </td>

                      {/* Remove Button */}
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => onRemoveItem(line.productId)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="Remove item from list"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50/90 text-xs font-bold border-t border-slate-200">
                <tr>
                  <td
                    colSpan={mode === 'sale' ? 6 : 5}
                    className="px-3 py-2 text-right text-slate-600"
                  >
                    Items Subtotal ({totalUnits} pcs):
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-emerald-800 font-extrabold">
                    {money(subtotal)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* 2. PRODUCT SELECTOR (SEARCH BAR)
          - Initial position: AT THE VERY TOP when items.length === 0.
          - After selecting a product: MOVES DOWN directly below the table.
      */}
      <div className="space-y-1.5" ref={containerRef}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onFocus={() => setIsOpen(true)}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setIsOpen(true);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              items.length === 0
                ? searchPlaceholder ||
                  'Search 990+ products (e.g. ss304, allen bolt, 5x10, rack #)... Press Enter to add'
                : `Search next product (Line #${items.length + 1})... Press Enter to add`
            }
            className={`input pl-9 pr-8 py-2 bg-white text-xs font-medium w-full border rounded-xl shadow-2xs transition ${
              items.length === 0
                ? 'border-indigo-400 ring-2 ring-indigo-50 focus:border-indigo-600'
                : 'border-slate-300 focus:border-indigo-500'
            }`}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setIsOpen(false);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Autocomplete Dropdown List */}
        {isOpen && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden animate-fade-in divide-y divide-slate-100 z-50">
            <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between text-[11px] text-slate-600 font-semibold">
              <span>
                Matching Products ({filteredProducts.length}{' '}
                {filteredProducts.length === 1 ? 'item' : 'items'})
              </span>
              <span className="text-slate-400 text-[10.5px]">
                Use &uarr;&darr; to navigate &middot; Press Enter or click &quot;+ Add&quot;
              </span>
            </div>

            {filteredProducts.length === 0 ? (
              <div className="p-3.5 flex flex-col sm:flex-row items-center justify-between bg-emerald-50/50 gap-2">
                <div className="text-xs text-emerald-950">
                  <span className="font-semibold">
                    No catalog match for &quot;{searchTerm}&quot;.
                  </span>
                  <span className="text-emerald-700 block text-[11px]">
                    Use the shortcut to add it directly to your main inventory catalog.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMasterInitialName(searchTerm.trim());
                      setIsMasterModalOpen(true);
                      setIsOpen(false);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition whitespace-nowrap shadow-xs flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add &quot;{searchTerm}&quot; to Product Master</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                {filteredProducts.map((p, idx) => {
                  const isSelected = idx === selectedIndex;
                  const addedLine = items.find((l) => l.productId === p.id);
                  const defaultRate =
                    mode === 'purchase' ? p.cost || p.price : p.price;

                  return (
                    <div
                      key={p.id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectProduct(p);
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex items-center justify-between p-2.5 transition text-left text-xs cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50/80 text-indigo-950 font-medium'
                          : addedLine
                          ? 'bg-emerald-50/40 hover:bg-emerald-50/70'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-3">
                        <p className="font-bold text-slate-800 leading-tight truncate">
                          {p.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 flex-wrap">
                          {p.rackNumber && (
                            <span className="text-slate-600 font-medium">
                              Rack: <strong className="text-slate-800">{p.rackNumber}</strong>
                            </span>
                          )}
                          <span>
                            Avail Stock:{' '}
                            <strong
                              className={
                                p.stock <= 0 ? 'text-rose-600' : 'text-emerald-700'
                              }
                            >
                              {p.stock} pcs
                            </strong>
                          </span>
                          {p.hsnCode && (
                            <span className="font-mono text-slate-400">
                              HSN: {p.hsnCode}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-bold text-indigo-600 font-mono">
                          {money(defaultRate)}
                        </span>

                        {onQuickEditProduct && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onQuickEditProduct(p);
                            }}
                            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
                            title="Quick Edit Product Master"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectProduct(p);
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-xs ${
                            addedLine
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-indigo-600 text-white hover:bg-indigo-700'
                          }`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{addedLine ? `Added (${addedLine.qty})` : '+ Add'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pt-0.5">
          <span>
            💡 Press <strong>Enter</strong> to add highlighted match &middot; Use &uarr;&darr; to navigate
          </span>
          {items.length === 0 && (
            <span className="text-indigo-600 font-semibold">
              Select product above to start invoice &darr;
            </span>
          )}
        </div>
      </div>

      {/* Shortcut Modal: Add Product to Master Catalog */}
      <Modal
        open={isMasterModalOpen}
        onClose={() => {
          setIsMasterModalOpen(false);
          setMasterInitialName('');
        }}
        title="Add Product to Master Catalog (Shortcut)"
        size="lg"
      >
        <ProductForm
          initial={masterInitialName ? ({ name: masterInitialName } as any) : undefined}
          onSubmit={handleSaveMasterProduct}
          onCancel={() => {
            setIsMasterModalOpen(false);
            setMasterInitialName('');
          }}
        />
      </Modal>
    </div>
  );
}

// Backward compatibility export if needed elsewhere
export const ActiveItemSpotlight = ERPProductItemsManager;
export const FastItemEntryBar = ERPProductItemsManager;
export default ERPProductItemsManager;
