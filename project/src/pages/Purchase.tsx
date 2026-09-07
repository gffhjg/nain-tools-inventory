import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, Download, Eye, Truck, PackageCheck, Clock, FileText,
  Trash2, Minus, Printer, CheckCircle2, Package, X, AlertTriangle, Sparkles,
  ShoppingCart, ArrowRight, Landmark, CreditCard, Calendar
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import Modal from '@/components/Modal';
import { printPurchase, printInvoice } from '@/components/PrintableInvoice';
import { useStore } from '@/store/AppStore';
import { GST_RATE, computeDiscountAmount, computeGrandTotal, productCategories } from '@/lib/constants';
import { downloadCSV, toCSV, money } from '@/utils/analytics';
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

type DraftLine = PurchaseLineItem;

export default function Purchase() {
  const { purchases, products, suppliers, sales, addPurchase, addSale, addProduct, addSupplier, deleteSale, updatePurchasePayment, companySettings } = useStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'bills' | 'credit-notes' | 'suggestions'>('all');

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
    const q = pbSupplier.trim().toLowerCase();
    if (!q) return suppliers.slice(0, 8);
    return suppliers
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.phone && s.phone.includes(q)) ||
          (s.gstin && s.gstin.toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [suppliers, pbSupplier]);

  const filteredPoSuppliers = useMemo(() => {
    const q = supplier.trim().toLowerCase();
    if (!q) return suppliers.slice(0, 8);
    return suppliers
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.phone && s.phone.includes(q)) ||
          (s.gstin && s.gstin.toLowerCase().includes(q))
      )
      .slice(0, 8);
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

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return combinedRecords.filter((rec) => {
      if (activeTab === 'bills' && rec.typeLabel !== 'PURCHASE BILL') return false;
      if (activeTab === 'credit-notes' && rec.typeLabel !== 'CREDIT NOTE') return false;

      if (!q) return true;
      return (
        rec.docNumber.toLowerCase().includes(q) ||
        rec.supplier.toLowerCase().includes(q) ||
        rec.items.some((i) => i.name.toLowerCase().includes(q))
      );
    });
  }, [combinedRecords, search, activeTab]);

  const summary = useMemo(() => {
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

  const statCards = [
    { label: 'Total Purchase Value', value: `₹${summary.totalInward.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: Truck, tone: 'bg-brand-50 text-brand-600' },
    { label: 'Purchase Bills', value: `${summary.countPB} (₹${summary.totalPB.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`, icon: PackageCheck, tone: 'bg-indigo-50 text-indigo-600' },
    { label: 'Credit Notes Issued', value: `${summary.countCN} (₹${summary.totalCN.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`, icon: FileText, tone: 'bg-rose-50 text-rose-600' },
    { label: 'Restock Suggestions', value: `${lowStockItems.length} items`, icon: Sparkles, tone: 'bg-amber-50 text-amber-600' },
  ];

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
    const q = productSearch.toLowerCase().trim();
    let list = products;
    if (poCategory !== 'All') {
      list = list.filter((p) => (p.category || '').toLowerCase() === poCategory.toLowerCase());
    }
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.size && p.size.toLowerCase().includes(q)) ||
          (p.category && p.category.toLowerCase().includes(q)) ||
          (p.rackNumber && p.rackNumber.toLowerCase().includes(q))
      );
    }
    return list.slice(0, 100);
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
        hsn: p.hsn || '7318150',
        size: p.size || '',
        rack: p.rack || '',
        qty: neededQty,
        price: p.cost,
        discountPercent: 0,
        taxableAmount: taxable,
        cgstPercent: pbGstTaxType === 'central' ? 0 : halfRate,
        sgstPercent: pbGstTaxType === 'central' ? 0 : halfRate,
        igstPercent: pbGstTaxType === 'central' ? pbEffectiveGstRate : 0,
        cgstAmount: cgstAmt,
        sgstAmount: sgstAmt,
        igstAmount: igstAmt,
        total: totalAmt,
      };
    });

    setPbLines(newPbLines);
    setPbNotes(`Auto-generated from Inventory Restock Suggestions (${itemsToOrder.length} items)`);
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
    const q = pbProductSearch.toLowerCase().trim();
    let list = products;
    if (pbCategory !== 'All') {
      list = list.filter((p) => (p.category || '').toLowerCase() === pbCategory.toLowerCase());
    }
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.size && p.size.toLowerCase().includes(q)) ||
          (p.category && p.category.toLowerCase().includes(q)) ||
          (p.rackNumber && p.rackNumber.toLowerCase().includes(q))
      );
    }
    return list.slice(0, 100);
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
              className="btn-primary flex items-center gap-1.5 shadow-sm"
              onClick={openNewPurchaseBill}
            >
              <Plus className="h-4 w-4" />
              <span>New Purchase Bill</span>
            </button>
          </div>
        }
      />

      {/* Metric Cards - Interactive Filter Shortcuts */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <div
          className={`card p-5 cursor-pointer transition-all duration-200 ${
            activeTab === 'all'
              ? 'ring-2 ring-brand-500/80 bg-brand-50/20 border-brand-300 shadow-md'
              : 'hover:border-slate-300 hover:shadow-md'
          }`}
          onClick={() => setActiveTab('all')}
        >
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 font-bold">
              <Truck className="h-5 w-5" />
            </div>
            <span className="text-[10.5px] font-extrabold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-md">
              All Inward
            </span>
          </div>
          <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">
            ₹{summary.totalInward.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-semibold">Total Purchase Value</p>
        </div>

        <div
          className={`card p-5 cursor-pointer transition-all duration-200 ${
            activeTab === 'bills'
              ? 'ring-2 ring-indigo-500/80 bg-indigo-50/20 border-indigo-300 shadow-md'
              : 'hover:border-slate-300 hover:shadow-md'
          }`}
          onClick={() => setActiveTab('bills')}
        >
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 font-bold">
              <PackageCheck className="h-5 w-5" />
            </div>
            <span className="text-[10.5px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
              Purchase Bills
            </span>
          </div>
          <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">
            {summary.countPB}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-semibold">
            ₹{summary.totalPB.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Inward
          </p>
        </div>

        <div
          className={`card p-5 cursor-pointer transition-all duration-200 ${
            activeTab === 'credit-notes'
              ? 'ring-2 ring-rose-500/80 bg-rose-50/20 border-rose-300 shadow-md'
              : 'hover:border-slate-300 hover:shadow-md'
          }`}
          onClick={() => setActiveTab('credit-notes')}
        >
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 font-bold">
              <FileText className="h-5 w-5" />
            </div>
            <span className="text-[10.5px] font-extrabold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">
              Credit Notes
            </span>
          </div>
          <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">
            {summary.countCN}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-semibold">
            ₹{summary.totalCN.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Adjustments
          </p>
        </div>

        <div
          className={`card p-5 cursor-pointer transition-all duration-200 ${
            activeTab === 'suggestions'
              ? 'ring-2 ring-amber-500/80 bg-amber-50/20 border-amber-300 shadow-md'
              : 'hover:border-slate-300 hover:shadow-md'
          }`}
          onClick={() => setActiveTab('suggestions')}
        >
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 font-bold">
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
              { id: 'all', label: `All Inward (${combinedRecords.length})` },
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
                <table className="w-full min-w-[760px]">
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
            <table className="w-full min-w-[760px]">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="table-th">Doc Number</th>
                  <th className="table-th">Type</th>
                  <th className="table-th">Supplier</th>
                  <th className="table-th">Products</th>
                  <th className="table-th">Date</th>
                  <th className="table-th text-right">Grand Total</th>
                  <th className="table-th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((rec) => {
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
                        <div>
                          <span>{rec.date}</span>
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
                          {!isPO && (
                            <button
                              onClick={() => {
                                if (window.confirm(`Are you sure you want to delete ${rec.docNumber}?`)) {
                                  deleteSale(rec.id);
                                }
                              }}
                              className="rounded-lg p-2 text-slate-400 transition hover:bg-err-50 hover:text-err-600"
                              title="Delete Document"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <p className="text-sm text-slate-500">
              Showing <span className="font-semibold text-slate-700">{filtered.length}</span> of{' '}
              <span className="font-semibold text-slate-700">{purchases.length}</span> orders
            </p>
            <div className="flex items-center gap-1">
              <button className="btn-secondary px-3 py-1.5 text-xs" disabled>Previous</button>
              <button className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">1</button>
              <button className="btn-secondary px-3 py-1.5 text-xs" disabled>Next</button>
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
                className="input"
              />
              {showPoSupplierDropdown && filteredPoSuppliers.length > 0 && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setShowPoSupplierDropdown(false)} />
                  <div className="absolute left-0 right-0 z-30 mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg divide-y divide-slate-100">
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
                    <div className="p-4 text-center text-xs text-slate-400">
                      No products found matching &quot;{productSearch}&quot;.
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
                    className="input bg-white text-xs font-medium"
                  />

                  {/* Floating Autocomplete List */}
                  {showPbSupplierDropdown && filteredPbSuppliers.length > 0 && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setShowPbSupplierDropdown(false)} />
                      <div className="absolute left-0 right-0 z-30 mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg divide-y divide-slate-100">
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
                  placeholder="e.g. PI-3101"
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
    </div>
  );
}
