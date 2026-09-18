export type BoxStatus = 'Full' | '75% Full' | 'Half' | 'Very Low' | 'Almost Empty' | 'Empty';

export type BoxStatusMode = 'auto' | 'manual';

export type Product = {
  id: string;
  name: string;
  category?: string;
  supplier: string;
  rackNumber: string;
  size: string;
  cost: number;
  price: number;
  stock: number;
  boxCapacity: number;
  reorderLevel: number;
  boxStatus: BoxStatus;
  boxStatusMode: BoxStatusMode;
  manualBoxStatus: BoxStatus;
  notes: string;
  image: string;
  hsnCode?: string;
  status: 'in-stock' | 'low-stock' | 'out-of-stock';
  lastPhysicalObservation: { observedStock: number; boxStatus: BoxStatus; date: string; user: string } | null;
};

export type InvoiceLineItem = {
  productId: string;
  name: string;
  price: number;
  qty: number;
  cost?: number; // Sourcing or material cost (for Gross Profit & COGS calculations)
  isCustom?: boolean; // True for one-off/direct-sourced/metal items not saved in inventory catalog
  hsnCode?: string;
  discount?: number;
  discountType?: DiscountType;
};

export type PaymentMethod = 'Cash' | 'UPI' | 'Card' | 'Bank Transfer' | 'Cheque' | 'Credit / Pay Later';

export type SaleStatus = 'draft' | 'paid' | 'partially-paid' | 'pending' | 'cancelled';

export type DiscountType = 'amount' | 'percent';

export type GstType = 'auto' | 'cgst-sgst' | 'igst' | 'exempt';

export type ChequeStatus = 'pending_clearance' | 'cleared' | 'bounced' | 'cancelled';
export type ChequeType = 'received' | 'issued';

export type ChequeRecord = {
  id: string;
  type?: ChequeType; // 'received' (from customer) or 'issued' (to supplier)
  saleId?: string;
  purchaseId?: string;
  customerId?: string;
  customerName: string;
  supplierId?: string;
  supplierName?: string;
  invoiceNumber: string;
  chequeNumber: string;
  bankName: string;
  chequeDate: string; // realization / claimable date
  amount: number;
  status: ChequeStatus;
  bounceReason?: string;
  bounceDate?: string;
  notes?: string;
  createdAt?: string;
};

export type SaleRecord = {
  id: string;
  invoice: string;
  customer: string;
  customerId: string;
  phone: string;
  customerAddress?: string;
  customerGstin: string;
  customerState: string;
  customerStateCode: string;
  date: string;
  dueDate?: string;
  paymentTerms?: string;
  items: InvoiceLineItem[];
  itemCount: number;
  subtotal: number;
  discount: number;
  discountType: DiscountType;
  gstRate: number;
  gstType: GstType;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  gstAmount: number;
  grandTotal: number;
  amountPaid: number;
  paymentMethod: PaymentMethod;
  status: SaleStatus;
  channel: 'in-store' | 'online' | 'wholesale';
  poNumber?: string;
  poDate?: string;
  transportMode?: string;
  vehicleNumber?: string;
  ewayBill?: string;
  vendorCode?: string;
  bankName?: string;
  bankAccount?: string;
  bankIfsc?: string;
  sellerGstin?: string;
  sellerPan?: string;
  documentType?: 'TAX INVOICE' | 'DEBIT NOTE' | 'CREDIT NOTE' | 'PURCHASE BILL' | 'PROFORMA INVOICE' | 'PURCHASE ORDER' | 'RAW INVOICE' | 'RAW PURCHASE';
  freightCharges?: number;
  notes?: string;
  chequeNo?: string;
  chequeBank?: string;
  chequeDate?: string;
  chequeStatus?: ChequeStatus;
  chequeBounceReason?: string;
  chequeBounceDate?: string;
  piExpirationDate?: string;
  convertedFromPiNumber?: string;
  convertedFromPoNumber?: string;
  expectedDeliveryDate?: string;
  convertedToInvoice?: string;
  convertedAt?: string;
};

export type PurchaseLineItem = {
  productId: string;
  name: string;
  cost: number;
  qty: number;
  gstRate: number;
  isNewProduct?: boolean;
  category?: string;
  rackNumber?: string;
  size?: string;
  sellingPrice?: number;
  boxCapacity?: number;
  reorderLevel?: number;
  hsnCode?: string;
};

export type PurchasePaymentMethod = 'Cash' | 'UPI' | 'Bank Transfer' | 'Cheque' | 'Credit / Pay Later';

export type PurchaseStatus = 'draft' | 'ordered' | 'partially-received' | 'received' | 'cancelled';

export type PurchaseRecord = {
  id: string;
  poNumber: string;
  supplier: string;
  supplierInvoice: string;
  phone: string;
  date: string;
  dueDate?: string;
  expectedDelivery: string;
  receivedDate: string | null;
  items: PurchaseLineItem[];
  itemCount: number;
  subtotal: number;
  gstRate: number;
  gstAmount: number;
  grandTotal: number;
  amountPaid?: number;
  paymentStatus: 'Paid' | 'Pending';
  paymentMethod: PurchasePaymentMethod;
  status: PurchaseStatus;
  notes: string;
  chequeNo?: string;
  chequeBank?: string;
  chequeDate?: string;
  chequeStatus?: ChequeStatus;
};

export type VerificationRecord = {
  id: string;
  productId: string;
  date: string;
  user: string;
  remark: string;
  previousEstimate: number;
  observedEstimate: number;
  boxStatus: BoxStatus;
};

export type ActivityItem = {
  id: string;
  type: 'sale' | 'purchase' | 'stock' | 'alert';
  title: string;
  detail: string;
  time: string;
};

export type Customer = {
  id: string;
  name: string;
  businessName: string;
  phone: string;
  gstin: string;
  email: string;
  address: string;
  state: string;
  stateCode: string;
  notes: string;
};

export type Supplier = {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  gstin: string;
  email: string;
  address: string;
  state: string;
  stateCode: string;
  notes: string;
};

export type CompanySettings = {
  id?: number;
  companyName: string;
  gstin: string;
  pan: string;
  address: string;
  phone: string;
  email: string;
  state: string;
  stateCode: string;
  bankName: string;
  bankAccount: string;
  bankIfsc: string;
  bankBranch: string;
  logo: string;
  firmCode?: string;
  tagColor?: string;
  isDefault?: boolean;
};
