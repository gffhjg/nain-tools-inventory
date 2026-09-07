import { useState, useMemo, useEffect } from 'react';
import {
  Plus, Search, Download, Eye, ShoppingCart, TrendingUp, Clock, CheckCircle2,
  Trash2, Minus, Printer, Package, AlertTriangle, MessageCircle, UserPlus, Check, Edit3, X,
  CreditCard, Calendar, Landmark, AlertOctagon, CheckSquare, XCircle, ArrowUpRight,
  ShieldCheck, RefreshCw, FileText, Building2, PackageCheck, ShoppingBag
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import Modal from '@/components/Modal';
import { printInvoice } from '@/components/PrintableInvoice';
import { useStore } from '@/store/AppStore';
import { GST_RATE, computeGrandTotal, computeDiscountAmount } from '@/lib/constants';
import { downloadCSV, toCSV, money } from '@/utils/analytics';
import type { SaleRecord, SaleStatus, InvoiceLineItem, PaymentMethod, DiscountType, Customer, ChequeRecord, ChequeStatus } from '@/lib/types';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysToDate(dateStr: string, days: number): string {
  try {
    const d = new Date(dateStr || new Date());
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  } catch {
    return dateStr;
  }
}

function addMonthsToDate(dateStr: string, months: number = 1): string {
  try {
    const d = new Date(dateStr || new Date());
    d.setMonth(d.getMonth() + months);
    return d.toISOString().slice(0, 10);
  } catch {
    return dateStr;
  }
}

function nextInvoice(existing: SaleRecord[]): string {
  const nums = existing
    .map((s) => parseInt(s.invoice.replace('INV-', ''), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 2040;
  return `INV-${max + 1}`;
}

function nextDebitNote(existing: SaleRecord[]): string {
  const nums = existing
    .filter((s) => s.documentType === 'DEBIT NOTE' || s.invoice.startsWith('DN-'))
    .map((s) => parseInt(s.invoice.replace('DN-', ''), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 1000;
  return `DN-${max + 1}`;
}

function nextProformaInvoice(existing: SaleRecord[]): string {
  const nums = existing
    .filter((s) => s.documentType === 'PROFORMA INVOICE' || s.invoice.startsWith('PI-'))
    .map((s) => parseInt(s.invoice.replace('PI-', ''), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 3100;
  return `PI-${max + 1}`;
}

function nextCompanyPoNumber(existing: SaleRecord[]): string {
  const nums = existing
    .filter((s) => s.documentType === 'PURCHASE ORDER' || s.invoice.startsWith('CPO-') || s.invoice.startsWith('PO-'))
    .map((s) => parseInt(s.invoice.replace(/^(CPO|PO)-/, ''), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 5000;
  return `CPO-${max + 1}`;
}

type DraftLine = InvoiceLineItem;

export default function Sales() {
  const {
    sales, products, customers, cheques,
    updateProduct, addSale, updateSale, deleteSale, updateSaleStatus, updateSaleDocumentType,
    addCustomer, addCheque, updateCheque, confirmChequeClearance, confirmChequeBounce, deleteCheque,
    companySettings
  } = useStore();

  const [activeSalesSubTab, setActiveSalesSubTab] = useState<'invoices' | 'orders' | 'cheques'>('invoices');
  const [search, setSearch] = useState('');
  const [activeFilterTab, setActiveFilterTab] = useState<'all' | 'paid' | 'pending' | 'partially-paid' | 'debit-note' | 'credit-note'>('all');

  // Pre-Sales: Orders & Estimates (PO & PI) Filter State
  const [orderQuoteFilterTab, setOrderQuoteFilterTab] = useState<'all' | 'po' | 'pi' | 'pending' | 'converted'>('all');
  const [orderQuoteSearch, setOrderQuoteSearch] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');

  // Cheque Realisation Tracker Filter State
  const [chequeFilter, setChequeFilter] = useState<'all' | 'claimable' | 'pending' | 'cleared' | 'bounced'>('all');
  const [chequeSearch, setChequeSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customer, setCustomer] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [date, setDate] = useState(todayISO());

  const filteredCustomers = useMemo(() => {
    const q = customer.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone && c.phone.includes(q)) ||
          (c.gstin && c.gstin.toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [customers, customer]);
  const [piExpirationDate, setPiExpirationDate] = useState(addMonthsToDate(todayISO(), 1));
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<DiscountType>('amount');

  // Payment Options & Pay Later / Credit terms State
  const [paymentStatusType, setPaymentStatusType] = useState<'paid' | 'pay-later' | 'partial'>('paid');
  const [partialPaidAmount, setPartialPaidAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [paymentTerms, setPaymentTerms] = useState('Immediate');
  const [dueDate, setDueDate] = useState('');
  const [saleNotes, setSaleNotes] = useState('');

  // Cheque Fields for Invoice Form
  const [chequeNo, setChequeNo] = useState('');
  const [chequeBank, setChequeBank] = useState('');
  const [chequeDate, setChequeDate] = useState(todayISO());
  const [chequeStatus, setChequeStatus] = useState<ChequeStatus>('pending_clearance');

  // Quick Record Payment Modal State
  const [recordPaymentModalSale, setRecordPaymentModalSale] = useState<SaleRecord | null>(null);
  const [recordPaymentAmount, setRecordPaymentAmount] = useState('');
  const [recordPaymentMethod, setRecordPaymentMethod] = useState<PaymentMethod>('Cash');
  const [recordChequeNo, setRecordChequeNo] = useState('');
  const [recordChequeBank, setRecordChequeBank] = useState('');
  const [recordChequeDate, setRecordChequeDate] = useState(todayISO());

  // Cheque Action Modals State
  const [clearTargetCheque, setClearTargetCheque] = useState<ChequeRecord | null>(null);
  const [bounceTargetCheque, setBounceTargetCheque] = useState<ChequeRecord | null>(null);
  const [bounceReason, setBounceReason] = useState('Insufficient Funds (Funds Insufficient)');
  const [customBounceReason, setCustomBounceReason] = useState('');
  const [bounceDate, setBounceDate] = useState(todayISO());

  const [editingCheque, setEditingCheque] = useState<ChequeRecord | null>(null);
  const [editChequeNo, setEditChequeNo] = useState('');
  const [editChequeBank, setEditChequeBank] = useState('');
  const [editChequeDate, setEditChequeDate] = useState('');
  const [editChequeAmount, setEditChequeAmount] = useState('');
  const [editChequeNotes, setEditChequeNotes] = useState('');

  const [saleStatus, setSaleStatus] = useState<SaleStatus>('paid');
  const [amountPaid, setAmountPaid] = useState(0);
  const [productSearch, setProductSearch] = useState('');
  const [salesCategory, setSalesCategory] = useState('All');

  // Custom / Direct Sourced Item State (Not saved in permanent inventory)
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customCost, setCustomCost] = useState('');
  const [customQty, setCustomQty] = useState('1');
  const [customHsn, setCustomHsn] = useState('7318150');
  const [customDiscount, setCustomDiscount] = useState('');

  const [viewing, setViewing] = useState<SaleRecord | null>(null);
  const [stockError, setStockError] = useState('');
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);

  // Quick Edit Product Master directly during Billing
  const [quickEditProduct, setQuickEditProduct] = useState<import('@/lib/types').Product | null>(null);
  const [quickEditProductModalOpen, setQuickEditProductModalOpen] = useState(false);
  const [quickEditFormData, setQuickEditFormData] = useState({
    name: '',
    category: 'Bolts',
    supplier: '',
    rackNumber: '',
    size: '',
    cost: 0,
    price: 0,
    stock: 0,
    boxCapacity: 1000,
    reorderLevel: 100,
    hsnCode: '7318150',
    notes: '',
  });

  // Quick Edit Custom Line Item
  const [quickEditCustomLine, setQuickEditCustomLine] = useState<DraftLine | null>(null);
  const [quickEditCustomModalOpen, setQuickEditCustomModalOpen] = useState(false);
  const [quickCustomFormData, setQuickCustomFormData] = useState({
    name: '',
    price: 0,
    cost: 0,
    qty: 1,
    hsnCode: '7318150',
  });

  const [convertTargetSale, setConvertTargetSale] = useState<SaleRecord | null>(null);
  const [convertInvoiceNumber, setConvertInvoiceNumber] = useState('');

  const autoInvoiceNumber = useMemo(() => nextInvoice(sales), [sales]);
  const [customInvoiceNumber, setCustomInvoiceNumber] = useState('');
  const invoiceNumber = customInvoiceNumber.trim() || autoInvoiceNumber;

  const [poNumber, setPoNumber] = useState('');
  const [poDate, setPoDate] = useState('');
  const [transportMode, setTransportMode] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [ewayBill, setEwayBill] = useState('');
  const [vendorCode, setVendorCode] = useState('');

  const [bankName, setBankName] = useState(companySettings?.bankName || 'HDFC BANK');
  const [bankAccount, setBankAccount] = useState(companySettings?.bankAccount || '50200088182531');
  const [bankIfsc, setBankIfsc] = useState(companySettings?.bankIfsc || 'HDFC0002034');

  const [sellerGstin, setSellerGstin] = useState(companySettings?.gstin || '06CCCPK0841B1ZA');
  const [sellerPan, setSellerPan] = useState(companySettings?.pan || 'CCCPK0841B');
  const [documentType, setDocumentType] = useState<'TAX INVOICE' | 'DEBIT NOTE' | 'CREDIT NOTE' | 'PROFORMA INVOICE' | 'PURCHASE BILL' | 'PURCHASE ORDER'>('TAX INVOICE');

  useEffect(() => {
    if (companySettings) {
      setBankName(companySettings.bankName || 'HDFC BANK');
      setBankAccount(companySettings.bankAccount || '50200088182531');
      setBankIfsc(companySettings.bankIfsc || 'HDFC0002034');
      setSellerGstin(companySettings.gstin || '06CCCPK0841B1ZA');
      setSellerPan(companySettings.pan || 'CCCPK0841B');
    }
  }, [companySettings]);

  // Unified Pre-Sales Pipeline: Company Purchase Orders (PO) & Proforma Invoices (PI)
  // Zero Stock Deduction (stock multiplier = 0) until converted into a Tax Invoice
  const orderQuoteList = useMemo(
    () =>
      sales.filter(
        (s) =>
          s.documentType === 'PURCHASE ORDER' ||
          s.documentType === 'PROFORMA INVOICE' ||
          !!s.convertedFromPoNumber ||
          !!s.convertedFromPiNumber ||
          s.invoice.startsWith('PI-') ||
          s.invoice.startsWith('PO-')
      ),
    [sales]
  );

  const poOnlyList = useMemo(
    () =>
      orderQuoteList.filter(
        (s) => s.documentType === 'PURCHASE ORDER' || !!s.convertedFromPoNumber || s.invoice.startsWith('PO-')
      ),
    [orderQuoteList]
  );

  const piOnlyList = useMemo(
    () =>
      orderQuoteList.filter(
        (s) => s.documentType === 'PROFORMA INVOICE' || !!s.convertedFromPiNumber || s.invoice.startsWith('PI-')
      ),
    [orderQuoteList]
  );

  const orderQuotePendingList = useMemo(
    () =>
      orderQuoteList.filter(
        (s) =>
          !s.convertedFromPoNumber &&
          !s.convertedFromPiNumber &&
          (s.documentType === 'PURCHASE ORDER' || s.documentType === 'PROFORMA INVOICE')
      ),
    [orderQuoteList]
  );

  const orderQuoteConvertedList = useMemo(
    () => orderQuoteList.filter((s) => !!s.convertedFromPoNumber || !!s.convertedFromPiNumber),
    [orderQuoteList]
  );

  const poPendingList = useMemo(
    () => poOnlyList.filter((s) => s.documentType === 'PURCHASE ORDER' && !s.convertedFromPoNumber),
    [poOnlyList]
  );

  const piPendingList = useMemo(
    () => piOnlyList.filter((s) => s.documentType === 'PROFORMA INVOICE' && !s.convertedFromPiNumber),
    [piOnlyList]
  );

  const orderQuoteTotalValue = useMemo(
    () => orderQuoteList.reduce((sum, s) => sum + s.grandTotal, 0),
    [orderQuoteList]
  );

  const orderQuotePendingValue = useMemo(
    () => orderQuotePendingList.reduce((sum, s) => sum + s.grandTotal, 0),
    [orderQuotePendingList]
  );

  const orderQuoteConvertedValue = useMemo(
    () => orderQuoteConvertedList.reduce((sum, s) => sum + s.grandTotal, 0),
    [orderQuoteConvertedList]
  );

  const poTotalValue = useMemo(
    () => poOnlyList.reduce((sum, s) => sum + s.grandTotal, 0),
    [poOnlyList]
  );

  const piTotalValue = useMemo(
    () => piOnlyList.reduce((sum, s) => sum + s.grandTotal, 0),
    [piOnlyList]
  );

  const orderQuoteUniqueClients = useMemo(
    () => new Set(orderQuoteList.map((s) => s.customer.toLowerCase().trim())).size,
    [orderQuoteList]
  );

  const filteredOrderQuoteList = useMemo(() => {
    let list = orderQuoteList;
    if (orderQuoteFilterTab === 'po') {
      list = poOnlyList;
    } else if (orderQuoteFilterTab === 'pi') {
      list = piOnlyList;
    } else if (orderQuoteFilterTab === 'pending') {
      list = orderQuotePendingList;
    } else if (orderQuoteFilterTab === 'converted') {
      list = orderQuoteConvertedList;
    }

    const q = orderQuoteSearch.toLowerCase().trim();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.invoice.toLowerCase().includes(q) ||
        s.customer.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q) ||
        (s.poNumber && s.poNumber.toLowerCase().includes(q)) ||
        (s.convertedFromPoNumber && s.convertedFromPoNumber.toLowerCase().includes(q)) ||
        (s.convertedFromPiNumber && s.convertedFromPiNumber.toLowerCase().includes(q)) ||
        (s.items && s.items.some((i) => i.name.toLowerCase().includes(q)))
    );
  }, [
    orderQuoteList,
    poOnlyList,
    piOnlyList,
    orderQuotePendingList,
    orderQuoteConvertedList,
    orderQuoteFilterTab,
    orderQuoteSearch,
  ]);

  const [previewCopyTag, setPreviewCopyTag] = useState('Original For Recipient');
  const [exportCopies, setExportCopies] = useState<Record<string, boolean>>({
    'Original For Recipient': true,
    'Duplicate For Transporter': true,
    'Triplicate For Supplier': true,
    'Extra Copy': true,
  });

  const [applyGst, setApplyGst] = useState(true);
  const [gstRate, setGstRate] = useState<number>(18);
  const [gstTaxType, setGstTaxType] = useState<'local' | 'central'>('local');

  // Global Keyboard Shortcuts (F2 for New Invoice)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        openNewSale();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filtered = useMemo(() => {
    let list = sales.filter((s) => s.documentType !== 'PURCHASE ORDER' && s.documentType !== 'PROFORMA INVOICE');
    if (activeFilterTab === 'paid') {
      list = list.filter((s) => s.status === 'paid');
    } else if (activeFilterTab === 'pending') {
      list = list.filter((s) => s.status === 'pending');
    } else if (activeFilterTab === 'partially-paid') {
      list = list.filter((s) => s.status === 'partially-paid');
    } else if (activeFilterTab === 'debit-note') {
      list = list.filter((s) => s.documentType === 'DEBIT NOTE' || s.invoice.startsWith('DN-'));
    } else if (activeFilterTab === 'credit-note') {
      list = list.filter((s) => s.documentType === 'CREDIT NOTE' || s.invoice.startsWith('CN-'));
    }

    const q = search.toLowerCase().trim();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.invoice.toLowerCase().includes(q) ||
        s.customer.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q) ||
        (s.items && s.items.some((i) => i.name.toLowerCase().includes(q)))
    );
  }, [sales, search, activeFilterTab]);

  const statusCounts = useMemo(() => {
    const activeInvoices = sales.filter((s) => s.documentType !== 'PURCHASE ORDER' && s.documentType !== 'PROFORMA INVOICE');
    const paid = activeInvoices.filter((s) => s.status === 'paid').length;
    const pending = activeInvoices.filter((s) => s.status === 'pending').length;
    const partial = activeInvoices.filter((s) => s.status === 'partially-paid').length;
    const debitNote = activeInvoices.filter((s) => s.documentType === 'DEBIT NOTE' || s.invoice.startsWith('DN-')).length;
    const creditNote = activeInvoices.filter((s) => s.documentType === 'CREDIT NOTE' || s.invoice.startsWith('CN-')).length;
    return { paid, pending, partial, debitNote, creditNote, all: activeInvoices.length };
  }, [sales]);

  const summary = useMemo(() => {
    const activeInvoices = sales.filter((s) => s.documentType !== 'PROFORMA INVOICE' && s.documentType !== 'PURCHASE ORDER');
    const total = activeInvoices.reduce((s, r) => s + r.grandTotal, 0);
    const paid = activeInvoices.filter((s) => s.status === 'paid').reduce((s, r) => s + r.grandTotal, 0);
    const outstanding = activeInvoices
      .filter((s) => s.status !== 'paid' && s.status !== 'cancelled' && s.status !== 'draft')
      .reduce((s, r) => s + (r.grandTotal - (r.amountPaid || 0)), 0);

    const dnList = sales.filter((s) => s.documentType === 'DEBIT NOTE' || s.invoice.startsWith('DN-'));
    const dnCount = dnList.length;
    const dnTotal = dnList.reduce((s, r) => s + r.grandTotal, 0);

    const cnList = sales.filter((s) => s.documentType === 'CREDIT NOTE' || s.invoice.startsWith('CN-'));
    const cnCount = cnList.length;
    const cnTotal = cnList.reduce((s, r) => s + r.grandTotal, 0);

    return { total, paid, outstanding, count: activeInvoices.length, dnCount, dnTotal, dnList, cnCount, cnTotal, cnList };
  }, [sales]);

  const [freightCharges, setFreightCharges] = useState('0');
  const freightVal = parseFloat(freightCharges) || 0;

  const subtotal = useMemo(
    () => lines.reduce((s, l) => {
      const gross = +(l.price * l.qty).toFixed(2);
      const discVal = l.discount ? +(gross * (l.discount / 100)).toFixed(2) : 0;
      return +(s + (gross - discVal)).toFixed(2);
    }, 0),
    [lines]
  );
  
  const effectiveGstRate = applyGst ? gstRate : 0;
  const splitRate = (gstRate / 2).toFixed(1).replace(/\.0$/, '');
  const { discountAmount, taxableAmount, gstAmount, rawTotal, roundOff, grandTotal, hasRoundOff } = computeGrandTotal(
    subtotal,
    discount,
    discountType,
    effectiveGstRate,
    freightVal
  );

  // Delhi GST Formulas with dynamic rate & exact paisa balance:
  // Local (Intra-state): CGST @ (Rate/2)% + SGST @ balance of GST (guarantees cgst + sgst === gstAmount exactly)
  // Central (Inter-state): IGST @ Rate%
  const cgstAmount = applyGst && gstTaxType === 'local' ? +(gstAmount / 2).toFixed(2) : 0;
  const sgstAmount = applyGst && gstTaxType === 'local' ? +(gstAmount - cgstAmount).toFixed(2) : 0;
  const igstAmount = applyGst && gstTaxType === 'central' ? +gstAmount.toFixed(2) : 0;

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
    if (salesCategory !== 'All') {
      list = list.filter((p) => (p.category || '').toLowerCase() === salesCategory.toLowerCase());
    }
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.rackNumber && p.rackNumber.toLowerCase().includes(q)) ||
          (p.size && p.size.toLowerCase().includes(q)) ||
          (p.category && p.category.toLowerCase().includes(q))
      );
    }
    return list.slice(0, 100);
  }, [products, productSearch, salesCategory]);

  const [customerGstin, setCustomerGstin] = useState('');

  const selectedCustomerPendingBalance = useMemo(() => {
    if (!selectedCustomerId || selectedCustomerId === 'new') return 0;
    return sales
      .filter((s) => s.customerId === selectedCustomerId && s.status !== 'paid' && s.status !== 'cancelled' && s.status !== 'draft')
      .reduce((sum, s) => sum + (s.grandTotal - (s.amountPaid || 0)), 0);
  }, [sales, selectedCustomerId]);

  const handleCustomerSelect = (custObjId: string) => {
    setSelectedCustomerId(custObjId);
    if (custObjId === '' || custObjId === 'new') {
      setCustomer('');
      setPhone('');
      setAddress('');
      setCustomerGstin('');
      return;
    }
    const found = customers.find((c) => c.id === custObjId);
    if (found) {
      setCustomer(found.name);
      setPhone(found.phone);
      setAddress(found.address || '');
      setCustomerGstin(found.gstin || '');
    }
  };

  const resetForm = () => {
    setSelectedCustomerId('');
    setCustomer('');
    setPhone('');
    setAddress('');
    setCustomerGstin('');
    setCustomInvoiceNumber('');
    setPoNumber('');
    setPoDate('');
    setTransportMode('');
    setVehicleNumber('');
    setEwayBill('');
    setVendorCode('');
    setBankName(companySettings?.bankName || 'HDFC BANK');
    setBankAccount(companySettings?.bankAccount || '50200088182531');
    setBankIfsc(companySettings?.bankIfsc || 'HDFC0002034');
    setSellerGstin(companySettings?.gstin || '06CCCPK0841B1ZA');
    setSellerPan(companySettings?.pan || 'CCCPK0841B');
    setDocumentType('TAX INVOICE');
    setPreviewCopyTag('Original For Recipient');
    setDate(todayISO());
    setPiExpirationDate(addMonthsToDate(todayISO(), 1));
    setLines([]);
    setDiscount(0);
    setDiscountType('amount');
    setPaymentStatusType('paid');
    setPartialPaidAmount('');
    setPaymentMethod('Cash');
    setPaymentTerms('Immediate');
    setDueDate('');
    setSaleNotes('');
    setChequeNo('');
    setChequeBank('');
    setChequeDate(todayISO());
    setChequeStatus('pending_clearance');
    setSaleStatus('paid');
    setAmountPaid(0);
    setProductSearch('');
    setSalesCategory('All');
    setApplyGst(true);
    setGstRate(18);
    setGstTaxType('local');
    setFreightCharges('0');
    setCustomName('');
    setCustomPrice('');
    setCustomCost('');
    setCustomQty('1');
    setCustomHsn('7318150');
    setCustomDiscount('');
    setIsAddingCustom(false);
    setExpectedDeliveryDate('');
    setEditingSaleId(null);
  };

  const openNewSale = () => {
    resetForm();
    setDocumentType('TAX INVOICE');
    setCustomInvoiceNumber(nextInvoice(sales));
    setModalOpen(true);
  };

  const openNewCompanyPO = () => {
    resetForm();
    setDocumentType('PURCHASE ORDER');
    setCustomInvoiceNumber(nextCompanyPoNumber(sales));
    setPaymentStatusType('pay-later');
    setPaymentMethod('Credit / Pay Later');
    setExpectedDeliveryDate(addDaysToDate(todayISO(), 15));
    setModalOpen(true);
  };

  const handleEditSale = (sale: SaleRecord) => {
    setEditingSaleId(sale.id);
    setCustomInvoiceNumber(sale.invoice);
    setCustomer(sale.customer);
    setSelectedCustomerId(sale.customerId || '');
    setPhone(sale.phone);
    setAddress(sale.customerAddress || '');
    setCustomerGstin(sale.customerGstin || '');
    setDate(sale.date);
    setExpectedDeliveryDate(sale.expectedDeliveryDate || '');
    setPiExpirationDate(sale.piExpirationDate || addMonthsToDate(sale.date || todayISO(), 1));
    setLines(sale.items.map((i) => ({ ...i })));
    setDiscount(sale.discount);
    setDiscountType(sale.discountType || 'percent');
    
    const statusType: 'paid' | 'pay-later' | 'partial' =
      sale.status === 'paid' ? 'paid' : sale.status === 'partially-paid' ? 'partial' : 'pay-later';
    setPaymentStatusType(statusType);
    setPartialPaidAmount(sale.amountPaid > 0 && sale.status === 'partially-paid' ? sale.amountPaid.toString() : '');
    setPaymentMethod(sale.paymentMethod || (statusType === 'pay-later' ? 'Credit / Pay Later' : 'Cash'));
    setPaymentTerms(sale.paymentTerms || (statusType === 'pay-later' ? '30 Days' : 'Immediate'));
    setDueDate(sale.dueDate || '');
    setSaleNotes(sale.notes || '');
    setChequeNo(sale.chequeNo || '');
    setChequeBank(sale.chequeBank || '');
    setChequeDate(sale.chequeDate || sale.date || todayISO());
    setChequeStatus(sale.chequeStatus || 'pending_clearance');

    setSaleStatus(sale.status || 'paid');
    setAmountPaid(sale.amountPaid);
    setPoNumber(sale.poNumber || '');
    setPoDate(sale.poDate || '');
    setTransportMode(sale.transportMode || '');
    setVehicleNumber(sale.vehicleNumber || '');
    setEwayBill(sale.ewayBill || '');
    setVendorCode(sale.vendorCode || '');
    setBankName(sale.bankName || companySettings?.bankName || 'HDFC BANK');
    setBankAccount(sale.bankAccount || companySettings?.bankAccount || '50200088182531');
    setBankIfsc(sale.bankIfsc || companySettings?.bankIfsc || 'HDFC0002034');
    setSellerGstin(sale.sellerGstin || companySettings?.gstin || '06CCCPK0841B1ZA');
    setSellerPan(sale.sellerPan || companySettings?.pan || 'CCCPK0841B');
    setDocumentType(sale.documentType || 'TAX INVOICE');
    setApplyGst(sale.gstRate > 0);
    setGstRate(sale.gstRate || 18);
    setGstTaxType(sale.gstType === 'igst' ? 'central' : 'local');
    setFreightCharges(sale.freightCharges ? sale.freightCharges.toString() : '0');
    setModalOpen(true);
  };

  const handleDeleteSale = async (sale: SaleRecord) => {
    const isPo = sale.documentType === 'PURCHASE ORDER';
    const isPi = sale.documentType === 'PROFORMA INVOICE';
    const isPb = sale.documentType === 'PURCHASE BILL';
    const isCn = sale.documentType === 'CREDIT NOTE';
    const msg = isPo
      ? `Are you sure you want to delete Company Purchase Order ${sale.invoice}?`
      : isPi
      ? `Are you sure you want to delete Proforma Invoice ${sale.invoice}?`
      : isPb
      ? `Are you sure you want to delete Purchase Bill ${sale.invoice}? Added items will be deducted from inventory stock.`
      : isCn
      ? `Are you sure you want to delete Credit Note ${sale.invoice}? Added items will be deducted from inventory stock.`
      : `Are you sure you want to delete ${sale.documentType || 'Invoice'} ${sale.invoice}? Deducted items will be returned to inventory stock.`;
    if (window.confirm(msg)) {
      await deleteSale(sale.id);
      if (viewing?.id === sale.id) {
        setViewing(null);
      }
    }
  };

  const openNewDebitNote = () => {
    resetForm();
    setDocumentType('DEBIT NOTE');
    setCustomInvoiceNumber(nextDebitNote(sales));
    setModalOpen(true);
  };

  const openNewProformaInvoice = () => {
    resetForm();
    setDocumentType('PROFORMA INVOICE');
    setCustomInvoiceNumber(nextProformaInvoice(sales));
    setPiExpirationDate(addMonthsToDate(todayISO(), 1));
    setModalOpen(true);
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
        { productId: product.id, name: product.name, price: product.price, cost: product.cost, qty: 1, isCustom: false, hsnCode: product.hsnCode || '7318150' },
      ];
    });
  };

  const addCustomLine = () => {
    if (!customName.trim()) return;
    const priceVal = parseFloat(customPrice) || 0;
    const costVal = parseFloat(customCost) || 0;
    const qtyVal = parseInt(customQty, 10) || 1;
    const discVal = parseFloat(customDiscount) || 0;
    const customId = `custom_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    setLines((prev) => [
      ...prev,
      {
        productId: customId,
        name: customName.trim(),
        price: priceVal,
        cost: costVal,
        qty: qtyVal,
        isCustom: true,
        hsnCode: customHsn.trim() || '7318150',
        discount: discVal,
        discountType: 'percent',
      },
    ]);
    setCustomName('');
    setCustomPrice('');
    setCustomCost('');
    setCustomQty('1');
    setCustomHsn('7318150');
    setCustomDiscount('');
    setIsAddingCustom(false);
  };

  const updateQty = (productId: string, delta: number) => {
    setLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, qty: Math.max(0, l.qty + delta) } : l))
    );
  };

  const setQty = (productId: string, raw: string) => {
    const qty = parseInt(raw, 10);
    setLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, qty: isNaN(qty) ? 0 : Math.max(0, qty) } : l))
    );
  };

  const setPrice = (productId: string, price: number) => {
    setLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, price: Math.max(0, price) } : l))
    );
  };

  const setCost = (productId: string, cost: number) => {
    setLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, cost: Math.max(0, cost) } : l))
    );
  };

  const setLineDiscount = (productId: string, rawDisc: string) => {
    const cleaned = rawDisc.replace(/^0+(?=\d)/, '');
    const disc = parseFloat(cleaned);
    setLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, discount: isNaN(disc) ? 0 : Math.max(0, disc) } : l))
    );
  };

  const setLineNetRate = (productId: string, rawNetRate: string) => {
    const cleaned = rawNetRate.replace(/^0+(?=\d)/, '');
    const netRate = parseFloat(cleaned);
    setLines((prev) =>
      prev.map((l) => {
        if (l.productId !== productId) return l;
        if (isNaN(netRate) || l.price <= 0) return { ...l, discount: 0 };
        const discPct = Math.max(0, ((l.price - netRate) / l.price) * 100);
        return { ...l, discount: +discPct.toFixed(2) };
      })
    );
  };

  const removeLine = (productId: string) => {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  };

  const handleOpenQuickEdit = (line: DraftLine) => {
    if (line.isCustom) {
      setQuickEditCustomLine(line);
      setQuickCustomFormData({
        name: line.name,
        price: line.price,
        cost: line.cost || 0,
        qty: line.qty,
        hsnCode: line.hsnCode || '7318150',
      });
      setQuickEditCustomModalOpen(true);
    } else {
      const prod = products.find((p) => p.id === line.productId);
      if (!prod) return;
      setQuickEditProduct(prod);
      setQuickEditFormData({
        name: prod.name,
        category: prod.category || 'Bolts',
        supplier: prod.supplier || '',
        rackNumber: prod.rackNumber || '',
        size: prod.size || '',
        cost: prod.cost || 0,
        price: prod.price || 0,
        stock: prod.stock || 0,
        boxCapacity: prod.boxCapacity || 1000,
        reorderLevel: prod.reorderLevel || 100,
        hsnCode: prod.hsnCode || '7318150',
        notes: prod.notes || '',
      });
      setQuickEditProductModalOpen(true);
    }
  };

  const handleSaveQuickEditProduct = async () => {
    if (!quickEditProduct) return;
    try {
      await updateProduct(quickEditProduct.id, {
        name: quickEditFormData.name.trim(),
        category: quickEditFormData.category.trim() || 'Bolts',
        supplier: quickEditFormData.supplier.trim(),
        rackNumber: quickEditFormData.rackNumber.trim(),
        size: quickEditFormData.size.trim(),
        cost: quickEditFormData.cost,
        price: quickEditFormData.price,
        stock: quickEditFormData.stock,
        boxCapacity: quickEditFormData.boxCapacity,
        reorderLevel: quickEditFormData.reorderLevel,
        hsnCode: quickEditFormData.hsnCode.trim() || '7318150',
        notes: quickEditFormData.notes.trim(),
        image: quickEditProduct.image || '',
      });

      // Synchronize current invoice draft line item
      setLines((prev) =>
        prev.map((l) => {
          if (l.productId !== quickEditProduct.id) return l;
          return {
            ...l,
            name: quickEditFormData.name.trim(),
            price: quickEditFormData.price,
            cost: quickEditFormData.cost,
            hsnCode: quickEditFormData.hsnCode.trim() || '7318150',
          };
        })
      );

      setQuickEditProductModalOpen(false);
      setQuickEditProduct(null);
    } catch (err) {
      alert(`Failed to update product: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleSaveQuickEditCustomLine = () => {
    if (!quickEditCustomLine) return;
    setLines((prev) =>
      prev.map((l) => {
        if (l.productId !== quickEditCustomLine.productId) return l;
        return {
          ...l,
          name: quickCustomFormData.name.trim(),
          price: quickCustomFormData.price,
          cost: quickCustomFormData.cost,
          qty: quickCustomFormData.qty,
          hsnCode: quickCustomFormData.hsnCode.trim() || '7318150',
        };
      })
    );
    setQuickEditCustomModalOpen(false);
    setQuickEditCustomLine(null);
  };

  const canSubmit = customer.trim() !== '' && invoiceNumber.trim() !== '' && lines.length > 0 && lines.every((l) => l.qty > 0);

  const stockCheck = useMemo(() => {
    if (
      documentType === 'PURCHASE ORDER' ||
      documentType === 'PROFORMA INVOICE' ||
      documentType === 'PURCHASE BILL' ||
      documentType === 'CREDIT NOTE'
    ) {
      return { ok: true };
    }
    for (const l of lines) {
      if (l.qty <= 0 || l.isCustom || l.productId.startsWith('custom_')) continue;
      const product = products.find((p) => p.id === l.productId);
      if (product && l.qty > product.stock) {
        return { ok: false, name: l.name, available: product.stock, requested: l.qty };
      }
    }
    return { ok: true };
  }, [lines, products, documentType]);

  useEffect(() => {
    if (!stockCheck.ok) {
      setStockError(`Insufficient stock available. ${stockCheck.name}: ${stockCheck.available} in stock, ${stockCheck.requested} requested.`);
    } else {
      setStockError('');
    }
  }, [stockCheck]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (!stockCheck.ok) {
      alert(`Cannot create sale. ${stockError}`);
      return;
    }

    let finalStatus: SaleStatus = 'paid';
    let finalAmountPaid = grandTotal;
    let finalPaymentMethod: PaymentMethod = paymentMethod;

    if (documentType === 'PROFORMA INVOICE') {
      finalStatus = 'draft';
      finalAmountPaid = 0;
    } else if (documentType === 'PURCHASE ORDER') {
      finalStatus = 'pending';
      finalAmountPaid = 0;
      finalPaymentMethod = 'Credit / Pay Later';
    } else if (paymentStatusType === 'pay-later') {
      finalStatus = 'pending';
      finalAmountPaid = 0;
      finalPaymentMethod = 'Credit / Pay Later';
    } else if (paymentStatusType === 'partial') {
      const parsedPartial = parseFloat(partialPaidAmount) || 0;
      finalAmountPaid = Math.min(grandTotal, Math.max(0, parsedPartial));
      if (finalAmountPaid >= grandTotal) {
        finalStatus = 'paid';
      } else if (finalAmountPaid > 0) {
        finalStatus = 'partially-paid';
      } else {
        finalStatus = 'pending';
        finalPaymentMethod = 'Credit / Pay Later';
      }
    } else {
      finalStatus = 'paid';
      finalAmountPaid = grandTotal;
    }

    // Disambiguated Customer Profile Resolution
    let finalCustId = selectedCustomerId;
    if (!finalCustId || finalCustId === 'new') {
      // Look for exact match on name AND (phone or address) if selecting without explicit ID
      const exactMatch = customers.find((c) => {
        const sameName = c.name.toLowerCase() === customer.trim().toLowerCase();
        if (!sameName) return false;
        if (phone.trim() && c.phone) return c.phone.trim() === phone.trim();
        if (address.trim() && c.address) return c.address.trim().toLowerCase() === address.trim().toLowerCase();
        return false;
      });

      if (exactMatch && selectedCustomerId !== 'new') {
        finalCustId = exactMatch.id;
      } else if (customer.trim()) {
        const newCustId = `c${Date.now()}`;
        let cleanGstin = customerGstin.trim().toUpperCase();
        if (cleanGstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(cleanGstin)) {
          cleanGstin = '';
        }
        try {
          await addCustomer({
            id: newCustId,
            name: customer.trim(),
            businessName: customer.trim(),
            phone: phone.trim(),
            gstin: cleanGstin,
            email: '',
            address: address.trim(),
            state: 'Haryana',
            stateCode: '06',
            notes: 'Auto-added from Invoice creation',
          });
          finalCustId = newCustId;
        } catch (err) {
          console.error('Primary customer auto-save failed, attempting fallback:', err);
          try {
            await addCustomer({
              id: newCustId,
              name: customer.trim(),
              businessName: customer.trim(),
              phone: phone.trim(),
              gstin: '',
              email: '',
              address: address.trim(),
              state: 'Haryana',
              stateCode: '06',
              notes: 'Auto-added from Invoice creation',
            });
            finalCustId = newCustId;
          } catch (fallbackErr) {
            console.error('Fallback customer auto-save failed:', fallbackErr);
          }
        }
      }
    }

    const calculatedDueDate =
      finalStatus === 'pending' || finalStatus === 'partially-paid'
        ? (dueDate || addDaysToDate(date, 30))
        : '';
    const calculatedPaymentTerms =
      finalStatus === 'pending' || finalStatus === 'partially-paid'
        ? (paymentTerms || '30 Days')
        : 'Immediate';

    const newSale: SaleRecord = {
      id: `s${Date.now()}`,
      invoice: invoiceNumber,
      customer: customer.trim(),
      customerId: finalCustId !== 'new' ? finalCustId : '',
      phone: phone.trim(),
      customerAddress: address.trim(),
      customerGstin: customerGstin.trim().toUpperCase(),
      customerState: gstTaxType === 'local' ? 'Delhi' : 'Other State',
      customerStateCode: gstTaxType === 'local' ? '07' : '99',
      date,
      dueDate: calculatedDueDate,
      paymentTerms: calculatedPaymentTerms,
      notes: saleNotes.trim(),
      items: lines,
      itemCount: lines.reduce((s, l) => s + l.qty, 0),
      subtotal,
      discount,
      discountType,
      gstRate: applyGst ? gstRate : 0,
      gstType: !applyGst ? 'exempt' : (gstTaxType === 'local' ? 'cgst-sgst' : 'igst'),
      cgstAmount,
      sgstAmount,
      igstAmount,
      gstAmount: applyGst ? gstAmount : 0,
      grandTotal,
      amountPaid: Math.min(grandTotal, Math.max(0, finalAmountPaid)),
      paymentMethod: finalPaymentMethod,
      status: finalStatus,
      channel: 'in-store',
      poNumber: poNumber.trim(),
      poDate: poDate.trim(),
      freightCharges: freightVal,
      transportMode: transportMode.trim(),
      vehicleNumber: vehicleNumber.trim().toUpperCase(),
      ewayBill: ewayBill.trim(),
      vendorCode: vendorCode.trim(),
      bankName: bankName.trim(),
      bankAccount: bankAccount.trim(),
      bankIfsc: bankIfsc.trim().toUpperCase(),
      sellerGstin: sellerGstin.trim().toUpperCase(),
      sellerPan: sellerPan.trim().toUpperCase(),
      documentType,
      chequeNo: finalPaymentMethod === 'Cheque' ? chequeNo.trim() : '',
      chequeBank: finalPaymentMethod === 'Cheque' ? chequeBank.trim() : '',
      chequeDate: finalPaymentMethod === 'Cheque' ? (chequeDate || date) : '',
      chequeStatus: finalPaymentMethod === 'Cheque' ? chequeStatus : undefined,
      piExpirationDate: documentType === 'PROFORMA INVOICE' ? (piExpirationDate || addMonthsToDate(date, 1)) : '',
      expectedDeliveryDate: documentType === 'PURCHASE ORDER' ? (expectedDeliveryDate || addDaysToDate(date, 15)) : undefined,
    };

    if (editingSaleId) {
      const existingSale = sales.find((s) => s.id === editingSaleId);
      const updatedSale: SaleRecord = {
        ...newSale,
        id: editingSaleId,
        convertedFromPoNumber: existingSale?.convertedFromPoNumber,
        convertedFromPiNumber: existingSale?.convertedFromPiNumber,
      };
      await updateSale(updatedSale);
      if (viewing?.id === editingSaleId) {
        setViewing(updatedSale);
      }
    } else {
      await addSale(newSale);
      setViewing(newSale);
    }
    setModalOpen(false);
  };

  const openRecordPaymentModal = (sale: SaleRecord) => {
    setRecordPaymentModalSale(sale);
    setRecordPaymentAmount((sale.grandTotal - (sale.amountPaid || 0)).toString());
    setRecordPaymentMethod(sale.paymentMethod || 'Cash');
    setRecordChequeNo(sale.chequeNo || '');
    setRecordChequeBank(sale.chequeBank || '');
    setRecordChequeDate(sale.chequeDate || todayISO());
  };

  const handleRecordPayment = async () => {
    if (!recordPaymentModalSale) return;
    const addedPay = parseFloat(recordPaymentAmount) || 0;
    if (addedPay <= 0) return;

    const newTotalPaid = Math.min(recordPaymentModalSale.grandTotal, (recordPaymentModalSale.amountPaid || 0) + addedPay);
    const newStatus: SaleStatus =
      newTotalPaid >= recordPaymentModalSale.grandTotal
        ? 'paid'
        : newTotalPaid > 0
        ? 'partially-paid'
        : 'pending';

    const updatedSale: SaleRecord = {
      ...recordPaymentModalSale,
      amountPaid: newTotalPaid,
      status: newStatus,
      paymentMethod: recordPaymentMethod,
      chequeNo: recordPaymentMethod === 'Cheque' ? recordChequeNo.trim() : '',
      chequeBank: recordPaymentMethod === 'Cheque' ? recordChequeBank.trim() : '',
      chequeDate: recordPaymentMethod === 'Cheque' ? recordChequeDate : '',
      chequeStatus: recordPaymentMethod === 'Cheque' ? 'pending_clearance' : undefined,
    };

    if (recordPaymentMethod === 'Cheque' && recordChequeNo.trim()) {
      const chequeRec: ChequeRecord = {
        id: `chq_rec_${Date.now()}`,
        saleId: recordPaymentModalSale.id,
        customerId: recordPaymentModalSale.customerId,
        customerName: recordPaymentModalSale.customer,
        invoiceNumber: recordPaymentModalSale.invoice,
        chequeNumber: recordChequeNo.trim(),
        bankName: recordChequeBank.trim() || 'Bank Cheque',
        chequeDate: recordChequeDate || todayISO(),
        amount: addedPay,
        status: 'pending_clearance',
        notes: `Installment for invoice ${recordPaymentModalSale.invoice}`,
      };
      await addCheque(chequeRec);
    }

    await updateSale(updatedSale);

    // Update local viewing state if open
    if (viewing && viewing.id === recordPaymentModalSale.id) {
      setViewing(updatedSale);
    }

    setRecordPaymentModalSale(null);
    setRecordPaymentAmount('');
    setRecordChequeNo('');
    setRecordChequeBank('');
  };

  const openConvertModal = (sale: SaleRecord) => {
    setConvertTargetSale(sale);
    setConvertInvoiceNumber(nextInvoice(sales));
  };

  const handleConfirmConvert = async () => {
    if (!convertTargetSale || !convertInvoiceNumber.trim()) return;
    const newInvoiceNo = convertInvoiceNumber.trim();
    const origDocNo = convertTargetSale.invoice;
    const isPo = convertTargetSale.documentType === 'PURCHASE ORDER';
    await updateSaleDocumentType(convertTargetSale.id, 'TAX INVOICE', newInvoiceNo, origDocNo, isPo);
    setViewing((prev) =>
      prev && prev.id === convertTargetSale.id
        ? {
            ...prev,
            documentType: 'TAX INVOICE',
            invoice: newInvoiceNo,
            status: 'pending',
            ...(isPo ? { convertedFromPoNumber: origDocNo } : { convertedFromPiNumber: origDocNo }),
          }
        : prev,
    );
    setConvertTargetSale(null);
  };

  const getWhatsAppInvoiceLink = (s: SaleRecord) => {
    const cleanPhone = s.phone.replace(/[^0-9]/g, '');
    const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const isPo = s.documentType === 'PURCHASE ORDER' || !!s.convertedFromPoNumber;
    const isPi = s.documentType === 'PROFORMA INVOICE' || !!s.convertedFromPiNumber;
    let msg = '';
    if (isPo) {
      msg = `Hello ${s.customer}, thank you for your Purchase Order #${s.invoice} dated ${s.date} for total ${money(s.grandTotal)}. We have scheduled your order. Nain Tools & Bolt Co.`;
    } else if (isPi) {
      msg = `Hello ${s.customer}, please find your Proforma Quote #${s.invoice} dated ${s.date} for total ${money(s.grandTotal)}. Valid for 1 month. Nain Tools & Bolt Co.`;
    } else {
      const dueInfo = s.status !== 'paid' ? ` | Unpaid Balance: ${money(s.grandTotal - (s.amountPaid || 0))}` : ' | Paid in Full';
      msg = `Hello ${s.customer}, thank you for your business! Your Invoice #${s.invoice} dated ${s.date} for total ${money(s.grandTotal)}${dueInfo} is confirmed. Nain Tools & Bolt Co.`;
    }
    return `https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`;
  };

  const claimableCheques = useMemo(
    () => cheques.filter((c) => c.status === 'pending_clearance' && c.chequeDate <= todayISO()),
    [cheques]
  );
  const pendingCheques = useMemo(
    () => cheques.filter((c) => c.status === 'pending_clearance' && c.chequeDate > todayISO()),
    [cheques]
  );
  const clearedCheques = useMemo(
    () => cheques.filter((c) => c.status === 'cleared'),
    [cheques]
  );
  const bouncedCheques = useMemo(
    () => cheques.filter((c) => c.status === 'bounced'),
    [cheques]
  );

  const chequeSummary = useMemo(() => {
    const totalAmount = cheques.reduce((sum, c) => sum + c.amount, 0);
    const claimableAmount = claimableCheques.reduce((sum, c) => sum + c.amount, 0);
    const pendingAmount = pendingCheques.reduce((sum, c) => sum + c.amount, 0);
    const clearedAmount = clearedCheques.reduce((sum, c) => sum + c.amount, 0);
    const bouncedAmount = bouncedCheques.reduce((sum, c) => sum + c.amount, 0);
    return { totalAmount, claimableAmount, pendingAmount, clearedAmount, bouncedAmount };
  }, [cheques, claimableCheques, pendingCheques, clearedCheques, bouncedCheques]);

  const filteredCheques = useMemo(() => {
    const q = chequeSearch.toLowerCase().trim();
    return cheques.filter((c) => {
      if (chequeFilter === 'claimable') {
        if (!(c.status === 'pending_clearance' && c.chequeDate <= todayISO())) return false;
      } else if (chequeFilter === 'pending') {
        if (c.status !== 'pending_clearance') return false;
      } else if (chequeFilter === 'cleared') {
        if (c.status !== 'cleared') return false;
      } else if (chequeFilter === 'bounced') {
        if (c.status !== 'bounced') return false;
      }

      if (!q) return true;
      return (
        c.chequeNumber.toLowerCase().includes(q) ||
        c.bankName.toLowerCase().includes(q) ||
        c.customerName.toLowerCase().includes(q) ||
        c.invoiceNumber.toLowerCase().includes(q) ||
        (c.bounceReason && c.bounceReason.toLowerCase().includes(q))
      );
    });
  }, [cheques, chequeFilter, chequeSearch]);

  const handleConfirmClearance = async () => {
    if (!clearTargetCheque) return;
    await confirmChequeClearance(clearTargetCheque.id);
    setClearTargetCheque(null);
  };

  const handleConfirmBounce = async () => {
    if (!bounceTargetCheque) return;
    const finalReason = bounceReason === 'Other' ? (customBounceReason.trim() || 'Other Reason') : bounceReason;
    await confirmChequeBounce(bounceTargetCheque.id, finalReason, bounceDate);
    setBounceTargetCheque(null);
    setBounceReason('Insufficient Funds (Funds Insufficient)');
    setCustomBounceReason('');
  };

  const openEditChequeModal = (chq: ChequeRecord) => {
    setEditingCheque(chq);
    setEditChequeNo(chq.chequeNumber);
    setEditChequeBank(chq.bankName);
    setEditChequeDate(chq.chequeDate);
    setEditChequeAmount(chq.amount.toString());
    setEditChequeNotes(chq.notes || '');
  };

  const handleSaveEditCheque = async () => {
    if (!editingCheque) return;
    const updated: ChequeRecord = {
      ...editingCheque,
      chequeNumber: editChequeNo.trim() || editingCheque.chequeNumber,
      bankName: editChequeBank.trim() || editingCheque.bankName,
      chequeDate: editChequeDate || editingCheque.chequeDate,
      amount: parseFloat(editChequeAmount) || editingCheque.amount,
      notes: editChequeNotes.trim(),
    };
    await updateCheque(updated);
    setEditingCheque(null);
  };

  const getWhatsAppChequeLink = (chq: ChequeRecord) => {
    const cust = customers.find((c) => c.name === chq.customerName);
    const rawPhone = cust?.phone || '';
    const cleanPhone = rawPhone.replace(/[^0-9]/g, '');
    const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    let msg = `Hello ${chq.customerName}, this is regarding Cheque #${chq.chequeNumber} (${chq.bankName}) for amount ${money(chq.amount)}.`;
    if (chq.status === 'bounced') {
      msg = `URGENT: Hello ${chq.customerName}, Cheque #${chq.chequeNumber} (${chq.bankName}) for amount ${money(chq.amount)} has BOUNCED (${chq.bounceReason || 'Dishonoured'}). Kindly remit immediate electronic payment. Nain Tools & Bolt Co.`;
    } else if (chq.status === 'pending_clearance') {
      msg = `Hello ${chq.customerName}, kindly note that Cheque #${chq.chequeNumber} (${chq.bankName}) of ${money(chq.amount)} is scheduled for bank deposit on ${chq.chequeDate}. Kindly ensure sufficient funds. Thank you, Nain Tools & Bolt Co.`;
    }
    return `https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`;
  };

  return (
    <div className="animate-fade-in space-y-6 pb-12">
      <PageHeader
        title="Sales & Invoicing"
        subtitle="Create GST compliant tax invoices, track credit receivables, and manage cheque clearing & dishonour."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-secondary bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 font-bold"
              onClick={openNewCompanyPO}
            >
              <Building2 className="h-4 w-4 text-blue-600" />
              <span>New Company PO</span>
            </button>
            <button
              className="btn-secondary bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100 font-bold"
              onClick={openNewProformaInvoice}
            >
              <Plus className="h-4 w-4 text-purple-600" />
              <span>New Proforma Invoice</span>
            </button>
            <button
              className="btn-secondary bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 font-bold"
              onClick={openNewDebitNote}
            >
              <Plus className="h-4 w-4 text-indigo-600" />
              <span>New Debit Note</span>
            </button>
            <button className="btn-primary" onClick={openNewSale} title="Press F2 anywhere for quick invoice creation">
              <Plus className="h-4 w-4" />
              <span>New Tax Invoice (F2)</span>
            </button>
          </div>
        }
      />

      {/* Main Sub-Navigation Tabs: Invoices vs Orders vs Cheques Tracker */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveSalesSubTab('invoices')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition ${
            activeSalesSubTab === 'invoices'
              ? 'bg-brand-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 bg-white border border-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Invoices &amp; Bills</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${activeSalesSubTab === 'invoices' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'}`}>
            {statusCounts.all}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSalesSubTab('orders')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition ${
            activeSalesSubTab === 'orders'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 bg-white border border-slate-200'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>Orders &amp; Estimates (PO &amp; PI)</span>
          {orderQuotePendingList.length > 0 ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500 text-white font-black animate-pulse flex items-center gap-1">
              ⚡ {orderQuotePendingList.length} Pending
            </span>
          ) : (
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${activeSalesSubTab === 'orders' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'}`}>
              {orderQuoteList.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveSalesSubTab('cheques')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition ${
            activeSalesSubTab === 'cheques'
              ? 'bg-brand-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 bg-white border border-slate-200'
          }`}
        >
          <Landmark className="w-4 h-4" />
          <span>Cheques &amp; Realisation Tracker</span>
          {claimableCheques.length > 0 ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500 text-white font-black animate-pulse flex items-center gap-1">
              🔔 {claimableCheques.length} Claimable Today
            </span>
          ) : (
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${activeSalesSubTab === 'cheques' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'}`}>
              {cheques.length}
            </span>
          )}
        </button>
      </div>

      {activeSalesSubTab === 'invoices' && (
        <>
          {/* Metric Cards */}
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
            <div
              className={`card p-5 cursor-pointer transition-all duration-200 ${
                activeFilterTab === 'all'
                  ? 'ring-2 ring-brand-500/80 bg-brand-50/20 border-brand-300 shadow-md'
                  : 'hover:border-slate-300 hover:shadow-md'
              }`}
              onClick={() => setActiveFilterTab('all')}
            >
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 font-bold">
                  <ShoppingCart className="h-5 w-5" />
                </div>
                <span className="text-[10.5px] font-extrabold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-md">
                  All Sales
                </span>
              </div>
              <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">{money(summary.total)}</p>
              <p className="mt-1 text-xs text-slate-500 font-semibold">Total Revenue ({statusCounts.all})</p>
            </div>

            <div
              className={`card p-5 cursor-pointer transition-all duration-200 ${
                activeFilterTab === 'paid'
                  ? 'ring-2 ring-emerald-500/80 bg-emerald-50/20 border-emerald-300 shadow-md'
                  : 'hover:border-slate-300 hover:shadow-md'
              }`}
              onClick={() => setActiveFilterTab('paid')}
            >
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 font-bold">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <span className="text-[10.5px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                  {statusCounts.paid} Paid
                </span>
              </div>
              <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">{money(summary.paid)}</p>
              <p className="mt-1 text-xs text-slate-500 font-semibold">Collected Payments</p>
            </div>

            <div
              className={`card p-5 cursor-pointer transition-all duration-200 ${
                activeFilterTab === 'pending'
                  ? 'ring-2 ring-amber-500/80 bg-amber-50/20 border-amber-300 shadow-md'
                  : 'hover:border-slate-300 hover:shadow-md'
              }`}
              onClick={() => setActiveFilterTab('pending')}
            >
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 font-bold">
                  <Clock className="h-5 w-5" />
                </div>
                <span className="text-[10.5px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
                  {statusCounts.pending} Unpaid
                </span>
              </div>
              <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">{money(summary.outstanding)}</p>
              <p className="mt-1 text-xs text-amber-600 font-semibold">Overdue Receivables</p>
            </div>

            <div
              className="card p-5 cursor-pointer transition-all duration-200 hover:border-blue-300 hover:shadow-md bg-gradient-to-br from-white to-blue-50/20"
              onClick={() => setActiveSalesSubTab('orders')}
              title="Click to view and manage Pre-Sales: Company POs and Proforma Quotes"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 font-bold">
                  <ShoppingBag className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-black text-amber-800 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                  ⚡ 0 Stock Impact
                </span>
              </div>
              <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">{money(orderQuoteTotalValue)}</p>
              <div className="mt-1 flex items-center justify-between">
                <p className="text-xs text-blue-700 font-bold">Orders &amp; Quotes ({orderQuoteList.length})</p>
                <span className="text-[10px] text-slate-500 font-semibold">
                  {orderQuotePendingList.length} Pending
                </span>
              </div>
            </div>

            <div
              className={`card p-5 cursor-pointer transition-all duration-200 ${
                activeFilterTab === 'debit-note'
                  ? 'ring-2 ring-indigo-500/80 bg-indigo-50/20 border-indigo-300 shadow-md'
                  : 'hover:border-slate-300 hover:shadow-md'
              }`}
              onClick={() => setActiveFilterTab('debit-note')}
            >
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 font-bold">
                  <FileText className="h-5 w-5" />
                </div>
                <span className="text-[10.5px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                  Sales Adjustment
                </span>
              </div>
              <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">{summary.dnCount} DNs ({money(summary.dnTotal)})</p>
              <p className="mt-1 text-xs text-indigo-600 font-semibold">Debit Notes</p>
            </div>
          </div>

          {/* Sales List Table */}
          <div className="card p-6 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Status Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                <button
                  onClick={() => setActiveFilterTab('all')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition ${
                    activeFilterTab === 'all'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All Invoices ({statusCounts.all})
                </button>
                <button
                  onClick={() => setActiveFilterTab('paid')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1 ${
                    activeFilterTab === 'paid'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Paid ({statusCounts.paid})
                </button>
                <button
                  onClick={() => setActiveFilterTab('pending')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1 ${
                    activeFilterTab === 'pending'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-amber-700 hover:bg-amber-50'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  Pay Later / Credit ({statusCounts.pending})
                </button>
                <button
                  onClick={() => setActiveFilterTab('partially-paid')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1 ${
                    activeFilterTab === 'partially-paid'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-blue-700 hover:bg-blue-50'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  Partially Paid ({statusCounts.partial})
                </button>
                <button
                  onClick={() => setActiveFilterTab('debit-note')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1 ${
                    activeFilterTab === 'debit-note'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-indigo-700 hover:bg-indigo-50 font-extrabold'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Debit Notes ({statusCounts.debitNote})
                </button>
              </div>

              <div className="relative max-w-md w-full md:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by invoice #, customer, phone..."
                  className="input pl-9"
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 font-bold text-slate-600">Invoice #</th>
                    <th className="px-4 py-3 font-bold text-slate-600">Customer</th>
                    <th className="px-4 py-3 font-bold text-slate-600">Date</th>
                    <th className="px-4 py-3 font-bold text-slate-600">Products</th>
                    <th className="px-4 py-3 font-bold text-slate-600">Total</th>
                    <th className="px-4 py-3 font-bold text-slate-600">Payment Status</th>
                    <th className="px-4 py-3 font-bold text-slate-600 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-sm text-slate-400">
                        No sales invoices found matching current filter.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-bold text-brand-600">
                          <div className="flex items-center gap-1.5">
                            <span>{s.invoice}</span>
                            {s.documentType === 'PROFORMA INVOICE' && (
                              <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-700">Proforma</span>
                            )}
                            {s.documentType === 'DEBIT NOTE' && (
                              <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">Debit Note</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-900">{s.customer}</p>
                          {s.phone && <p className="text-[11px] text-slate-500 font-mono">{s.phone}</p>}
                        </td>
                        <td className="px-4 py-3 text-slate-600 font-mono">{s.date}</td>
                        <td className="px-4 py-3 text-slate-700 font-semibold font-mono">
                          {s.items && s.items.length > 0 ? s.items.length : s.itemCount}
                        </td>
                        <td className="px-4 py-3 font-black text-slate-900">{money(s.grandTotal)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5 items-start">
                            {s.documentType === 'PROFORMA INVOICE' ? (
                              <div className="flex flex-col gap-1 items-start">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1">
                                  <Calendar className="w-2.5 h-2.5 text-purple-600" />
                                  {s.piExpirationDate ? (
                                    s.piExpirationDate <= todayISO() ? (
                                      <span className="text-rose-700 font-black">Expired ({s.piExpirationDate})</span>
                                    ) : (
                                      <span>Valid until {s.piExpirationDate} (1 Month)</span>
                                    )
                                  ) : (
                                    <span>Valid for 1 Month ({addMonthsToDate(s.date, 1)})</span>
                                  )}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => openConvertModal(s)}
                                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition shadow-xs"
                                  title="Convert Proforma Quote to Official Tax Invoice"
                                >
                                  + Convert to Tax Invoice
                                </button>
                              </div>
                            ) : (
                              <StatusBadge status={s.status} />
                            )}
                            {s.status === 'pending' && s.documentType !== 'PROFORMA INVOICE' && (
                              <span className="text-[10px] text-amber-700 font-bold flex items-center gap-0.5 mt-0.5">
                                <Clock className="w-2.5 h-2.5 text-amber-600" />
                                {s.dueDate ? `Due: ${s.dueDate}` : 'Pay Later (Full Due)'}
                              </span>
                            )}
                            {s.status === 'partially-paid' && s.documentType !== 'PROFORMA INVOICE' && (
                              <span className="text-[10px] text-blue-700 font-bold mt-0.5">
                                Paid {money(s.amountPaid || 0)} · Due {money(s.grandTotal - (s.amountPaid || 0))}
                              </span>
                            )}
                            {s.paymentMethod === 'Cheque' && s.chequeNo && (
                              <div className="flex flex-wrap items-center gap-1 mt-1 text-[10px] font-bold">
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                                  <Landmark className="w-2.5 h-2.5" />
                                  Cheque #{s.chequeNo}
                                </span>
                                {s.chequeStatus === 'bounced' ? (
                                  <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-extrabold">
                                    Bounced
                                  </span>
                                ) : s.chequeStatus === 'cleared' ? (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-extrabold">
                                    Cleared
                                  </span>
                                ) : s.chequeDate && s.chequeDate <= todayISO() ? (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-black animate-pulse">
                                    🔔 Claimable
                                  </span>
                                ) : s.chequeDate ? (
                                  <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                                    Due {s.chequeDate}
                                  </span>
                                ) : null}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {s.status !== 'paid' && s.status !== 'cancelled' && s.status !== 'draft' && (
                              <button
                                onClick={() => openRecordPaymentModal(s)}
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                                title="Collect / Record Payment"
                              >
                                <CreditCard className="h-4 w-4" />
                              </button>
                            )}
                            {s.phone && (
                              <a
                                href={getWhatsAppInvoiceLink(s)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                                title="Share Invoice via WhatsApp"
                              >
                                <MessageCircle className="h-4 w-4" />
                              </a>
                            )}
                            <button
                              onClick={() => setViewing(s)}
                              className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition"
                              title="View Invoice"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleEditSale(s)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                              title="Edit Invoice"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => printInvoice(s, undefined, companySettings)}
                              className="p-1.5 text-brand-600 hover:bg-brand-50 rounded-lg transition"
                              title="Print Tax Invoice"
                            >
                              <Printer className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteSale(s)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition"
                              title="Delete Invoice"
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
        </>
      )}

      {/* Orders & Estimates (PO & PI) Pipeline View */}
      {activeSalesSubTab === 'orders' && (
        <div className="space-y-6">
          {/* Top KPI Metric Cards (4 Cards) */}
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {/* Card 1: Total Pre-Sales Pipeline */}
            <div className="card p-5 border-l-4 border-l-blue-600 bg-white">
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <ShoppingBag className="h-5 w-5" />
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200">
                  Pre-Sales Total
                </span>
              </div>
              <p className="mt-4 text-2xl font-black text-slate-900">{money(orderQuoteTotalValue)}</p>
              <div className="mt-1 flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>{orderQuoteList.length} Total Orders &amp; Quotes</span>
                <span className="text-blue-700 font-bold">{orderQuoteUniqueClients} Clients</span>
              </div>
            </div>

            {/* Card 2: Company Purchase Orders (PO) */}
            <div className="card p-5 border-l-4 border-l-indigo-600 bg-indigo-50/20">
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                  <Building2 className="h-5 w-5" />
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-800 border border-indigo-200">
                  Client POs
                </span>
              </div>
              <p className="mt-4 text-2xl font-black text-indigo-950">{money(poTotalValue)}</p>
              <div className="mt-1 flex items-center justify-between text-xs font-semibold">
                <span className="text-indigo-800">{poOnlyList.length} Purchase Orders</span>
                <span className="text-amber-700 font-bold">{poPendingList.length} Pending</span>
              </div>
            </div>

            {/* Card 3: Proforma Invoices (PI) */}
            <div className="card p-5 border-l-4 border-l-purple-600 bg-purple-50/20">
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
                  <FileText className="h-5 w-5" />
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200">
                  Quotes / Estimates
                </span>
              </div>
              <p className="mt-4 text-2xl font-black text-purple-950">{money(piTotalValue)}</p>
              <div className="mt-1 flex items-center justify-between text-xs font-semibold">
                <span className="text-purple-800">{piOnlyList.length} Proforma Quotes</span>
                <span className="text-amber-700 font-bold">{piPendingList.length} Active</span>
              </div>
            </div>

            {/* Card 4: Pending Conversion (0 Stock Impact) */}
            <div className="card p-5 border-l-4 border-l-amber-500 bg-amber-50/25">
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                  <Clock className="h-5 w-5" />
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white animate-pulse">
                  ⚡ 0 Stock Impact
                </span>
              </div>
              <p className="mt-4 text-2xl font-black text-amber-950">{money(orderQuotePendingValue)}</p>
              <div className="mt-1 flex items-center justify-between text-xs font-bold text-amber-800">
                <span>{orderQuotePendingList.length} Waiting for Conversion</span>
                <span className="text-emerald-700 font-semibold">{orderQuoteConvertedList.length} Converted</span>
              </div>
            </div>
          </div>

          {/* Banner Explaining Pre-Sales Non-Impact Guarantee + Quick Action Buttons */}
          <div className="p-4 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 rounded-2xl border border-indigo-200/80 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-xs shrink-0 mt-0.5">
                <PackageCheck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-indigo-950 flex items-center gap-2">
                  <span>Pre-Sales Pipeline: Company POs &amp; Proforma Quotes</span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                    ✓ Stock Protected
                  </span>
                </h4>
                <p className="text-xs text-indigo-900/80 mt-1 max-w-3xl leading-relaxed">
                  Both <strong>Company Purchase Orders (PO)</strong> and <strong>Proforma Invoices (PI)</strong> are pre-sale commitments that have <strong>Zero Stock Deduction (0 multiplier)</strong>. Your inventory levels and GST sales ledger remain completely unaffected until you click <strong>&ldquo;⚡ Convert to Tax Invoice&rdquo;</strong> upon dispatch.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end lg:self-center">
              <button
                type="button"
                onClick={openNewCompanyPO}
                className="btn-primary bg-blue-600 hover:bg-blue-700 border-blue-700 text-xs font-bold flex items-center gap-1.5"
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>New Company PO</span>
              </button>
              <button
                type="button"
                onClick={openNewProformaInvoice}
                className="btn-secondary bg-purple-600 text-white hover:bg-purple-700 border-purple-700 text-xs font-bold flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Proforma Invoice</span>
              </button>
            </div>
          </div>

          {/* Filter Chips & Search Bar */}
          <div className="card p-4 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setOrderQuoteFilterTab('all')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition ${
                    orderQuoteFilterTab === 'all'
                      ? 'bg-white text-indigo-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({orderQuoteList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setOrderQuoteFilterTab('po')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                    orderQuoteFilterTab === 'po'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-blue-700 hover:bg-blue-50'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Company POs ({poOnlyList.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOrderQuoteFilterTab('pi')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                    orderQuoteFilterTab === 'pi'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'text-purple-700 hover:bg-purple-50'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Proforma Quotes ({piOnlyList.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOrderQuoteFilterTab('pending')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                    orderQuoteFilterTab === 'pending'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'text-amber-800 hover:bg-amber-50'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Pending Conversion ({orderQuotePendingList.length})</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/30 text-white font-black">
                    ⚡ 0 Stock
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setOrderQuoteFilterTab('converted')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                    orderQuoteFilterTab === 'converted'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-emerald-800 hover:bg-emerald-50'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Converted to Tax Invoice ({orderQuoteConvertedList.length})</span>
                </button>
              </div>

              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={orderQuoteSearch}
                  onChange={(e) => setOrderQuoteSearch(e.target.value)}
                  placeholder="Search PO#, PI#, Tax Inv#, client, phone..."
                  className="input pl-9 text-xs w-full"
                />
                {orderQuoteSearch && (
                  <button
                    onClick={() => setOrderQuoteSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Table of Orders & Quotes */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs min-w-[960px]">
                <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-bold">Document Type &amp; Ref</th>
                    <th className="px-4 py-3 font-bold">Client / Customer</th>
                    <th className="px-4 py-3 font-bold">Dates &amp; Validity</th>
                    <th className="px-4 py-3 font-bold">Items Ordered / Quoted</th>
                    <th className="px-4 py-3 font-bold text-right">Value (₹)</th>
                    <th className="px-4 py-3 font-bold text-center">Status &amp; Stock Impact</th>
                    <th className="px-4 py-3 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredOrderQuoteList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <ShoppingBag className="w-10 h-10 text-slate-300" />
                          <p className="font-semibold text-slate-600">No Orders or Estimates Found</p>
                          <p className="text-xs text-slate-400">
                            {orderQuoteSearch ? 'Try a different search term or clear filters.' : 'Create a new Company PO or Proforma Invoice to get started.'}
                          </p>
                          {!orderQuoteSearch && (
                            <div className="flex items-center gap-2 mt-2">
                              <button
                                type="button"
                                onClick={openNewCompanyPO}
                                className="btn-primary bg-blue-600 hover:bg-blue-700 border-blue-700 text-xs"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Create Company PO</span>
                              </button>
                              <button
                                type="button"
                                onClick={openNewProformaInvoice}
                                className="btn-secondary bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100 text-xs font-bold"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Create Proforma Quote</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredOrderQuoteList.map((record) => {
                      const isPo = record.documentType === 'PURCHASE ORDER' || !!record.convertedFromPoNumber || record.invoice.startsWith('PO-');
                      const isPi = record.documentType === 'PROFORMA INVOICE' || !!record.convertedFromPiNumber || record.invoice.startsWith('PI-');
                      const isConverted = !!record.convertedFromPoNumber || !!record.convertedFromPiNumber;
                      const origDocNo = record.convertedFromPoNumber || record.convertedFromPiNumber || record.invoice;

                      return (
                        <tr key={record.id} className={`hover:bg-slate-50/80 transition ${isConverted ? 'bg-emerald-50/15' : ''}`}>
                          <td className="px-4 py-3 font-semibold">
                            <div className="flex flex-col gap-1 items-start">
                              <div className="flex items-center gap-1.5">
                                {isPo ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200">
                                    <Building2 className="w-3 h-3 text-blue-600" />
                                    Company PO
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200">
                                    <FileText className="w-3 h-3 text-purple-600" />
                                    Proforma Invoice
                                  </span>
                                )}
                              </div>
                              <span className="font-mono font-bold text-slate-800 text-xs">
                                {origDocNo}
                              </span>
                              {isConverted ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 w-fit">
                                  <ArrowUpRight className="w-3 h-3" />
                                  Tax Inv: {record.invoice}
                                </span>
                              ) : isPo && record.poNumber ? (
                                <span className="text-[10px] text-slate-500 font-medium">
                                  Client Ref: {record.poNumber}
                                </span>
                              ) : !isConverted && isPi ? (
                                <span className="text-[10px] text-purple-600 font-medium">
                                  Price Estimate
                                </span>
                              ) : null}
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <div>
                              <div className="font-bold text-slate-900">{record.customer}</div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                                {record.phone && <span>📞 {record.phone}</span>}
                                {record.customerGstin && <span className="font-mono text-[10px] text-slate-600">{record.customerGstin}</span>}
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-0.5 text-[11px]">
                              <span className="text-slate-700 font-medium">
                                Date: <strong>{record.date}</strong>
                              </span>
                              {isPo ? (
                                record.expectedDeliveryDate ? (
                                  <span className="text-blue-700 font-bold flex items-center gap-1">
                                    <Calendar className="w-3 h-3 text-blue-600" />
                                    Delivery: {record.expectedDeliveryDate}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 text-[10px]">No delivery date set</span>
                                )
                              ) : (
                                (() => {
                                  const expDate = record.piExpirationDate || addMonthsToDate(record.date, 1);
                                  const isExpired = expDate <= todayISO();
                                  return (
                                    <span className={`flex items-center gap-1 font-bold ${isExpired && !isConverted ? 'text-rose-700' : 'text-purple-700'}`}>
                                      <Clock className="w-3 h-3" />
                                      {isExpired && !isConverted ? `Expired (${expDate})` : `Valid: ${expDate}`}
                                    </span>
                                  );
                                })()
                              )}
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <div className="max-w-xs">
                              <span className="font-bold text-slate-800">
                                {record.items?.length || 0} items ({record.items?.reduce((s, i) => s + i.qty, 0) || 0} pcs)
                              </span>
                              <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                {record.items?.map((i) => `${i.name} (x${i.qty})`).join(', ') || 'No line items'}
                              </p>
                            </div>
                          </td>

                          <td className="px-4 py-3 text-right">
                            <div className="font-mono font-bold text-slate-900 text-sm">
                              {money(record.grandTotal)}
                            </div>
                            <span className="text-[10px] text-slate-500 font-medium">
                              Sub: {money(record.subtotal)}
                            </span>
                          </td>

                          <td className="px-4 py-3 text-center">
                            <div className="flex flex-col items-center justify-center gap-1.5">
                              {isConverted ? (
                                <div className="flex flex-col items-center">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                    Converted &amp; Stock Deducted
                                  </span>
                                  <span className="text-[10px] text-slate-500 mt-0.5">
                                    Tax Invoice #{record.invoice}
                                  </span>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center gap-1">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-amber-600" />
                                    Pending Conversion
                                  </span>
                                  <span className="text-[10px] text-slate-500 font-semibold">
                                    0 Stock Deducted (Reserved)
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => openConvertModal(record)}
                                    className="mt-0.5 px-2.5 py-1 rounded-lg text-[10.5px] font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition flex items-center gap-1"
                                    title="Convert this record into an official Tax Invoice and deduct items from inventory stock"
                                  >
                                    <RefreshCw className="w-3 h-3" />
                                    <span>⚡ Convert to Tax Invoice</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>

                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {!isConverted && (
                                <button
                                  type="button"
                                  onClick={() => openConvertModal(record)}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                  title="Convert to Tax Invoice"
                                >
                                  <RefreshCw className="h-4 w-4" />
                                </button>
                              )}
                              {record.phone && (
                                <a
                                  href={getWhatsAppInvoiceLink(record)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                                  title="Share via WhatsApp"
                                >
                                  <MessageCircle className="h-4 w-4" />
                                </a>
                              )}
                              <button
                                onClick={() => setViewing(record)}
                                className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition"
                                title="View Details"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              {!isConverted && (
                                <button
                                  onClick={() => handleEditSale(record)}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                  title="Edit Order/Quote"
                                >
                                  <Edit3 className="h-4 w-4" />
                                </button>
                              )}
                              <button
                                onClick={() => printInvoice(record, undefined, companySettings)}
                                className="p-1.5 text-brand-600 hover:bg-brand-50 rounded-lg transition"
                                title="Print / PDF"
                              >
                                <Printer className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteSale(record)}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition"
                                title="Delete"
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
          </div>
        </div>
      )}

      {/* Cheques & Realisation Tracker View */}
      {activeSalesSubTab === 'cheques' && (
        <div className="space-y-6">
          {/* Cheque Metric Cards */}
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <div className="card p-5 border-l-4 border-l-brand-600">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Landmark className="h-5 w-5" />
              </div>
              <p className="mt-4 text-2xl font-black text-slate-900">{money(chequeSummary.totalAmount)}</p>
              <p className="mt-1 text-xs text-slate-500 font-medium">Total Registered Cheques ({cheques.length})</p>
            </div>

            <div className="card p-5 border-l-4 border-l-amber-500 bg-amber-50/20">
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                  <Clock className="h-5 w-5" />
                </div>
                {claimableCheques.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white animate-pulse">
                    Action Needed
                  </span>
                )}
              </div>
              <p className="mt-4 text-2xl font-black text-amber-900">{money(chequeSummary.claimableAmount)}</p>
              <p className="mt-1 text-xs text-amber-700 font-bold">
                Claimable Today / Overdue ({claimableCheques.length})
              </p>
            </div>

            <div className="card p-5 border-l-4 border-l-blue-500">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Calendar className="h-5 w-5" />
              </div>
              <p className="mt-4 text-2xl font-black text-slate-900">{money(chequeSummary.pendingAmount)}</p>
              <p className="mt-1 text-xs text-blue-600 font-medium">Post-Dated / In-Hand ({pendingCheques.length})</p>
            </div>

            <div className="card p-5 border-l-4 border-l-emerald-500">
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                {bouncedCheques.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-700 border border-rose-200">
                    {bouncedCheques.length} Bounced ({money(chequeSummary.bouncedAmount)})
                  </span>
                )}
              </div>
              <p className="mt-4 text-2xl font-black text-slate-900">{money(chequeSummary.clearedAmount)}</p>
              <p className="mt-1 text-xs text-emerald-700 font-medium">Cleared & Realised ({clearedCheques.length})</p>
            </div>
          </div>

          {/* Cheques List Card */}
          <div className="card p-6 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                <button
                  onClick={() => setChequeFilter('all')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition ${
                    chequeFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All Cheques ({cheques.length})
                </button>
                <button
                  onClick={() => setChequeFilter('claimable')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1 ${
                    chequeFilter === 'claimable'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-amber-700 hover:bg-amber-50'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  Claimable Today ({claimableCheques.length})
                </button>
                <button
                  onClick={() => setChequeFilter('pending')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1 ${
                    chequeFilter === 'pending'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-blue-700 hover:bg-blue-50'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  Pending Deposit ({pendingCheques.length})
                </button>
                <button
                  onClick={() => setChequeFilter('cleared')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1 ${
                    chequeFilter === 'cleared'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Cleared ({clearedCheques.length})
                </button>
                <button
                  onClick={() => setChequeFilter('bounced')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1 ${
                    chequeFilter === 'bounced'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-rose-700 hover:bg-rose-50'
                  }`}
                >
                  <AlertOctagon className="w-3.5 h-3.5" />
                  Bounced ({bouncedCheques.length})
                </button>
              </div>

              <div className="relative max-w-md w-full md:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={chequeSearch}
                  onChange={(e) => setChequeSearch(e.target.value)}
                  placeholder="Search cheque #, bank, customer, invoice..."
                  className="input pl-9"
                />
              </div>
            </div>

            {/* Cheques Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 font-bold text-slate-600">Cheque # & Bank</th>
                    <th className="px-4 py-3 font-bold text-slate-600">Customer</th>
                    <th className="px-4 py-3 font-bold text-slate-600">Linked Invoice</th>
                    <th className="px-4 py-3 font-bold text-slate-600">Realisation Date</th>
                    <th className="px-4 py-3 font-bold text-slate-600">Cheque Amount</th>
                    <th className="px-4 py-3 font-bold text-slate-600">Status</th>
                    <th className="px-4 py-3 font-bold text-slate-600 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredCheques.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-sm text-slate-400">
                        No cheques found matching current filter.
                      </td>
                    </tr>
                  ) : (
                    filteredCheques.map((c) => {
                      const isClaimableNow = c.status === 'pending_clearance' && c.chequeDate <= todayISO();
                      const linkedSale = sales.find((s) => s.id === c.saleId || s.invoice === c.invoiceNumber);

                      return (
                        <tr key={c.id} className={`hover:bg-slate-50/80 ${isClaimableNow ? 'bg-amber-50/30' : ''}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                                <Landmark className="w-4 h-4" />
                              </div>
                              <div>
                                <p className="font-bold text-slate-900 font-mono text-sm">#{c.chequeNumber}</p>
                                <p className="text-[11px] text-slate-500 font-semibold">{c.bankName}</p>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <p className="font-bold text-slate-900">{c.customerName}</p>
                            {c.notes && <p className="text-[11px] text-slate-400 italic truncate max-w-xs">{c.notes}</p>}
                          </td>

                          <td className="px-4 py-3">
                            {linkedSale ? (
                              <button
                                type="button"
                                onClick={() => setViewing(linkedSale)}
                                className="font-bold text-brand-600 hover:underline flex items-center gap-1"
                                title="View linked invoice"
                              >
                                <span>{c.invoiceNumber}</span>
                                <ArrowUpRight className="w-3 h-3" />
                              </button>
                            ) : (
                              <span className="font-mono text-slate-600">{c.invoiceNumber || '—'}</span>
                            )}
                          </td>

                          <td className="px-4 py-3 font-mono">
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-900">{c.chequeDate}</span>
                              {isClaimableNow && (
                                <span className="text-[10px] font-black text-amber-700 animate-pulse flex items-center gap-0.5">
                                  🔔 Claimable Today
                                </span>
                              )}
                              {c.status === 'pending_clearance' && c.chequeDate > todayISO() && (
                                <span className="text-[10px] text-slate-400 font-medium">
                                  In Hand (Post-Dated)
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <span className="font-black text-slate-900 font-mono text-sm">{money(c.amount)}</span>
                          </td>

                          <td className="px-4 py-3">
                            {c.status === 'cleared' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Cleared
                              </span>
                            )}
                            {c.status === 'pending_clearance' && (
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${
                                isClaimableNow
                                  ? 'bg-amber-100 text-amber-900 border-amber-300 font-black'
                                  : 'bg-blue-50 text-blue-800 border-blue-200'
                              }`}>
                                <Clock className="w-3.5 h-3.5" />
                                {isClaimableNow ? 'Claimable' : 'Pending Clearance'}
                              </span>
                            )}
                            {c.status === 'bounced' && (
                              <div className="flex flex-col items-start gap-0.5">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-300">
                                  <AlertOctagon className="w-3.5 h-3.5" />
                                  Bounced
                                </span>
                                {c.bounceReason && (
                                  <span className="text-[10px] text-rose-700 font-medium max-w-xs truncate" title={c.bounceReason}>
                                    {c.bounceReason}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {c.status === 'pending_clearance' && (
                                <>
                                  <button
                                    onClick={() => setClearTargetCheque(c)}
                                    className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 flex items-center gap-1 transition"
                                    title="Confirm Cheque Clearance / Claim Money"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                    <span>Clear / Claim</span>
                                  </button>

                                  <button
                                    onClick={() => {
                                      setBounceTargetCheque(c);
                                      setBounceReason('Insufficient Funds (Funds Insufficient)');
                                      setBounceDate(todayISO());
                                    }}
                                    className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 flex items-center gap-1 transition"
                                    title="Mark as Bounced (Dishonoured)"
                                  >
                                    <AlertOctagon className="h-3.5 w-3.5 text-rose-600" />
                                    <span>Bounced</span>
                                  </button>
                                </>
                              )}

                              <a
                                href={getWhatsAppChequeLink(c)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                                title="Send Cheque Notice / Status via WhatsApp"
                              >
                                <MessageCircle className="h-4 w-4" />
                              </a>

                              <button
                                onClick={() => openEditChequeModal(c)}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                title="Edit Cheque Details"
                              >
                                <Edit3 className="h-4 w-4" />
                              </button>

                              <button
                                onClick={() => {
                                  if (confirm(`Delete cheque #${c.chequeNumber} record?`)) {
                                    deleteCheque(c.id);
                                  }
                                }}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition"
                                title="Delete Cheque Record"
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
          </div>
        </div>
      )}

      {/* New Invoice / Edit Invoice Modal */}
      {modalOpen && (
        <Modal
          title={`${editingSaleId ? 'Edit Record' : documentType === 'DEBIT NOTE' ? 'Create Debit Note' : documentType === 'PROFORMA INVOICE' ? 'Create Proforma Invoice' : documentType === 'PURCHASE ORDER' ? 'Create Company Purchase Order' : 'Create Tax Invoice'} (${invoiceNumber})`}
          size="xl"
          onClose={() => setModalOpen(false)}
        >
          <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
            {/* Refined Autocomplete Customer Selector */}
            <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/70 space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-800">Customer &amp; Billing Details</label>
                {customer.trim() && !customers.some((c) => c.name.trim().toLowerCase() === customer.trim().toLowerCase()) && (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                    ✨ New Customer (Auto-saves to Master List)
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Autocomplete Input for Customer Name */}
                <div className="relative">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Customer / Firm Name *</label>
                  <input
                    type="text"
                    value={customer}
                    onFocus={() => setShowCustomerDropdown(true)}
                    onChange={(e) => {
                      setCustomer(e.target.value);
                      setShowCustomerDropdown(true);
                      if (selectedCustomerId !== 'new') setSelectedCustomerId('new');
                    }}
                    placeholder="Type or search customer..."
                    className="input bg-white text-xs font-medium"
                  />

                  {/* Floating Autocomplete List */}
                  {showCustomerDropdown && filteredCustomers.length > 0 && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setShowCustomerDropdown(false)} />
                      <div className="absolute left-0 right-0 z-30 mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg divide-y divide-slate-100">
                        {filteredCustomers.map((c) => (
                          <div
                            key={c.id}
                            onMouseDown={() => {
                              setSelectedCustomerId(c.id);
                              setCustomer(c.name);
                              setPhone(c.phone || '');
                              setAddress(c.address || '');
                              setCustomerGstin(c.gstin || '');
                              setShowCustomerDropdown(false);
                            }}
                            className="p-2 hover:bg-indigo-50 cursor-pointer transition rounded-lg text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900">{c.name}</span>
                              {c.gstin && (
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                                  {c.gstin}
                                </span>
                              )}
                            </div>
                            {(c.phone || c.address) && (
                              <p className="text-[10.5px] text-slate-500 mt-0.5 truncate">
                                {c.phone && `📞 ${c.phone}`} {c.phone && c.address && '·'} {c.address && `📍 ${c.address}`}
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
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Mobile for WhatsApp"
                    className="input bg-white text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Customer GSTIN</label>
                  <input
                    type="text"
                    value={customerGstin}
                    onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
                    placeholder="e.g. 07AAAAA0000A1Z5"
                    className="input bg-white text-xs font-mono uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Billing / Delivery Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Address details..."
                  className="input bg-white text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {documentType === 'DEBIT NOTE' ? 'Debit Note Number *' : documentType === 'PROFORMA INVOICE' ? 'Proforma Invoice Number *' : documentType === 'PURCHASE ORDER' ? 'Company Purchase Order Number *' : 'Invoice Number *'}
                </label>
                <input
                  type="text"
                  value={customInvoiceNumber}
                  onChange={(e) => setCustomInvoiceNumber(e.target.value)}
                  placeholder={documentType === 'DEBIT NOTE' ? 'e.g. DN-1001' : documentType === 'PROFORMA INVOICE' ? 'e.g. PI-1001' : documentType === 'PURCHASE ORDER' ? 'e.g. CPO-5001 or PO/2026/09' : 'e.g. INV-2046 or 00744'}
                  className="input font-mono font-bold text-brand-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {documentType === 'PURCHASE ORDER' ? 'PO Received Date' : 'Invoice Date'}
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    const newDate = e.target.value;
                    setDate(newDate);
                    if (documentType === 'PROFORMA INVOICE') {
                      setPiExpirationDate(addMonthsToDate(newDate, 1));
                    }
                  }}
                  className="input"
                />
              </div>
            </div>

            {documentType === 'PURCHASE ORDER' && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                    <ShoppingBag className="w-4 h-4 text-blue-600" />
                    Incoming Company PO &amp; Delivery Schedule
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-200 text-blue-800">
                    Client Order (Stock Intact)
                  </span>
                </div>
                <p className="text-[11px] text-blue-700">
                  This incoming order will be registered in your sales orders pipeline. Stock will <strong>NOT</strong> be minused until converted to an official Tax Invoice upon dispatch.
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <label className="text-[11px] font-bold text-blue-900">Expected Delivery Date:</label>
                  <input
                    type="date"
                    value={expectedDeliveryDate}
                    onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                    className="input text-xs font-bold w-44 text-blue-900 border-blue-300 focus:border-blue-500 bg-white"
                  />
                  <div className="flex flex-wrap items-center gap-1">
                    {[
                      { label: '7 Days', days: 7 },
                      { label: '15 Days (Std)', days: 15 },
                      { label: '30 Days', days: 30 },
                      { label: '45 Days', days: 45 },
                    ].map((opt) => (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => setExpectedDeliveryDate(addDaysToDate(date, opt.days))}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-blue-200 bg-white text-blue-800 hover:bg-blue-100 transition"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {documentType === 'PROFORMA INVOICE' && (
              <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-purple-600" />
                    Proforma Invoice (PI) Expiration Date
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-200 text-purple-800">
                    1 Month Validity Period
                  </span>
                </div>
                <p className="text-[11px] text-purple-700">
                  Proforma Invoices are valid for 1 month by default. Adjust the expiration date or choose presets below:
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <input
                    type="date"
                    value={piExpirationDate}
                    onChange={(e) => setPiExpirationDate(e.target.value)}
                    className="input text-xs font-bold w-40 text-purple-900 border-purple-300 focus:border-purple-500 bg-white"
                  />
                  <div className="flex flex-wrap items-center gap-1">
                    {[
                      { label: '1 Month (Standard)', months: 1 },
                      { label: '15 Days', days: 15 },
                      { label: '2 Months', months: 2 },
                      { label: '3 Months', months: 3 },
                    ].map((opt) => (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => {
                          if (opt.months) setPiExpirationDate(addMonthsToDate(date, opt.months));
                          else if (opt.days) setPiExpirationDate(addDaysToDate(date, opt.days));
                        }}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-purple-200 bg-white text-purple-800 hover:bg-purple-100 transition"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Optional Tax & Transport Metadata section */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
              <label className="block text-xs font-bold text-slate-700">Transport & Tax Details (P.O., Transport, E-Way Bill)</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">P.O. Number</label>
                  <input
                    type="text"
                    value={poNumber}
                    onChange={(e) => setPoNumber(e.target.value)}
                    placeholder="e.g. PO-1029"
                    className="input py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">P.O. Date</label>
                  <input
                    type="date"
                    value={poDate}
                    onChange={(e) => setPoDate(e.target.value)}
                    className="input py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">E-Way Bill No.</label>
                  <input
                    type="text"
                    value={ewayBill}
                    onChange={(e) => setEwayBill(e.target.value)}
                    placeholder="12-digit E-Way Bill"
                    className="input py-1 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Mode of Transport</label>
                  <input
                    type="text"
                    value={transportMode}
                    onChange={(e) => setTransportMode(e.target.value)}
                    placeholder="e.g. Road / Tempo / Hand"
                    className="input py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Vehicle Number</label>
                  <input
                    type="text"
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                    placeholder="e.g. HR-51-AB-1234"
                    className="input py-1 text-xs font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Vendor Code</label>
                  <input
                    type="text"
                    value={vendorCode}
                    onChange={(e) => setVendorCode(e.target.value)}
                    placeholder="Vendor / Account Code"
                    className="input py-1 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Item Search & Selection */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="block text-xs font-bold text-slate-700">Add Products to Invoice</label>
                <button
                  type="button"
                  onClick={() => setIsAddingCustom(!isAddingCustom)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition flex items-center gap-1.5 shadow-xs ${
                    isAddingCustom
                      ? 'bg-purple-600 text-white border-purple-700'
                      : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Custom / Direct-Sourced Product</span>
                </button>
              </div>

              {/* Inline Custom Product Creator */}
              {isAddingCustom && (
                <div className="rounded-xl border-2 border-purple-200 bg-purple-50/40 p-4 space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                        Custom Metal / Outsourced Product (Non-Inventory)
                      </h4>
                      <p className="text-[11px] text-purple-700">
                        This item will <strong>not</strong> be saved to your product list, but earnings and profit will be added to your Gross Total and Reports.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsAddingCustom(false)}
                      className="text-purple-400 hover:text-purple-700 p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3">
                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Product Description / Name *</label>
                      <input
                        type="text"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        placeholder="e.g. Custom SS 304 Flange 50mm"
                        className="input bg-white text-xs py-1.5 font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Selling Rate (₹) *</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={customPrice}
                        onChange={(e) => setCustomPrice(e.target.value)}
                        placeholder="0.00"
                        className="input bg-white text-xs py-1.5 font-bold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1" title="Rate paid to the other seller or metal material cost">
                        Sourcing Cost (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={customCost}
                        onChange={(e) => setCustomCost(e.target.value)}
                        placeholder="0.00"
                        className="input bg-white text-xs py-1.5 font-semibold text-emerald-700"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Qty</label>
                      <input
                        type="number"
                        min="1"
                        value={customQty}
                        onChange={(e) => setCustomQty(e.target.value)}
                        placeholder="1"
                        className="input bg-white text-xs py-1.5 text-center font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">HSN Code</label>
                      <input
                        type="text"
                        value={customHsn}
                        onChange={(e) => setCustomHsn(e.target.value)}
                        placeholder="7318150"
                        className="input bg-white text-xs py-1.5 font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsAddingCustom(false)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={addCustomLine}
                      disabled={!customName.trim() || !customPrice}
                      className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add to Invoice</span>
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
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 rounded-full transition"
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
                      onClick={() => setSalesCategory(cat)}
                      className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition shrink-0 ${
                        salesCategory === cat
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
                      Catalog List ({searchResults.length} {searchResults.length === 1 ? 'item' : 'items'} displayed
                      {productSearch ? ` for "${productSearch}"` : ''})
                    </span>
                    <span className="text-slate-400 text-[10.5px]">Scroll to browse &middot; Click &quot;+ Add&quot; to include</span>
                  </div>

                  {productSearch.trim() && searchResults.length === 0 ? (
                    <div className="p-4 flex flex-col sm:flex-row items-center justify-between border-t border-purple-200 bg-purple-50/50 gap-2">
                      <div className="text-xs text-purple-900">
                        <span className="font-semibold">No catalog match for &quot;{productSearch}&quot;.</span>
                        <span className="text-purple-600 block text-[11px]">You can add this as a custom or direct-sourced product.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomName(productSearch.trim());
                          setIsAddingCustom(true);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition whitespace-nowrap shadow-xs"
                      >
                        + Add as Custom Item
                      </button>
                    </div>
                  ) : (
                    <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                      {searchResults.map((p) => {
                        const addedLine = lines.find((l) => l.productId === p.id);
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
                                <span>Avail. Stock: <strong className="text-emerald-700">{p.stock}</strong></span>
                                {p.category && <span className="text-slate-400 font-medium">({p.category})</span>}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs font-bold text-brand-600 font-mono">{money(p.price)}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setQuickEditProduct(p);
                                  setQuickEditFormData({
                                    name: p.name,
                                    category: p.category || 'Bolts',
                                    supplier: p.supplier || '',
                                    rackNumber: p.rackNumber || '',
                                    size: p.size || '',
                                    cost: p.cost || 0,
                                    price: p.price || 0,
                                    stock: p.stock || 0,
                                    boxCapacity: p.boxCapacity || 1000,
                                    reorderLevel: p.reorderLevel || 100,
                                    hsnCode: p.hsnCode || '7318150',
                                    notes: p.notes || '',
                                  });
                                  setQuickEditProductModalOpen(true);
                                }}
                                className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition"
                                title="Quick Edit Product Master"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>

                              {addedLine ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="px-2 py-0.5 rounded-full text-[10.5px] font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-300 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3 text-indigo-600" />
                                    <span>Added ({addedLine.qty})</span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => addLine(p.id)}
                                    className="p-1 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition"
                                    title="Add one more"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeLine(p.id)}
                                    className="p-1 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition"
                                    title="Remove from invoice"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => addLine(p.id)}
                                  className="px-2.5 py-1 bg-brand-600 hover:bg-brand-700 text-white text-[11px] font-bold rounded-lg transition flex items-center gap-1 shadow-xs"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Add</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Items Added to Invoice */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <ShoppingCart className="w-4 h-4 text-brand-600" />
                  <span>Items Added to Invoice</span>
                  <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-extrabold bg-brand-100 text-brand-800 border border-brand-200">
                    {lines.length} {lines.length === 1 ? 'item' : 'items'}
                  </span>
                </label>
                {lines.length > 0 && (
                  <span className="text-xs font-bold text-slate-600">
                    Subtotal: <strong className="text-brand-700 font-mono">{money(subtotal)}</strong>
                  </span>
                )}
              </div>

              {lines.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
                  <table className="w-full text-left text-xs min-w-[700px]">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-3 py-2.5 font-bold text-slate-600">Product</th>
                        <th className="px-3 py-2.5 font-bold text-slate-600 text-center w-24">Avail. Stock</th>
                        <th className="px-3 py-2.5 font-bold text-slate-600 w-24 text-center">Qty</th>
                        <th className="px-3 py-2.5 font-bold text-slate-600 w-28 text-right">Rate (₹)</th>
                        <th className="px-3 py-2.5 font-bold text-slate-600 w-24 text-right">Disc %</th>
                        <th className="px-3 py-2.5 font-bold text-slate-600 w-28 text-right">Net Rate (₹)</th>
                        <th className="px-3 py-2.5 font-bold text-slate-600 w-28 text-right">Total (₹)</th>
                        <th className="px-3 py-2.5 text-right w-24">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {lines.map((l) => {
                        const prod = products.find((p) => p.id === l.productId);
                        const availStock = prod ? prod.stock : 0;
                        const discPct = l.discount || 0;
                        const netRate = l.price * (1 - discPct / 100);
                        const lineNet = l.qty * netRate;
                        const isOverStock = !l.isCustom && l.qty > availStock;
                        return (
                          <tr key={l.productId} className={l.isCustom ? 'bg-purple-50/20' : ''}>
                            <td className="px-3 py-2.5">
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenQuickEdit(l)}
                                    className="font-bold text-slate-800 hover:text-indigo-600 hover:underline text-left inline-flex items-center gap-1 group transition cursor-pointer"
                                    title="Click to edit product master stock, price, rack, or details"
                                  >
                                    <span>{l.name}</span>
                                    <Edit3 className="w-3 h-3 text-indigo-500 opacity-0 group-hover:opacity-100 transition" />
                                  </button>
                                  {l.isCustom && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-purple-100 text-purple-700 border border-purple-200">
                                      Custom / Direct
                                    </span>
                                  )}
                                </div>
                                {prod?.rackNumber && (
                                  <p className="text-[10px] text-slate-400 font-normal">Rack: {prod.rackNumber}</p>
                                )}
                                {l.isCustom && l.cost !== undefined && l.cost > 0 && (
                                  <p className="text-[10px] text-purple-600 font-medium">
                                    Cost: {money(l.cost)} · Profit: {money(Math.max(0, netRate - l.cost))}/pc
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {l.isCustom ? (
                                <span className="text-[11px] font-bold text-slate-400 italic">Custom</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleOpenQuickEdit(l)}
                                  title="Click to edit product master stock or details"
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition hover:scale-105 cursor-pointer ${
                                    isOverStock
                                      ? 'bg-rose-100 text-rose-700 border border-rose-200 hover:bg-rose-200'
                                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                  }`}
                                >
                                  <span>{availStock}</span>
                                  <Edit3 className="w-2.5 h-2.5 opacity-70" />
                                </button>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <input
                                type="number"
                                value={l.qty || ''}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => setQty(l.productId, e.target.value)}
                                className={`w-20 rounded-lg border px-2.5 py-1.5 text-xs text-center font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                                  isOverStock
                                    ? 'border-rose-400 bg-rose-50/50 text-rose-900 focus:ring-rose-500'
                                    : 'border-slate-200 focus:border-indigo-500'
                                }`}
                              />
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <input
                                type="number"
                                value={l.price || ''}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => {
                                  const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                                  setPrice(l.productId, parseFloat(cleaned) || 0);
                                }}
                                className="w-24 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-right font-medium focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono"
                              />
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={l.discount ? l.discount : ''}
                                placeholder="NIL"
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => setLineDiscount(l.productId, e.target.value)}
                                className="w-20 rounded-lg border border-slate-200 bg-amber-50/30 px-2.5 py-1.5 text-xs text-right font-bold text-amber-700 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 placeholder:text-slate-400 placeholder:font-semibold font-mono"
                              />
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={netRate && netRate !== l.price ? +netRate.toFixed(2) : ''}
                                placeholder={l.price > 0 ? l.price.toFixed(2) : '0.00'}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => setLineNetRate(l.productId, e.target.value)}
                                className="w-24 rounded-lg border border-slate-200 bg-indigo-50/30 px-2.5 py-1.5 text-xs text-right font-bold text-indigo-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 placeholder:text-slate-400 font-mono"
                              />
                            </td>
                            <td className="px-3 py-2.5 text-right font-bold text-slate-900 font-mono">
                              {money(lineNet)}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleOpenQuickEdit(l)}
                                  className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition"
                                  title="Edit Product Master (Stock, Price, Rack, Details)"
                                >
                                  <Edit3 className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeLine(l.productId)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition shadow-xs"
                                  title="Remove item"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>Remove</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 py-8 text-center">
                  <Package className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-2 text-xs font-bold text-slate-600">No products added yet</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Click &quot;+ Add&quot; on any product in the catalog above to add it to this invoice.</p>
                </div>
              )}
            </div>

            {/* Calculations & GST */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 text-xs">
              {/* Checkbox, Editable GST Rate & Tax Type Selection */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-slate-200/80">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={applyGst}
                      onChange={(e) => setApplyGst(e.target.checked)}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 h-4 w-4"
                    />
                    <span>Apply GST</span>
                  </label>

                  {applyGst && (
                    <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-xs">
                      <span className="text-[11px] font-semibold text-slate-500">Rate:</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={gstRate}
                        onChange={(e) => setGstRate(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-14 rounded border border-slate-200 px-1.5 py-0.5 text-center text-xs font-bold text-brand-600 focus:border-brand-500 focus:outline-none"
                      />
                      <span className="text-xs font-bold text-slate-600">%</span>
                    </div>
                  )}
                </div>

                {applyGst && (
                  <div className="flex items-center gap-3 font-semibold text-slate-700 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-xs">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="gstTaxType"
                        value="local"
                        checked={gstTaxType === 'local'}
                        onChange={() => setGstTaxType('local')}
                        className="text-brand-600 focus:ring-brand-500"
                      />
                      <span>Local (CGST {splitRate}% + SGST {splitRate}%)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="gstTaxType"
                        value="central"
                        checked={gstTaxType === 'central'}
                        onChange={() => setGstTaxType('central')}
                        className="text-brand-600 focus:ring-brand-500"
                      />
                      <span>Central (IGST {gstRate}%)</span>
                    </label>
                  </div>
                )}
              </div>

              <div className="flex justify-between font-semibold text-slate-700">
                <span>Subtotal</span>
                <span>{money(subtotal)}</span>
              </div>

              {/* Discount Controls */}
              <div className="pt-2 border-t border-slate-200/80 space-y-1.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <label className="font-bold text-slate-800">
                      Discount ({discountType === 'amount' ? '₹' : '%'})
                    </label>
                    <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100 text-[11px] font-bold">
                      <button
                        type="button"
                        onClick={() => setDiscountType('amount')}
                        className={`px-2 py-0.5 rounded-md transition ${
                          discountType === 'amount'
                            ? 'bg-white text-brand-600 shadow-xs font-bold'
                            : 'text-slate-500 hover:text-slate-800 font-normal'
                        }`}
                      >
                        ₹ Amount
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiscountType('percent')}
                        className={`px-2 py-0.5 rounded-md transition ${
                          discountType === 'percent'
                            ? 'bg-white text-brand-600 shadow-xs font-bold'
                            : 'text-slate-500 hover:text-slate-800 font-normal'
                        }`}
                      >
                        % Percent
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 self-end sm:self-auto">
                    {discountType === 'amount' && (
                      <span className="text-xs font-bold text-slate-600">₹</span>
                    )}
                    <input
                      type="number"
                      min="0"
                      max={discountType === 'percent' ? 100 : undefined}
                      step="0.01"
                      value={discount || ''}
                      placeholder="0"
                      onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-28 rounded border border-slate-200 px-2 py-1 text-right text-xs font-bold text-slate-900 focus:border-brand-500 focus:outline-none"
                    />
                    {discountType === 'percent' && (
                      <span className="text-xs font-bold text-slate-600">%</span>
                    )}
                  </div>
                </div>

                {discountAmount > 0 && (
                  <div className="flex justify-between font-semibold text-amber-600 pl-2">
                    <span>Discount Deduction</span>
                    <span>-{money(discountAmount)}</span>
                  </div>
                )}
              </div>

              {/* Freight / Cartage Charges */}
              <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between gap-2">
                <label className="font-bold text-slate-800">
                  Freight / Cartage Charges (₹)
                </label>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-600">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={freightCharges || ''}
                    placeholder="0"
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setFreightCharges(e.target.value.replace(/^0+(?=\d)/, ''))}
                    className="w-28 rounded border border-slate-200 px-2 py-1 text-right text-xs font-bold text-slate-900 focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-1.5">
                <span>Taxable Amount</span>
                <span>{money(taxableAmount)}</span>
              </div>

              {applyGst ? (
                gstTaxType === 'local' ? (
                  <>
                    <div className="flex justify-between font-medium text-slate-600 pl-2">
                      <span>Central GST (CGST @ {splitRate}%)</span>
                      <span>{money(cgstAmount)}</span>
                    </div>
                    <div className="flex justify-between font-medium text-slate-600 pl-2">
                      <span>State GST (SGST @ {splitRate}%)</span>
                      <span>{money(sgstAmount)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-slate-800 border-t border-slate-200/60 pt-1">
                      <span>Total GST ({gstRate}%)</span>
                      <span>{money(gstAmount)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between font-medium text-slate-600 pl-2">
                      <span>Central Integrated GST (IGST @ {gstRate}%)</span>
                      <span>{money(igstAmount)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-slate-800 border-t border-slate-200/60 pt-1">
                      <span>Total GST ({gstRate}%)</span>
                      <span>{money(gstAmount)}</span>
                    </div>
                  </>
                )
              ) : (
                <div className="flex justify-between font-medium text-slate-400">
                  <span>GST (Exempt / Not Applied)</span>
                  <span>{money(0)}</span>
                </div>
              )}

              {hasRoundOff && (
                <div className="flex justify-between font-medium text-slate-600 border-t border-slate-200/60 pt-1">
                  <span>Round Off</span>
                  <span>{roundOff > 0 ? `+${money(roundOff)}` : money(roundOff)}</span>
                </div>
              )}

              <div className="flex justify-between font-black text-sm text-slate-900 border-t border-slate-200 pt-2">
                <span>Grand Total</span>
                <span className="text-brand-600">{money(grandTotal)}</span>
              </div>
            </div>

            {/* Payment Mode & Pay Later / Credit Terms Section */}
            {documentType !== 'PROFORMA INVOICE' && (
              <div className="rounded-xl border-2 border-slate-200 bg-white p-4 space-y-3.5 text-xs shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4 text-brand-600" />
                      Payment & Credit Terms (Settlement Mode)
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Choose whether full payment is received now or if goods are given on credit / later payment.
                    </p>
                  </div>
                  {selectedCustomerPendingBalance > 0 && (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-800">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      <span>Customer Prior Due: {money(selectedCustomerPendingBalance)}</span>
                    </div>
                  )}
                </div>

                {/* 3 Payment Settlement Option Tabs */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentStatusType('paid');
                      setPaymentMethod('Cash');
                    }}
                    className={`p-3 rounded-xl border text-left transition flex flex-col justify-between gap-1.5 ${
                      paymentStatusType === 'paid'
                        ? 'border-emerald-500 bg-emerald-50/50 text-emerald-950 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs flex items-center gap-1.5">
                        <CheckCircle2 className={`w-4 h-4 ${paymentStatusType === 'paid' ? 'text-emerald-600' : 'text-slate-400'}`} />
                        Full Payment (Paid)
                      </span>
                      {paymentStatusType === 'paid' && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-700">Active</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Collected {money(grandTotal)} immediately.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPaymentStatusType('pay-later');
                      setPaymentMethod('Credit / Pay Later');
                      if (!dueDate) setDueDate(addDaysToDate(date, 30));
                      if (paymentTerms === 'Immediate') setPaymentTerms('30 Days');
                    }}
                    className={`p-3 rounded-xl border text-left transition flex flex-col justify-between gap-1.5 ${
                      paymentStatusType === 'pay-later'
                        ? 'border-amber-500 bg-amber-50/50 text-amber-950 ring-2 ring-amber-500/20'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs flex items-center gap-1.5">
                        <Clock className={`w-4 h-4 ${paymentStatusType === 'pay-later' ? 'text-amber-600' : 'text-slate-400'}`} />
                        Pay Later / Full Credit (Udhar)
                      </span>
                      {paymentStatusType === 'pay-later' && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-800">Pending</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      ₹0 paid today · Full {money(grandTotal)} due later.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPaymentStatusType('partial');
                      if (!partialPaidAmount) setPartialPaidAmount(Math.round(grandTotal * 0.5).toString());
                      if (!dueDate) setDueDate(addDaysToDate(date, 15));
                      if (paymentTerms === 'Immediate') setPaymentTerms('15 Days');
                    }}
                    className={`p-3 rounded-xl border text-left transition flex flex-col justify-between gap-1.5 ${
                      paymentStatusType === 'partial'
                        ? 'border-blue-500 bg-blue-50/50 text-blue-950 ring-2 ring-blue-500/20'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs flex items-center gap-1.5">
                        <TrendingUp className={`w-4 h-4 ${paymentStatusType === 'partial' ? 'text-blue-600' : 'text-slate-400'}`} />
                        Partial Payment (Advance)
                      </span>
                      {paymentStatusType === 'partial' && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-blue-100 text-blue-800">Split</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Collect token / advance now, balance on credit.
                    </p>
                  </button>
                </div>

                {/* Details for Full Payment */}
                {paymentStatusType === 'paid' && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="text-xs font-bold text-slate-700 block">Payment Method Received:</span>
                      <span className="text-[11px] text-slate-500">Select the channel where customer paid {money(grandTotal)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(['Cash', 'UPI', 'Bank Transfer', 'Cheque'] as PaymentMethod[]).map((pm) => (
                        <button
                          key={pm}
                          type="button"
                          onClick={() => setPaymentMethod(pm)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                            paymentMethod === pm
                              ? 'bg-brand-600 text-white border-brand-700 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {pm}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Details for Pay Later / Credit */}
                {paymentStatusType === 'pay-later' && (
                  <div className="p-3.5 bg-amber-50/60 rounded-xl border border-amber-200 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-amber-950">Total Credit Due:</span>
                        <span className="text-sm font-black text-amber-700 font-mono">{money(grandTotal)}</span>
                      </div>
                      <div className="text-[11px] text-amber-800 font-medium">
                        Will show as <strong>Unpaid / Due</strong> on Customer Ledger & Overdue Receivables
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-amber-200/70">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Credit Terms / Days</label>
                        <div className="flex flex-wrap gap-1">
                          {['Immediate', '15 Days', '30 Days', '45 Days', '60 Days'].map((term) => {
                            const days = parseInt(term, 10) || 0;
                            return (
                              <button
                                key={term}
                                type="button"
                                onClick={() => {
                                  setPaymentTerms(term);
                                  setDueDate(days > 0 ? addDaysToDate(date, days) : date);
                                }}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition ${
                                  paymentTerms === term
                                    ? 'bg-amber-600 text-white border-amber-700'
                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                {term}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Payment Due Date</label>
                        <input
                          type="date"
                          value={dueDate || addDaysToDate(date, 30)}
                          onChange={(e) => {
                            setDueDate(e.target.value);
                            setPaymentTerms('Custom');
                          }}
                          className="input bg-white text-xs py-1 font-bold text-slate-800"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Details for Partial Payment */}
                {paymentStatusType === 'partial' && (
                  <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-200 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Advance Amount Paid Today (₹) *</label>
                        <input
                          type="number"
                          min="0"
                          max={grandTotal}
                          step="1"
                          value={partialPaidAmount}
                          onChange={(e) => setPartialPaidAmount(e.target.value)}
                          placeholder="0"
                          className="input bg-white text-xs py-1.5 font-bold text-emerald-700"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Payment Method (For Advance)</label>
                        <select
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                          className="input bg-white text-xs py-1.5 font-medium"
                        >
                          <option value="Cash">Cash</option>
                          <option value="UPI">UPI</option>
                          <option value="Bank Transfer">Bank Transfer</option>
                          <option value="Cheque">Cheque</option>
                          <option value="Card">Card</option>
                        </select>
                      </div>
                      <div className="flex flex-col justify-center bg-white p-2.5 rounded-lg border border-blue-200">
                        <span className="text-[10px] text-slate-500 font-bold uppercase">Remaining Balance Due:</span>
                        <span className="text-sm font-black text-amber-700 font-mono">
                          {money(Math.max(0, grandTotal - (parseFloat(partialPaidAmount) || 0)))}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-blue-200/70">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Balance Due Terms</label>
                        <div className="flex flex-wrap gap-1">
                          {['7 Days', '15 Days', '30 Days', '45 Days', '60 Days'].map((term) => {
                            const days = parseInt(term, 10) || 0;
                            return (
                              <button
                                key={term}
                                type="button"
                                onClick={() => {
                                  setPaymentTerms(term);
                                  setDueDate(days > 0 ? addDaysToDate(date, days) : date);
                                }}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition ${
                                  paymentTerms === term
                                    ? 'bg-blue-600 text-white border-blue-700'
                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                {term}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Balance Due Date</label>
                        <input
                          type="date"
                          value={dueDate || addDaysToDate(date, 15)}
                          onChange={(e) => {
                            setDueDate(e.target.value);
                            setPaymentTerms('Custom');
                          }}
                          className="input bg-white text-xs py-1 font-bold text-slate-800"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Dedicated Cheque Information Card */}
                {paymentMethod === 'Cheque' && (
                  <div className="p-3.5 bg-blue-50/70 rounded-xl border border-blue-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-blue-950 flex items-center gap-1.5">
                        <Landmark className="w-4 h-4 text-blue-600" />
                        Cheque Details & Realisation Date
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                        Cheque Mode Selected
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Cheque Leaf Number *
                        </label>
                        <input
                          type="text"
                          value={chequeNo}
                          onChange={(e) => setChequeNo(e.target.value)}
                          placeholder="e.g. 004821"
                          className="input bg-white text-xs font-mono font-bold py-1.5"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Issuing Bank Name *
                        </label>
                        <input
                          type="text"
                          value={chequeBank}
                          onChange={(e) => setChequeBank(e.target.value)}
                          placeholder="e.g. HDFC Bank, SBI, ICICI"
                          className="input bg-white text-xs font-semibold py-1.5"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Claimable / Realisation Date *
                        </label>
                        <input
                          type="date"
                          value={chequeDate}
                          onChange={(e) => setChequeDate(e.target.value)}
                          className="input bg-white text-xs font-bold py-1.5"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Clearance Status
                        </label>
                        <select
                          value={chequeStatus}
                          onChange={(e) => setChequeStatus(e.target.value as ChequeStatus)}
                          className="input bg-white text-xs font-semibold py-1.5"
                        >
                          <option value="pending_clearance">In Hand (Pending Clearance)</option>
                          <option value="cleared">Cleared Immediately</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={!canSubmit}
                onClick={handleSubmit}
                className="btn-primary"
              >
                {editingSaleId ? 'Save & Update Invoice' : documentType === 'DEBIT NOTE' ? 'Confirm & Issue Debit Note' : documentType === 'PROFORMA INVOICE' ? 'Confirm & Issue Proforma Invoice' : 'Confirm & Issue Invoice'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Invoice / Debit Note / PO View Modal */}
      {viewing && (
        <Modal
          title={`${viewing.documentType === 'DEBIT NOTE' ? 'Debit Note Details' : viewing.documentType === 'PROFORMA INVOICE' ? 'Proforma Invoice Details' : viewing.documentType === 'PURCHASE ORDER' ? 'Company Purchase Order Details' : 'Invoice Details'} — ${viewing.invoice}`}
          size="xl"
          onClose={() => setViewing(null)}
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
                    onClick={() => setPreviewCopyTag(copyTag)}
                    className={`px-2.5 py-1 rounded text-[10.5px] font-bold transition-all ${
                      previewCopyTag === copyTag
                        ? 'bg-brand-600 text-white shadow-xs'
                        : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
                    }`}
                  >
                    {copyTag}
                  </button>
                ))}
              </div>
            </div>

            {(viewing.documentType === 'PROFORMA INVOICE' || viewing.documentType === 'PURCHASE ORDER') && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 shadow-xs">
                <div>
                  <span className="font-bold text-xs text-blue-950 flex items-center gap-1.5">
                    <PackageCheck className="w-4 h-4 text-blue-600" />
                    {viewing.documentType === 'PURCHASE ORDER' ? 'Ready to Dispatch Goods?' : 'Ready to Bill Client?'}
                  </span>
                  <p className="text-[11px] text-blue-800 mt-0.5">
                    Click &ldquo;Convert to Tax Invoice&rdquo; to deduct items from inventory stock and generate the official GST Tax Invoice.
                  </p>
                </div>
                <button
                  onClick={() => openConvertModal(viewing)}
                  className="btn-primary bg-emerald-600 hover:bg-emerald-700 border-emerald-700 text-xs px-3.5 py-2 flex items-center gap-1.5 font-bold shadow-xs shrink-0"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Convert to Tax Invoice</span>
                </button>
              </div>
            )}

            {viewing.convertedFromPoNumber && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between font-bold shadow-xs">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Converted from Company PO #{viewing.convertedFromPoNumber}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-200/80 text-emerald-900 font-extrabold">
                  Stock Deducted
                </span>
              </div>
            )}

            <div className="text-right text-[10px] font-bold text-slate-900 tracking-wide">{previewCopyTag}</div>

            {/* Main Border Frame Box */}
            <div className="border-2 border-black text-black bg-white shadow-sm overflow-hidden">
              <div className="text-center font-bold text-xs border-b border-black py-1 tracking-wider uppercase bg-slate-50">
                {viewing.documentType || 'TAX INVOICE'}
              </div>

              {/* Company Header */}
              <div className="text-center p-3 border-b border-black">
                <h2 className="text-xl font-black uppercase tracking-tight font-sans">{companySettings?.companyName || 'NAIN TOOLS & SS BOLT CO.'}</h2>
                <p className="text-[11px] font-bold mt-0.5">{companySettings?.address || '17/1, INDUSTRIAL AREA WHIRLPOOL CHOWK, NIT FARIDABAD'}</p>
                <p className="text-[10px] text-slate-700 mt-0.5">EMAIL : {companySettings?.email || 'narendernain2011@gmail.com'} &nbsp;|&nbsp; {companySettings?.phone || '9213469582 7053795074 129 4870974'}</p>
                <p className="text-xs font-black mt-1">GSTIN No. {viewing.sellerGstin || companySettings?.gstin || '06CCCPK0841B1ZA'}</p>
              </div>

              {/* PAN & Reverse Charge */}
              <div className="flex justify-between px-3 py-1.5 border-b border-black text-[11px] font-bold bg-slate-50/60">
                <div>PAN No. &nbsp;&nbsp;&nbsp;&nbsp; <span className="font-mono">{viewing.sellerPan || companySettings?.pan || 'CCCPK0841B'}</span></div>
                <div>Tax is Payable on Reverse Charge : <span>No</span></div>
              </div>

              {/* Two Column Grid: Invoice Meta & Transport */}
              <div className="grid grid-cols-2 border-b border-black divide-x divide-black text-[10px]">
                <div className="p-2 space-y-1">
                  <div className="flex justify-between">
                    <span>{viewing.documentType === 'DEBIT NOTE' ? 'Debit Note No. :' : viewing.documentType === 'PROFORMA INVOICE' ? 'Proforma Invoice No. :' : viewing.documentType === 'PURCHASE ORDER' ? 'Company PO No. :' : 'Invoice No. :'} &nbsp;&nbsp; <strong>{viewing.invoice}</strong></span>
                    <span>Date : &nbsp;&nbsp; <strong>{viewing.date}</strong></span>
                  </div>
                  {viewing.expectedDeliveryDate && (
                    <div className="flex justify-between text-blue-900 font-bold">
                      <span>Exp. Delivery Date :</span> <strong>{viewing.expectedDeliveryDate}</strong>
                    </div>
                  )}
                  <div className="flex justify-between"><span>P.O. No. :</span> <strong>{viewing.poNumber || '—'}</strong></div>
                  <div className="flex justify-between"><span>P.O. Date :</span> <strong>{viewing.poDate || '—'}</strong></div>
                </div>
                <div className="p-2 space-y-1">
                  <div className="flex justify-between"><span>Mode of Transport :</span> <strong>{viewing.transportMode || '—'}</strong></div>
                  <div className="flex justify-between"><span>Vehicle No. :</span> <strong>{viewing.vehicleNumber || '—'}</strong></div>
                  <div className="flex justify-between"><span>Date & Time of Supply :</span> <span>{viewing.date} 01:29 PM</span></div>
                  <div className="flex justify-between"><span>Place of Supply :</span> <strong>{(viewing.customerState || 'HARYANA').toUpperCase()}</strong></div>
                </div>
              </div>

              {/* Two Column Grid: Party Details */}
              <div className="grid grid-cols-2 border-b border-black divide-x divide-black text-[10px]">
                <div className="p-2.5">
                  <div className="flex justify-between font-bold underline mb-1">
                    <span>Receiver Details (Billed to)</span>
                    <span>Vendor Code : <strong>{viewing.vendorCode || '—'}</strong></span>
                  </div>
                  <div className="font-bold text-xs uppercase text-slate-900">{viewing.customer}</div>
                  <div className="text-slate-700 mt-0.5">{viewing.customerAddress || 'FARIDABAD, HARYANA'}</div>
                  <div className="mt-3 space-y-0.5 text-slate-900 font-semibold">
                    <div>GSTIN No. : &nbsp;&nbsp;&nbsp;&nbsp; <strong className="font-mono">{viewing.customerGstin || '06AAECA0878K1ZJ'}</strong></div>
                    <div>State : &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <strong>{viewing.customerState || 'Haryana'}</strong> &nbsp;&nbsp; Code : <strong>{viewing.customerStateCode || '06'}</strong></div>
                  </div>
                </div>
                <div className="p-2.5">
                  <div className="font-bold underline mb-1">Consignee Details (Shipped to)</div>
                  <div className="font-bold text-xs uppercase text-slate-900">{viewing.customer}</div>
                  <div className="text-slate-700 mt-0.5">{viewing.customerAddress || 'FARIDABAD, HARYANA'}</div>
                  <div className="mt-3 space-y-0.5 text-slate-900 font-semibold">
                    <div>GSTIN No. : &nbsp;&nbsp;&nbsp;&nbsp; <strong className="font-mono">{viewing.customerGstin || '06AAECA0878K1ZJ'}</strong></div>
                    <div>State : &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <strong>{viewing.customerState || 'Haryana'}</strong> &nbsp;&nbsp; Code : <strong>{viewing.customerStateCode || '06'}</strong></div>
                  </div>
                </div>
              </div>

              {/* Table Grid */}
              <div className="border-b border-black overflow-x-auto min-h-[160px]">
                <table className="w-full text-left border-collapse text-[10.5px]">
                  {(() => {
                    const isAmountDisc = viewing.discountType === 'amount' && viewing.discount && viewing.discount > 0;
                    const isPercentDisc = viewing.discountType === 'percent' && viewing.discount && viewing.discount > 0;
                    return (
                      <>
                        <thead>
                          <tr className="border-b border-black text-center font-bold bg-slate-50">
                            <th className="border-r border-black p-1.5 w-8">Sr No</th>
                            <th className="border-r border-black p-1.5 text-left pl-3">Description of Goods</th>
                            <th className="border-r border-black p-1.5 w-16">HSN Code</th>
                            <th className="border-r border-black p-1.5 w-16">Qty</th>
                            <th className="border-r border-black p-1.5 w-16">Rate (Rs.)</th>
                            <th className="border-r border-black p-1.5 w-14">Disc %</th>
                            <th className="border-r border-black p-1.5 w-16 text-right">Net Rate (Rs.)</th>
                            <th className="p-1.5 w-20 text-right pr-3">Amount (Rs.)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/40">
                          {viewing.items.map((it, idx) => {
                            const unitPrice = it.price;
                            const grossTotal = unitPrice * it.qty;
                            const hasPerItemDisc = typeof it.discount === 'number' && !isNaN(it.discount) && it.discount >= 0;
                            
                            let itemDiscPercent = 0;
                            if (hasPerItemDisc) {
                              itemDiscPercent = it.discountType === 'amount'
                                ? (grossTotal > 0 ? (it.discount! / grossTotal) * 100 : 0)
                                : (it.discount || 0);
                            } else if (isPercentDisc) {
                              itemDiscPercent = viewing.discount || 0;
                            } else if (isAmountDisc && viewing.subtotal > 0) {
                              itemDiscPercent = (viewing.discount / viewing.subtotal) * 100;
                            }

                            const netUnitPrice = unitPrice * (1 - itemDiscPercent / 100);
                            const lineNetTotal = it.qty * netUnitPrice;
                            const discDisplay = itemDiscPercent > 0 ? itemDiscPercent.toFixed(2) : 'NIL';

                            return (
                              <tr key={idx} className="align-top">
                                <td className="border-r border-black p-1.5 text-center">{idx + 1}</td>
                                <td className="border-r border-black p-1.5 font-bold pl-3">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const prod = products.find((p) => p.id === it.productId || p.name.trim().toLowerCase() === it.name.trim().toLowerCase());
                                      if (prod) {
                                        setQuickEditProduct(prod);
                                        setQuickEditFormData({
                                          name: prod.name,
                                          category: prod.category || 'Bolts',
                                          supplier: prod.supplier || '',
                                          rackNumber: prod.rackNumber || '',
                                          size: prod.size || '',
                                          cost: prod.cost || 0,
                                          price: prod.price || 0,
                                          stock: prod.stock || 0,
                                          boxCapacity: prod.boxCapacity || 1000,
                                          reorderLevel: prod.reorderLevel || 100,
                                          hsnCode: prod.hsnCode || '7318150',
                                          notes: prod.notes || '',
                                        });
                                        setQuickEditProductModalOpen(true);
                                      }
                                    }}
                                    className="hover:text-indigo-600 hover:underline text-left inline-flex items-center gap-1 group transition cursor-pointer"
                                    title="Quick Edit Product Master (Stock, Price, Rack, Details)"
                                  >
                                    <span>{it.name}</span>
                                    <Edit3 className="w-3 h-3 text-indigo-500 opacity-0 group-hover:opacity-100 transition" />
                                  </button>
                                </td>
                                <td className="border-r border-black p-1.5 text-center font-mono">{it.hsnCode || '7318150'}</td>
                                <td className="border-r border-black p-1.5 text-right font-mono">{it.qty.toFixed(2)} PCS</td>
                                <td className="border-r border-black p-1.5 text-right font-mono">{unitPrice.toFixed(2)}</td>
                                <td className="border-r border-black p-1.5 text-right font-mono">{discDisplay}</td>
                                <td className="border-r border-black p-1.5 text-right font-mono font-bold">{netUnitPrice.toFixed(2)}</td>
                                <td className="p-1.5 text-right font-mono pr-3 font-bold">{lineNetTotal.toFixed(2)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </>
                    );
                  })()}
                </table>
              </div>

              {/* Bottom Summary Grid */}
              <div className="grid grid-cols-12 divide-x divide-black text-[10px]">
<div className="col-span-7 p-2.5 flex flex-col justify-between">
                  <div>
                    <div className="font-bold mb-1.5">E-Way Bill No : <strong>{viewing.ewayBill || '—'}</strong></div>
                    <div className="font-bold underline mb-0.5">Bank Details :</div>
                    <div className="text-[10px] font-bold space-y-0.5">
                      <div>{viewing.bankName || companySettings?.bankName || 'HDFC BANK'}</div>
                      <div>{viewing.bankAccount || companySettings?.bankAccount || '50200088182531'}</div>
                      <div>IFSC CODE :{viewing.bankIfsc || companySettings?.bankIfsc || 'HDFC0002034'}</div>
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-black/20">
                    <div className="text-[9px] text-slate-700 font-semibold italic">
                      Certified that the Particulars given above are true and correct
                    </div>
                    <div className="font-bold underline mt-1 mb-0.5">Terms & Conditions :</div>
                    <ol className="text-[8.5px] text-slate-700 space-y-0.5">
                      <li>1. Interest @ 24% p.a. will be charged for delayed payments</li>
                      <li>2. Our risk & responsibility ceases as soon as Goods leave our factory</li>
                      <li>3. All disputes are subject to Faridabad Jurisdiction only.</li>
                      <li>4. E&OE</li>
                    </ol>

                    <div className="flex justify-between items-end mt-4 pt-2 font-bold text-[10px]">
                      <div>Receiver's Signature</div>
                      <div className="text-right">
                        <div>For <strong>{companySettings?.companyName || 'NAIN TOOLS & SS BOLT CO.'}</strong></div>
                        <div className="mt-5">Authorised Signatory</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="col-span-5 flex flex-col justify-between font-bold divide-y divide-black">
                  {(() => {
                    const discAmt = computeDiscountAmount(viewing.subtotal, viewing.discount, viewing.discountType);
                    const freightAmt = viewing.freightCharges || 0;
                    const taxableVal = Math.max(0, viewing.subtotal - discAmt + freightAmt);
                    const isCentral = viewing.gstType === 'igst';
                    const splitRate = (((viewing.gstRate || 18) / 2)).toFixed(2);
                    const cgst = viewing.cgstAmount || +(viewing.gstAmount / 2).toFixed(2);
                    const sgst = viewing.sgstAmount || +(viewing.gstAmount / 2).toFixed(2);
                    const igst = viewing.igstAmount || viewing.gstAmount;
                    const totalGst = isCentral ? igst : (cgst + sgst);
                    const rawTotal = taxableVal + totalGst;
                    const grandTotalInt = Math.round(viewing.grandTotal || rawTotal);
                    const roundOff = +(grandTotalInt - rawTotal).toFixed(2);
                    const showRoundOff = Math.abs(roundOff) >= 0.01;

                    return (
                      <>
                        <div className="p-2 flex justify-between">
                          <span>Total Amount</span>
                          <span className="font-mono">{viewing.subtotal.toFixed(2)}</span>
                        </div>
                        {discAmt > 0 ? (
                          <div className="p-2 flex justify-between text-amber-700 bg-amber-50/50">
                            <span>Discount (Less)</span>
                            <span className="font-mono">-{discAmt.toFixed(2)}</span>
                          </div>
                        ) : null}
                        {freightAmt > 0 ? (
                          <div className="p-2 flex justify-between font-bold">
                            <span>FREIGHT</span>
                            <span className="font-mono">{freightAmt.toFixed(2)}</span>
                          </div>
                        ) : null}
                        <div className="p-2 flex justify-between font-bold">
                          <span>Taxable Amount</span>
                          <span className="font-mono">{taxableVal.toFixed(2)}</span>
                        </div>
                        {isCentral ? (
                          <div className="p-2 flex justify-between">
                            <span>IGST @ &nbsp;&nbsp;&nbsp;&nbsp; {(viewing.gstRate || 18).toFixed(2)} %</span>
                            <span className="font-mono">{igst.toFixed(2)}</span>
                          </div>
                        ) : (
                          <>
                            <div className="p-2 flex justify-between">
                              <span>CGST @ &nbsp;&nbsp;&nbsp;&nbsp; {splitRate} %</span>
                              <span className="font-mono">{cgst.toFixed(2)}</span>
                            </div>
                            <div className="p-2 flex justify-between">
                              <span>SGST @ &nbsp;&nbsp;&nbsp;&nbsp; {splitRate} %</span>
                              <span className="font-mono">{sgst.toFixed(2)}</span>
                            </div>
                          </>
                        )}
                        {showRoundOff ? (
                          <div className="p-2 flex justify-between font-normal">
                            <span>Round Off</span>
                            <span className="font-mono">{roundOff > 0 ? `+${roundOff.toFixed(2)}` : roundOff.toFixed(2)}</span>
                          </div>
                        ) : null}
                        <div className="p-2 flex justify-between text-xs bg-slate-50 font-black">
                          <span>Invoice Amount (Rs.)</span>
                          <span className="font-mono text-black">{grandTotalInt.toFixed(2)}</span>
                        </div>
                        {viewing.documentType !== 'PROFORMA INVOICE' && (
                          <>
                            <div className="p-2 flex justify-between text-xs bg-emerald-50 text-emerald-800 font-bold border-t border-black">
                              <span>Amount Paid ({viewing.paymentMethod || 'Cash'})</span>
                              <span className="font-mono">{money(viewing.amountPaid || 0)}</span>
                            </div>
                            {(viewing.status === 'pending' || viewing.status === 'partially-paid' || (viewing.amountPaid || 0) < viewing.grandTotal) && (
                              <div className="p-2 flex justify-between text-xs bg-amber-50 text-amber-900 font-black border-t border-amber-300">
                                <span>
                                  Balance Due {viewing.dueDate ? `(Due: ${viewing.dueDate})` : ''}
                                  {viewing.paymentTerms ? ` · ${viewing.paymentTerms}` : ''}
                                </span>
                                <span className="font-mono">{money(viewing.grandTotal - (viewing.amountPaid || 0))}</span>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Copy Selector & Export Options */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-slate-800">Select Copies to Export / Print:</span>
                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  <button
                    onClick={() =>
                      setExportCopies({
                        'Original For Recipient': true,
                        'Duplicate For Transporter': true,
                        'Triplicate For Supplier': true,
                        'Extra Copy': true,
                      })
                    }
                    className="px-2 py-0.5 rounded bg-white hover:bg-slate-200 border border-slate-300 font-semibold text-slate-700"
                  >
                    All 4 Copies
                  </button>
                  <button
                    onClick={() =>
                      setExportCopies({
                        'Original For Recipient': true,
                        'Duplicate For Transporter': false,
                        'Triplicate For Supplier': false,
                        'Extra Copy': false,
                      })
                    }
                    className="px-2 py-0.5 rounded bg-white hover:bg-slate-200 border border-slate-300 font-semibold text-slate-700"
                  >
                    Original Only (1 Copy)
                  </button>
                  <button
                    onClick={() =>
                      setExportCopies({
                        'Original For Recipient': true,
                        'Duplicate For Transporter': true,
                        'Triplicate For Supplier': false,
                        'Extra Copy': false,
                      })
                    }
                    className="px-2 py-0.5 rounded bg-white hover:bg-slate-200 border border-slate-300 font-semibold text-slate-700"
                  >
                    Original + Duplicate (2 Copies)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-200/80">
                {[
                  'Original For Recipient',
                  'Duplicate For Transporter',
                  'Triplicate For Supplier',
                  'Extra Copy'
                ].map((copyTag) => (
                  <label key={copyTag} className="flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={!!exportCopies[copyTag]}
                      onChange={(e) =>
                        setExportCopies((prev) => ({
                          ...prev,
                          [copyTag]: e.target.checked,
                        }))
                      }
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className={exportCopies[copyTag] ? 'text-brand-700 font-bold' : 'text-slate-500'}>{copyTag}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              {viewing.status !== 'paid' && viewing.status !== 'cancelled' && viewing.status !== 'draft' && (
                <button
                  className="btn-secondary bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100 font-bold"
                  onClick={() => {
                    const target = viewing;
                    openRecordPaymentModal(target);
                  }}
                >
                  <CreditCard className="h-4 w-4 text-emerald-600" />
                  <span>Collect Payment ({money(viewing.grandTotal - (viewing.amountPaid || 0))} Due)</span>
                </button>
              )}
              {(viewing.documentType === 'PURCHASE ORDER' || viewing.documentType === 'PROFORMA INVOICE') &&
                !viewing.convertedFromPoNumber &&
                !viewing.convertedFromPiNumber && (
                  <button
                    className="btn-primary bg-emerald-600 hover:bg-emerald-700 border-emerald-700 font-bold flex items-center gap-1.5"
                    onClick={() => openConvertModal(viewing)}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>⚡ Convert to Tax Invoice</span>
                  </button>
                )}
              <button
                className="btn-secondary text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100 font-bold"
                onClick={() => {
                  const target = viewing;
                  setViewing(null);
                  handleEditSale(target);
                }}
              >
                <Edit3 className="h-4 w-4 text-blue-600" />
                <span>Edit Invoice</span>
              </button>
              <button
                className="btn-secondary text-red-700 bg-red-50 border-red-200 hover:bg-red-100 font-bold"
                onClick={() => handleDeleteSale(viewing)}
              >
                <Trash2 className="h-4 w-4 text-red-600" />
                <span>Delete</span>
              </button>
              <button className="btn-secondary" onClick={() => setViewing(null)}>
                Close
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  const selectedList = Object.keys(exportCopies).filter((k) => exportCopies[k]);
                  printInvoice(viewing, selectedList.length > 0 ? selectedList : undefined, companySettings);
                }}
              >
                <Printer className="h-4 w-4" /> Print / Export Selected ({Object.values(exportCopies).filter(Boolean).length} {Object.values(exportCopies).filter(Boolean).length === 1 ? 'Copy' : 'Copies'})
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Quick Record Payment Modal */}
      {recordPaymentModalSale && (
        <Modal
          title={`Record Payment — Invoice ${recordPaymentModalSale.invoice}`}
          size="md"
          onClose={() => setRecordPaymentModalSale(null)}
        >
          <div className="space-y-4 text-xs font-sans">
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-600">Customer:</span>
                <span className="font-bold text-slate-900">{recordPaymentModalSale.customer}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Total Invoice Amount:</span>
                <span className="font-bold text-slate-900">{money(recordPaymentModalSale.grandTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Amount Paid So Far:</span>
                <span className="font-semibold text-emerald-600">{money(recordPaymentModalSale.amountPaid || 0)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-black">
                <span className="text-slate-800">Remaining Balance Due:</span>
                <span className="text-amber-700">
                  {money(recordPaymentModalSale.grandTotal - (recordPaymentModalSale.amountPaid || 0))}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Payment Amount Collected Today (₹) *
              </label>
              <input
                type="number"
                min="1"
                max={recordPaymentModalSale.grandTotal - (recordPaymentModalSale.amountPaid || 0)}
                step="1"
                value={recordPaymentAmount}
                onChange={(e) => setRecordPaymentAmount(e.target.value)}
                placeholder="Enter collected amount"
                className="input text-sm font-bold text-emerald-700 py-2 w-full"
                autoFocus
              />
              <div className="flex gap-2 mt-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setRecordPaymentAmount(
                      Math.max(0, recordPaymentModalSale.grandTotal - (recordPaymentModalSale.amountPaid || 0)).toString()
                    )
                  }
                  className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300"
                >
                  Pay Full Balance ({money(recordPaymentModalSale.grandTotal - (recordPaymentModalSale.amountPaid || 0))})
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Payment Method Received
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                {(['Cash', 'UPI', 'Bank Transfer', 'Cheque'] as PaymentMethod[]).map((pm) => (
                  <button
                    key={pm}
                    type="button"
                    onClick={() => setRecordPaymentMethod(pm)}
                    className={`py-2 rounded-lg text-xs font-bold border transition ${
                      recordPaymentMethod === pm
                        ? 'bg-brand-600 text-white border-brand-700 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {pm}
                  </button>
                ))}
              </div>
            </div>

            {/* If Cheque selected for payment */}
            {recordPaymentMethod === 'Cheque' && (
              <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200 space-y-2.5">
                <span className="font-bold text-xs text-blue-950 flex items-center gap-1.5">
                  <Landmark className="w-3.5 h-3.5 text-blue-600" />
                  Cheque Details & Realisation Date
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Cheque Leaf No. *</label>
                    <input
                      type="text"
                      value={recordChequeNo}
                      onChange={(e) => setRecordChequeNo(e.target.value)}
                      placeholder="e.g. 004821"
                      className="input bg-white text-xs font-mono font-bold py-1.5 w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Issuing Bank *</label>
                    <input
                      type="text"
                      value={recordChequeBank}
                      onChange={(e) => setRecordChequeBank(e.target.value)}
                      placeholder="e.g. HDFC / SBI"
                      className="input bg-white text-xs font-semibold py-1.5 w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Claimable Date *</label>
                    <input
                      type="date"
                      value={recordChequeDate}
                      onChange={(e) => setRecordChequeDate(e.target.value)}
                      className="input bg-white text-xs font-bold py-1.5 w-full"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setRecordPaymentModalSale(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary bg-emerald-600 hover:bg-emerald-700 border-emerald-700"
                onClick={handleRecordPayment}
                disabled={!recordPaymentAmount || parseFloat(recordPaymentAmount) <= 0}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm Payment Receipt</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Convert Proforma or Company PO to Tax Invoice Modal */}
      {convertTargetSale && (
        <Modal
          title={convertTargetSale.documentType === 'PURCHASE ORDER' ? 'Convert Company PO to Tax Invoice' : 'Convert Proforma Invoice to Tax Invoice'}
          size="md"
          onClose={() => setConvertTargetSale(null)}
        >
          <div className="space-y-4 text-xs font-sans">
            <p className="text-slate-600">
              You are converting {convertTargetSale.documentType === 'PURCHASE ORDER' ? 'Company Purchase Order' : 'Proforma Invoice'}{' '}
              <strong className={convertTargetSale.documentType === 'PURCHASE ORDER' ? 'text-blue-700 font-mono' : 'text-purple-700 font-mono'}>
                {convertTargetSale.invoice}
              </strong>{' '}
              for <strong>{convertTargetSale.customer}</strong> into an official Tax Invoice.
            </p>

            {convertTargetSale.documentType === 'PURCHASE ORDER' ? (
              <div className="p-3 bg-blue-50/80 rounded-xl border border-blue-200 text-blue-900 text-xs">
                <span className="font-bold flex items-center gap-1.5 mb-1">
                  <PackageCheck className="w-4 h-4 text-blue-600" />
                  Inventory Stock Movement
                </span>
                <p>
                  Upon conversion to Tax Invoice, items on this Purchase Order will be <strong>deducted from inventory stock</strong>, and this order will be recorded under Tax Invoices.
                </p>
              </div>
            ) : (
              <div className="p-3 bg-purple-50/80 rounded-xl border border-purple-200 text-purple-900 text-xs">
                <span className="font-bold flex items-center gap-1.5 mb-1">
                  <PackageCheck className="w-4 h-4 text-purple-600" />
                  Inventory Stock Movement
                </span>
                <p>
                  Upon conversion to Tax Invoice, items on this Proforma Quote will be <strong>deducted from inventory stock</strong>.
                </p>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                New Tax Invoice Number *
              </label>
              <input
                type="text"
                value={convertInvoiceNumber}
                onChange={(e) => setConvertInvoiceNumber(e.target.value)}
                placeholder="e.g. INV-2042"
                className="input font-mono font-bold text-brand-600 w-full"
                autoFocus
              />
              <p className="text-[11px] text-slate-400 mt-1">You can edit the Tax Invoice number if needed.</p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                className="btn-secondary"
                onClick={() => setConvertTargetSale(null)}
              >
                Cancel
              </button>
              <button
                className="btn-primary bg-emerald-600 hover:bg-emerald-700 border-emerald-700"
                onClick={handleConfirmConvert}
                disabled={!convertInvoiceNumber.trim()}
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Confirm Conversion</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm Cheque Clearance Modal */}
      {clearTargetCheque && (
        <Modal
          title={`Confirm Cheque Clearance — #${clearTargetCheque.chequeNumber}`}
          size="md"
          onClose={() => setClearTargetCheque(null)}
        >
          <div className="space-y-4 text-xs font-sans">
            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 space-y-2.5">
              <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Confirm Bank Deposit & Clearance</span>
              </div>
              <p className="text-emerald-800 text-[11px]">
                Confirm that cheque leaf <strong>#{clearTargetCheque.chequeNumber}</strong> ({clearTargetCheque.bankName}) has cleared in the bank account.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-emerald-200/80 text-[11px]">
                <div>
                  <span className="text-slate-500 block">Customer:</span>
                  <span className="font-bold text-slate-800">{clearTargetCheque.customerName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Invoice #:</span>
                  <span className="font-bold text-slate-800">{clearTargetCheque.invoiceNumber || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Realisation Date:</span>
                  <span className="font-bold text-slate-800">{clearTargetCheque.chequeDate}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Cheque Value:</span>
                  <span className="font-black text-emerald-700 text-sm font-mono">{money(clearTargetCheque.amount)}</span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-600 text-[11px]">
              ℹ️ Marking this cheque as cleared will verify the payment in customer ledger and ensure the linked invoice is fully paid.
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setClearTargetCheque(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary bg-emerald-600 hover:bg-emerald-700 border-emerald-700 flex items-center gap-1.5"
                onClick={handleConfirmClearance}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm Clearance & Realisation</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm Cheque Dishonour / Bounce Modal */}
      {bounceTargetCheque && (
        <Modal
          title={`Confirm Cheque Bounce (Dishonoured) — #${bounceTargetCheque.chequeNumber}`}
          size="md"
          onClose={() => setBounceTargetCheque(null)}
        >
          <div className="space-y-4 text-xs font-sans">
            <div className="p-4 bg-rose-50 rounded-xl border border-rose-200 space-y-2.5">
              <div className="flex items-center gap-2 text-rose-950 font-bold text-sm">
                <AlertOctagon className="w-5 h-5 text-rose-600" />
                <span>Cheque Dishonour Reversal Warning</span>
              </div>
              <p className="text-rose-900 text-[11px] leading-relaxed">
                Recording this cheque as bounced will <strong>reverse payment credit of {money(bounceTargetCheque.amount)}</strong>, re-opening the customer's invoice balance as <strong>unpaid / overdue</strong> on their ledger.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-rose-200/80 text-[11px]">
                <div>
                  <span className="text-slate-500 block">Customer:</span>
                  <span className="font-bold text-slate-800">{bounceTargetCheque.customerName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Cheque #:</span>
                  <span className="font-bold text-slate-800 font-mono">#{bounceTargetCheque.chequeNumber} ({bounceTargetCheque.bankName})</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Select Return / Bounce Reason *
              </label>
              <select
                value={bounceReason}
                onChange={(e) => setBounceReason(e.target.value)}
                className="input w-full font-semibold"
              >
                <option value="Insufficient Funds (Funds Insufficient)">Insufficient Funds (Funds Insufficient)</option>
                <option value="Drawer Signature Mismatch / Incomplete">Drawer Signature Mismatch / Incomplete</option>
                <option value="Payment Stopped by Drawer (Customer)">Payment Stopped by Drawer (Customer)</option>
                <option value="Account Closed / Frozen / Blocked">Account Closed / Frozen / Blocked</option>
                <option value="Post-Dated / Stale Cheque (Expired)">Post-Dated / Stale Cheque (Expired)</option>
                <option value="Other">Other Custom Reason...</option>
              </select>
            </div>

            {bounceReason === 'Other' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Specify Custom Reason *
                </label>
                <input
                  type="text"
                  value={customBounceReason}
                  onChange={(e) => setCustomBounceReason(e.target.value)}
                  placeholder="Enter reason provided in bank return memo"
                  className="input w-full"
                  autoFocus
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Bounce / Return Memo Date *
              </label>
              <input
                type="date"
                value={bounceDate}
                onChange={(e) => setBounceDate(e.target.value)}
                className="input w-full font-bold"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setBounceTargetCheque(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary bg-rose-600 hover:bg-rose-700 border-rose-700 flex items-center gap-1.5"
                onClick={handleConfirmBounce}
              >
                <AlertOctagon className="w-4 h-4" />
                <span>Confirm Bounce & Reopen Due Balance</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Cheque Modal */}
      {editingCheque && (
        <Modal
          title={`Edit Cheque Record — #${editingCheque.chequeNumber}`}
          size="md"
          onClose={() => setEditingCheque(null)}
        >
          <div className="space-y-4 text-xs font-sans">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Cheque Leaf Number *</label>
                <input
                  type="text"
                  value={editChequeNo}
                  onChange={(e) => setEditChequeNo(e.target.value)}
                  className="input font-mono font-bold w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Bank Name *</label>
                <input
                  type="text"
                  value={editChequeBank}
                  onChange={(e) => setEditChequeBank(e.target.value)}
                  className="input font-semibold w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Claimable / Realisation Date *</label>
                <input
                  type="date"
                  value={editChequeDate}
                  onChange={(e) => setEditChequeDate(e.target.value)}
                  className="input font-bold w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Cheque Amount (₹) *</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={editChequeAmount}
                  onChange={(e) => setEditChequeAmount(e.target.value)}
                  className="input font-mono font-bold text-emerald-700 w-full"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Notes / Remarks</label>
              <textarea
                value={editChequeNotes}
                onChange={(e) => setEditChequeNotes(e.target.value)}
                placeholder="Branch name, clearing memo details, etc."
                className="input w-full h-16 resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setEditingCheque(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSaveEditCheque}
              >
                <Check className="w-4 h-4" />
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Quick Edit Product Master Modal (Inside Billing Process) */}
      {quickEditProductModalOpen && quickEditProduct && (
        <Modal
          title={`Quick Edit Product Master — ${quickEditProduct.name}`}
          size="md"
          onClose={() => setQuickEditProductModalOpen(false)}
        >
          <div className="space-y-4 text-xs font-sans">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-blue-900">
              <p className="font-bold flex items-center gap-1.5">
                <Edit3 className="w-4 h-4 text-blue-600" />
                Updating Product Master directly during Billing
              </p>
              <p className="text-[11px] text-blue-700 mt-0.5">
                Changes saved here will update the master catalog database and immediately sync with your active invoice without losing your draft.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Product Name *</label>
                <input
                  type="text"
                  value={quickEditFormData.name}
                  onChange={(e) => setQuickEditFormData({ ...quickEditFormData, name: e.target.value })}
                  className="input font-semibold text-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-indigo-50/70 border border-indigo-200 p-2.5 rounded-xl">
                  <label className="block font-bold text-indigo-900 mb-1 flex items-center justify-between">
                    <span>Available Stock (Pcs)</span>
                    <span className="text-[10px] font-extrabold bg-indigo-200 text-indigo-800 px-1.5 py-0.5 rounded">Master</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={quickEditFormData.stock}
                    onChange={(e) => setQuickEditFormData({ ...quickEditFormData, stock: parseInt(e.target.value, 10) || 0 })}
                    className="input bg-white font-extrabold text-indigo-900 text-sm border-indigo-300 focus:border-indigo-600"
                  />
                  <p className="text-[10px] text-indigo-600 mt-1">Adjust database stock instantly</p>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Selling Rate (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={quickEditFormData.price}
                    onChange={(e) => setQuickEditFormData({ ...quickEditFormData, price: parseFloat(e.target.value) || 0 })}
                    className="input font-bold text-emerald-700"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Master selling price</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Purchase Cost (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={quickEditFormData.cost}
                    onChange={(e) => setQuickEditFormData({ ...quickEditFormData, cost: parseFloat(e.target.value) || 0 })}
                    className="input"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Rack Location</label>
                  <input
                    type="text"
                    value={quickEditFormData.rackNumber}
                    onChange={(e) => setQuickEditFormData({ ...quickEditFormData, rackNumber: e.target.value })}
                    placeholder="e.g. A-01"
                    className="input"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">HSN Code</label>
                <input
                  type="text"
                  value={quickEditFormData.hsnCode}
                  onChange={(e) => setQuickEditFormData({ ...quickEditFormData, hsnCode: e.target.value })}
                  className="input font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setQuickEditProductModalOpen(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveQuickEditProduct}
                className="btn-primary bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                Save & Update Invoice
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Quick Edit Custom Line Modal */}
      {quickEditCustomModalOpen && quickEditCustomLine && (
        <Modal
          title={`Edit Custom Line Item — ${quickEditCustomLine.name}`}
          size="md"
          onClose={() => setQuickEditCustomModalOpen(false)}
        >
          <div className="space-y-4 text-xs font-sans">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Product Description / Name *</label>
              <input
                type="text"
                value={quickCustomFormData.name}
                onChange={(e) => setQuickCustomFormData({ ...quickCustomFormData, name: e.target.value })}
                className="input font-semibold"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Selling Rate (₹) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={quickCustomFormData.price}
                  onChange={(e) => setQuickCustomFormData({ ...quickCustomFormData, price: parseFloat(e.target.value) || 0 })}
                  className="input font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Sourcing Cost (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={quickCustomFormData.cost}
                  onChange={(e) => setQuickCustomFormData({ ...quickCustomFormData, cost: parseFloat(e.target.value) || 0 })}
                  className="input text-emerald-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={quickCustomFormData.qty}
                  onChange={(e) => setQuickCustomFormData({ ...quickCustomFormData, qty: parseInt(e.target.value, 10) || 1 })}
                  className="input text-center font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">HSN Code</label>
                <input
                  type="text"
                  value={quickCustomFormData.hsnCode}
                  onChange={(e) => setQuickCustomFormData({ ...quickCustomFormData, hsnCode: e.target.value })}
                  className="input font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setQuickEditCustomModalOpen(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveQuickEditCustomLine}
                className="btn-primary"
              >
                Save Line Item
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
