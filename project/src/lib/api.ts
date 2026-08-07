import { getDb } from './db';
import { computeBoxStatus, computeStockStatus, validateGstin } from './constants';
import type {
  Product, Customer, Supplier, SaleRecord, PurchaseRecord,
  VerificationRecord, InvoiceLineItem, PurchaseLineItem,
  BoxStatus, BoxStatusMode, DiscountType, GstType, CompanySettings,
} from './types';

export const APP_VERSION = '1.2.0';
export const DB_VERSION = 3;
const BACKUP_TABLES = ['products', 'customers', 'suppliers', 'sales', 'sale_items', 'purchases', 'purchase_items', 'verifications', 'categories', 'company_settings'] as const;

type ProductRow = {
  id: string; name: string; category: string; supplier: string; rack_number: string; size: string;
  cost: string; price: string; stock: number; box_capacity: number; reorder_level: number;
  box_status: string; box_status_mode: string; manual_box_status: string; notes: string; image: string; status: string;
  last_phys_obs_stock: number | null; last_phys_box_status: string | null;
  last_phys_date: string | null; last_phys_user: string | null;
};

function resolveBoxStatus(mode: BoxStatusMode, auto: BoxStatus, manual: BoxStatus): BoxStatus {
  return mode === 'manual' ? manual : auto;
}

function mapProduct(r: ProductRow): Product {
  const autoBoxStatus = computeBoxStatus(r.stock, r.box_capacity);
  const mode = (r.box_status_mode || 'auto') as BoxStatusMode;
  const manualBoxStatus = (r.manual_box_status || 'Empty') as BoxStatus;
  return {
    id: r.id, name: r.name, category: r.category, supplier: r.supplier,
    rackNumber: r.rack_number, size: r.size || '', cost: parseFloat(r.cost), price: parseFloat(r.price),
    stock: r.stock, boxCapacity: r.box_capacity, reorderLevel: r.reorder_level,
    boxStatus: resolveBoxStatus(mode, autoBoxStatus, manualBoxStatus),
    boxStatusMode: mode, manualBoxStatus,
    notes: r.notes, image: r.image,
    status: r.status as Product['status'],
    lastPhysicalObservation: r.last_phys_obs_stock !== null
      ? {
          observedStock: r.last_phys_obs_stock,
          boxStatus: r.last_phys_box_status as BoxStatus,
          date: r.last_phys_date!,
          user: r.last_phys_user!,
        }
      : null,
  };
}

type SaleRow = {
  id: string; invoice: string; customer: string; customer_id: string; phone: string;
  customer_gstin: string; customer_state: string; customer_state_code: string;
  date: string; item_count: number; subtotal: string; discount: string; discount_type: string;
  gst_rate: string; gst_type: string; cgst_amount: string; sgst_amount: string; igst_amount: string;
  gst_amount: string; grand_total: string; amount_paid: string;
  payment_method: string; status: string; channel: string;
  document_type?: string; po_number?: string; po_date?: string; transport_mode?: string;
  vehicle_number?: string; eway_bill?: string; vendor_code?: string; bank_name?: string;
  bank_account?: string; bank_ifsc?: string; seller_gstin?: string; seller_pan?: string;
};

type SaleItemRow = {
  sale_id: string; product_id: string; name: string; price: string; qty: number;
};

async function fetchSaleItems(saleIds: string[]): Promise<Map<string, InvoiceLineItem[]>> {
  if (saleIds.length === 0) return new Map();
  const db = await getDb();
  const { rows } = await db.query<SaleItemRow>(
    `SELECT sale_id, product_id, name, price, qty FROM sale_items WHERE sale_id = ANY($1) ORDER BY sort_order`,
    [saleIds],
  );
  const map = new Map<string, InvoiceLineItem[]>();
  for (const r of rows) {
    const items = map.get(r.sale_id) ?? [];
    items.push({ productId: r.product_id, name: r.name, price: parseFloat(r.price), qty: r.qty });
    map.set(r.sale_id, items);
  }
  return map;
}

