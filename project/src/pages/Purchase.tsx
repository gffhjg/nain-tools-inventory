import { useState, useMemo, useEffect, useDeferredValue } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Plus, Search, Download, Eye, Truck, PackageCheck, Clock, FileText,
  Trash2, Minus, Printer, CheckCircle2, Package, X, AlertTriangle, Sparkles,
  ShoppingCart, ArrowRight, Landmark, CreditCard, Calendar,
  Zap, Wallet, Receipt, SlidersHorizontal, ChevronDown, ChevronUp, RefreshCw
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import Modal from '@/components/Modal';
import { printPurchase, printInvoice } from '@/components/PrintableInvoice';
import { useStore } from '@/store/AppStore';
import { GST_RATE, computeDiscountAmount, computeGrandTotal, productCategories } from '@/lib/constants';
import {
  downloadCSV,
  toCSV,
  money,
  moneyShort,
  filterByDateRange,
  getDateRangeLabel,
  getDateRangeBounds,
  getDaysAgo,
  formatRelativeDate,
  type DateRange,
} from '@/utils/analytics';
import { smartFilterItems } from '@/utils/search';
import type { PurchaseRecord, PurchaseLineItem, PurchasePaymentMethod, SaleRecord, InvoiceLineItem, DiscountType, Product, ChequeStatus, Supplier } from '@/lib/types';

const paymentTone: Record<PurchasePaymentMethod, string> = {
  Cash: 'bg-accent-50 text-accent-600',
  UPI: 'bg-brand-50 text-brand-600',
  'Bank Transfer': 'bg-amber-50 text-amber-600',
  Cheque: 'bg-indigo-50 text-indigo-600',
  'Credit / Pay Later': 'bg-warn-50 text-warn-600',
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nextPONumber(existing: PurchaseRecord[]): string {
  const nums = existing
    .map((p) => parseInt(p.poNumber.replace('PO-', ''), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 3100;
  return `PO-${max + 1}`;
}

function nextPurchaseBill(existingSales: SaleRecord[]): string {
  const nums = existingSales
    .filter((s) => s.documentType === 'PURCHASE BILL' || s.invoice.startsWith('PI-') || s.invoice.startsWith('PB-'))
    .map((s) => parseInt(s.invoice.replace(/^(PI|PB)-/, ''), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 3100;
  return `PI-${max + 1}`;
}

function nextCreditNote(existingSales: SaleRecord[]): string {
  const nums = existingSales
    .filter((s) => s.documentType === 'CREDIT NOTE' || s.invoice.startsWith('CN-'))
    .map((s) => parseInt(s.invoice.replace(/^CN-/, ''), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 1000;
  return `CN-${max + 1}`;
}

function nextDebitNote(existingSales: SaleRecord[]): string {
  const nums = existingSales
    .filter((s) => s.documentType === 'DEBIT NOTE' || s.invoice.startsWith('DN-'))
    .map((s) => parseInt(s.invoice.replace(/^DN-/, ''), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 1000;
  return `DN-${max + 1}`;
}

function nextRawPurchaseNumber(existingSales: SaleRecord[]): string {
  const nums = existingSales
    .filter((s) => s.documentType === 'RAW PURCHASE' || s.invoice.startsWith('RP-') || s.invoice.startsWith('RAW-P-'))
    .map((s) => parseInt(s.invoice.replace(/^(RP-|RAW-P-)/, ''), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 1000;
  return `RP-${max + 1}`;
}

type DraftLine = PurchaseLineItem;

const PURCHASE_TIMELINE_STEPS: { id: DateRange; label: string; shortLabel: string }[] = [
  { id: 'today', label: 'Today', shortLabel: 'Today' },
  { id: '3d', label: 'Past 3 Days', shortLabel: '3D' },
  { id: '7d', label: 'Past 7 Days', shortLabel: '7D' },
  { id: '14d', label: 'Past 14 Days', shortLabel: '14D' },
  { id: '30d', label: 'Past 30 Days', shortLabel: '30D' },
  { id: '90d', label: 'Past 90 Days', shortLabel: '90D' },
  { id: 'all', label: 'All Time', shortLabel: 'All' },
];

export default function Purchase() {
  const { purchases, products, suppliers, sales, addPurchase, updatePurchase, deletePurchase, addSale, addProduct, addSupplier, deleteSale, updatePurchasePayment, companySettings } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [activePurchaseSubTab, setActivePurchaseSubTab] = useState<'bills' | 'raw-purchases'>('bills');
  const [timelineRange, setTimelineRange] = useState<DateRange>('all');
  const [isTimelineOpen, setIsTimelineOpen] = useState<boolean>(() => {
    return localStorage.getItem('nain_purchase_timeline_open') === 'true';
  });

  const toggleTimeline = () => {
    setIsTimelineOpen((prev) => {
      const next = !prev;
      localStorage.setItem('nain_purchase_timeline_open', String(next));
      return next;
    });
  };

  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [activeTab, setActiveTab] = useState<'all' | 'bills' | 'credit-notes' | 'suggestions'>('all');

  // Raw Purchases (Cash / UPI Inward Counter Purchases) State
  const [rawPurFilter, setRawPurFilter] = useState<'all' | 'Cash' | 'UPI'>('all');
  const [rawPurSearch, setRawPurSearch] = useState('');
  const [rawPurchaseModalOpen, setRawPurchaseModalOpen] = useState(false);
  const [rawPurNumber, setRawPurNumber] = useState('');
  const [rawPurDate, setRawPurDate] = useState(todayISO());
  const [rawPurNote, setRawPurNote] = useState('');
  const [rawPurPaymentMethod, setRawPurPaymentMethod] = useState<'Cash' | 'UPI'>('Cash');
  const [rawPurLines, setRawPurLines] = useState<InvoiceLineItem[]>([]);
  const [rawPurProductSearch, setRawPurProductSearch] = useState('');
  const [rawPurCategory, setRawPurCategory] = useState('All');
  const [viewingRawPur, setViewingRawPur] = useState<SaleRecord | null>(null);

  // New Product Creator State in Raw Purchase (auto-adds to Main Inventory & Inward List)
  const [isAddingRawPurProduct, setIsAddingRawPurProduct] = useState(false);
  const [rawNewProdName, setRawNewProdName] = useState('');
  const [rawNewProdCategory, setRawNewProdCategory] = useState('Bolts');
  const [rawNewProdRack, setRawNewProdRack] = useState('');
  const [rawNewProdSize, setRawNewProdSize] = useState('');
  const [rawNewProdCost, setRawNewProdCost] = useState('');
  const [rawNewProdPrice, setRawNewProdPrice] = useState('');
  const [rawNewProdInwardQty, setRawNewProdInwardQty] = useState('1');
  const [rawNewProdHsn, setRawNewProdHsn] = useState('7318150');

  const [modalOpen, setModalOpen] = useState(false);
  const [supplier, setSupplier] = useState('');
  const [supplierInvoice, setSupplierInvoice] = useState('');
  const [phone, setPhone] = useState('');
  const [date, setDate] = useState(todayISO());
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [notes, setNotes] = useState('');
  const [poStatus, setPoStatus] = useState<'draft' | 'ordered' | 'partially-received' | 'received' | 'cancelled'>('received');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [paymentStatus, setPaymentStatus] = useState<'Paid' | 'Pending'>('Paid');
  const [paymentMethod, setPaymentMethod] = useState<PurchasePaymentMethod>('Bank Transfer');
  const [poDueDate, setPoDueDate] = useState('');
  const [poPaymentTerms, setPoPaymentTerms] = useState('Immediate');
  const [poChequeNo, setPoChequeNo] = useState('');
  const [poChequeBank, setPoChequeBank] = useState('');
  const [poChequeDate, setPoChequeDate] = useState(todayISO());
  const [poChequeStatus, setPoChequeStatus] = useState<ChequeStatus>('pending_clearance');

  // Quick Record Payment Modal for Purchase Orders
  const [payTargetPO, setPayTargetPO] = useState<PurchaseRecord | null>(null);
  const [recordPayAmount, setRecordPayAmount] = useState('');
  const [recordPayMethod, setRecordPayMethod] = useState<PurchasePaymentMethod>('Bank Transfer');
  const [recordPayChequeNo, setRecordPayChequeNo] = useState('');
  const [recordPayChequeBank, setRecordPayChequeBank] = useState('');
  const [recordPayChequeDate, setRecordPayChequeDate] = useState(todayISO());

  const [productSearch, setProductSearch] = useState('');
  const [poCategory, setPoCategory] = useState('All');

  // New Product Creator State in Purchase Order (auto-adds to Main Inventory)
  const [isAddingNewProduct, setIsAddingNewProduct] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdCategory, setNewProdCategory] = useState('Bolts');
  const [newProdRack, setNewProdRack] = useState('');
  const [newProdSize, setNewProdSize] = useState('');
  const [newProdCost, setNewProdCost] = useState('');
  const [newProdPrice, setNewProdPrice] = useState('');
  const [newProdBoxCap, setNewProdBoxCap] = useState('1000');
  const [newProdReorder, setNewProdReorder] = useState('100');
  const [newProdHsn, setNewProdHsn] = useState('7318150');
  const [newProdQty, setNewProdQty] = useState('1000');

  // New Product Creator State in Purchase Bill (auto-adds to Main Inventory)
  const [isAddingPbNewProduct, setIsAddingPbNewProduct] = useState(false);
  const [pbNewProdName, setPbNewProdName] = useState('');
  const [pbNewProdCategory, setPbNewProdCategory] = useState('Bolts');
  const [pbNewProdRack, setPbNewProdRack] = useState('');
  const [pbNewProdSize, setPbNewProdSize] = useState('');
  const [pbNewProdCost, setPbNewProdCost] = useState('');
  const [pbNewProdPrice, setPbNewProdPrice] = useState('');
  const [pbNewProdBoxCap, setPbNewProdBoxCap] = useState('1000');
  const [pbNewProdReorder, setPbNewProdReorder] = useState('100');
  const [pbNewProdHsn, setPbNewProdHsn] = useState('7318150');

  // Supplier Combobox Autocomplete Dropdown state
  const [showPbSupplierDropdown, setShowPbSupplierDropdown] = useState(false);
  const [showPoSupplierDropdown, setShowPoSupplierDropdown] = useState(false);

  // Purchase Bill Modal State (rich Tax Invoice features for Purchase Bill)
  const [pbModalOpen, setPbModalOpen] = useState(false);
  const [pbSupplierId, setPbSupplierId] = useState('');
  const [pbSupplier, setPbSupplier] = useState('');
  const [pbPhone, setPbPhone] = useState('');
  const [pbAddress, setPbAddress] = useState('');
  const [pbGstin, setPbGstin] = useState('');
  const [pbCustomBillNumber, setPbCustomBillNumber] = useState('');
  const [pbDate, setPbDate] = useState(todayISO());
  const [pbPoNumber, setPbPoNumber] = useState('');
  const [pbPoDate, setPbPoDate] = useState('');
  const [pbTransportMode, setPbTransportMode] = useState('');
  const [pbVehicleNumber, setPbVehicleNumber] = useState('');
  const [pbEwayBill, setPbEwayBill] = useState('');
  const [pbVendorCode, setPbVendorCode] = useState('');
  const [pbBankName, setPbBankName] = useState(companySettings?.bankName || 'HDFC BANK');
  const [pbBankAccount, setPbBankAccount] = useState(companySettings?.bankAccount || '50200088182531');
  const [pbBankIfsc, setPbBankIfsc] = useState(companySettings?.bankIfsc || 'HDFC0002034');
  const [pbSellerGstin, setPbSellerGstin] = useState(companySettings?.gstin || '06CCCPK0841B1ZA');
  const [pbSellerPan, setPbSellerPan] = useState(companySettings?.pan || 'CCCPK0841B');
  const [pbApplyGst, setPbApplyGst] = useState(true);
  const [pbGstRate, setPbGstRate] = useState(18);
  const [pbGstTaxType, setPbGstTaxType] = useState<'local' | 'central'>('local');

  useEffect(() => {
    if (companySettings) {
      setPbBankName(companySettings.bankName || 'HDFC BANK');
      setPbBankAccount(companySettings.bankAccount || '50200088182531');
      setPbBankIfsc(companySettings.bankIfsc || 'HDFC0002034');
      setPbSellerGstin(companySettings.gstin || '06CCCPK0841B1ZA');
      setPbSellerPan(companySettings.pan || 'CCCPK0841B');
    }
  }, [companySettings]);
  const [pbDiscount, setPbDiscount] = useState(0);
  const [pbDiscountType, setPbDiscountType] = useState<DiscountType>('percent');
  const [pbFreightCharges, setPbFreightCharges] = useState<string>('');
  const [pbLines, setPbLines] = useState<InvoiceLineItem[]>([]);
  const [pbProductSearch, setPbProductSearch] = useState('');
  const [pbCategory, setPbCategory] = useState('All');
  const [pbViewing, setPbViewing] = useState<SaleRecord | null>(null);
  const [pbDocumentType, setPbDocumentType] = useState<'PURCHASE BILL' | 'CREDIT NOTE' | 'DEBIT NOTE'>('PURCHASE BILL');
  const [pbPreviewCopyTag, setPbPreviewCopyTag] = useState('Original For Recipient');
  const [pbExportCopies, setPbExportCopies] = useState<Record<string, boolean>>({
    'Original For Recipient': true,
    'Duplicate For Transporter': true,
    'Triplicate For Supplier': true,
    'Extra Copy': true,
  });

  const autoPbNumber = useMemo(() => {
    if (pbDocumentType === 'CREDIT NOTE') return nextCreditNote(sales);
    if (pbDocumentType === 'DEBIT NOTE') return nextDebitNote(sales);
    return nextPurchaseBill(sales);
  }, [sales, pbDocumentType]);
  const pbNumber = pbCustomBillNumber.trim() || autoPbNumber;

  const poNumber = useMemo(() => nextPONumber(purchases), [purchases]);

  const filteredPbSuppliers = useMemo(() => {
    return smartFilterItems(
      suppliers,
      pbSupplier,
      (s) => [s.name, s.phone, s.gstin, s.address],
      { maxResults: 8 }
    );
  }, [suppliers, pbSupplier]);

  const filteredPoSuppliers = useMemo(() => {
    return smartFilterItems(
      suppliers,
      supplier,
      (s) => [s.name, s.phone, s.gstin, s.address],
      { maxResults: 8 }
    );
  }, [suppliers, supplier]);

  // Inventory restock low-stock suggestions calculation
  const lowStockItems = useMemo(() => {
    return products.filter((p) => p.status === 'low-stock' || p.status === 'out-of-stock' || p.stock <= p.reorderLevel);
  }, [products]);

  const combinedRecords = useMemo(() => {
    type CombinedRecord =
      | { kind: 'po'; id: string; docNumber: string; typeLabel: 'PURCHASE BILL'; supplier: string; date: string; items: PurchaseLineItem[]; grandTotal: number; status: string; paymentMethod: string; paymentStatus: string; raw: PurchaseRecord }
      | { kind: 'bill'; id: string; docNumber: string; typeLabel: 'PURCHASE BILL' | 'CREDIT NOTE' | 'DEBIT NOTE'; supplier: string; date: string; items: InvoiceLineItem[]; grandTotal: number; status: string; paymentMethod: string; paymentStatus: string; raw: SaleRecord };

    const list: CombinedRecord[] = [];

    for (const p of purchases) {
      const docNumber = p.poNumber.startsWith('PO-')
        ? 'PB-' + p.poNumber.slice(3)
        : (p.poNumber || `PB-${p.id}`);

      list.push({
        kind: 'po',
        id: p.id,
        docNumber,
        typeLabel: 'PURCHASE BILL',
        supplier: p.supplier,
        date: p.date,
        items: p.items,
        grandTotal: p.grandTotal,
        status: p.status === 'received' ? 'completed' : p.status,
        paymentMethod: p.paymentMethod,
        paymentStatus: p.paymentStatus,
        raw: p,
      });
    }

    for (const s of sales) {
      if (
        s.documentType === 'PURCHASE BILL' ||
        s.documentType === 'CREDIT NOTE' ||
        s.documentType === 'DEBIT NOTE' ||
        s.invoice.startsWith('PI-') ||
        s.invoice.startsWith('PB-') ||
        s.invoice.startsWith('CN-') ||
        s.invoice.startsWith('DN-')
      ) {
        const typeLabel = (s.documentType === 'CREDIT NOTE' || s.invoice.startsWith('CN-'))
          ? 'CREDIT NOTE'
          : (s.documentType === 'DEBIT NOTE' || s.invoice.startsWith('DN-'))
          ? 'DEBIT NOTE'
          : 'PURCHASE BILL';

        list.push({
          kind: 'bill',
          id: s.id,
          docNumber: s.invoice,
          typeLabel,
          supplier: s.customer,
          date: s.date,
          items: s.items,
          grandTotal: s.grandTotal,
          status: s.status,
          paymentMethod: s.paymentMethod,
          paymentStatus: 'Paid',
          raw: s,
        });
      }
    }

    return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [purchases, sales]);

  const timelineFilteredPurchases = useMemo(() => {
    if (timelineRange === 'all') return combinedRecords;
    return filterByDateRange(combinedRecords, timelineRange);
  }, [combinedRecords, timelineRange]);

  const timelineSummary = useMemo(() => {
    const total = timelineFilteredPurchases.reduce((s, r) => s + r.grandTotal, 0);
    return {
      count: timelineFilteredPurchases.length,
      total,
      label: getDateRangeLabel(timelineRange),
    };
  }, [timelineFilteredPurchases, timelineRange]);

  const latestPurchaseDate = useMemo(() => {
    const valid = combinedRecords
      .filter((s) => s.date)
      .map((s) => s.date)
      .sort((a, b) => b.localeCompare(a));
    return valid[0] || null;
  }, [combinedRecords]);

  const sliderIndex = PURCHASE_TIMELINE_STEPS.findIndex((s) => s.id === timelineRange);

  const filtered = useMemo(() => {
    let list = timelineFilteredPurchases;
    if (activeTab === 'bills') {
      list = list.filter((rec) => rec.typeLabel === 'PURCHASE BILL');
    } else if (activeTab === 'credit-notes') {
      list = list.filter((rec) => rec.typeLabel === 'CREDIT NOTE');
    }

    const q = deferredSearch.toLowerCase().trim();
    if (!q) return list;
    return list.filter(
      (rec) =>
        rec.docNumber.toLowerCase().includes(q) ||
        rec.supplier.toLowerCase().includes(q) ||
        (rec.items && rec.items.some((i) => i.name.toLowerCase().includes(q)))
    );
  }, [timelineFilteredPurchases, deferredSearch, activeTab]);

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, activeTab, timelineRange, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedPurchases = useMemo(() => {
    if (pageSize >= 99999) return filtered;
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const allTimeSummary = useMemo(() => {
    const totalInward = combinedRecords.reduce((s, r) => s + r.grandTotal, 0);
    const totalPB = combinedRecords
      .filter((r) => r.typeLabel === 'PURCHASE BILL')
      .reduce((s, r) => s + r.grandTotal, 0);
    const countPB = combinedRecords.filter((r) => r.typeLabel === 'PURCHASE BILL').length;
    const totalCN = combinedRecords
      .filter((r) => r.typeLabel === 'CREDIT NOTE')
      .reduce((s, r) => s + r.grandTotal, 0);
    const countCN = combinedRecords.filter((r) => r.typeLabel === 'CREDIT NOTE').length;
    return { totalInward, totalPB, countPB, totalCN, countCN };
  }, [combinedRecords]);

  const summary = useMemo(() => {
    const activeRecords = timelineRange === 'all' ? combinedRecords : timelineFilteredPurchases;
    const totalInward = activeRecords.reduce((s, r) => s + r.grandTotal, 0);
    const totalPB = activeRecords
      .filter((r) => r.typeLabel === 'PURCHASE BILL')
      .reduce((s, r) => s + r.grandTotal, 0);
    const countPB = activeRecords.filter((r) => r.typeLabel === 'PURCHASE BILL').length;
    const totalCN = activeRecords
      .filter((r) => r.typeLabel === 'CREDIT NOTE')
      .reduce((s, r) => s + r.grandTotal, 0);
    const countCN = activeRecords.filter((r) => r.typeLabel === 'CREDIT NOTE').length;
    return {
      totalInward,
      totalPB,
      countPB,
      totalCN,
      countCN,
      allTimeTotalInward: allTimeSummary.totalInward,
    };
  }, [combinedRecords, timelineFilteredPurchases, timelineRange, allTimeSummary]);

  const statCards = [
    { label: 'Total Purchase Value', value: `₹${summary.totalInward.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: Truck, tone: 'bg-brand-50 text-brand-600' },
    { label: 'Purchase Bills', value: `${summary.countPB} (₹${summary.totalPB.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`, icon: PackageCheck, tone: 'bg-indigo-50 text-indigo-600' },
    { label: 'Credit Notes Issued', value: `${summary.countCN} (₹${summary.totalCN.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`, icon: FileText, tone: 'bg-rose-50 text-rose-600' },
    { label: 'Restock Suggestions', value: `${lowStockItems.length} items`, icon: Sparkles, tone: 'bg-amber-50 text-amber-600' },
  ];

  // Raw Purchases (Counter / Cash & UPI Purchases without GST bill)
  const rawPurchasesList = useMemo(
    () => sales.filter((s) => s.documentType === 'RAW PURCHASE' || s.invoice.startsWith('RP-')),
    [sales]
  );

  const filteredRawPurchases = useMemo(() => {
    let list = rawPurchasesList;
    if (rawPurFilter !== 'all') {
      list = list.filter((s) => s.paymentMethod === rawPurFilter);
    }
    const q = rawPurSearch.toLowerCase().trim();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.invoice.toLowerCase().includes(q) ||
        s.customer.toLowerCase().includes(q) ||
        (s.notes && s.notes.toLowerCase().includes(q)) ||
        (s.items && s.items.some((i) => i.name.toLowerCase().includes(q)))
    );
  }, [rawPurchasesList, rawPurFilter, rawPurSearch]);

  const rawPurSummary = useMemo(() => {
    const total = rawPurchasesList.reduce((s, r) => s + r.grandTotal, 0);
    const cash = rawPurchasesList.filter((s) => s.paymentMethod === 'Cash');
    const cashTotal = cash.reduce((s, r) => s + r.grandTotal, 0);
    const upi = rawPurchasesList.filter((s) => s.paymentMethod === 'UPI');
    const upiTotal = upi.reduce((s, r) => s + r.grandTotal, 0);
    const totalPieces = rawPurchasesList.reduce((s, r) => s + (r.items ? r.items.reduce((sum, i) => sum + i.qty, 0) : 0), 0);
    return {
      total,
      count: rawPurchasesList.length,
      cashTotal,
      cashCount: cash.length,
      upiTotal,
      upiCount: upi.length,
      totalPieces,
    };
  }, [rawPurchasesList]);

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + l.cost * l.qty, 0),
    [lines],
  );
  const gstAmount = +(subtotal * (GST_RATE / 100)).toFixed(2);
  const grandTotal = +(subtotal + gstAmount).toFixed(2);

  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => {
      if (p.category && p.category.trim()) cats.add(p.category.trim());
    });
    return ['All', ...Array.from(cats).sort()];
  }, [products]);

  const searchResults = useMemo(() => {
    return smartFilterItems(
      products,
      productSearch,
      (p) => [p.name, p.size, p.category, p.rackNumber],
      {
        activeCategory: poCategory,
        getCategory: (p) => p.category,
        maxResults: 100,
      }
    );
  }, [productSearch, products, poCategory]);



  const resetNewProductForm = () => {
    setNewProdName('');
    setNewProdCategory('Bolts');
    setNewProdRack('');
    setNewProdSize('');
    setNewProdCost('');
    setNewProdPrice('');
    setNewProdBoxCap('1000');
    setNewProdReorder('100');
    setNewProdHsn('7318150');
    setNewProdQty('1000');
    setIsAddingNewProduct(false);
  };

  const resetForm = () => {
    setSupplier('');
    setSupplierInvoice('');
    setPhone('');
    setDate(todayISO());
    setExpectedDelivery('');
    setNotes('');
    setPoStatus('received');
    setLines([]);
    setPaymentStatus('Paid');
    setPaymentMethod('Bank Transfer');
    setPoDueDate('');
    setPoPaymentTerms('Immediate');
    setPoChequeNo('');
    setPoChequeBank('');
    setPoChequeDate(todayISO());
    setPoChequeStatus('pending_clearance');
    setProductSearch('');
    setPoCategory('All');
    resetNewProductForm();
  };

  const poStatusOptions: { value: typeof poStatus; label: string }[] = [
    { value: 'draft', label: 'Draft' },
    { value: 'ordered', label: 'Ordered' },
    { value: 'partially-received', label: 'Partially Received' },
    { value: 'received', label: 'Received' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  const openNewPurchase = () => {
    resetForm();
    setModalOpen(true);
  };

  const onSupplierSelect = (name: string) => {
    setSupplier(name);
    const s = suppliers.find((x) => x.name === name);
    if (s && !phone) setPhone(s.phone);
  };

  const addLine = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === productId);
      if (existing) {
        return prev.map((l) => (l.productId === productId ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...prev,
        { productId: product.id, name: product.name, cost: product.cost, qty: 1, gstRate: GST_RATE },
      ];
    });
  };

  const addNewProductLine = () => {
    if (!newProdName.trim()) return;
    const costVal = parseFloat(newProdCost) || 0;
    const priceVal = parseFloat(newProdPrice) || +(costVal * 1.3).toFixed(2);
    const qtyVal = parseInt(newProdQty, 10) || 1000;
    const boxCapVal = parseInt(newProdBoxCap, 10) || 1000;
    const reorderVal = parseInt(newProdReorder, 10) || 100;
    const newTempId = `new_p${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    setLines((prev) => [
      ...prev,
      {
        productId: newTempId,
        name: newProdName.trim(),
        cost: costVal,
        qty: qtyVal,
        gstRate: GST_RATE,
        isNewProduct: true,
        category: newProdCategory.trim() || 'Fasteners',
        rackNumber: newProdRack.trim() || 'General',
        size: newProdSize.trim(),
        sellingPrice: priceVal,
        boxCapacity: boxCapVal,
        reorderLevel: reorderVal,
        hsnCode: newProdHsn.trim() || '7318150',
      },
    ]);

    resetNewProductForm();
  };

  const updateQty = (productId: string, delta: number) => {
    setLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, qty: Math.max(0, l.qty + delta) } : l)),
    );
  };

  const setQty = (productId: string, raw: string) => {
    const qty = parseInt(raw, 10);
    setLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, qty: isNaN(qty) ? 0 : Math.max(0, qty) } : l)),
    );
  };

  const setCost = (productId: string, cost: number) => {
    setLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, cost: Math.max(0, cost) } : l)),
    );
  };

  const updatePoLineName = (productId: string, name: string) => {
    setLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, name } : l)),
    );
  };

  const removeLine = (productId: string) => {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  };

  const createBillFromSuggestions = (selectedItems?: Product[]) => {
    const itemsToOrder = selectedItems || lowStockItems;
    if (itemsToOrder.length === 0) return;
    resetPbForm();
    setPbDocumentType('PURCHASE BILL');
    setPbCustomBillNumber(nextPurchaseBill(sales));

    const commonSupplierName = itemsToOrder[0]?.supplier || '';
    if (commonSupplierName) {
      setPbSupplier(commonSupplierName);
      const s = suppliers.find((x) => x.name.toLowerCase() === commonSupplierName.toLowerCase());
      if (s) {
        setPbSupplierId(s.id);
        setPbPhone(s.phone || '');
        setPbAddress(s.address || '');
        setPbGstin(s.gstin || '');
      }
    }

    const newPbLines: InvoiceLineItem[] = itemsToOrder.map((p) => {
      const neededQty = Math.max(p.reorderLevel * 2, p.boxCapacity - p.stock, 500);
      const taxable = +(neededQty * p.cost).toFixed(2);
      const halfRate = pbEffectiveGstRate / 2;
      const cgstAmt = pbGstTaxType === 'central' ? 0 : +(taxable * (halfRate / 100)).toFixed(2);
      const sgstAmt = pbGstTaxType === 'central' ? 0 : +(taxable * (halfRate / 100)).toFixed(2);
      const igstAmt = pbGstTaxType === 'central' ? +(taxable * (pbEffectiveGstRate / 100)).toFixed(2) : 0;
      const totalAmt = +(taxable + cgstAmt + sgstAmt + igstAmt).toFixed(2);

      return {
        productId: p.id,
        name: p.name,
        price: p.cost,
        qty: neededQty,
        cost: p.cost,
        hsnCode: p.hsnCode || '7318150',
      };
    });

    setPbLines(newPbLines);
    setNotes(`Auto-generated from Inventory Restock Suggestions (${itemsToOrder.length} items)`);
    setPbModalOpen(true);
  };

  const canSubmit = supplier.trim() !== '' && lines.length > 0;

  // Purchase Bill calculations & handlers
  const pbSubtotal = useMemo(
    () => pbLines.reduce((sum, line) => sum + line.price * line.qty, 0),
    [pbLines],
  );
  const pbFreightVal = parseFloat(pbFreightCharges) || 0;
  const pbEffectiveGstRate = pbApplyGst ? pbGstRate : 0;
  const {
    discountAmount: pbDiscountAmount,
    taxableAmount: pbTaxableAmount,
    gstAmount: pbGstAmount,
    rawTotal: pbRawTotal,
    roundOff: pbRoundOff,
    grandTotal: pbGrandTotal,
    hasRoundOff: pbHasRoundOff,
  } = computeGrandTotal(pbSubtotal, pbDiscount, pbDiscountType, pbEffectiveGstRate, pbFreightVal);

  const pbCgstAmount = pbApplyGst && pbGstTaxType === 'local' ? +(pbGstAmount / 2).toFixed(2) : 0;
  const pbSgstAmount = pbApplyGst && pbGstTaxType === 'local' ? +(pbGstAmount / 2).toFixed(2) : 0;
  const pbIgstAmount = pbApplyGst && pbGstTaxType === 'central' ? +pbGstAmount.toFixed(2) : 0;

  const pbSearchResults = useMemo(() => {
    return smartFilterItems(
      products,
      pbProductSearch,
      (p) => [p.name, p.size, p.category, p.rackNumber],
      {
        activeCategory: pbCategory,
        getCategory: (p) => p.category,
        maxResults: 100,
      }
    );
  }, [pbProductSearch, products, pbCategory]);

  const resetPbForm = () => {
    setPbSupplierId('');
    setPbSupplier('');
    setPbPhone('');
    setPbAddress('');
    setPbGstin('');
    setPbCustomBillNumber('');
    setPbDate(todayISO());
    setPbPoNumber('');
    setPbPoDate('');
    setPbTransportMode('');
    setPbVehicleNumber('');
    setPbEwayBill('');
    setPbVendorCode('');
    setPbBankName(companySettings?.bankName || 'HDFC BANK');
    setPbBankAccount(companySettings?.bankAccount || '50200088182531');
    setPbBankIfsc(companySettings?.bankIfsc || 'HDFC0002034');
    setPbSellerGstin(companySettings?.gstin || '06CCCPK0841B1ZA');
    setPbSellerPan(companySettings?.pan || 'CCCPK0841B');
    setPbApplyGst(true);
    setPbGstRate(18);
    setPbGstTaxType('local');
    setPbDiscount(0);
    setPbDiscountType('percent');
    setPbFreightCharges('');
    setPbLines([]);
    setPbProductSearch('');
    setPbCategory('All');
    setPbDocumentType('PURCHASE BILL');
  };

  const openNewPurchaseBill = () => {
    resetPbForm();
    setPbDocumentType('PURCHASE BILL');
    setPbCustomBillNumber(nextPurchaseBill(sales));
    setPbModalOpen(true);
  };

  const openNewCreditNote = () => {
    resetPbForm();
    setPbDocumentType('CREDIT NOTE');
    setPbCustomBillNumber(nextCreditNote(sales));
    setPbModalOpen(true);
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if ((location.state as any)?.openNewBill || params.get('action') === 'new-bill') {
      openNewPurchaseBill();
      window.history.replaceState({}, document.title, location.pathname);
    }
  }, [location]);

  const rawPurSearchResults = useMemo(() => {
    return smartFilterItems(
      products,
      rawPurProductSearch,
      (p) => [p.name, p.rackNumber, p.size, p.category],
      {
        activeCategory: rawPurCategory,
        getCategory: (p) => p.category,
        maxResults: 50,
      }
    );
  }, [products, rawPurProductSearch, rawPurCategory]);

  const openNewRawPurchase = () => {
    setRawPurNumber(nextRawPurchaseNumber(sales));
    setRawPurDate(todayISO());
    setRawPurNote('');
    setRawPurPaymentMethod('Cash');
    setRawPurLines([]);
    setRawPurProductSearch('');
    setRawPurCategory('All');
    setIsAddingRawPurProduct(false);
    setRawNewProdName('');
    setRawNewProdRack('');
    setRawNewProdSize('');
    setRawNewProdCost('');
    setRawNewProdPrice('');
    setRawNewProdInwardQty('1');
    setRawPurchaseModalOpen(true);
  };

  const addRawProductToPurchase = (p: Product) => {
    setRawPurLines((prev) => {
      const idx = prev.findIndex((l) => l.productId === p.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          price: p.cost || p.price,
          cost: p.cost,
          qty: 1,
          hsnCode: p.hsnCode || '7318150',
        },
      ];
    });
  };

  const updateRawPurLineQty = (productId: string, qty: number) => {
    if (qty <= 0) {
      setRawPurLines((prev) => prev.filter((l) => l.productId !== productId));
      return;
    }
    setRawPurLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, qty } : l))
    );
  };

  const updateRawPurLineCost = (productId: string, price: number) => {
    setRawPurLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, price: Math.max(0, price) } : l))
    );
  };

  const removeRawPurLine = (productId: string) => {
    setRawPurLines((prev) => prev.filter((l) => l.productId !== productId));
  };

  const handleCreateRawPurNewProduct = async () => {
    if (!rawNewProdName.trim()) {
      alert('Please enter a product name');
      return;
    }
    const cost = parseFloat(rawNewProdCost) || 0;
    const price = parseFloat(rawNewProdPrice) || (cost > 0 ? cost * 1.25 : 0);
    const inwardQty = Math.max(1, parseInt(rawNewProdInwardQty, 10) || 1);

    try {
      // 1. Create product in Main Inventory Master with initial stock = 0
      // (Because saving this Raw Purchase will add inwardQty to stock!)
      const created = await addProduct({
        name: rawNewProdName.trim(),
        category: rawNewProdCategory,
        supplier: 'Raw Purchase',
        rackNumber: rawNewProdRack.trim() || 'General',
        size: rawNewProdSize.trim() || 'Standard',
        cost,
        price,
        boxCapacity: 1000,
        reorderLevel: 100,
        notes: 'Auto-created via Raw Purchase Inward Entry',
        image: '',
        hsnCode: rawNewProdHsn.trim() || '7318150',
      });

      // 2. Add line item directly to active Raw Purchase lines
      setRawPurLines((prev) => [
        ...prev,
        {
          productId: created.id,
          name: created.name,
          price: cost > 0 ? cost : price,
          cost,
          qty: inwardQty,
          hsnCode: created.hsnCode || '7318150',
        },
      ]);

      // 3. Reset form
      setRawNewProdName('');
      setRawNewProdRack('');
      setRawNewProdSize('');
      setRawNewProdCost('');
      setRawNewProdPrice('');
      setRawNewProdInwardQty('1');
      setIsAddingRawPurProduct(false);
      setRawPurProductSearch('');
    } catch (err) {
      alert(`Failed to create product: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleSaveRawPurchase = async () => {
    if (rawPurLines.length === 0) {
      alert('Please select at least one product.');
      return;
    }

    const subtotalAmt = rawPurLines.reduce((s, l) => s + (l.price * l.qty), 0);
    const totalAmt = +subtotalAmt.toFixed(2);

    const newRawPurchase: SaleRecord = {
      id: `raw_pur_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      invoice: rawPurNumber.trim() || nextRawPurchaseNumber(sales),
      customer: 'Raw Purchase',
      customerId: '',
      phone: '',
      customerGstin: '',
      customerState: 'Haryana',
      customerStateCode: '06',
      date: rawPurDate,
      items: rawPurLines,
      itemCount: rawPurLines.length,
      subtotal: totalAmt,
      discount: 0,
      discountType: 'amount',
      gstRate: 0,
      gstType: 'exempt',
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      gstAmount: 0,
      grandTotal: totalAmt,
      amountPaid: totalAmt,
      paymentMethod: rawPurPaymentMethod,
      status: 'paid',
      channel: 'in-store',
      documentType: 'RAW PURCHASE',
      notes: rawPurNote.trim(),
    };

    try {
      await addSale(newRawPurchase);
      setRawPurchaseModalOpen(false);
    } catch (err) {
      alert(`Failed to record raw purchase: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handlePbSupplierSelect = (id: string) => {
    setPbSupplierId(id);
    if (!id || id === 'new') {
      if (id === '') {
        setPbSupplier('');
        setPbPhone('');
        setPbAddress('');
        setPbGstin('');
      }
      return;
    }
    const sup = suppliers.find((s) => s.id === id);
    if (sup) {
      setPbSupplier(sup.name);
      setPbPhone(sup.phone || '');
      setPbAddress(sup.address || '');
      setPbGstin(sup.gstin || '');
    }
  };

  const addPbLine = (productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    setPbLines((prev) => {
      const idx = prev.findIndex((l) => l.productId === p.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          price: p.price,
          qty: 1,
          hsnCode: p.hsnCode || '7318150',
        },
      ];
    });
  };

  const updatePbLineQty = (productId: string, delta: number) => {
    setPbLines((prev) =>
      prev
        .map((l) => (l.productId === productId ? { ...l, qty: Math.max(0, l.qty + delta) } : l))
        .filter((l) => l.qty > 0),
    );
  };

  const setPbLineQty = (productId: string, raw: string) => {
    const q = parseInt(raw, 10);
    setPbLines((prev) =>
      prev
        .map((l) => (l.productId === productId ? { ...l, qty: isNaN(q) ? 0 : Math.max(0, q) } : l))
        .filter((l) => l.qty > 0),
    );
  };

  const setPbLinePrice = (productId: string, raw: string) => {
    const val = parseFloat(raw);
    setPbLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, price: isNaN(val) ? 0 : Math.max(0, val) } : l)),
    );
  };

  const setPbLineHsn = (productId: string, hsnCode: string) => {
    setPbLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, hsnCode } : l)),
    );
  };

  const updatePbLineName = (productId: string, name: string) => {
    setPbLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, name } : l)),
    );
  };

  const removePbLine = (productId: string) => {
    setPbLines((prev) => prev.filter((l) => l.productId !== productId));
  };

  const handleCreatePbNewProduct = async () => {
    if (!pbNewProdName.trim()) {
      alert('Please enter a product name');
      return;
    }
    const cost = parseFloat(pbNewProdCost) || 0;
    const price = parseFloat(pbNewProdPrice) || (cost > 0 ? cost * 1.25 : 0);
    const boxCapacity = parseInt(pbNewProdBoxCap, 10) || 1000;
    const reorderLevel = parseInt(pbNewProdReorder, 10) || 100;
    const newId = `prod_${Date.now()}`;

    // 1. Create product in Main Inventory Master
    await addProduct({
      name: pbNewProdName.trim(),
      category: pbNewProdCategory,
      supplier: pbSupplier.trim() || 'General Supplier',
      rackNumber: pbNewProdRack.trim() || 'General',
      size: pbNewProdSize.trim() || 'Standard',
      cost,
      price,
      boxCapacity,
      reorderLevel,
      notes: 'Auto-created via Purchase Bill Entry',
      image: '',
      hsnCode: pbNewProdHsn.trim() || '7318150',
    });

    // 2. Add line item directly to active Purchase Bill
    setPbLines((prev) => [
      ...prev,
      {
        productId: newId,
        name: pbNewProdName.trim(),
        price,
        qty: 1,
        hsnCode: pbNewProdHsn.trim() || '7318150',
      },
    ]);

    // 3. Reset creator form state
    setPbNewProdName('');
    setPbNewProdRack('');
    setPbNewProdSize('');
    setPbNewProdCost('');
    setPbNewProdPrice('');
    setIsAddingPbNewProduct(false);
    setPbProductSearch('');
  };

  const pbCanSubmit = pbSupplier.trim() !== '' && pbLines.length > 0;

  const handleSavePurchaseBill = async () => {
    if (!pbCanSubmit) return;

    // Auto-save new supplier to Master Suppliers list if not already saved
    const cleanSupplierName = pbSupplier.trim();
    if (cleanSupplierName) {
      const existingSup = suppliers.find((s) => s.name.trim().toLowerCase() === cleanSupplierName.toLowerCase());
      if (!existingSup) {
        const newSup: Supplier = {
          id: `sup_${Date.now()}`,
          name: cleanSupplierName,
          contactPerson: cleanSupplierName,
          phone: pbPhone.trim(),
          email: '',
          address: pbAddress.trim(),
          state: 'HARYANA',
          stateCode: '06',
          gstin: pbGstin.trim().toUpperCase(),
          notes: 'Auto-added from Purchase Bill',
        };
        await addSupplier(newSup);
      }
    }

    const newBill: SaleRecord = {
      id: `pb-${Date.now()}`,
      invoice: pbNumber,
      customer: pbSupplier.trim(),
      customerId: pbSupplierId || 'sup-custom',
      phone: pbPhone.trim(),
      customerAddress: pbAddress.trim(),
      customerGstin: pbGstin.trim().toUpperCase(),
      customerState: 'HARYANA',
      customerStateCode: '06',
      date: pbDate,
      items: pbLines.map((l) => ({ ...l })),
      itemCount: pbLines.reduce((s, l) => s + l.qty, 0),
      subtotal: +pbSubtotal.toFixed(2),
      discount: pbDiscount,
      discountType: pbDiscountType,
      gstRate: pbEffectiveGstRate,
      gstType: pbGstTaxType === 'local' ? 'cgst-sgst' : 'igst',
      cgstAmount: pbCgstAmount,
      sgstAmount: pbSgstAmount,
      igstAmount: pbIgstAmount,
      gstAmount: pbGstAmount,
      grandTotal: pbGrandTotal,
      amountPaid: pbGrandTotal,
      paymentMethod: 'Cash',
      status: 'paid',
      channel: 'in-store',
      poNumber: pbPoNumber.trim(),
      poDate: pbPoDate.trim(),
      transportMode: pbTransportMode.trim(),
      vehicleNumber: pbVehicleNumber.trim().toUpperCase(),
      ewayBill: pbEwayBill.trim(),
      vendorCode: pbVendorCode.trim(),
      bankName: pbBankName.trim(),
      bankAccount: pbBankAccount.trim(),
      bankIfsc: pbBankIfsc.trim().toUpperCase(),
      sellerGstin: pbSellerGstin.trim().toUpperCase(),
      sellerPan: pbSellerPan.trim().toUpperCase(),
      documentType: pbDocumentType,
      freightCharges: pbFreightVal,
    };

    await addSale(newBill);
    setPbModalOpen(false);
    setPbViewing(newBill);
    resetPbForm();
  };

  const handleSave = async () => {
    if (!canSubmit) return;

    // Auto-save new supplier to Master Suppliers list if not already saved
    const cleanSupplierName = supplier.trim();
    if (cleanSupplierName) {
      const existingSup = suppliers.find((s) => s.name.trim().toLowerCase() === cleanSupplierName.toLowerCase());
      if (!existingSup) {
        const newSup: Supplier = {
          id: `sup_${Date.now()}`,
          name: cleanSupplierName,
          contactPerson: cleanSupplierName,
          phone: phone.trim(),
          email: '',
          address: '',
          state: 'HARYANA',
          stateCode: '06',
          gstin: '',
          notes: 'Auto-added from Purchase Order',
        };
        await addSupplier(newSup);
      }
    }

    const po: PurchaseRecord = {
      id: `po${Date.now()}`,
      poNumber,
      supplier: supplier.trim(),
      supplierInvoice: supplierInvoice.trim(),
      phone: phone.trim() || '—',
      date,
      dueDate: poDueDate || '',
      expectedDelivery: expectedDelivery || '',
      receivedDate: poStatus === 'received' ? date : null,
      items: lines.map((l) => ({ ...l })),
      itemCount: lines.reduce((s, l) => s + l.qty, 0),
      subtotal: +subtotal.toFixed(2),
      gstRate: GST_RATE,
      gstAmount,
      grandTotal,
      amountPaid: paymentStatus === 'Paid' ? grandTotal : 0,
      paymentStatus,
      paymentMethod,
      status: poStatus,
      notes: notes.trim(),
      chequeNo: paymentMethod === 'Cheque' ? poChequeNo.trim() : '',
      chequeBank: paymentMethod === 'Cheque' ? poChequeBank.trim() : '',
      chequeDate: paymentMethod === 'Cheque' ? poChequeDate : '',
      chequeStatus: paymentMethod === 'Cheque' ? poChequeStatus : undefined,
    };
    await addPurchase(po);
    setModalOpen(false);
    resetForm();
  };

  const handleRecordPoPayment = async () => {
    if (!payTargetPO) return;
    const payVal = parseFloat(recordPayAmount) || 0;
    if (payVal <= 0) return;
    const currentPaid = payTargetPO.amountPaid ?? (payTargetPO.paymentStatus === 'Paid' ? payTargetPO.grandTotal : 0);
    const newPaid = currentPaid + payVal;
    const newStatus = newPaid >= payTargetPO.grandTotal ? 'Paid' : 'Pending';

    await updatePurchasePayment(
      payTargetPO.id,
      newStatus,
      newPaid,
      recordPayMethod,
      recordPayMethod === 'Cheque' ? recordPayChequeNo.trim() : '',
      recordPayMethod === 'Cheque' ? recordPayChequeBank.trim() : '',
      recordPayMethod === 'Cheque' ? recordPayChequeDate : '',
      'pending_clearance'
    );
    setPayTargetPO(null);
    setRecordPayAmount('');
    setRecordPayChequeNo('');
    setRecordPayChequeBank('');
  };

  const handleExport = () => {
    const rows = filtered.map((rec) => ({
      DocNumber: rec.docNumber,
      Type: rec.typeLabel,
      Supplier: rec.supplier,
      Date: rec.date,
      ItemsCount: rec.items.length,
      GrandTotal: rec.grandTotal.toFixed(2),
    }));
    downloadCSV('purchases.csv', toCSV(rows));
  };

  const handlePrint = (po: PurchaseRecord) => {
    printPurchase(po);
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Purchases & Supplier Inward"
        subtitle="Manage supplier purchase bills and credit notes. All inward items automatically add to inventory stock."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary" onClick={handleExport}>
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export</span>
            </button>
            <button
              className="btn-secondary bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100 font-bold flex items-center gap-1.5 shadow-sm"
              onClick={openNewCreditNote}
            >
              <Plus className="h-4 w-4 text-rose-600" />
              <span>Credit Note</span>
            </button>
            <button
              className="btn-secondary bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 font-bold flex items-center gap-1.5 shadow-sm"
              onClick={openNewRawPurchase}
            >
              <Zap className="h-4 w-4 text-emerald-600" />
              <span>New Raw Purchase</span>
            </button>
            <button
              className="btn-primary flex items-center gap-1.5 shadow-sm"
              onClick={openNewPurchaseBill}
            >
              <Plus className="h-4 w-4" />
              <span>New Purchase Bill</span>
            </button>
          </div>
        }
      />

      {/* Main Sub-Navigation: Purchase Bills vs Raw Purchases */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 mb-6">
        <button
          type="button"
          onClick={() => setActivePurchaseSubTab('bills')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition ${
            activePurchaseSubTab === 'bills'
              ? 'bg-brand-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 bg-white border border-slate-200'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>Purchase Bills &amp; Inward</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${activePurchaseSubTab === 'bills' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'}`}>
            {combinedRecords.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActivePurchaseSubTab('raw-purchases')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition ${
            activePurchaseSubTab === 'raw-purchases'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 bg-white border border-slate-200'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>Raw Purchases (Cash / UPI)</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${activePurchaseSubTab === 'raw-purchases' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'}`}>
            {rawPurchasesList.length}
          </span>
        </button>
      </div>

      {activePurchaseSubTab === 'bills' && (
        <>
          {/* Metric Cards - Interactive Filter Shortcuts */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <div
          className={`stagger-1 card-interactive group p-5 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200/80 shadow-xs cursor-pointer transition-all duration-200 ${
            activeTab === 'all'
              ? 'ring-2 ring-brand-500/80 bg-brand-50/30 border-brand-300 shadow-md'
              : 'hover:border-slate-300 hover:shadow-md'
          }`}
          onClick={() => setActiveTab('all')}
        >
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 font-bold shadow-xs group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
              <Truck className="h-5 w-5" />
            </div>
            <span className={`text-[10.5px] font-extrabold px-2 py-0.5 rounded-md ${
              timelineRange === 'all'
                ? 'text-brand-700 bg-brand-50'
                : 'text-brand-800 bg-brand-100 border border-brand-200'
            }`}>
              {timelineRange === 'all' ? 'All Inward' : timelineSummary.label}
            </span>
          </div>
          <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">
            {money(summary.totalInward)}
          </p>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>Total Purchase Value</span>
            {timelineRange !== 'all' && (
              <span className="text-[10px] text-slate-400 font-medium" title={`All-time Total: ${money(summary.allTimeTotalInward)}`}>
                All: {moneyShort(summary.allTimeTotalInward)}
              </span>
            )}
          </div>
        </div>

        <div
          className={`stagger-2 card-interactive group p-5 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200/80 shadow-xs cursor-pointer transition-all duration-200 ${
            activeTab === 'bills'
              ? 'ring-2 ring-indigo-500/80 bg-indigo-50/30 border-indigo-300 shadow-md'
              : 'hover:border-slate-300 hover:shadow-md'
          }`}
          onClick={() => setActiveTab('bills')}
        >
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 font-bold shadow-xs group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
              <PackageCheck className="h-5 w-5" />
            </div>
            <span className="text-[10.5px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
              {summary.countPB} Bills
            </span>
          </div>
          <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">
            {money(summary.totalPB)}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-semibold">
            {timelineRange === 'all' ? 'Purchase Bills' : `Inward (${timelineSummary.label})`}
          </p>
        </div>

        <div
          className={`stagger-3 card-interactive group p-5 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200/80 shadow-xs cursor-pointer transition-all duration-200 ${
            activeTab === 'credit-notes'
              ? 'ring-2 ring-rose-500/80 bg-rose-50/30 border-rose-300 shadow-md'
              : 'hover:border-slate-300 hover:shadow-md'
          }`}
          onClick={() => setActiveTab('credit-notes')}
        >
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 font-bold shadow-xs group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
              <FileText className="h-5 w-5" />
            </div>
            <span className="text-[10.5px] font-extrabold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">
              {summary.countCN} Notes
            </span>
          </div>
          <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">
            {money(summary.totalCN)}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-semibold">
            {timelineRange === 'all' ? 'Credit Notes' : `Adjustments (${timelineSummary.label})`}
          </p>
        </div>

        <div
          className={`stagger-4 card-interactive group p-5 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200/80 shadow-xs cursor-pointer transition-all duration-200 ${
            activeTab === 'suggestions'
              ? 'ring-2 ring-amber-500/80 bg-amber-50/30 border-amber-300 shadow-md'
              : 'hover:border-slate-300 hover:shadow-md'
          }`}
          onClick={() => setActiveTab('suggestions')}
        >
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 font-bold shadow-xs group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
              <Sparkles className="h-5 w-5" />
            </div>
            <span className="text-[10.5px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
              Restock Alerts
            </span>
          </div>
          <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">
            {lowStockItems.length}
          </p>
          <p className="mt-1 text-xs text-amber-600 font-semibold">Low / Out of Stock Items</p>
        </div>
      </div>

      {/* Collapsible Purchase & Inward Timeline Slider */}
      <div className="mt-4">
        {!isTimelineOpen ? (
          /* Compact Collapsed Bar (Minimalist, 0 clutter for daily work) */
          <div className="flex items-center justify-between px-3.5 py-2 rounded-xl border border-slate-200 bg-white/90 backdrop-blur-xs shadow-2xs">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <Calendar className="h-3.5 w-3.5" />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-bold text-slate-800">
                  Timeline Filter:
                </span>
                <span className={`px-2 py-0.5 rounded-md font-extrabold text-[11px] ${
                  timelineRange === 'all'
                    ? 'bg-slate-100 text-slate-700'
                    : 'bg-brand-50 text-brand-700 border border-brand-200'
                }`}>
                  {timelineSummary.label}
                </span>
                <span className="text-[11px] text-slate-500 font-semibold">
                  ({timelineSummary.count} bills · {money(timelineSummary.total)})
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {timelineRange !== 'all' && (
                <button
                  type="button"
                  onClick={() => setTimelineRange('all')}
                  className="px-2 py-1 rounded-lg text-xs font-bold text-slate-600 hover:text-brand-600 hover:bg-slate-100 transition cursor-pointer"
                  title="Reset timeline to All Time"
                >
                  Reset All
                </button>
              )}
              <button
                type="button"
                onClick={toggleTimeline}
                className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition flex items-center gap-1.5 cursor-pointer"
                title="Expand purchase date slider"
              >
                <SlidersHorizontal className="w-3 h-3 text-slate-500" />
                <span>Timeline Slider</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              </button>
            </div>
          </div>
        ) : (
          /* Expanded View (Full interactive slider with Collapse button) */
          <div className="rounded-2xl border border-brand-200/80 bg-gradient-to-br from-brand-50/50 via-white to-slate-50/70 p-4 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-xs">
                  <Calendar className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
                      Purchase &amp; Inward Timeline Tracker
                    </h3>
                    <span className="rounded-md bg-brand-100 px-2 py-0.5 text-[10.5px] font-extrabold text-brand-800 border border-brand-200">
                      {timelineSummary.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Slide to track purchases by timeframe · <strong className="text-slate-800">{timelineSummary.count} bills</strong> ({money(timelineSummary.total)})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                {timelineRange !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setTimelineRange('all')}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-600 hover:text-brand-600 hover:bg-white border border-slate-200 transition shadow-2xs flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3 text-slate-400" />
                    <span>Show All Time</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={toggleTimeline}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 transition shadow-2xs flex items-center gap-1 cursor-pointer"
                  title="Collapse slider to save screen space"
                >
                  <span>Collapse</span>
                  <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                </button>
              </div>
            </div>

            {/* Slider Track and Thumb */}
            <div className="px-1 pt-1 pb-1">
              <input
                type="range"
                min={0}
                max={PURCHASE_TIMELINE_STEPS.length - 1}
                step={1}
                value={sliderIndex >= 0 ? sliderIndex : PURCHASE_TIMELINE_STEPS.length - 1}
                onChange={(e) => setTimelineRange(PURCHASE_TIMELINE_STEPS[Number(e.target.value)].id)}
                className="w-full accent-brand-600 cursor-pointer h-2.5 bg-slate-200 rounded-lg appearance-none transition-all shadow-inner"
                title="Slide to track when purchases/bills were recorded"
              />

              {/* Milestone Buttons below slider */}
              <div className="mt-2 grid grid-cols-7 gap-1">
                {PURCHASE_TIMELINE_STEPS.map((step) => {
                  const isActive = timelineRange === step.id;
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => setTimelineRange(step.id)}
                      className={`flex flex-col items-center py-1.5 px-1 rounded-xl transition-all text-center cursor-pointer ${
                        isActive
                          ? 'bg-brand-600 text-white font-extrabold shadow-sm scale-105'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 font-semibold'
                      }`}
                    >
                      <span className="text-[11.5px] leading-none">{step.shortLabel}</span>
                      <span className={`mt-0.5 text-[9.5px] hidden sm:inline ${isActive ? 'text-brand-100' : 'text-slate-400'}`}>
                        {step.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Helpful notice if 0 bills found in range */}
            {timelineRange !== 'all' && timelineFilteredPurchases.length === 0 && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center justify-between">
                <span>No purchase bills found in the selected timeframe ({timelineSummary.label}).</span>
                <button
                  type="button"
                  onClick={() => setTimelineRange('all')}
                  className="font-bold underline text-amber-900 hover:text-amber-950 cursor-pointer"
                >
                  Show All Time
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="sticky top-[8.5rem] z-10 mt-4 -mx-4 px-4 py-3 bg-slate-50/90 backdrop-blur-md rounded-lg lg:-mx-8 lg:px-8">
        <div className="card p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Bill #, supplier, or product…"
              className="input pl-10"
            />
          </div>
          <div className="flex items-center gap-1 overflow-x-auto bg-slate-100 p-1 rounded-xl border border-slate-200">
            {[
              { id: 'all', label: `All Inward (${timelineFilteredPurchases.length})` },
              { id: 'bills', label: `Purchase Bills (${summary.countPB})` },
              { id: 'credit-notes', label: `Credit Notes (${summary.countCN})` },
              { id: 'suggestions', label: `Restock Suggestions (${lowStockItems.length})`, highlight: lowStockItems.length > 0 },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? tab.id === 'suggestions'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'bg-white text-slate-900 shadow-sm'
                    : tab.highlight
                    ? 'text-amber-700 bg-amber-100/70 hover:bg-amber-100 font-extrabold'
                    : 'text-slate-600 hover:bg-slate-200/60'
                }`}
              >
                {tab.id === 'suggestions' && <Sparkles className="w-3.5 h-3.5" />}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeTab === 'suggestions' ? (
        <div className="mt-4 space-y-4">
          <div className="card p-5 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent border-amber-200">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600 shrink-0">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    Inventory Restock Suggestions
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                      {lowStockItems.length} Products Low / Out of Stock
                    </span>
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    These items are below their minimum reorder levels in main inventory. Generate inward purchase bills automatically with 1-click.
                  </p>
                </div>
              </div>
              {lowStockItems.length > 0 && (
                <button
                  onClick={() => createBillFromSuggestions()}
                  className="btn-primary bg-amber-600 hover:bg-amber-700 text-white shadow-sm flex items-center gap-2 shrink-0"
                >
                  <ShoppingCart className="h-4 w-4" />
                  <span>Create Purchase Bill for All ({lowStockItems.length})</span>
                </button>
              )}
            </div>
          </div>

          <div className="card overflow-hidden">
            {lowStockItems.length === 0 ? (
              <div className="p-12 text-center">
                <PackageCheck className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
                <h4 className="text-base font-bold text-slate-800">All Stock Levels Optimal!</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  No products are currently at or below their reorder thresholds. Main inventory is fully stocked.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="table-th">Product & Size</th>
                      <th className="table-th">Category / Rack</th>
                      <th className="table-th">Supplier</th>
                      <th className="table-th text-center">Stock Level</th>
                      <th className="table-th text-center">Reorder Threshold</th>
                      <th className="table-th text-right">Suggested Qty</th>
                      <th className="table-th text-right">Est. Unit Cost</th>
                      <th className="table-th text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lowStockItems.map((p) => {
                      const suggestedQty = Math.max(p.reorderLevel * 2, p.boxCapacity - p.stock, 500);
                      const isOut = p.stock <= 0;
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/50 transition">
                          <td className="table-td">
                            <div>
                              <p className="font-bold text-slate-900">{p.name}</p>
                              {p.size && <p className="text-[11px] text-slate-500">Size: {p.size}</p>}
                            </div>
                          </td>
                          <td className="table-td">
                            <span className="badge bg-slate-100 text-slate-700 font-medium">
                              {p.category}
                            </span>
                            <span className="text-[11px] text-slate-400 block mt-0.5">Rack: {p.rackNumber}</span>
                          </td>
                          <td className="table-td text-slate-700 font-medium">{p.supplier || 'Any Supplier'}</td>
                          <td className="table-td text-center">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                                isOut
                                  ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                  : 'bg-amber-100 text-amber-700 border border-amber-200'
                              }`}
                            >
                              {p.stock.toLocaleString('en-IN')} pcs {isOut ? '(Out of Stock)' : '(Low Stock)'}
                            </span>
                          </td>
                          <td className="table-td text-center text-xs font-semibold text-slate-600">
                            {p.reorderLevel.toLocaleString('en-IN')} pcs
                          </td>
                          <td className="table-td text-right font-bold text-brand-600">
                            {suggestedQty.toLocaleString('en-IN')} pcs
                          </td>
                          <td className="table-td text-right font-medium text-slate-900">
                            ₹{p.cost.toFixed(2)}
                          </td>
                          <td className="table-td text-right">
                            <button
                              onClick={() => createBillFromSuggestions([p])}
                              className="px-3 py-1.5 rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-700 font-bold text-xs transition border border-brand-200 inline-flex items-center gap-1.5"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              <span>+ Purchase Bill</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4 card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="table-th">Doc Number</th>
                  <th className="table-th">Type</th>
                  <th className="table-th">Supplier</th>
                  <th className="table-th">Products</th>
                  <th className="table-th">Purchased / Date</th>
                  <th className="table-th text-right">Grand Total</th>
                  <th className="table-th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedPurchases.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-sm text-slate-500">
                      <div className="max-w-md mx-auto space-y-3">
                        <Clock className="w-8 h-8 text-slate-300 mx-auto mb-1" />
                        <p className="font-bold text-slate-700">No purchase records found matching current filter</p>
                        {timelineRange !== 'all' && (
                          <div className="text-xs text-slate-500 space-y-2">
                            <p>Active period: <span className="font-bold text-brand-700">{timelineSummary.label}</span></p>
                            {latestPurchaseDate && (
                              <p className="text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                                Your latest purchase was on <strong>{latestPurchaseDate}</strong> ({getDaysAgo(latestPurchaseDate)} days ago). Slide to 14 Days to view it!
                              </p>
                            )}
                            <div className="flex items-center justify-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => setTimelineRange('14d')}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-600 text-white hover:bg-brand-700 shadow-xs cursor-pointer"
                              >
                                Slide to 14 Days
                              </button>
                              <button
                                type="button"
                                onClick={() => setTimelineRange('all')}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
                              >
                                Reset to All Time
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedPurchases.map((rec) => {
                    const isPO = rec.kind === 'po';
                    const isCN = rec.typeLabel === 'CREDIT NOTE';
                    const isDN = rec.typeLabel === 'DEBIT NOTE';
                    return (
                      <tr
                        key={rec.id}
                        className="cursor-pointer transition hover:bg-slate-50/50"
                        onClick={() => {
                          if (isPO) navigate(`/purchase/${rec.id}`);
                          else setPbViewing(rec.raw);
                        }}
                      >
                        <td className="table-td font-semibold text-brand-600">{rec.docNumber}</td>
                        <td className="table-td">
                          <span
                            className={`badge font-bold ${
                              isCN
                                ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                : isDN
                                ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                : isPO
                                ? 'bg-blue-100 text-blue-700 border border-blue-200'
                                : 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                            }`}
                          >
                            {rec.typeLabel}
                          </span>
                        </td>
                        <td className="table-td font-medium text-slate-800">{rec.supplier}</td>
                        <td className="table-td">
                          <div className="space-y-0.5">
                            {rec.items.slice(0, 2).map((it, idx) => (
                              <div key={idx} className="text-xs text-slate-600">
                                <span className="font-medium text-slate-800">{it.name}</span>
                                {' '}
                                <span className="text-slate-400">({it.qty.toLocaleString('en-IN')} pcs)</span>
                              </div>
                            ))}
                            {rec.items.length > 2 && (
                              <div className="text-xs text-brand-600">+{rec.items.length - 2} more…</div>
                            )}
                          </div>
                        </td>
                        <td className="table-td text-slate-600">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-slate-800 font-mono">{rec.date}</span>
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-700 bg-brand-50 border border-brand-200/70 px-1.5 py-0.5 rounded w-fit shadow-2xs">
                                <Clock className="w-2.5 h-2.5 text-brand-600" />
                                {formatRelativeDate(rec.date)}
                              </span>
                            </div>
                            {isPO && (rec.raw as PurchaseRecord).dueDate && (
                              <span className="block text-[10px] text-amber-700 font-semibold">
                                Due: {(rec.raw as PurchaseRecord).dueDate}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="table-td text-right">
                          <div className="font-semibold tabular-nums text-slate-900">
                            ₹{rec.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          {isPO && (
                            <div className="mt-0.5 flex items-center justify-end gap-1">
                              {rec.paymentStatus === 'Paid' ? (
                                <span className="text-[10px] font-bold text-accent-700 bg-accent-50 px-1.5 py-0.5 rounded">
                                  {rec.paymentMethod === 'Cheque' ? `Cheque #${(rec.raw as PurchaseRecord).chequeNo || ''}` : 'Paid'}
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                                  Pending Credit
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="table-td" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {isPO && rec.paymentStatus === 'Pending' && (
                              <button
                                onClick={() => {
                                  setPayTargetPO(rec.raw);
                                  const paidAlready = rec.raw.amountPaid || 0;
                                  const rem = Math.max(0, rec.raw.grandTotal - paidAlready);
                                  setRecordPayAmount(String(rem));
                                }}
                                className="rounded-lg p-2 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition"
                                title="Record Payment to Supplier"
                              >
                                <CreditCard className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={() => {
                                if (isPO) navigate(`/purchase/${rec.id}`);
                                else setPbViewing(rec.raw);
                              }}
                              className="rounded-lg p-2 text-slate-400 transition hover:bg-brand-50 hover:text-brand-600"
                              title="View Details"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => {
                                if (isPO) handlePrint(rec.raw);
                                else printInvoice(rec.raw, undefined, companySettings);
                              }}
                              className="rounded-lg p-2 text-slate-400 transition hover:bg-brand-50 hover:text-brand-600"
                              title="Print Document"
                            >
                              <Printer className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => {
                                const isReceivedPo = isPO && (rec.raw as any).status === 'received';
                                const promptMsg = isPO
                                  ? `Are you sure you want to delete ${rec.docNumber}?${isReceivedPo ? ' Received items will be deducted from inventory stock.' : ''}`
                                  : `Are you sure you want to delete Purchase Bill ${rec.docNumber}? Added items will be deducted from inventory stock.`;
                                if (window.confirm(promptMsg)) {
                                  if (isPO) {
                                    deletePurchase(rec.id);
                                  } else {
                                    deleteSale(rec.id);
                                  }
                                }
                              }}
                              className="rounded-lg p-2 text-slate-400 transition hover:bg-err-50 hover:text-err-600"
                              title="Delete Document"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
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
                of <span className="font-semibold text-slate-700">{filtered.length}</span> records
                {filtered.length !== combinedRecords.length && (
                  <span className="text-slate-400 ml-1">(filtered from {combinedRecords.length})</span>
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
      )}
        </>
      )}

      {/* Raw Purchases (Cash / UPI Inward Counter Purchases) */}
      {activePurchaseSubTab === 'raw-purchases' && (
        <div className="space-y-6 animate-fade-in">
          {/* Metric Cards */}
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <div
              className={`stagger-1 card-interactive group p-5 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200/80 shadow-xs cursor-pointer transition-all duration-200 ${
                rawPurFilter === 'all'
                  ? 'ring-2 ring-emerald-500/80 bg-emerald-50/30 border-emerald-300 shadow-md'
                  : 'hover:border-slate-300 hover:shadow-md'
              }`}
              onClick={() => setRawPurFilter('all')}
            >
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 font-bold shadow-xs group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
                  <Zap className="h-5 w-5" />
                </div>
                <span className="text-[10.5px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                  All Raw Inward
                </span>
              </div>
              <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">{money(rawPurSummary.total)}</p>
              <p className="mt-1 text-xs text-slate-500 font-semibold">{rawPurSummary.count} Inward Purchases ({rawPurSummary.totalPieces} pcs)</p>
            </div>

            <div
              className={`stagger-2 card-interactive group p-5 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200/80 shadow-xs cursor-pointer transition-all duration-200 ${
                rawPurFilter === 'Cash'
                  ? 'ring-2 ring-brand-500/80 bg-brand-50/30 border-brand-300 shadow-md'
                  : 'hover:border-slate-300 hover:shadow-md'
              }`}
              onClick={() => setRawPurFilter('Cash')}
            >
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 font-bold shadow-xs group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
                  <Wallet className="h-5 w-5" />
                </div>
                <span className="text-[10.5px] font-extrabold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-md">
                  Cash Inward
                </span>
              </div>
              <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">{money(rawPurSummary.cashTotal)}</p>
              <p className="mt-1 text-xs text-slate-500 font-semibold">{rawPurSummary.cashCount} Cash Purchases</p>
            </div>

            <div
              className={`stagger-3 card-interactive group p-5 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200/80 shadow-xs cursor-pointer transition-all duration-200 ${
                rawPurFilter === 'UPI'
                  ? 'ring-2 ring-indigo-500/80 bg-indigo-50/30 border-indigo-300 shadow-md'
                  : 'hover:border-slate-300 hover:shadow-md'
              }`}
              onClick={() => setRawPurFilter('UPI')}
            >
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 font-bold shadow-xs group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
                  <CreditCard className="h-5 w-5" />
                </div>
                <span className="text-[10.5px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                  UPI Instant
                </span>
              </div>
              <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">{money(rawPurSummary.upiTotal)}</p>
              <p className="mt-1 text-xs text-slate-500 font-semibold">{rawPurSummary.upiCount} UPI Purchases</p>
            </div>

            <div
              className="stagger-4 card-interactive group p-5 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-200/80 shadow-xs cursor-pointer transition-all duration-200"
              onClick={openNewRawPurchase}
            >
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white font-bold shadow-md shadow-emerald-600/25 group-hover:scale-110 transition-transform">
                  <Plus className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md">
                  Fast Inward
                </span>
              </div>
              <p className="mt-3 text-lg font-black text-emerald-950">Quick Raw Inward</p>
              <p className="mt-1 text-xs text-emerald-700 font-medium">Click to record cash / UPI purchase</p>
            </div>
          </div>

          {/* Raw Purchases Table Card */}
          <div className="card p-6 space-y-4 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200/80 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                  <Zap className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Raw Counter Purchases</h3>
                  <p className="text-xs text-slate-500">Immediate cash &amp; UPI inward items with automatic stock addition to Main Inventory</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Search */}
                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={rawPurSearch}
                    onChange={(e) => setRawPurSearch(e.target.value)}
                    placeholder="Search raw purchase # or product..."
                    className="input pl-9 text-xs"
                  />
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
                  <button
                    onClick={() => setRawPurFilter('all')}
                    className={`px-3 py-1.5 rounded-lg transition ${rawPurFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    All ({rawPurchasesList.length})
                  </button>
                  <button
                    onClick={() => setRawPurFilter('Cash')}
                    className={`px-3 py-1.5 rounded-lg transition ${rawPurFilter === 'Cash' ? 'bg-brand-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    Cash ({rawPurSummary.cashCount})
                  </button>
                  <button
                    onClick={() => setRawPurFilter('UPI')}
                    className={`px-3 py-1.5 rounded-lg transition ${rawPurFilter === 'UPI' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    UPI ({rawPurSummary.upiCount})
                  </button>
                </div>

                <button
                  onClick={openNewRawPurchase}
                  className="btn-primary flex items-center gap-1.5 py-2 text-xs"
                >
                  <Plus className="h-4 w-4" />
                  <span>New Raw Purchase</span>
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200/80 shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-bold">Bill #</th>
                    <th className="px-4 py-3 font-bold">Party Name</th>
                    <th className="px-4 py-3 font-bold">Date</th>
                    <th className="px-4 py-3 font-bold">Items Summary</th>
                    <th className="px-4 py-3 font-bold">Payment Mode</th>
                    <th className="px-4 py-3 font-bold text-right">Grand Total</th>
                    <th className="px-4 py-3 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredRawPurchases.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                        <Zap className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                        <p className="font-bold text-slate-600 text-sm">No Raw Purchases Recorded</p>
                        <p className="text-xs text-slate-400 mt-1">Click "+ New Raw Purchase" to record a quick cash/UPI inward delivery.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredRawPurchases.map((s) => (
                      <tr key={s.id} className="hover:bg-emerald-50/20 transition-colors duration-150">
                        <td className="px-4 py-3 font-mono font-bold text-emerald-700">{s.invoice}</td>
                        <td className="px-4 py-3">
                          <span className="font-bold text-slate-900">{s.customer || 'Raw Purchase'}</span>
                          {s.notes && <p className="text-[11px] text-slate-500 italic truncate max-w-xs">{s.notes}</p>}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-600">{s.date}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-800">
                              {s.items && s.items.length > 0
                                ? `${s.items.length} item${s.items.length > 1 ? 's' : ''} (${s.items.reduce((sum, i) => sum + i.qty, 0)} pcs added)`
                                : '—'}
                            </span>
                            <span className="text-[11px] text-slate-500 truncate max-w-sm">
                              {s.items?.map((i) => `${i.qty}× ${i.name}`).join(', ')}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            s.paymentMethod === 'UPI'
                              ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}>
                            {s.paymentMethod === 'UPI' ? <CreditCard className="w-3 h-3" /> : <Wallet className="w-3 h-3" />}
                            {s.paymentMethod} (Paid)
                          </span>
                        </td>
                        <td className="px-4 py-3 font-black text-slate-900 text-right font-mono text-sm">
                          {money(s.grandTotal)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setViewingRawPur(s)}
                              className="p-1.5 text-slate-600 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition"
                              title="View Items Detail"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Delete raw purchase ${s.invoice}? Items will be deducted from inventory stock.`)) {
                                  deleteSale(s.id);
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                              title="Delete Raw Purchase"
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
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Create New Purchase"
        subtitle={`PO ${poNumber} · ${date}`}
        size="xl"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button
              className="btn-primary"
              disabled={!canSubmit}
              onClick={handleSave}
            >
              <CheckCircle2 className="h-4 w-4" />
              Save Purchase
            </button>
          </>
        }
      >
        <div className="space-y-5">
          {/* Supplier section */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="relative">
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Supplier Name</label>
              <input
                type="text"
                value={supplier}
                onFocus={() => setShowPoSupplierDropdown(true)}
                onChange={(e) => {
                  onSupplierSelect(e.target.value);
                  setShowPoSupplierDropdown(true);
                }}
                placeholder="Type or search supplier..."
                className="input relative z-20"
              />
              {showPoSupplierDropdown && filteredPoSuppliers.length > 0 && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowPoSupplierDropdown(false)} />
                  <div className="absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg divide-y divide-slate-100">
                    {filteredPoSuppliers.map((s) => (
                      <div
                        key={s.id}
                        onMouseDown={() => {
                          setSupplier(s.name);
                          if (s.phone) setPhone(s.phone);
                          setShowPoSupplierDropdown(false);
                        }}
                        className="p-2 hover:bg-indigo-50 cursor-pointer transition rounded-lg text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{s.name}</span>
                          {s.gstin && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                              {s.gstin}
                            </span>
                          )}
                        </div>
                        {(s.phone || s.address) && (
                          <p className="text-[10.5px] text-slate-500 mt-0.5 truncate">
                            {s.phone && `📞 ${s.phone}`} {s.phone && s.address && '·'} {s.address && `📍 ${s.address}`}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Supplier Invoice #</label>
              <input
                type="text"
                value={supplierInvoice}
                onChange={(e) => setSupplierInvoice(e.target.value)}
                placeholder="e.g. TVS-INV-5521"
                className="input"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Supplier Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98250 00000"
                className="input"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Purchase Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Expected Delivery</label>
              <input
                type="date"
                value={expectedDelivery}
                onChange={(e) => setExpectedDelivery(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Order Status</label>
              <div className="flex flex-wrap gap-2">
                {poStatusOptions.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setPoStatus(s.value)}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                      poStatus === s.value
                        ? s.value === 'received'
                          ? 'border-accent-500 bg-accent-50 text-accent-700'
                          : s.value === 'cancelled'
                            ? 'border-err-500 bg-err-50 text-err-700'
                            : s.value === 'ordered'
                              ? 'border-brand-500 bg-brand-50 text-brand-700'
                              : 'border-warn-500 bg-warn-50 text-warn-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <label className="block text-sm font-medium text-slate-700">Add Products</label>
              <button
                type="button"
                onClick={() => setIsAddingNewProduct(!isAddingNewProduct)}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition flex items-center gap-1.5 shadow-xs ${
                  isAddingNewProduct
                    ? 'bg-emerald-600 text-white border-emerald-700'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add New Product to Main Inventory</span>
              </button>
            </div>

            {/* Inline New Product Creator */}
            {isAddingNewProduct && (
              <div className="mb-4 rounded-xl border-2 border-emerald-200 bg-emerald-50/40 p-4 space-y-3 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      Add New Product to Main Inventory
                    </h4>
                    <p className="text-[11px] text-emerald-700">
                      This new product will automatically be added to your <strong>Main Inventory & Catalog</strong> when this purchase order is received.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddingNewProduct(false)}
                    className="text-emerald-400 hover:text-emerald-700 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Product Name *</label>
                    <input
                      type="text"
                      value={newProdName}
                      onChange={(e) => setNewProdName(e.target.value)}
                      placeholder="e.g. Hex Bolt SS 304 M12x50"
                      className="input bg-white text-xs py-1.5 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Purchase Cost (₹) *</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={newProdCost}
                      onChange={(e) => setNewProdCost(e.target.value)}
                      placeholder="0.00"
                      className="input bg-white text-xs py-1.5 font-bold text-emerald-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Selling Rate (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={newProdPrice}
                      onChange={(e) => setNewProdPrice(e.target.value)}
                      placeholder="0.00"
                      className="input bg-white text-xs py-1.5 font-bold text-brand-600"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsAddingNewProduct(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={addNewProductLine}
                    disabled={!newProdName.trim() || !newProdCost}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition disabled:opacity-50"
                  >
                    Save & Add Item
                  </button>
                </div>
              </div>
            )}

            {/* Product Catalog Picker with Search, Category Filter, and Smooth Scroller */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-2.5">
              {/* Search input with Cross (X) button */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchResults.length > 0) {
                      e.preventDefault();
                      addLine(searchResults[0].id);
                      setProductSearch('');
                    }
                  }}
                  placeholder="Search 990+ products by name, size, rack..."
                  className="input pl-9 pr-9 text-xs bg-white"
                />
                {productSearch && (
                  <button
                    type="button"
                    onClick={() => setProductSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 rounded-full transition"
                    title="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Category Filter Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                <span className="text-[11px] font-bold text-slate-500 shrink-0">Category:</span>
                {availableCategories.slice(0, 9).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setPoCategory(cat)}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition shrink-0 ${
                      poCategory === cat
                        ? 'bg-brand-600 text-white shadow-xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Scrollable Catalog Product List (Inline, Never overlays or hides added items) */}
              <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-xs">
                <div className="bg-slate-100/70 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between text-[11px] text-slate-600 font-semibold">
                  <span>
                    Catalog List ({searchResults.length} {searchResults.length === 1 ? 'item' : 'items'} displayed
                    {productSearch ? ` for "${productSearch}"` : ''})
                  </span>
                  <span className="text-slate-400 text-[10.5px]">Scroll to browse &middot; Click &quot;+ Add&quot; to order</span>
                </div>

                <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                  {searchResults.length > 0 ? (
                    searchResults.map((p) => {
                      const addedLine = lines.find((l) => l.productId === p.id);
                      return (
                        <div
                          key={p.id}
                          className={`flex items-center justify-between p-2.5 transition text-left text-xs ${
                            addedLine ? 'bg-emerald-50/40 hover:bg-emerald-50/70' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex-1 pr-3">
                            <p className="font-bold text-slate-800 leading-tight">{p.name}</p>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 flex-wrap">
                              {p.size && <span className="font-mono bg-slate-100 px-1 rounded text-slate-600">{p.size}</span>}
                              {p.rackNumber && <span>Rack: <strong className="text-slate-700">{p.rackNumber}</strong></span>}
                              <span>Est. Stock: <strong className="text-slate-700">{p.stock}</strong></span>
                              {p.category && <span className="text-slate-400 font-medium">({p.category})</span>}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-xs font-bold text-slate-700 font-mono">
                              ₹{p.cost.toFixed(2)}
                            </span>

                            {addedLine ? (
                              <div className="flex items-center gap-1.5">
                                <span className="px-2 py-0.5 rounded-full text-[10.5px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  <span>Added ({addedLine.qty})</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => addLine(p.id)}
                                  className="p-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition"
                                  title="Add one more"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeLine(p.id)}
                                  className="p-1 rounded-md bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition"
                                  title="Remove from order"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => addLine(p.id)}
                                className="px-3 py-1 rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 font-bold text-xs transition flex items-center gap-1 shadow-xs"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Add</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-4 text-center text-xs space-y-2">
                      <p className="text-slate-400">No products found matching &quot;{productSearch}&quot;.</p>
                      {productSearch.trim() && !isAddingNewProduct && (
                        <button
                          type="button"
                          onClick={() => {
                            setNewProdName(productSearch.trim());
                            setIsAddingNewProduct(true);
                            setProductSearch('');
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-xs transition"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>+ Add &quot;{productSearch}&quot; as New Product Master</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Items Added to Purchase Order */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <ShoppingCart className="w-4 h-4 text-brand-600" />
                <span>Items Added to Purchase Order</span>
                <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-extrabold bg-brand-100 text-brand-800 border border-brand-200">
                  {lines.length} {lines.length === 1 ? 'item' : 'items'}
                </span>
              </label>
              {lines.length > 0 && (
                <span className="text-xs font-bold text-slate-600">
                  Subtotal: <strong className="text-brand-700 font-mono">₹{subtotal.toFixed(2)}</strong>
                </span>
              )}
            </div>

            {lines.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 font-bold text-slate-700">
                    <tr>
                      <th className="p-2.5">Product Name</th>
                      <th className="p-2.5 text-center w-36">Qty (Pieces)</th>
                      <th className="p-2.5 text-right w-28">Cost / Piece</th>
                      <th className="p-2.5 text-right w-20">GST</th>
                      <th className="p-2.5 text-right w-28">Total</th>
                      <th className="p-2.5 text-center w-24">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.map((l) => (
                      <tr key={l.productId} className={l.isNewProduct ? 'bg-emerald-50/20' : 'hover:bg-slate-50/50'}>
                        <td className="p-2.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <input
                              type="text"
                              value={l.name}
                              onChange={(e) => updatePoLineName(l.productId, e.target.value)}
                              className="input py-1 px-2 text-xs font-semibold text-slate-800 bg-white"
                              placeholder="Product Name"
                            />
                            {l.isNewProduct && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-700 border border-emerald-200">
                                + Auto-Adds to Main Inventory
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-2.5">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => updateQty(l.productId, -1)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100"
                              title="Decrease quantity"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={l.qty === 0 ? '' : l.qty}
                              onChange={(e) => setQty(l.productId, e.target.value)}
                              className="w-16 rounded-lg border border-slate-200 py-1 text-center text-xs font-bold tabular-nums focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                            />
                            <button
                              type="button"
                              onClick={() => updateQty(l.productId, 1)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100"
                              title="Increase quantity"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className="p-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-slate-400 font-mono">₹</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={l.cost || ''}
                              onChange={(e) => setCost(l.productId, parseFloat(e.target.value) || 0)}
                              className="w-20 rounded-lg border border-slate-200 py-1 text-right text-xs font-bold tabular-nums focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 font-mono"
                            />
                          </div>
                        </td>
                        <td className="p-2.5 text-right tabular-nums text-slate-500 font-mono">{l.gstRate}%</td>
                        <td className="p-2.5 text-right font-bold tabular-nums text-slate-900 font-mono">
                          ₹{(l.cost * l.qty).toFixed(2)}
                        </td>
                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => removeLine(l.productId)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition shadow-xs"
                            title="Remove item"
                          >
                            <X className="h-3.5 w-3.5" />
                            <span>Remove</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 py-8 text-center">
                <Package className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-xs font-bold text-slate-600">No products added yet</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Click &quot;+ Add&quot; on any product in the catalog above to add it to this purchase order.</p>
              </div>
            )}
          </div>

          <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-brand-600" />
                <span>Supplier Settlement & Payment Terms</span>
              </label>
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${paymentStatus === 'Paid' ? 'bg-accent-100 text-accent-800' : 'bg-amber-100 text-amber-800'}`}>
                {paymentStatus === 'Paid' ? '✓ Settled Now' : '⏳ Credit / Pay Later'}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Payment Status</label>
                <div className="flex gap-2">
                  {(['Paid', 'Pending'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setPaymentStatus(s)}
                      className={`flex-1 rounded-xl border py-2 text-xs font-bold transition ${
                        paymentStatus === s
                          ? s === 'Paid'
                            ? 'border-accent-500 bg-accent-50 text-accent-700'
                            : 'border-warn-500 bg-warn-50 text-warn-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {s === 'Paid' ? 'Paid Immediately' : 'Pay Later / Credit'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Payment Method</label>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                  {(['Bank Transfer', 'UPI', 'Cash', 'Cheque', 'Credit / Pay Later'] as PurchasePaymentMethod[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setPaymentMethod(m);
                        if (m === 'Credit / Pay Later') setPaymentStatus('Pending');
                      }}
                      className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold transition truncate text-center ${
                        paymentMethod === m
                          ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-xs'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Cheque Details Card */}
            {paymentMethod === 'Cheque' && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3.5 space-y-3 animate-fade-in">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                    <Landmark className="w-4 h-4 text-indigo-600" />
                    <span>Outward Cheque Details (Issued to Supplier)</span>
                  </h4>
                  <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">
                    Auto-tracked in Cheque Register
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Cheque Leaf # *</label>
                    <input
                      type="text"
                      value={poChequeNo}
                      onChange={(e) => setPoChequeNo(e.target.value)}
                      placeholder="e.g. 004821"
                      className="input bg-white text-xs py-1.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Bank Name *</label>
                    <input
                      type="text"
                      value={poChequeBank}
                      onChange={(e) => setPoChequeBank(e.target.value)}
                      placeholder="e.g. HDFC Bank, SBI"
                      className="input bg-white text-xs py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Realisation / Due Date *</label>
                    <input
                      type="date"
                      value={poChequeDate}
                      onChange={(e) => setPoChequeDate(e.target.value)}
                      className="input bg-white text-xs py-1.5"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Credit Terms & Due Date */}
            {(paymentStatus === 'Pending' || paymentMethod === 'Credit / Pay Later') && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 space-y-2.5 animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-amber-600" />
                    <span>Credit Terms & Expected Payment Due Date</span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(['Immediate', '15 Days', '30 Days', '45 Days', '60 Days'] as const).map((term) => {
                    const days = term === 'Immediate' ? 0 : parseInt(term, 10);
                    return (
                      <button
                        key={term}
                        type="button"
                        onClick={() => {
                          setPoPaymentTerms(term);
                          const d = new Date(date || new Date().toISOString().slice(0, 10));
                          d.setDate(d.getDate() + days);
                          setPoDueDate(d.toISOString().slice(0, 10));
                        }}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition ${
                          poPaymentTerms === term
                            ? 'bg-amber-500 text-white border-amber-600'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-amber-50'
                        }`}
                      >
                        {term}
                      </button>
                    );
                  })}
                  <div className="flex items-center gap-1 ml-auto">
                    <span className="text-[11px] font-semibold text-slate-600">Due:</span>
                    <input
                      type="date"
                      value={poDueDate}
                      onChange={(e) => {
                        setPoDueDate(e.target.value);
                        setPoPaymentTerms('Custom');
                      }}
                      className="input bg-white text-xs py-1 px-2 w-32"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about this purchase order"
              rows={2}
              className="input"
            />
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <div className="ml-auto max-w-xs space-y-2">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Subtotal</span>
                <span className="tabular-nums font-medium">₹{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-600">
                <span>GST ({GST_RATE}%)</span>
                <span className="tabular-nums font-medium">₹{gstAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-lg font-bold text-slate-900">
                <span>Grand Total</span>
                <span className="tabular-nums">₹{grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {lines.length > 0 && (
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <PackageCheck className="h-4 w-4 text-accent-500" />
              {poStatus === 'received'
                ? 'Estimated Stock will automatically increase for each product when this purchase is saved.'
                : poStatus === 'cancelled'
                  ? 'Cancelled orders do not affect Estimated Stock.'
                  : 'Estimated Stock will not update until this order is marked as Received.'}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={handleSave} disabled={!canSubmit}>
              Save Purchase Order
            </button>
          </div>
        </div>
      </Modal>

      {/* Create Purchase Bill / Credit Note Modal */}
      {pbModalOpen && (
        <Modal
          title={`Create ${pbDocumentType === 'CREDIT NOTE' ? 'Credit Note' : pbDocumentType === 'DEBIT NOTE' ? 'Debit Note' : 'Purchase Bill'} (${pbNumber})`}
          size="xl"
          onClose={() => setPbModalOpen(false)}
        >
          <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1 text-xs">
            {/* Document Type Selector */}
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Document Type</label>
              <div className="flex gap-2">
                {[
                  { value: 'PURCHASE BILL', label: 'Purchase Bill', tone: 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-xs' },
                  { value: 'CREDIT NOTE', label: 'Credit Note', tone: 'border-rose-600 bg-rose-50 text-rose-700 shadow-xs' },
                  { value: 'DEBIT NOTE', label: 'Debit Note', tone: 'border-amber-600 bg-amber-50 text-amber-700 shadow-xs' },
                ].map((dt) => (
                  <button
                    key={dt.value}
                    type="button"
                    onClick={() => {
                      setPbDocumentType(dt.value as any);
                      if (dt.value === 'CREDIT NOTE') setPbCustomBillNumber(nextCreditNote(sales));
                      else if (dt.value === 'DEBIT NOTE') setPbCustomBillNumber(nextDebitNote(sales));
                      else setPbCustomBillNumber(nextPurchaseBill(sales));
                    }}
                    className={`flex-1 py-1.5 px-3 rounded-lg border text-xs font-bold transition ${
                      pbDocumentType === dt.value
                        ? dt.tone
                        : 'border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {dt.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Refined Autocomplete Supplier Selector */}
            <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/70 space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-800">Supplier &amp; Billing Details</label>
                {pbSupplier.trim() && !suppliers.some((s) => s.name.trim().toLowerCase() === pbSupplier.trim().toLowerCase()) && (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                    ✨ New Supplier (Auto-saves to Master List)
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Autocomplete Input for Supplier Name */}
                <div className="relative">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Supplier / Firm Name *</label>
                  <input
                    type="text"
                    value={pbSupplier}
                    onFocus={() => setShowPbSupplierDropdown(true)}
                    onChange={(e) => {
                      setPbSupplier(e.target.value);
                      setShowPbSupplierDropdown(true);
                      if (pbSupplierId !== 'new') setPbSupplierId('new');
                    }}
                    placeholder="Type or search supplier..."
                    className="input bg-white text-xs font-medium relative z-20"
                  />

                  {/* Floating Autocomplete List */}
                  {showPbSupplierDropdown && filteredPbSuppliers.length > 0 && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowPbSupplierDropdown(false)} />
                      <div className="absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg divide-y divide-slate-100">
                        {filteredPbSuppliers.map((s) => (
                          <div
                            key={s.id}
                            onMouseDown={() => {
                              setPbSupplierId(s.id);
                              setPbSupplier(s.name);
                              setPbPhone(s.phone || '');
                              setPbAddress(s.address || '');
                              setPbGstin(s.gstin || '');
                              setShowPbSupplierDropdown(false);
                            }}
                            className="p-2 hover:bg-indigo-50 cursor-pointer transition rounded-lg text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900">{s.name}</span>
                              {s.gstin && (
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                                  {s.gstin}
                                </span>
                              )}
                            </div>
                            {(s.phone || s.address) && (
                              <p className="text-[10.5px] text-slate-500 mt-0.5 truncate">
                                {s.phone && `📞 ${s.phone}`} {s.phone && s.address && '·'} {s.address && `📍 ${s.address}`}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={pbPhone}
                    onChange={(e) => setPbPhone(e.target.value)}
                    placeholder="Mobile / Office Phone"
                    className="input bg-white text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Supplier GSTIN</label>
                  <input
                    type="text"
                    value={pbGstin}
                    onChange={(e) => setPbGstin(e.target.value.toUpperCase())}
                    placeholder="e.g. 07AAAAA0000A1Z5"
                    className="input bg-white text-xs font-mono uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Billing / Delivery Address</label>
                <input
                  type="text"
                  value={pbAddress}
                  onChange={(e) => setPbAddress(e.target.value)}
                  placeholder="Address details..."
                  className="input bg-white text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Purchase Bill Number *</label>
                <input
                  type="text"
                  value={pbCustomBillNumber}
                  onChange={(e) => setPbCustomBillNumber(e.target.value)}
                  placeholder="e.g. PB-1001 or BILL-5521"
                  className="input font-mono font-bold text-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Bill Date</label>
                <input
                  type="date"
                  value={pbDate}
                  onChange={(e) => setPbDate(e.target.value)}
                  className="input"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Supplier GSTIN</label>
                <input
                  type="text"
                  value={pbGstin}
                  onChange={(e) => setPbGstin(e.target.value)}
                  placeholder="E.G. 07AAAAA0000A1Z5"
                  className="input font-mono uppercase"
                />
              </div>
            </div>

            {/* Transport & Tax Details */}
            <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 space-y-2.5">
              <span className="text-[11px] font-bold text-slate-700">Transport &amp; Tax Details (P.O., Transport, E-Way Bill)</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5">P.O. Number</label>
                  <input
                    type="text"
                    value={pbPoNumber}
                    onChange={(e) => setPbPoNumber(e.target.value)}
                    placeholder="e.g. PB-1029"
                    className="input text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5">P.O. Date</label>
                  <input
                    type="date"
                    value={pbPoDate}
                    onChange={(e) => setPbPoDate(e.target.value)}
                    className="input text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5">E-Way Bill No.</label>
                  <input
                    type="text"
                    value={pbEwayBill}
                    onChange={(e) => setPbEwayBill(e.target.value)}
                    placeholder="12-digit E-Way Bill"
                    className="input text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5">Mode of Transport</label>
                  <input
                    type="text"
                    value={pbTransportMode}
                    onChange={(e) => setPbTransportMode(e.target.value)}
                    placeholder="e.g. Road / Tempo / Hand"
                    className="input text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5">Vehicle Number</label>
                  <input
                    type="text"
                    value={pbVehicleNumber}
                    onChange={(e) => setPbVehicleNumber(e.target.value)}
                    placeholder="E.G. HR-51-AB-1234"
                    className="input text-xs font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5">Vendor Code</label>
                  <input
                    type="text"
                    value={pbVendorCode}
                    onChange={(e) => setPbVendorCode(e.target.value)}
                    placeholder="Vendor / Account Code"
                    className="input text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Product Selector */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700">Add Products to Purchase Bill</label>
                <button
                  type="button"
                  onClick={() => {
                    if (!isAddingPbNewProduct) setPbNewProdName(pbProductSearch.trim());
                    setIsAddingPbNewProduct(!isAddingPbNewProduct);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold transition flex items-center gap-1 shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Add New Product Master</span>
                </button>
              </div>

              {/* Inline New Product Form for Purchase Bill */}
              {isAddingPbNewProduct && (
                <div className="mb-3 p-3 bg-emerald-50/60 rounded-xl border-2 border-emerald-300 space-y-2.5 animate-fade-in shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-emerald-900 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      Add Brand New Product Master (Auto-saves to Inventory)
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsAddingPbNewProduct(false)}
                      className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                    >
                      ✕ Close
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                    <div className="sm:col-span-2">
                      <label className="block text-[10.5px] font-bold text-slate-700 mb-0.5">Product Name *</label>
                      <input
                        type="text"
                        value={pbNewProdName}
                        onChange={(e) => setPbNewProdName(e.target.value)}
                        placeholder="e.g. Hex Bolt M12 x 50mm SS 304"
                        className="input text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10.5px] font-bold text-slate-700 mb-0.5">Cost Price (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={pbNewProdCost}
                        onChange={(e) => setPbNewProdCost(e.target.value)}
                        placeholder="0.00"
                        className="input text-xs bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10.5px] font-bold text-slate-700 mb-0.5">Selling Price (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={pbNewProdPrice}
                        onChange={(e) => setPbNewProdPrice(e.target.value)}
                        placeholder="0.00"
                        className="input text-xs bg-white font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10.5px] text-emerald-800 font-medium">
                      ✓ Auto-creates product master in Inventory catalog &amp; appends line item to this bill.
                    </span>
                    <button
                      type="button"
                      onClick={handleCreatePbNewProduct}
                      className="btn-primary bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1.5 flex items-center gap-1.5 shadow-sm"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Save &amp; Add to Bill</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Product Catalog Picker with Search, Category Filter, and Smooth Scroller */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-2.5">
                {/* Search input with Cross (X) button */}
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={pbProductSearch}
                    onChange={(e) => setPbProductSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && pbSearchResults.length > 0) {
                        e.preventDefault();
                        addPbLine(pbSearchResults[0].id);
                        setPbProductSearch('');
                      }
                    }}
                    placeholder="Search 990+ products by name, size, rack..."
                    className="input pl-9 pr-9 text-xs bg-white"
                  />
                  {pbProductSearch && (
                    <button
                      type="button"
                      onClick={() => setPbProductSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 rounded-full transition"
                      title="Clear search"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Category Filter Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                  <span className="text-[11px] font-bold text-slate-500 shrink-0">Category:</span>
                  {availableCategories.slice(0, 9).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setPbCategory(cat)}
                      className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition shrink-0 ${
                        pbCategory === cat
                          ? 'bg-brand-600 text-white shadow-xs'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Scrollable Catalog Product List (Inline) */}
                <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-xs">
                  <div className="bg-slate-100/70 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between text-[11px] text-slate-600 font-semibold">
                    <span>
                      Catalog List ({pbSearchResults.length} {pbSearchResults.length === 1 ? 'item' : 'items'} displayed
                      {pbProductSearch ? ` for "${pbProductSearch}"` : ''})
                    </span>
                    <span className="text-slate-400 text-[10.5px]">Scroll to browse &middot; Click &quot;+ Add&quot; to include</span>
                  </div>

                  <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                    {pbSearchResults.length > 0 ? (
                      pbSearchResults.map((p) => {
                        const addedLine = pbLines.find((l) => l.productId === p.id);
                        return (
                          <div
                            key={p.id}
                            className={`flex items-center justify-between p-2.5 transition text-left text-xs ${
                              addedLine ? 'bg-indigo-50/40 hover:bg-indigo-50/70' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex-1 pr-3">
                              <p className="font-bold text-slate-800 leading-tight">{p.name}</p>
                              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 flex-wrap">
                                {p.size && <span className="font-mono bg-slate-100 px-1 rounded text-slate-600">{p.size}</span>}
                                {p.rackNumber && <span>Rack: <strong className="text-slate-700">{p.rackNumber}</strong></span>}
                                <span>Est. Stock: <strong className="text-slate-700">{p.stock}</strong></span>
                                {p.category && <span className="text-slate-400 font-medium">({p.category})</span>}
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-xs font-bold text-slate-700 font-mono">
                                ₹{p.price.toFixed(2)}
                              </span>

                              {addedLine ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="px-2 py-0.5 rounded-full text-[10.5px] font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-300 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3 text-indigo-600" />
                                    <span>Added ({addedLine.qty})</span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => addPbLine(p.id)}
                                    className="p-1 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition"
                                    title="Add one more"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removePbLine(p.id)}
                                    className="p-1 rounded-md bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition"
                                    title="Remove from bill"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => addPbLine(p.id)}
                                  className="px-3 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs transition flex items-center gap-1 shadow-xs"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Add</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-4 text-center text-xs text-slate-400">
                        No products found matching &quot;{pbProductSearch}&quot;.
                      </div>
                    )}
                  </div>
                </div>

                {pbProductSearch && pbSearchResults.length === 0 && !isAddingPbNewProduct && (
                  <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/70 flex items-center justify-between gap-2">
                    <span className="text-xs text-amber-900 font-medium">
                      No existing product match for &quot;{pbProductSearch}&quot;.
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setPbNewProdName(pbProductSearch.trim());
                        setIsAddingPbNewProduct(true);
                        setPbProductSearch('');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs shrink-0 flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Add &quot;{pbProductSearch}&quot; as New Product</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Items Added to Purchase Bill */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <ShoppingCart className="w-4 h-4 text-indigo-600" />
                  <span>Items Added to Purchase Bill</span>
                  <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-200">
                    {pbLines.length} {pbLines.length === 1 ? 'item' : 'items'}
                  </span>
                </label>
                {pbLines.length > 0 && (
                  <span className="text-xs font-bold text-slate-600">
                    Subtotal: <strong className="text-indigo-700 font-mono">₹{pbSubtotal.toFixed(2)}</strong>
                  </span>
                )}
              </div>

              {pbLines.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 font-bold text-slate-700">
                      <tr>
                        <th className="p-2.5">Item Name</th>
                        <th className="p-2.5 w-28">HSN Code</th>
                        <th className="p-2.5 w-28 text-center">Qty</th>
                        <th className="p-2.5 w-28 text-right">Price (₹)</th>
                        <th className="p-2.5 w-28 text-right">Total (₹)</th>
                        <th className="p-2.5 w-24 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pbLines.map((l) => (
                        <tr key={l.productId} className="hover:bg-slate-50/50">
                          <td className="p-2.5">
                            <input
                              type="text"
                              value={l.name}
                              onChange={(e) => updatePbLineName(l.productId, e.target.value)}
                              className="input p-1.5 text-xs font-semibold text-slate-900 bg-white"
                              placeholder="Item Name"
                            />
                          </td>
                          <td className="p-2.5">
                            <input
                              type="text"
                              value={l.hsnCode || '7318150'}
                              onChange={(e) => setPbLineHsn(l.productId, e.target.value)}
                              className="input p-1 text-[11px] font-mono text-center bg-white"
                            />
                          </td>
                          <td className="p-2.5">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => updatePbLineQty(l.productId, -1)}
                                className="p-1 rounded hover:bg-slate-200 text-slate-500"
                                title="Decrease quantity"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <input
                                type="number"
                                value={l.qty}
                                onChange={(e) => setPbLineQty(l.productId, e.target.value)}
                                className="w-14 text-center font-bold input p-1 bg-white"
                                min={1}
                              />
                              <button
                                type="button"
                                onClick={() => updatePbLineQty(l.productId, 1)}
                                className="p-1 rounded hover:bg-slate-200 text-slate-500"
                                title="Increase quantity"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                          <td className="p-2.5 text-right">
                            <input
                              type="number"
                              value={l.price}
                              onChange={(e) => setPbLinePrice(l.productId, e.target.value)}
                              className="w-20 text-right font-semibold input p-1 ml-auto bg-white font-mono"
                              step="0.01"
                            />
                          </td>
                          <td className="p-2.5 text-right font-bold text-slate-900 font-mono">
                            ₹{(l.price * l.qty).toFixed(2)}
                          </td>
                          <td className="p-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => removePbLine(l.productId)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition shadow-xs"
                              title="Remove item"
                            >
                              <X className="h-3.5 w-3.5" />
                              <span>Remove</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 py-8 text-center">
                  <Package className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-2 text-xs font-bold text-slate-600">No products added yet</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Click &quot;+ Add&quot; on any product in the catalog above to add it to this purchase bill.</p>
                </div>
              )}
            </div>

            {/* Calculations Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              <div className="space-y-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700">Apply GST Tax</label>
                  <input
                    type="checkbox"
                    checked={pbApplyGst}
                    onChange={(e) => setPbApplyGst(e.target.checked)}
                    className="h-4 w-4 rounded accent-indigo-600"
                  />
                </div>

                {pbApplyGst && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">GST Rate (%)</label>
                        <select
                          value={pbGstRate}
                          onChange={(e) => setPbGstRate(Number(e.target.value))}
                          className="input p-1.5"
                        >
                          <option value={0}>0% (Nil)</option>
                          <option value={5}>5%</option>
                          <option value={12}>12%</option>
                          <option value={18}>18%</option>
                          <option value={28}>28%</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Tax Type</label>
                        <select
                          value={pbGstTaxType}
                          onChange={(e) => setPbGstTaxType(e.target.value as 'local' | 'central')}
                          className="input p-1.5"
                        >
                          <option value="local">Local (CGST + SGST)</option>
                          <option value="central">Central (IGST)</option>
                        </select>
                      </div>
                    </div>
                  </>
                )}

                <div className="border-t border-slate-200 pt-2">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Discount (%)</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={pbDiscount}
                      onChange={(e) => setPbDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="input p-1.5 w-full text-right font-bold"
                      min={0}
                      max={100}
                      step={0.01}
                      placeholder="0"
                    />
                    <span className="text-xs font-bold text-slate-600">%</span>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-2">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Freight / Cartage Charges (₹)</label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-600">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={pbFreightCharges}
                      placeholder="0"
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setPbFreightCharges(e.target.value.replace(/^0+(?=\d)/, ''))}
                      className="input p-1.5 w-full text-right font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 text-white p-3.5 rounded-lg space-y-1.5 font-mono">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">Subtotal:</span>
                  <span>₹{pbSubtotal.toFixed(2)}</span>
                </div>
                {pbDiscountAmount > 0 && (
                  <div className="flex justify-between text-xs text-amber-400">
                    <span>Discount:</span>
                    <span>-₹{pbDiscountAmount.toFixed(2)}</span>
                  </div>
                )}
                {pbFreightVal > 0 && (
                  <div className="flex justify-between text-xs text-indigo-300 font-bold">
                    <span>FREIGHT:</span>
                    <span>₹{pbFreightVal.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs font-bold text-white">
                  <span className="text-slate-300">Taxable Value:</span>
                  <span>₹{pbTaxableAmount.toFixed(2)}</span>
                </div>
                {pbApplyGst && pbGstTaxType === 'local' && (
                  <>
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>CGST ({(pbGstRate / 2)}%):</span>
                      <span>₹{pbCgstAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>SGST ({(pbGstRate / 2)}%):</span>
                      <span>₹{pbSgstAmount.toFixed(2)}</span>
                    </div>
                  </>
                )}
                {pbApplyGst && pbGstTaxType === 'central' && (
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>IGST ({pbGstRate}%):</span>
                    <span>₹{pbIgstAmount.toFixed(2)}</span>
                  </div>
                )}
                {pbHasRoundOff && (
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Round Off:</span>
                    <span>{pbRoundOff > 0 ? `+₹${pbRoundOff.toFixed(2)}` : `-₹${Math.abs(pbRoundOff).toFixed(2)}`}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold text-emerald-400 border-t border-slate-700 pt-2 mt-2 font-sans">
                  <span>Grand Total:</span>
                  <span>₹{pbGrandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={() => setPbModalOpen(false)}>
                Cancel
              </button>
              <button
                className={`btn-primary font-bold ${
                  pbDocumentType === 'CREDIT NOTE'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : pbDocumentType === 'DEBIT NOTE'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
                onClick={handleSavePurchaseBill}
                disabled={!pbCanSubmit}
              >
                Confirm &amp; Issue {pbDocumentType === 'CREDIT NOTE' ? 'Credit Note' : pbDocumentType === 'DEBIT NOTE' ? 'Debit Note' : 'Purchase Bill'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Purchase Bill View Modal (4 Copies Export & Print) */}
      {pbViewing && (
        <Modal
          title={`Purchase Bill Details — ${pbViewing.invoice}`}
          size="xl"
          onClose={() => setPbViewing(null)}
        >
          <div className="space-y-3.5 text-xs font-sans">
            {/* Copy Selector Tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-slate-100 p-1.5 rounded-lg border border-slate-200 gap-2">
              <span className="text-[11px] font-bold text-slate-700 pl-1">Preview Copy:</span>
              <div className="flex flex-wrap gap-1">
                {[
                  'Original For Recipient',
                  'Duplicate For Transporter',
                  'Triplicate For Supplier',
                  'Extra Copy'
                ].map((copyTag) => (
                  <button
                    key={copyTag}
                    onClick={() => setPbPreviewCopyTag(copyTag)}
                    className={`px-2.5 py-1 rounded text-[10.5px] font-bold transition-all ${
                      pbPreviewCopyTag === copyTag
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
                    }`}
                  >
                    {copyTag}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-right text-[10px] font-bold text-slate-900 tracking-wide">{pbPreviewCopyTag}</div>

            {/* Main Frame Box */}
            <div className="border-2 border-black text-black bg-white shadow-sm overflow-hidden">
              <div className="text-center font-bold text-xs border-b border-black py-1 tracking-wider uppercase bg-slate-50">
                {pbViewing.documentType || 'PURCHASE BILL'}
              </div>

              {/* Company Header */}
              <div className="text-center p-3 border-b border-black">
                <h2 className="text-xl font-black uppercase tracking-tight font-sans">{companySettings?.companyName || 'NAIN TOOLS & SS BOLT CO.'}</h2>
                <p className="text-[11px] font-bold mt-0.5">{companySettings?.address || '17/1, INDUSTRIAL AREA WHIRLPOOL CHOWK, NIT FARIDABAD'}</p>
                <p className="text-[10px] text-slate-700 mt-0.5">EMAIL : {companySettings?.email || 'narendernain2011@gmail.com'} &nbsp;|&nbsp; {companySettings?.phone || '9213469582 7053795074 129 4870974'}</p>
                <p className="text-xs font-black mt-1">GSTIN No. {pbViewing.sellerGstin || companySettings?.gstin || '06CCCPK0841B1ZA'}</p>
              </div>

              {/* PAN & Reverse Charge */}
              <div className="flex justify-between px-3 py-1.5 border-b border-black text-[11px] font-bold bg-slate-50/60">
                <div>PAN No. &nbsp;&nbsp;&nbsp;&nbsp; <span className="font-mono">{pbViewing.sellerPan || companySettings?.pan || 'CCCPK0841B'}</span></div>
                <div>Tax is Payable on Reverse Charge : <span>No</span></div>
              </div>

              {/* Two Column Grid */}
              <div className="grid grid-cols-2 border-b border-black divide-x divide-black text-[10px]">
                <div className="p-2 space-y-1">
                  <div className="flex justify-between">
                    <span>Bill No. : &nbsp;&nbsp; <strong>{pbViewing.invoice}</strong></span>
                    <span>Date : &nbsp;&nbsp; <strong>{pbViewing.date}</strong></span>
                  </div>
                  <div className="flex justify-between"><span>P.O. No. :</span> <strong>{pbViewing.poNumber || '—'}</strong></div>
                  <div className="flex justify-between"><span>P.O. Date :</span> <strong>{pbViewing.poDate || '—'}</strong></div>
                </div>
                <div className="p-2 space-y-1">
                  <div className="flex justify-between"><span>Mode of Transport :</span> <strong>{pbViewing.transportMode || '—'}</strong></div>
                  <div className="flex justify-between"><span>Vehicle No. :</span> <strong>{pbViewing.vehicleNumber || '—'}</strong></div>
                  <div className="flex justify-between"><span>Date &amp; Time of Supply :</span> <span>{pbViewing.date} 01:29 PM</span></div>
                </div>
              </div>

              {/* Party Details */}
              <div className="p-2.5 border-b border-black bg-slate-50/30">
                <span className="font-bold text-[10px] text-slate-500 uppercase tracking-wider block mb-0.5">Supplier Details:</span>
                <p className="font-bold text-xs uppercase">{pbViewing.customer}</p>
                <p className="text-[10.5px] font-medium">{pbViewing.customerAddress || 'Haryana, India'}</p>
                <p className="text-[10.5px]">GSTIN / Unique ID : <span className="font-mono font-bold">{pbViewing.customerGstin || '—'}</span></p>
              </div>

              {/* Products Table */}
              <table className="w-full text-left text-[10.5px] border-b border-black">
                {(() => {
                  const isAmountDisc = pbViewing.discountType === 'amount' && pbViewing.discount && pbViewing.discount > 0;
                  const isPercentDisc = pbViewing.discountType === 'percent' && pbViewing.discount && pbViewing.discount > 0;
                  return (
                    <>
                      <thead className="bg-slate-100 border-b border-black font-bold">
                        <tr>
                          <th className="p-1.5 border-r border-black w-8 text-center">S.N.</th>
                          <th className="p-1.5 border-r border-black">Description of Goods</th>
                          <th className="p-1.5 border-r border-black w-16 text-center">HSN Code</th>
                          <th className="p-1.5 border-r border-black w-12 text-center">Qty</th>
                          <th className="p-1.5 border-r border-black w-16 text-right">Rate</th>
                          <th className="p-1.5 border-r border-black w-14 text-right">Disc %</th>
                          <th className="p-1.5 border-r border-black w-16 text-right">Net Rate</th>
                          <th className="p-1.5 text-right w-20">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/20">
                        {pbViewing.items.map((item, idx) => {
                          const unitPrice = item.price;
                          const grossTotal = unitPrice * item.qty;
                          const hasPerItemDisc = typeof item.discount === 'number' && !isNaN(item.discount) && item.discount >= 0;
                          
                          let itemDiscPercent = 0;
                          if (hasPerItemDisc) {
                            itemDiscPercent = item.discountType === 'amount'
                              ? (grossTotal > 0 ? (item.discount! / grossTotal) * 100 : 0)
                              : (item.discount || 0);
                          } else if (isPercentDisc) {
                            itemDiscPercent = pbViewing.discount || 0;
                          } else if (isAmountDisc && pbViewing.subtotal > 0) {
                            itemDiscPercent = (pbViewing.discount / pbViewing.subtotal) * 100;
                          }

                          const netUnitPrice = unitPrice * (1 - itemDiscPercent / 100);
                          const lineNetTotal = item.qty * netUnitPrice;

                          return (
                            <tr key={idx}>
                              <td className="p-1.5 border-r border-black text-center">{idx + 1}</td>
                              <td className="p-1.5 border-r border-black font-bold">{item.name}</td>
                              <td className="p-1.5 border-r border-black text-center font-mono">{item.hsnCode || '7318150'}</td>
                              <td className="p-1.5 border-r border-black text-center font-bold">{item.qty}</td>
                              <td className="p-1.5 border-r border-black text-right font-mono">₹{unitPrice.toFixed(2)}</td>
                              <td className="p-1.5 border-r border-black text-right font-mono">{itemDiscPercent.toFixed(2)}</td>
                              <td className="p-1.5 border-r border-black text-right font-mono font-bold">₹{netUnitPrice.toFixed(2)}</td>
                              <td className="p-1.5 text-right font-bold font-mono">₹{lineNetTotal.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </>
                  );
                })()}
              </table>

              {/* Totals Section */}
              <div className="p-3 bg-slate-50 font-mono text-xs space-y-1 border-t border-black">
                {(() => {
                  const discAmt = computeDiscountAmount(pbViewing.subtotal, pbViewing.discount, pbViewing.discountType);
                  const freightAmt = pbViewing.freightCharges || 0;
                  const taxableVal = Math.max(0, pbViewing.subtotal - discAmt + freightAmt);
                  const gstVal = pbViewing.gstAmount || 0;
                  const rawTotal = taxableVal + gstVal;
                  const grandTotalInt = Math.round(pbViewing.grandTotal || rawTotal);
                  const roundOff = +(grandTotalInt - rawTotal).toFixed(2);
                  const showRoundOff = Math.abs(roundOff) >= 0.01;

                  return (
                    <>
                      <div className="flex justify-between">
                        <span>Total Amount:</span>
                        <span>{money(pbViewing.subtotal)}</span>
                      </div>
                      {discAmt > 0 ? (
                        <div className="flex justify-between text-amber-700 font-semibold">
                          <span>Discount (Less):</span>
                          <span>-{money(discAmt)}</span>
                        </div>
                      ) : null}
                      {freightAmt > 0 ? (
                        <div className="flex justify-between font-bold text-slate-800">
                          <span>FREIGHT:</span>
                          <span>{money(freightAmt)}</span>
                        </div>
                      ) : null}
                      <div className="flex justify-between font-bold">
                        <span>Taxable Amount:</span>
                        <span>{money(taxableVal)}</span>
                      </div>
                      {showRoundOff ? (
                        <div className="flex justify-between text-slate-600">
                          <span>Round Off:</span>
                          <span>{roundOff > 0 ? `+${money(roundOff)}` : money(roundOff)}</span>
                        </div>
                      ) : null}
                      <div className="flex justify-between font-bold text-sm border-t border-slate-300 pt-1 mt-1 font-sans">
                        <span>Grand Total:</span>
                        <span>{money(grandTotalInt)}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Export Copies Selection */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 text-xs">Select Copies to Export / Print:</span>
                <div className="flex gap-1.5 text-[11px]">
                  <button
                    onClick={() => setPbExportCopies({ 'Original For Recipient': true, 'Duplicate For Transporter': true, 'Triplicate For Supplier': true, 'Extra Copy': true })}
                    className="px-2 py-0.5 bg-indigo-50 text-indigo-700 font-bold rounded hover:bg-indigo-100"
                  >
                    All 4 Copies
                  </button>
                  <button
                    onClick={() => setPbExportCopies({ 'Original For Recipient': true, 'Duplicate For Transporter': false, 'Triplicate For Supplier': false, 'Extra Copy': false })}
                    className="px-2 py-0.5 bg-slate-200 text-slate-800 font-bold rounded hover:bg-slate-300"
                  >
                    Original Only
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                {[
                  'Original For Recipient',
                  'Duplicate For Transporter',
                  'Triplicate For Supplier',
                  'Extra Copy'
                ].map((copyTag) => (
                  <label key={copyTag} className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!pbExportCopies[copyTag]}
                      onChange={(e) => setPbExportCopies((prev) => ({ ...prev, [copyTag]: e.target.checked }))}
                      className="rounded accent-indigo-600"
                    />
                    <span>{copyTag}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-2">
              <button className="btn-secondary" onClick={() => setPbViewing(null)}>
                Close
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const sel = Object.keys(pbExportCopies).filter((k) => pbExportCopies[k]);
                    printInvoice(pbViewing, sel, companySettings);
                  }}
                  className="btn-primary bg-indigo-600 hover:bg-indigo-700 flex items-center gap-1.5"
                >
                  <Printer className="h-4 w-4" />
                  <span>Print Selected Copies ({Object.values(pbExportCopies).filter(Boolean).length})</span>
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Quick Record Payment Modal for Purchase Orders */}
      {payTargetPO && (
        <Modal
          open={!!payTargetPO}
          onClose={() => setPayTargetPO(null)}
          title="Record Supplier Payment"
          subtitle={`Bill #${payTargetPO.poNumber.startsWith('PO-') ? 'PB-' + payTargetPO.poNumber.slice(3) : payTargetPO.poNumber} · Supplier: ${payTargetPO.supplier}`}
          size="md"
          footer={
            <>
              <button className="btn-secondary" onClick={() => setPayTargetPO(null)}>Cancel</button>
              <button
                className="btn-primary bg-emerald-600 hover:bg-emerald-700"
                onClick={handleRecordPoPayment}
                disabled={!recordPayAmount || parseFloat(recordPayAmount) <= 0}
              >
                <CheckCircle2 className="w-4 h-4" /> Save Payment
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <div className="flex justify-between text-xs text-slate-600">
                <span>Total Bill Value:</span>
                <span className="font-bold tabular-nums text-slate-800">{money(payTargetPO.grandTotal)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-600">
                <span>Already Paid:</span>
                <span className="font-bold tabular-nums text-emerald-700">
                  {money(payTargetPO.amountPaid || (payTargetPO.paymentStatus === 'Paid' ? payTargetPO.grandTotal : 0))}
                </span>
              </div>
              <div className="flex justify-between text-sm font-bold border-t border-slate-200 pt-2 text-slate-900">
                <span>Balance Due to Supplier:</span>
                <span className="font-bold tabular-nums text-amber-700">
                  {money(Math.max(0, payTargetPO.grandTotal - (payTargetPO.amountPaid || (payTargetPO.paymentStatus === 'Paid' ? payTargetPO.grandTotal : 0))))}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Payment Amount (₹) *</label>
              <input
                type="number"
                min="1"
                step="0.01"
                value={recordPayAmount}
                onChange={(e) => setRecordPayAmount(e.target.value)}
                placeholder="Enter amount being paid"
                className="input text-sm font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Payment Mode *</label>
              <div className="grid grid-cols-4 gap-2">
                {(['Bank Transfer', 'UPI', 'Cash', 'Cheque'] as PurchasePaymentMethod[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setRecordPayMethod(m)}
                    className={`py-2 px-2 text-xs font-bold rounded-lg border transition text-center ${
                      recordPayMethod === m
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {recordPayMethod === 'Cheque' && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3.5 space-y-3">
                <div className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                  <Landmark className="w-4 h-4 text-indigo-600" />
                  <span>Cheque Details (Issued to Supplier)</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Cheque Leaf # *</label>
                    <input
                      type="text"
                      value={recordPayChequeNo}
                      onChange={(e) => setRecordPayChequeNo(e.target.value)}
                      placeholder="e.g. 004821"
                      className="input bg-white text-xs py-1.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Bank Name *</label>
                    <input
                      type="text"
                      value={recordPayChequeBank}
                      onChange={(e) => setRecordPayChequeBank(e.target.value)}
                      placeholder="e.g. HDFC Bank"
                      className="input bg-white text-xs py-1.5"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Cheque Date / Realisation *</label>
                    <input
                      type="date"
                      value={recordPayChequeDate}
                      onChange={(e) => setRecordPayChequeDate(e.target.value)}
                      className="input bg-white text-xs py-1.5"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* New Raw Purchase Modal (Quick Cash / UPI Inward) */}
      {rawPurchaseModalOpen && (
        <Modal
          title={`Create Raw Purchase (${rawPurNumber || 'Auto'})`}
          size="lg"
          onClose={() => setRawPurchaseModalOpen(false)}
        >
          <div className="space-y-4 max-h-[82vh] overflow-y-auto pr-1 text-xs">
            {/* Top Bar Info & Payment Mode */}
            <div className="p-3.5 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-black">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-emerald-950 text-sm">Direct Inward Purchase</h4>
                    <p className="text-[11px] text-emerald-700">Immediate inventory addition • No vendor or GST bill details required</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-600">Recorded Under:</span>
                  <span className="px-2.5 py-0.5 rounded-md bg-emerald-100 border border-emerald-300 font-extrabold text-emerald-900">
                    Raw Purchase
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-emerald-200/60">
                <div>
                  <label className="block text-[11px] font-bold text-emerald-900 mb-1">Purchase / Inward Slip #</label>
                  <input
                    type="text"
                    value={rawPurNumber}
                    onChange={(e) => setRawPurNumber(e.target.value)}
                    placeholder="e.g. RP-1001"
                    className="input font-mono font-bold text-emerald-800 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-emerald-900 mb-1">Inward Date</label>
                  <input
                    type="date"
                    value={rawPurDate}
                    onChange={(e) => setRawPurDate(e.target.value)}
                    className="input font-semibold bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-emerald-900 mb-1">Payment Method (Immediate) *</label>
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-white rounded-xl border border-emerald-300">
                    <button
                      type="button"
                      onClick={() => setRawPurPaymentMethod('Cash')}
                      className={`py-1.5 px-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition ${
                        rawPurPaymentMethod === 'Cash'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <Wallet className="w-3.5 h-3.5" />
                      <span>Cash</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRawPurPaymentMethod('UPI')}
                      className={`py-1.5 px-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition ${
                        rawPurPaymentMethod === 'UPI'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>UPI</span>
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-emerald-900 mb-1">Optional Note / Reference</label>
                <input
                  type="text"
                  value={rawPurNote}
                  onChange={(e) => setRawPurNote(e.target.value)}
                  placeholder="e.g. Local supplier cash inward, Chawri Bazar hardware, etc."
                  className="input bg-white text-xs"
                />
              </div>
            </div>

            {/* Product Selector for Raw Purchase */}
            <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/70 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="font-extrabold text-slate-800 flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-emerald-600" />
                  <span>Select Products to Inward (Adds to Stock)</span>
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={rawPurCategory}
                    onChange={(e) => setRawPurCategory(e.target.value)}
                    className="input py-1 text-xs font-semibold"
                  >
                    {availableCategories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      if (!isAddingRawPurProduct) setRawNewProdName(rawPurProductSearch.trim());
                      setIsAddingRawPurProduct(!isAddingRawPurProduct);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1 shadow-xs shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add New Product</span>
                  </button>
                </div>
              </div>

              {/* Inline New Product Form for Raw Purchase */}
              {isAddingRawPurProduct && (
                <div className="p-3 bg-emerald-50/70 rounded-xl border-2 border-emerald-300 space-y-2.5 animate-fade-in shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      Add Brand New Product (Auto-creates Master &amp; Inwards to Purchase)
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsAddingRawPurProduct(false)}
                      className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                    >
                      ✕ Close
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <div className="sm:col-span-2">
                      <label className="block text-[10.5px] font-bold text-slate-700 mb-0.5">Product Name *</label>
                      <input
                        type="text"
                        value={rawNewProdName}
                        onChange={(e) => setRawNewProdName(e.target.value)}
                        placeholder="e.g. Hex Bolt M10 x 40mm SS"
                        className="input text-xs bg-white font-medium"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-[10.5px] font-bold text-slate-700 mb-0.5">Category</label>
                      <select
                        value={rawNewProdCategory}
                        onChange={(e) => setRawNewProdCategory(e.target.value)}
                        className="input text-xs bg-white"
                      >
                        {availableCategories.filter((c) => c !== 'All').map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10.5px] font-bold text-slate-700 mb-0.5">Size / Spec</label>
                      <input
                        type="text"
                        value={rawNewProdSize}
                        onChange={(e) => setRawNewProdSize(e.target.value)}
                        placeholder="e.g. M10 x 40"
                        className="input text-xs bg-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[10.5px] font-bold text-slate-700 mb-0.5">Inward Cost Price (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={rawNewProdCost}
                        onChange={(e) => setRawNewProdCost(e.target.value)}
                        placeholder="0.00"
                        className="input text-xs bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10.5px] font-bold text-slate-700 mb-0.5">Selling Price (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={rawNewProdPrice}
                        onChange={(e) => setRawNewProdPrice(e.target.value)}
                        placeholder="0.00"
                        className="input text-xs bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10.5px] font-bold text-slate-700 mb-0.5">Rack / Shelf</label>
                      <input
                        type="text"
                        value={rawNewProdRack}
                        onChange={(e) => setRawNewProdRack(e.target.value)}
                        placeholder="e.g. R-04"
                        className="input text-xs bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10.5px] font-bold text-slate-700 mb-0.5">Inward Qty (Pcs) *</label>
                      <input
                        type="number"
                        min="1"
                        value={rawNewProdInwardQty}
                        onChange={(e) => setRawNewProdInwardQty(e.target.value)}
                        placeholder="1"
                        className="input text-xs bg-white font-mono font-bold text-emerald-800"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10.5px] text-emerald-800 font-medium">
                      ✓ Saves to product catalog &amp; immediately adds to Inward Items below.
                    </span>
                    <button
                      type="button"
                      onClick={handleCreateRawPurNewProduct}
                      className="btn-primary bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1.5 flex items-center gap-1.5 shadow-sm"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Save &amp; Inward to Purchase</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={rawPurProductSearch}
                  onChange={(e) => setRawPurProductSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && rawPurSearchResults.length > 0) {
                      e.preventDefault();
                      addRawProductToPurchase(rawPurSearchResults[0]);
                      setRawPurProductSearch('');
                    }
                  }}
                  placeholder="Search products by name, rack #, size..."
                  className="input pl-8 py-1.5 bg-white text-xs font-medium"
                />
              </div>

              {/* Quick Pick Products Grid */}
              <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5 divide-y divide-slate-100">
                {rawPurSearchResults.length === 0 ? (
                  <div className="py-4 px-2 text-center space-y-2">
                    <p className="text-slate-400 text-xs">
                      {rawPurProductSearch
                        ? `No products found matching "${rawPurProductSearch}".`
                        : 'No products in this category.'}
                    </p>
                    {rawPurProductSearch.trim() && !isAddingRawPurProduct && (
                      <button
                        type="button"
                        onClick={() => {
                          setRawNewProdName(rawPurProductSearch.trim());
                          setIsAddingRawPurProduct(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ Create &quot;{rawPurProductSearch}&quot; as New Product</span>
                      </button>
                    )}
                  </div>
                ) : (
                  rawPurSearchResults.map((p) => {
                    const alreadyInCart = rawPurLines.find((l) => l.productId === p.id);
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between py-1.5 px-2 hover:bg-slate-50 rounded-lg transition"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-bold text-slate-800 truncate">{p.name}</p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500">
                            <span>Rack: <strong className="text-slate-700">{p.rackNumber || '—'}</strong></span>
                            <span>•</span>
                            <span>Cost: <strong className="text-emerald-700">{money(p.cost)}</strong></span>
                            <span>•</span>
                            <span className="text-slate-600">
                              Current Stock: <strong>{p.stock}</strong>
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => addRawProductToPurchase(p)}
                          className={`px-2.5 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1 shrink-0 ${
                            alreadyInCart
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-slate-100 text-slate-700 hover:bg-emerald-600 hover:text-white'
                          }`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{alreadyInCart ? `Add (${alreadyInCart.qty})` : 'Add'}</span>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Selected Inward Items Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h5 className="font-extrabold text-slate-800">
                  Inward Items ({rawPurLines.length})
                </h5>
                <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  ⚡ Stock to add: +{rawPurLines.reduce((s, l) => s + l.qty, 0)} pcs
                </span>
              </div>

              {rawPurLines.length === 0 ? (
                <div className="p-6 border-2 border-dashed border-slate-200 rounded-xl text-center text-slate-400">
                  <ShoppingCart className="w-8 h-8 mx-auto mb-1 text-slate-300" />
                  <p className="font-semibold">No items selected for inward yet</p>
                  <p className="text-[11px]">Click items above to add them to this raw purchase.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[11px] font-bold text-slate-600">
                      <tr>
                        <th className="px-3 py-2">Item Name</th>
                        <th className="px-3 py-2 w-28 text-center">Inward Qty</th>
                        <th className="px-3 py-2 w-28 text-right">Cost Rate (₹)</th>
                        <th className="px-3 py-2 text-right">Total</th>
                        <th className="px-2 py-2 w-10 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {rawPurLines.map((line) => {
                        const lineTotal = +(line.price * line.qty).toFixed(2);
                        const prod = products.find((p) => p.id === line.productId);

                        return (
                          <tr key={line.productId} className="hover:bg-slate-50">
                            <td className="px-3 py-2">
                              <p className="font-bold text-slate-900">{line.name}</p>
                              {prod && (
                                <p className="text-[10px] text-slate-400">
                                  Current Stock: {prod.stock} → New: <strong className="text-emerald-700 font-bold">{prod.stock + line.qty}</strong>
                                </p>
                              )}
                            </td>

                            <td className="px-3 py-2">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => updateRawPurLineQty(line.productId!, line.qty - 1)}
                                  className="h-6 w-6 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-slate-700"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min="1"
                                  value={line.qty}
                                  onChange={(e) => updateRawPurLineQty(line.productId!, parseInt(e.target.value, 10) || 1)}
                                  className="w-12 text-center font-bold input py-0.5 px-1 text-xs"
                                />
                                <button
                                  type="button"
                                  onClick={() => updateRawPurLineQty(line.productId!, line.qty + 1)}
                                  className="h-6 w-6 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-slate-700"
                                >
                                  +
                                </button>
                              </div>
                            </td>

                            <td className="px-3 py-2 text-right">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={line.price}
                                onChange={(e) => updateRawPurLineCost(line.productId!, parseFloat(e.target.value) || 0)}
                                className="w-20 text-right font-mono font-bold input py-0.5 px-1 text-xs"
                              />
                            </td>

                            <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">
                              {money(lineTotal)}
                            </td>

                            <td className="px-2 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => removeRawPurLine(line.productId!)}
                                className="text-slate-400 hover:text-red-600 p-1 transition"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Bill Summary & Actions */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-[11px] text-slate-500 block">Immediate Settlement (No Credit / Cheques)</span>
                <span className="text-xs font-bold text-emerald-800 flex items-center gap-1 mt-0.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Paid in Full via {rawPurPaymentMethod}
                </span>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-[11px] text-slate-500 uppercase tracking-wider font-bold">Total Inward Value</p>
                  <p className="text-2xl font-black text-slate-900 font-mono">
                    {money(rawPurLines.reduce((s, l) => s + (l.price * l.qty), 0))}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleSaveRawPurchase}
                  disabled={rawPurLines.length === 0}
                  className="btn-primary bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 shadow-md shadow-emerald-600/20 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save &amp; Inward Stock</span>
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* View Raw Purchase Detail Modal */}
      {viewingRawPur && (
        <Modal
          title={`Raw Purchase — ${viewingRawPur.invoice}`}
          size="md"
          onClose={() => setViewingRawPur(null)}
        >
          <div className="space-y-4 text-xs">
            {/* Header info */}
            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase tracking-wider font-extrabold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                    Raw Inward Slip
                  </span>
                  <p className="font-mono font-black text-lg text-emerald-950 mt-1">{viewingRawPur.invoice}</p>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    {viewingRawPur.paymentMethod === 'UPI' ? <CreditCard className="w-3.5 h-3.5" /> : <Wallet className="w-3.5 h-3.5" />}
                    {viewingRawPur.paymentMethod} (Paid)
                  </span>
                  <p className="text-[11px] text-slate-500 font-mono mt-1">Date: {viewingRawPur.date}</p>
                </div>
              </div>

              <div className="pt-2 border-t border-emerald-200/60 flex items-center justify-between text-slate-700">
                <span>Party: <strong className="text-slate-900">{viewingRawPur.customer || 'Raw Purchase'}</strong></span>
                {viewingRawPur.notes && (
                  <span className="italic text-slate-500">Note: {viewingRawPur.notes}</span>
                )}
              </div>
            </div>

            {/* Items table */}
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-bold text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 text-center">Inward Qty</th>
                    <th className="px-3 py-2 text-right">Cost Rate</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {viewingRawPur.items?.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-bold text-slate-800">{item.name}</td>
                      <td className="px-3 py-2 text-center font-mono font-bold text-emerald-700">+{item.qty}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-600">{money(item.price)}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">{money(item.price * item.qty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Total */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <span className="font-bold text-slate-600">Total Purchase Value Settled:</span>
              <span className="font-mono font-black text-xl text-slate-900">{money(viewingRawPur.grandTotal)}</span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete raw purchase ${viewingRawPur.invoice}? Added items will be deducted from inventory stock.`)) {
                    deleteSale(viewingRawPur.id);
                    setViewingRawPur(null);
                  }
                }}
                className="text-red-600 hover:text-red-700 font-bold flex items-center gap-1 text-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Record</span>
              </button>

              <button
                type="button"
                onClick={() => setViewingRawPur(null)}
                className="btn-secondary text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