function mapSale(r: SaleRow, items: InvoiceLineItem[]): SaleRecord {
  return {
    id: r.id, invoice: r.invoice, customer: r.customer, phone: r.phone, date: r.date,
    customerId: r.customer_id || '', customerGstin: r.customer_gstin || '',
    customerState: r.customer_state || '', customerStateCode: r.customer_state_code || '',
    items, itemCount: r.item_count, subtotal: parseFloat(r.subtotal), discount: parseFloat(r.discount),
    discountType: (r.discount_type || 'amount') as DiscountType,
    gstRate: parseFloat(r.gst_rate), gstType: (r.gst_type || 'auto') as GstType,
    cgstAmount: parseFloat(r.cgst_amount || '0'), sgstAmount: parseFloat(r.sgst_amount || '0'),
    igstAmount: parseFloat(r.igst_amount || '0'),
    gstAmount: parseFloat(r.gst_amount),
    grandTotal: parseFloat(r.grand_total), amountPaid: parseFloat(r.amount_paid),
    paymentMethod: r.payment_method as SaleRecord['paymentMethod'],
    status: r.status as SaleRecord['status'],
    channel: r.channel as SaleRecord['channel'],
    documentType: (r.document_type || 'TAX INVOICE') as SaleRecord['documentType'],
    poNumber: r.po_number || '', poDate: r.po_date || '', transportMode: r.transport_mode || '',
    vehicleNumber: r.vehicle_number || '', ewayBill: r.eway_bill || '', vendorCode: r.vendor_code || '',
    bankName: r.bank_name || '', bankAccount: r.bank_account || '', bankIfsc: r.bank_ifsc || '',
    sellerGstin: r.seller_gstin || '', sellerPan: r.seller_pan || '',
  };
}

type PurchaseRow = {
  id: string; po_number: string; supplier: string; supplier_invoice: string;
  phone: string; date: string; expected_delivery: string; received_date: string | null;
  item_count: number; subtotal: string; gst_rate: string; gst_amount: string;
  grand_total: string; payment_status: string; payment_method: string; status: string; notes: string;
};

type PurchaseItemRow = {
  purchase_id: string; product_id: string; name: string; cost: string; qty: number; gst_rate: string;
};

async function fetchPurchaseItems(poIds: string[]): Promise<Map<string, PurchaseLineItem[]>> {
  if (poIds.length === 0) return new Map();
  const db = await getDb();
  const { rows } = await db.query<PurchaseItemRow>(
    `SELECT purchase_id, product_id, name, cost, qty, gst_rate FROM purchase_items WHERE purchase_id = ANY($1) ORDER BY sort_order`,
    [poIds],
  );
  const map = new Map<string, PurchaseLineItem[]>();
  for (const r of rows) {
    const items = map.get(r.purchase_id) ?? [];
    items.push({ productId: r.product_id, name: r.name, cost: parseFloat(r.cost), qty: r.qty, gstRate: parseFloat(r.gst_rate) });
    map.set(r.purchase_id, items);
  }
  return map;
}

function mapPurchase(r: PurchaseRow, items: PurchaseLineItem[]): PurchaseRecord {
  return {
    id: r.id, poNumber: r.po_number, supplier: r.supplier, supplierInvoice: r.supplier_invoice,
    phone: r.phone, date: r.date, expectedDelivery: r.expected_delivery, receivedDate: r.received_date,
    items, itemCount: r.item_count, subtotal: parseFloat(r.subtotal), gstRate: parseFloat(r.gst_rate),
    gstAmount: parseFloat(r.gst_amount), grandTotal: parseFloat(r.grand_total),
    paymentStatus: r.payment_status as PurchaseRecord['paymentStatus'],
    paymentMethod: r.payment_method as PurchaseRecord['paymentMethod'],
    status: r.status as PurchaseRecord['status'], notes: r.notes,
  };
}

type VerificationRow = {
  id: string; product_id: string; date: string; user_name: string; remark: string;
  previous_estimate: number; observed_estimate: number; box_status: string;
};

function mapVerification(r: VerificationRow): VerificationRecord {
  return {
    id: r.id, productId: r.product_id, date: r.date, user: r.user_name, remark: r.remark,
    previousEstimate: r.previous_estimate, observedEstimate: r.observed_estimate,
    boxStatus: r.box_status as BoxStatus,
  };
}

type CustomerRow = {
  id: string; name: string; business_name: string; phone: string; gstin: string;
  email: string; address: string; state: string; state_code: string; notes: string;
};

function mapCustomer(r: CustomerRow): Customer {
  return {
    id: r.id, name: r.name, businessName: r.business_name || '', phone: r.phone,
    gstin: r.gstin || '', email: r.email || '', address: r.address || '',
    state: r.state || '', stateCode: r.state_code || '', notes: r.notes || '',
  };
}

type SupplierRow = {
  id: string; name: string; contact_person: string; phone: string; gstin: string;
  email: string; address: string; state: string; state_code: string; notes: string;
};

function mapSupplier(r: SupplierRow): Supplier {
  return {
    id: r.id, name: r.name, contactPerson: r.contact_person || '', phone: r.phone,
    gstin: r.gstin || '', email: r.email || '', address: r.address || '',
    state: r.state || '', stateCode: r.state_code || '', notes: r.notes || '',
  };
}

type CompanySettingsRow = {
  company_name: string; gstin: string; pan: string; address: string; phone: string;
  email: string; state: string; state_code: string;
  bank_name: string; bank_account: string; bank_ifsc: string; bank_branch: string; logo: string;
};

function mapCompanySettings(r: CompanySettingsRow): CompanySettings {
  return {
    companyName: r.company_name, gstin: r.gstin, pan: r.pan, address: r.address,
    phone: r.phone, email: r.email, state: r.state, stateCode: r.state_code,
    bankName: r.bank_name, bankAccount: r.bank_account, bankIfsc: r.bank_ifsc,
    bankBranch: r.bank_branch, logo: r.logo || '',
  };
}

function validateNonNegative(value: number, field: string): void {
  if (value < 0) throw new Error(`${field} cannot be negative`);
}

function validateNonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} cannot be empty`);
}

// ============================================================
// API
// ============================================================

export const api = {
  // ---- Products ----
  async getProducts(): Promise<Product[]> {
    const db = await getDb();
    const { rows } = await db.query<ProductRow>('SELECT * FROM products ORDER BY created_at');
    return rows.map(mapProduct);
  },

  async createProduct(id: string, data: Omit<Product, 'id' | 'status' | 'boxStatus' | 'stock' | 'lastPhysicalObservation' | 'boxStatusMode' | 'manualBoxStatus'>): Promise<Product> {
    validateNonEmpty(data.name, 'Product name');
    validateNonNegative(data.cost, 'Cost');
    validateNonNegative(data.price, 'Price');
    validateNonNegative(data.boxCapacity, 'Box capacity');
    validateNonNegative(data.reorderLevel, 'Reorder level');
    const db = await getDb();
    const stock = 0;
    const boxStatus = computeBoxStatus(stock, data.boxCapacity);
    const status = computeStockStatus(stock, data.reorderLevel);
    await db.query(
      `INSERT INTO products (id, name, category, supplier, rack_number, size, cost, price, stock, box_capacity, reorder_level, box_status, box_status_mode, manual_box_status, notes, image, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [id, data.name, data.category, data.supplier, data.rackNumber, data.size, data.cost, data.price, stock, data.boxCapacity, data.reorderLevel, boxStatus, 'auto', 'Empty', data.notes, data.image, status],
    );
    return { ...data, id, stock, boxStatus, boxStatusMode: 'auto', manualBoxStatus: 'Empty', status, lastPhysicalObservation: null };
  },

  async updateProduct(id: string, data: Omit<Product, 'id' | 'status' | 'boxStatus' | 'stock' | 'lastPhysicalObservation' | 'boxStatusMode' | 'manualBoxStatus'>): Promise<void> {
    validateNonEmpty(data.name, 'Product name');
    validateNonNegative(data.cost, 'Cost');
    validateNonNegative(data.price, 'Price');
    validateNonNegative(data.boxCapacity, 'Box capacity');
    validateNonNegative(data.reorderLevel, 'Reorder level');
    const db = await getDb();
    const { rows } = await db.query<ProductRow>('SELECT stock, box_status_mode, manual_box_status FROM products WHERE id = $1', [id]);
    if (rows.length === 0) return;
    const stock = rows[0].stock;
    const mode = (rows[0].box_status_mode || 'auto') as BoxStatusMode;
    const manualBoxStatus = (rows[0].manual_box_status || 'Empty') as BoxStatus;
    const autoBoxStatus = computeBoxStatus(stock, data.boxCapacity);
    const boxStatus = resolveBoxStatus(mode, autoBoxStatus, manualBoxStatus);
    const status = computeStockStatus(stock, data.reorderLevel);
    await db.query(
      `UPDATE products SET name=$1, category=$2, supplier=$3, rack_number=$4, size=$5, cost=$6, price=$7, box_capacity=$8, reorder_level=$9, box_status=$10, notes=$11, status=$12 WHERE id=$13`,
      [data.name, data.category, data.supplier, data.rackNumber, data.size, data.cost, data.price, data.boxCapacity, data.reorderLevel, boxStatus, data.notes, status, id],
    );
  },

  async deleteProduct(id: string): Promise<void> {
    const db = await getDb();
    await db.query('DELETE FROM products WHERE id = $1', [id]);
  },

  async updateProductStock(id: string, stock: number, boxCapacity: number, reorderLevel: number): Promise<void> {
    validateNonNegative(stock, 'Stock');
    validateNonNegative(boxCapacity, 'Box capacity');
    validateNonNegative(reorderLevel, 'Reorder level');
    const db = await getDb();
    const { rows } = await db.query<ProductRow>('SELECT box_status_mode, manual_box_status FROM products WHERE id = $1', [id]);
    if (rows.length === 0) return;
    const mode = (rows[0].box_status_mode || 'auto') as BoxStatusMode;
    const manualBoxStatus = (rows[0].manual_box_status || 'Empty') as BoxStatus;
    const autoBoxStatus = computeBoxStatus(stock, boxCapacity);
    const boxStatus = resolveBoxStatus(mode, autoBoxStatus, manualBoxStatus);
    const status = computeStockStatus(stock, reorderLevel);
    await db.query(
      'UPDATE products SET stock=$1, box_status=$2, status=$3 WHERE id=$4',
      [stock, boxStatus, status, id],
    );
  },

  async updateBoxStatusMode(id: string, mode: BoxStatusMode, manualBoxStatus?: BoxStatus): Promise<void> {
    const db = await getDb();
    const { rows } = await db.query<ProductRow>('SELECT stock, box_capacity, manual_box_status FROM products WHERE id = $1', [id]);
    if (rows.length === 0) return;
    const stock = rows[0].stock;
    const boxCapacity = rows[0].box_capacity;
    const currentManual = (rows[0].manual_box_status || 'Empty') as BoxStatus;
    const newManual = manualBoxStatus ?? currentManual;
    const autoBoxStatus = computeBoxStatus(stock, boxCapacity);
    const boxStatus = resolveBoxStatus(mode, autoBoxStatus, newManual);
    await db.query(
      'UPDATE products SET box_status_mode=$1, manual_box_status=$2, box_status=$3 WHERE id=$4',
      [mode, newManual, boxStatus, id],
    );
  },

  async setPhysicalObservation(id: string, observedStock: number, boxStatus: BoxStatus, date: string, user: string): Promise<void> {
    validateNonNegative(observedStock, 'Observed stock');
    validateNonEmpty(date, 'Date');
    validateNonEmpty(user, 'User name');
    const db = await getDb();
    const { rows } = await db.query<{ reorder_level: number; box_status_mode: string; manual_box_status: string }>('SELECT reorder_level, box_status_mode, manual_box_status FROM products WHERE id=$1', [id]);
    if (rows.length === 0) return;
    const mode = (rows[0].box_status_mode || 'auto') as BoxStatusMode;
    const manualBoxStatus = (rows[0].manual_box_status || 'Empty') as BoxStatus;
    const autoBoxStatus = computeBoxStatus(observedStock, (await db.query<{ box_capacity: number }>('SELECT box_capacity FROM products WHERE id=$1', [id])).rows[0].box_capacity);
    const resolvedBoxStatus = resolveBoxStatus(mode, autoBoxStatus, manualBoxStatus);
    await db.query(
      `UPDATE products SET stock=$1, box_status=$2, status=$3, last_phys_obs_stock=$4, last_phys_box_status=$5, last_phys_date=$6, last_phys_user=$7 WHERE id=$8`,
      [observedStock, resolvedBoxStatus, computeStockStatus(observedStock, rows[0].reorder_level), observedStock, boxStatus, date, user, id],
    );
  },

  // ---- Customers ----
  async getCustomers(): Promise<Customer[]> {
    const db = await getDb();
    const { rows } = await db.query<CustomerRow>('SELECT * FROM customers ORDER BY created_at');
    return rows.map(mapCustomer);
  },

  async searchCustomers(query: string): Promise<Customer[]> {
    const q = query.trim();
    if (!q) return [];
    const db = await getDb();
    const { rows } = await db.query<CustomerRow>(
      `SELECT * FROM customers
       WHERE LOWER(name) LIKE LOWER($1) OR gstin LIKE $2 OR phone LIKE $3
       ORDER BY name LIMIT 20`,
      [`%${q}%`, `%${q.toUpperCase()}%`, `%${q}%`],
    );
    return rows.map(mapCustomer);
  },

  async checkGstinDuplicate(gstin: string, excludeId?: string): Promise<boolean> {
    const trimmed = gstin.trim().toUpperCase();
    if (!trimmed) return false;
    const db = await getDb();
    if (excludeId) {
      const { rows } = await db.query<{ count: string }>(
        'SELECT COUNT(*)::text as count FROM customers WHERE gstin = $1 AND id != $2',
        [trimmed, excludeId],
      );
      return parseInt(rows[0].count, 10) > 0;
    }
    const { rows } = await db.query<{ count: string }>(
      'SELECT COUNT(*)::text as count FROM customers WHERE gstin = $1',
      [trimmed],
    );
    return parseInt(rows[0].count, 10) > 0;
  },

  async createCustomer(c: Customer): Promise<void> {
    validateNonEmpty(c.name, 'Customer name');
    if (c.gstin) {
      const v = validateGstin(c.gstin);
      if (!v.valid) throw new Error(v.error);
      if (await this.checkGstinDuplicate(c.gstin)) {
        throw new Error(`A customer with GSTIN ${c.gstin.toUpperCase()} already exists.`);
      }
    }
    const db = await getDb();
    await db.query(
      `INSERT INTO customers (id, name, business_name, phone, gstin, email, address, state, state_code, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [c.id, c.name, c.businessName, c.phone, c.gstin.toUpperCase(), c.email, c.address, c.state, c.stateCode, c.notes],
    );
  },

  async updateCustomer(id: string, c: Customer): Promise<void> {
    validateNonEmpty(c.name, 'Customer name');
    if (c.gstin) {
      const v = validateGstin(c.gstin);
      if (!v.valid) throw new Error(v.error);
      if (await this.checkGstinDuplicate(c.gstin, id)) {
        throw new Error(`A customer with GSTIN ${c.gstin.toUpperCase()} already exists.`);
      }
    }
    const db = await getDb();
    await db.query(
      `UPDATE customers SET name=$1, business_name=$2, phone=$3, gstin=$4, email=$5, address=$6, state=$7, state_code=$8, notes=$9 WHERE id=$10`,
      [c.name, c.businessName, c.phone, c.gstin.toUpperCase(), c.email, c.address, c.state, c.stateCode, c.notes, id],
    );
  },

  async deleteCustomer(id: string): Promise<void> {
    const db = await getDb();
    await db.query('DELETE FROM customers WHERE id = $1', [id]);
  },

  // ---- Suppliers ----
  async getSuppliers(): Promise<Supplier[]> {
    const db = await getDb();
    const { rows } = await db.query<SupplierRow>('SELECT * FROM suppliers ORDER BY created_at');
    return rows.map(mapSupplier);
  },

  async createSupplier(s: Supplier): Promise<void> {
    validateNonEmpty(s.name, 'Supplier name');
    const db = await getDb();
    await db.query(
      `INSERT INTO suppliers (id, name, contact_person, phone, gstin, email, address, state, state_code, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [s.id, s.name, s.contactPerson, s.phone, s.gstin, s.email, s.address, s.state, s.stateCode, s.notes],
    );
  },

  async updateSupplier(id: string, s: Supplier): Promise<void> {
    validateNonEmpty(s.name, 'Supplier name');
    const db = await getDb();
    await db.query(
      `UPDATE suppliers SET name=$1, contact_person=$2, phone=$3, gstin=$4, email=$5, address=$6, state=$7, state_code=$8, notes=$9 WHERE id=$10`,
      [s.name, s.contactPerson, s.phone, s.gstin, s.email, s.address, s.state, s.stateCode, s.notes, id],
    );
  },

  async deleteSupplier(id: string): Promise<void> {
    const db = await getDb();
    await db.query('DELETE FROM suppliers WHERE id = $1', [id]);
  },

  // ---- Sales ----
  async getSales(): Promise<SaleRecord[]> {
    const db = await getDb();
    const { rows } = await db.query<SaleRow>('SELECT * FROM sales ORDER BY date DESC, created_at DESC');
    const ids = rows.map((r) => r.id);
    const itemsMap = await fetchSaleItems(ids);
    return rows.map((r) => mapSale(r, itemsMap.get(r.id) ?? []));
  },

  async checkInvoiceDuplicate(invoice: string, excludeId?: string): Promise<boolean> {
    const db = await getDb();
    if (excludeId) {
      const { rows } = await db.query<{ count: string }>(
        'SELECT COUNT(*)::text as count FROM sales WHERE invoice = $1 AND id != $2',
        [invoice, excludeId],
      );
      return parseInt(rows[0].count, 10) > 0;
    }
    const { rows } = await db.query<{ count: string }>(
      'SELECT COUNT(*)::text as count FROM sales WHERE invoice = $1',
      [invoice],
    );
    return parseInt(rows[0].count, 10) > 0;
  },

  async createSale(sale: SaleRecord): Promise<void> {
    validateNonEmpty(sale.invoice, 'Invoice number');
    validateNonEmpty(sale.customer, 'Customer name');
    validateNonEmpty(sale.date, 'Date');
    validateNonNegative(sale.subtotal, 'Subtotal');
    validateNonNegative(sale.discount, 'Discount');
    validateNonNegative(sale.gstAmount, 'GST amount');
    validateNonNegative(sale.grandTotal, 'Grand total');
    validateNonNegative(sale.amountPaid, 'Amount paid');
    for (const item of sale.items) {
      validateNonNegative(item.price, 'Item price');
      if (item.qty <= 0) throw new Error('Item quantity must be greater than zero');
    }
    if (await this.checkInvoiceDuplicate(sale.invoice)) {
      throw new Error(`Invoice number ${sale.invoice} already exists. Please use a unique invoice number.`);
    }
    const db = await getDb();
    await db.query(
      `INSERT INTO sales (id, invoice, customer, customer_id, phone, customer_gstin, customer_state, customer_state_code, date, item_count, subtotal, discount, discount_type, gst_rate, gst_type, cgst_amount, sgst_amount, igst_amount, gst_amount, grand_total, amount_paid, payment_method, status, channel, document_type, po_number, po_date, transport_mode, vehicle_number, eway_bill, vendor_code, bank_name, bank_account, bank_ifsc, seller_gstin, seller_pan)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36)`,
      [sale.id, sale.invoice, sale.customer, sale.customerId || '', sale.phone, sale.customerGstin || '', sale.customerState || '', sale.customerStateCode || '', sale.date, sale.itemCount, sale.subtotal, sale.discount, sale.discountType || 'amount', sale.gstRate, sale.gstType || 'auto', sale.cgstAmount || 0, sale.sgstAmount || 0, sale.igstAmount || 0, sale.gstAmount, sale.grandTotal, sale.amountPaid, sale.paymentMethod, sale.status, sale.channel, sale.documentType || 'TAX INVOICE', sale.poNumber || '', sale.poDate || '', sale.transportMode || '', sale.vehicleNumber || '', sale.ewayBill || '', sale.vendorCode || '', sale.bankName || '', sale.bankAccount || '', sale.bankIfsc || '', sale.sellerGstin || '', sale.sellerPan || ''],
    );
    for (let i = 0; i < sale.items.length; i++) {
      const item = sale.items[i];
      await db.query(
        'INSERT INTO sale_items (sale_id, product_id, name, price, qty, sort_order) VALUES ($1, $2, $3, $4, $5, $6)',
        [sale.id, item.productId, item.name, item.price, item.qty, i],
      );
    }
  },

  async updateSaleStatus(id: string, status: SaleRecord['status'], amountPaid: number): Promise<void> {
    validateNonNegative(amountPaid, 'Amount paid');
    const db = await getDb();
    await db.query('UPDATE sales SET status=$1, amount_paid=$2 WHERE id=$3', [status, amountPaid, id]);
  },

  async updateSaleDocument(id: string, documentType: string, invoice: string): Promise<void> {
    validateNonEmpty(invoice, 'Invoice number');
    const db = await getDb();
    await db.query('UPDATE sales SET document_type = $1, invoice = $2 WHERE id = $3', [documentType, invoice, id]);
  },

  async updateSale(sale: SaleRecord): Promise<void> {
    validateNonEmpty(sale.invoice, 'Invoice number');
    validateNonEmpty(sale.customer, 'Customer name');
    validateNonEmpty(sale.date, 'Date');
    validateNonNegative(sale.subtotal, 'Subtotal');
    validateNonNegative(sale.discount, 'Discount');
    validateNonNegative(sale.gstAmount, 'GST amount');
    validateNonNegative(sale.grandTotal, 'Grand total');
    validateNonNegative(sale.amountPaid, 'Amount paid');
    for (const item of sale.items) {
      validateNonNegative(item.price, 'Item price');
      if (item.qty <= 0) throw new Error('Item quantity must be greater than zero');
    }
    const db = await getDb();
    await db.query(
      `UPDATE sales SET invoice=$1, customer=$2, customer_id=$3, phone=$4, customer_gstin=$5, customer_state=$6, customer_state_code=$7, date=$8, item_count=$9, subtotal=$10, discount=$11, discount_type=$12, gst_rate=$13, gst_type=$14, cgst_amount=$15, sgst_amount=$16, igst_amount=$17, gst_amount=$18, grand_total=$19, amount_paid=$20, payment_method=$21, status=$22, channel=$23, document_type=$24, po_number=$25, po_date=$26, transport_mode=$27, vehicle_number=$28, eway_bill=$29, vendor_code=$30, bank_name=$31, bank_account=$32, bank_ifsc=$33, seller_gstin=$34, seller_pan=$35 WHERE id=$36`,
      [sale.invoice, sale.customer, sale.customerId || '', sale.phone, sale.customerGstin || '', sale.customerState || '', sale.customerStateCode || '', sale.date, sale.itemCount, sale.subtotal, sale.discount, sale.discountType || 'amount', sale.gstRate, sale.gstType || 'auto', sale.cgstAmount || 0, sale.sgstAmount || 0, sale.igstAmount || 0, sale.gstAmount, sale.grandTotal, sale.amountPaid, sale.paymentMethod, sale.status, sale.channel, sale.documentType || 'TAX INVOICE', sale.poNumber || '', sale.poDate || '', sale.transportMode || '', sale.vehicleNumber || '', sale.ewayBill || '', sale.vendorCode || '', sale.bankName || '', sale.bankAccount || '', sale.bankIfsc || '', sale.sellerGstin || '', sale.sellerPan || '', sale.id],
    );
    await db.query('DELETE FROM sale_items WHERE sale_id = $1', [sale.id]);
    for (let i = 0; i < sale.items.length; i++) {
      const item = sale.items[i];
      await db.query(
        'INSERT INTO sale_items (sale_id, product_id, name, price, qty, sort_order) VALUES ($1, $2, $3, $4, $5, $6)',
        [sale.id, item.productId, item.name, item.price, item.qty, i],
      );
    }
  },

  async deleteSale(id: string): Promise<void> {
    const db = await getDb();
    await db.query('DELETE FROM sales WHERE id = $1', [id]);
  },

  // ---- Purchases ----
  async getPurchases(): Promise<PurchaseRecord[]> {
    const db = await getDb();
    const { rows } = await db.query<PurchaseRow>('SELECT * FROM purchases ORDER BY date DESC, created_at DESC');
    const ids = rows.map((r) => r.id);
    const itemsMap = await fetchPurchaseItems(ids);
    return rows.map((r) => mapPurchase(r, itemsMap.get(r.id) ?? []));
  },

  async checkPONumberDuplicate(poNumber: string, excludeId?: string): Promise<boolean> {
    const db = await getDb();
    if (excludeId) {
      const { rows } = await db.query<{ count: string }>(
        'SELECT COUNT(*)::text as count FROM purchases WHERE po_number = $1 AND id != $2',
        [poNumber, excludeId],
      );
      return parseInt(rows[0].count, 10) > 0;
    }
    const { rows } = await db.query<{ count: string }>(
      'SELECT COUNT(*)::text as count FROM purchases WHERE po_number = $1',
      [poNumber],
    );
    return parseInt(rows[0].count, 10) > 0;
  },

  async createPurchase(po: PurchaseRecord): Promise<void> {
    validateNonEmpty(po.poNumber, 'PO number');
    validateNonEmpty(po.supplier, 'Supplier name');
    validateNonEmpty(po.date, 'Date');
    validateNonNegative(po.subtotal, 'Subtotal');
    validateNonNegative(po.gstAmount, 'GST amount');
    validateNonNegative(po.grandTotal, 'Grand total');
    for (const item of po.items) {
      validateNonNegative(item.cost, 'Item cost');
      if (item.qty <= 0) throw new Error('Item quantity must be greater than zero');
    }
    if (await this.checkPONumberDuplicate(po.poNumber)) {
      throw new Error(`PO number ${po.poNumber} already exists. Please use a unique PO number.`);
    }
    const db = await getDb();
    await db.query(
      `INSERT INTO purchases (id, po_number, supplier, supplier_invoice, phone, date, expected_delivery, received_date, item_count, subtotal, gst_rate, gst_amount, grand_total, payment_status, payment_method, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [po.id, po.poNumber, po.supplier, po.supplierInvoice, po.phone, po.date, po.expectedDelivery, po.receivedDate, po.itemCount, po.subtotal, po.gstRate, po.gstAmount, po.grandTotal, po.paymentStatus, po.paymentMethod, po.status, po.notes],
    );
    for (let i = 0; i < po.items.length; i++) {
      const item = po.items[i];
      await db.query(
        'INSERT INTO purchase_items (purchase_id, product_id, name, cost, qty, gst_rate, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [po.id, item.productId, item.name, item.cost, item.qty, item.gstRate, i],
      );
    }
  },

  async updatePurchaseStatus(id: string, status: PurchaseRecord['status']): Promise<void> {
    const db = await getDb();
    const receivedDate = status === 'received' ? new Date().toISOString().slice(0, 10) : null;
    await db.query(
      'UPDATE purchases SET status=$1, received_date=COALESCE(received_date, $2) WHERE id=$3',
      [status, receivedDate, id],
    );
  },

  async markPurchaseReceived(id: string): Promise<void> {
    const db = await getDb();
    const receivedDate = new Date().toISOString().slice(0, 10);
    await db.query('UPDATE purchases SET status=$1, received_date=COALESCE(received_date, $2) WHERE id=$3', ['received', receivedDate, id]);
  },

  async deletePurchase(id: string): Promise<void> {
    const db = await getDb();
    await db.query('DELETE FROM purchases WHERE id = $1', [id]);
  },

  // ---- Verifications ----
  async getVerifications(): Promise<VerificationRecord[]> {
    const db = await getDb();
    const { rows } = await db.query<VerificationRow>('SELECT * FROM verifications ORDER BY date DESC, created_at DESC');
    return rows.map(mapVerification);
  },

  async createVerification(v: VerificationRecord): Promise<void> {
    validateNonEmpty(v.productId, 'Product ID');
    validateNonEmpty(v.date, 'Date');
    validateNonEmpty(v.user, 'User name');
    validateNonNegative(v.previousEstimate, 'Previous estimate');
    validateNonNegative(v.observedEstimate, 'Observed estimate');
    const db = await getDb();
    await db.query(
      `INSERT INTO verifications (id, product_id, date, user_name, remark, previous_estimate, observed_estimate, box_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [v.id, v.productId, v.date, v.user, v.remark, v.previousEstimate, v.observedEstimate, v.boxStatus],
    );
  },

  // ---- Company Settings ----
  async getCompanySettings(): Promise<CompanySettings> {
    const db = await getDb();
    const { rows } = await db.query<CompanySettingsRow>('SELECT * FROM company_settings WHERE id = 1');
    if (rows.length === 0) {
      await db.query('INSERT INTO company_settings (id) VALUES (1)');
      const { rows: fresh } = await db.query<CompanySettingsRow>('SELECT * FROM company_settings WHERE id = 1');
      return mapCompanySettings(fresh[0]);
    }
    return mapCompanySettings(rows[0]);
  },

  async updateCompanySettings(s: CompanySettings): Promise<void> {
    const db = await getDb();
    await db.query(
      `UPDATE company_settings SET company_name=$1, gstin=$2, pan=$3, address=$4, phone=$5, email=$6, state=$7, state_code=$8, bank_name=$9, bank_account=$10, bank_ifsc=$11, bank_branch=$12, logo=$13, updated_at=now() WHERE id=1`,
      [s.companyName, s.gstin.toUpperCase(), s.pan, s.address, s.phone, s.email, s.state, s.stateCode, s.bankName, s.bankAccount, s.bankIfsc, s.bankBranch, s.logo],
    );
  },

  // ---- Database integrity ----
  async checkIntegrity(): Promise<{ ok: boolean; missingTables: string[] }> {
    const db = await getDb();
    const missingTables: string[] = [];
    for (const table of BACKUP_TABLES) {
      try {
        await db.query(`SELECT 1 FROM ${table} LIMIT 1`);
      } catch {
        missingTables.push(table);
      }
    }
    return { ok: missingTables.length === 0, missingTables };
  },

  // ---- Backup / Restore ----
  async exportDatabase(): Promise<Blob> {
    const db = await getDb();
    const data: Record<string, unknown[]> = {};
    for (const table of BACKUP_TABLES) {
      const { rows } = await db.query(`SELECT * FROM ${table}`);
      data[table] = rows as unknown[];
    }
    const payload = {
      app: 'nain-tools',
      appVersion: APP_VERSION,
      dbVersion: DB_VERSION,
      schemaVersion: DB_VERSION,
      exportedAt: new Date().toISOString(),
      tableCount: BACKUP_TABLES.length,
      data,
    };
    return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  },

  async importDatabase(jsonText: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error('Invalid backup file: not valid JSON.');
    }
    const p = parsed as Record<string, unknown>;
    if (!p || typeof p !== 'object') {
      throw new Error('Invalid backup file: not a valid JSON object.');
    }
    if (p.app !== 'nain-tools') {
      throw new Error('Invalid backup file: not a Nain Tools backup.');
    }
    if (!p.data || typeof p.data !== 'object') {
      throw new Error('Invalid backup file: missing data section.');
    }
    const data = p.data as Record<string, unknown[]>;
    for (const table of BACKUP_TABLES) {
      if (data[table] !== undefined && !Array.isArray(data[table])) {
        throw new Error(`Invalid backup file: ${table} is not an array.`);
      }
    }
    const db = await getDb();
    await db.exec(`
      DELETE FROM sale_items;
      DELETE FROM purchase_items;
      DELETE FROM verifications;
      DELETE FROM sales;
      DELETE FROM purchases;
      DELETE FROM products;
      DELETE FROM customers;
      DELETE FROM suppliers;
      DELETE FROM categories;
    `);

    const insertOrder = ['products', 'customers', 'suppliers', 'sales', 'sale_items', 'purchases', 'purchase_items', 'verifications', 'categories'];
    for (const table of insertOrder) {
      const rows = data[table];
      if (!rows || rows.length === 0) continue;
      for (const row of rows) {
        const obj = row as Record<string, unknown>;
        const columns = Object.keys(obj);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const values = columns.map((c) => obj[c]);
        await db.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`, values);
      }
    }

    try {
      await db.query("SELECT setval('sale_items_id_seq', COALESCE((SELECT MAX(id) FROM sale_items), 1))");
      await db.query("SELECT setval('purchase_items_id_seq', COALESCE((SELECT MAX(id) FROM purchase_items), 1))");
    } catch {
      // sequence reset is non-critical
    }
  },
};
