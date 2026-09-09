import { PGlite } from '@electric-sql/pglite';
import { populateRealInventory } from './inventorySeedData';

let dbInstance: PGlite | null = null;
let initPromise: Promise<PGlite> | null = null;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Other',
  supplier text NOT NULL DEFAULT '',
  rack_number text NOT NULL DEFAULT '',
  size text NOT NULL DEFAULT '',
  cost numeric NOT NULL DEFAULT 0,
  price numeric NOT NULL DEFAULT 0,
  stock integer NOT NULL DEFAULT 0,
  box_capacity integer NOT NULL DEFAULT 0,
  reorder_level integer NOT NULL DEFAULT 0,
  box_status text NOT NULL DEFAULT 'Empty',
  box_status_mode text NOT NULL DEFAULT 'auto',
  manual_box_status text NOT NULL DEFAULT 'Empty',
  notes text NOT NULL DEFAULT '',
  image text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'out-of-stock',
  last_phys_obs_stock integer,
  last_phys_box_status text,
  last_phys_date text,
  last_phys_user text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id text PRIMARY KEY,
  name text NOT NULL,
  business_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  gstin text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  state_code text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id text PRIMARY KEY,
  name text NOT NULL,
  contact_person text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  gstin text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  state_code text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS company_settings (
  id integer PRIMARY KEY DEFAULT 1,
  company_name text NOT NULL DEFAULT 'Nain Tools & Bolt Co.',
  gstin text NOT NULL DEFAULT '24ABCDE1234F1Z5',
  pan text NOT NULL DEFAULT 'ABCDE1234F',
  address text NOT NULL DEFAULT 'Plot 42, GIDC Industrial Estate, Jamnagar, Gujarat 361004',
  phone text NOT NULL DEFAULT '+91 288 255 1234',
  email text NOT NULL DEFAULT 'sales@naintools.in',
  state text NOT NULL DEFAULT 'Gujarat',
  state_code text NOT NULL DEFAULT '24',
  bank_name text NOT NULL DEFAULT 'HDFC Bank, Jamnagar Branch',
  bank_account text NOT NULL DEFAULT '50200012345678',
  bank_ifsc text NOT NULL DEFAULT 'HDFC0001234',
  bank_branch text NOT NULL DEFAULT 'Jamnagar GIDC',
  logo text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales (
  id text PRIMARY KEY,
  invoice text NOT NULL,
  customer text NOT NULL,
  customer_id text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  customer_gstin text NOT NULL DEFAULT '',
  customer_state text NOT NULL DEFAULT '',
  customer_state_code text NOT NULL DEFAULT '',
  date text NOT NULL,
  item_count integer NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  discount_type text NOT NULL DEFAULT 'amount',
  gst_rate numeric NOT NULL DEFAULT 18,
  gst_type text NOT NULL DEFAULT 'auto',
  cgst_amount numeric NOT NULL DEFAULT 0,
  sgst_amount numeric NOT NULL DEFAULT 0,
  igst_amount numeric NOT NULL DEFAULT 0,
  gst_amount numeric NOT NULL DEFAULT 0,
  grand_total numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'Cash',
  status text NOT NULL DEFAULT 'pending',
  channel text NOT NULL DEFAULT 'in-store',
  due_date text NOT NULL DEFAULT '',
  payment_terms text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  cheque_no text NOT NULL DEFAULT '',
  cheque_bank text NOT NULL DEFAULT '',
  cheque_date text NOT NULL DEFAULT '',
  cheque_status text NOT NULL DEFAULT '',
  cheque_bounce_reason text NOT NULL DEFAULT '',
  cheque_bounce_date text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sale_items (
  id bigserial PRIMARY KEY,
  sale_id text NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  name text NOT NULL,
  price numeric NOT NULL,
  qty integer NOT NULL,
  cost numeric NOT NULL DEFAULT 0,
  is_custom boolean NOT NULL DEFAULT false,
  hsn_code text NOT NULL DEFAULT '',
  discount numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS purchases (
  id text PRIMARY KEY,
  po_number text NOT NULL,
  supplier text NOT NULL,
  supplier_invoice text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  date text NOT NULL,
  due_date text NOT NULL DEFAULT '',
  expected_delivery text NOT NULL DEFAULT '',
  received_date text,
  item_count integer NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  gst_rate numeric NOT NULL DEFAULT 18,
  gst_amount numeric NOT NULL DEFAULT 0,
  grand_total numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'Pending',
  payment_method text NOT NULL DEFAULT 'Bank Transfer',
  status text NOT NULL DEFAULT 'draft',
  notes text NOT NULL DEFAULT '',
  cheque_no text NOT NULL DEFAULT '',
  cheque_bank text NOT NULL DEFAULT '',
  cheque_date text NOT NULL DEFAULT '',
  cheque_status text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id bigserial PRIMARY KEY,
  purchase_id text NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  name text NOT NULL,
  cost numeric NOT NULL,
  qty integer NOT NULL,
  gst_rate numeric NOT NULL DEFAULT 18,
  is_new_product boolean NOT NULL DEFAULT false,
  category text NOT NULL DEFAULT '',
  rack_number text NOT NULL DEFAULT '',
  size text NOT NULL DEFAULT '',
  selling_price numeric NOT NULL DEFAULT 0,
  box_capacity integer NOT NULL DEFAULT 1000,
  reorder_level integer NOT NULL DEFAULT 100,
  hsn_code text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS verifications (
  id text PRIMARY KEY,
  product_id text NOT NULL,
  date text NOT NULL,
  user_name text NOT NULL DEFAULT 'Staff',
  remark text NOT NULL DEFAULT '',
  previous_estimate integer NOT NULL DEFAULT 0,
  observed_estimate integer NOT NULL DEFAULT 0,
  box_status text NOT NULL DEFAULT 'Empty',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cheques (
  id text PRIMARY KEY,
  type text NOT NULL DEFAULT 'received',
  sale_id text NOT NULL DEFAULT '',
  purchase_id text NOT NULL DEFAULT '',
  customer_id text NOT NULL DEFAULT '',
  customer_name text NOT NULL DEFAULT '',
  supplier_id text NOT NULL DEFAULT '',
  supplier_name text NOT NULL DEFAULT '',
  invoice_number text NOT NULL DEFAULT '',
  cheque_number text NOT NULL,
  bank_name text NOT NULL,
  cheque_date text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending_clearance',
  bounce_reason text NOT NULL DEFAULT '',
  bounce_date text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS _meta (
  key text PRIMARY KEY,
  value text NOT NULL
);

INSERT INTO _meta (key, value) VALUES ('schema_version', '5')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
INSERT INTO _meta (key, value) VALUES ('app_version', '1.4.0')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

CREATE INDEX IF NOT EXISTS idx_customers_name_lower ON customers (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_customers_gstin ON customers (gstin) WHERE gstin != '';
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone) WHERE phone != '';
CREATE INDEX IF NOT EXISTS idx_products_name_lower ON products (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);
CREATE INDEX IF NOT EXISTS idx_products_status ON products (status);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales (date);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales (customer);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases (date);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases (supplier);
CREATE INDEX IF NOT EXISTS idx_cheques_date ON cheques (cheque_date);
CREATE INDEX IF NOT EXISTS idx_cheques_status ON cheques (status);
CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales (customer_id) WHERE customer_id != '';

INSERT INTO company_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;
`;

const SEED_SQL = `
INSERT INTO products (id, name, category, supplier, rack_number, cost, price, stock, box_capacity, reorder_level, box_status, notes, image, status, last_phys_obs_stock, last_phys_box_status, last_phys_date, last_phys_user) VALUES
('p1', 'HB 3x10', 'Bolts', 'TVS Fasteners Ltd', 'A-01', 0.80, 1.50, 4200, 5000, 1000, 'Full', '', '', 'in-stock', 4200, 'Full', '2026-07-28', 'Tanishq Nain'),
('p2', 'HB 4x20', 'Bolts', 'Unbrako Industrial', 'A-02', 1.20, 2.50, 850, 5000, 900, 'Very Low', 'Fast moving', '', 'low-stock', NULL, NULL, NULL, NULL),
('p3', 'HB 5x30', 'Bolts', 'TVS Fasteners Ltd', 'A-03', 1.80, 3.50, 3100, 5000, 800, '75% Full', '', '', 'in-stock', NULL, NULL, NULL, NULL),
('p4', 'M8 Nut', 'Nuts', 'LPS Fasteners', 'B-01', 0.50, 1.00, 6800, 8000, 1500, '75% Full', '', '', 'in-stock', NULL, NULL, NULL, NULL),
('p5', 'M10 Nut', 'Nuts', 'APL Apollo', 'B-02', 0.80, 1.50, 0, 8000, 500, 'Empty', 'Urgent reorder needed', '', 'out-of-stock', 0, 'Empty', '2026-07-25', 'Tanishq Nain'),
('p6', 'M12 Nut', 'Nuts', 'LPS Fasteners', 'B-03', 1.20, 2.00, 2400, 4000, 600, '75% Full', '', '', 'in-stock', NULL, NULL, NULL, NULL),
('p7', 'M8 Washer', 'Washers', 'Sundaram Fasteners', 'C-01', 0.30, 0.75, 5200, 6000, 1000, '75% Full', '', '', 'in-stock', NULL, NULL, NULL, NULL),
('p8', 'M10 Washer', 'Washers', 'Sundaram Fasteners', 'C-02', 0.50, 1.00, 480, 6000, 800, 'Very Low', '', '', 'low-stock', 480, 'Very Low', '2026-07-20', 'Staff'),
('p9', 'CSK Screw M6x20', 'Screws', 'Panchscrew Industries', 'D-01', 0.60, 1.25, 3400, 4000, 800, '75% Full', '', '', 'in-stock', NULL, NULL, NULL, NULL),
('p10', 'CSK Screw M8x25', 'Screws', 'Panchscrew Industries', 'D-02', 0.90, 1.75, 2100, 4000, 600, 'Half', '', '', 'in-stock', NULL, NULL, NULL, NULL),
('p11', 'Allen Bolt M8x25', 'Bolts', 'Unbrako Industrial', 'A-04', 2.50, 4.50, 1800, 2000, 500, 'Half', 'Grade 12.9', '', 'in-stock', NULL, NULL, NULL, NULL),
('p12', 'Allen Bolt M10x30', 'Bolts', 'Unbrako Industrial', 'A-05', 3.80, 6.50, 640, 2000, 200, 'Very Low', '', '', 'low-stock', NULL, NULL, NULL, NULL),
('p13', 'Threaded Rod M12', 'Threaded Rods', 'TVS Fasteners Ltd', 'E-01', 45.00, 75.00, 320, 400, 100, '75% Full', '1 meter length', '', 'in-stock', NULL, NULL, NULL, NULL),
('p14', 'Threaded Rod M10', 'Threaded Rods', 'GKW Hardware', 'E-02', 38.00, 65.00, 75, 400, 80, 'Very Low', '', '', 'low-stock', NULL, NULL, NULL, NULL),
('p15', 'Anchor Bolt M10', 'Anchors', 'APL Apollo', 'F-01', 8.00, 15.00, 640, 1000, 200, 'Half', '', '', 'in-stock', NULL, NULL, NULL, NULL),
('p16', 'Rivet Nut M6', 'Fasteners', 'LPS Fasteners', 'G-01', 1.50, 3.00, 1800, 2000, 500, 'Half', '', '', 'in-stock', NULL, NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO customers (id, name, phone, gstin, address, notes) VALUES
('c1', 'Shree Balaji Hardware', '+91 98250 12345', '24ABCDE1234F1Z5', 'Shop 14, Hardware Market, Ahmedabad, Gujarat 380002', 'Prompt payer. Prefers UPI. Buys HB bolts and nuts in bulk.'),
('c2', 'Patel Construction Co.', '+91 99250 67890', '24FGHIJ5678K1Z2', 'Plot 22, Industrial Estate, Surat, Gujarat 395001', 'Large contractor. Often takes partial credit. Bulk threaded rod buyer.'),
('c3', 'Mahalaxmi Steel Works', '+91 98250 33221', '27KLMNO9012P1Z9', 'Steel Market, Howrah, West Bengal 711101', 'Monthly buyer. Needs delivery to Howrah.'),
('c4', 'Jai Bhavani Enterprises', '+91 98250 44556', '29QRSTU3456V1Z3', 'Shop 8, Gandhi Bazaar, Bengaluru, Karnataka 560004', 'Anchor bolt specialist. Pays on time.'),
('c5', 'Krishna Hardware Mart', '+91 99250 77889', '27WXYZA7890B1Z7', 'Cabinet Road, Mumbai, Maharashtra 400004', 'Wholesale only. Needs 30-day credit.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO suppliers (id, name, phone, gstin, address, notes) VALUES
('s1', 'TVS Fasteners Ltd', '+91 44 12345678', '33TVSFN1234A1Z5', 'No. 42, Industrial Corridor, Chennai, Tamil Nadu 600032', 'Primary bolt supplier. 7-day delivery. Best rates on HB bolts.'),
('s2', 'LPS Fasteners', '+91 22 98765432', '27LPSFN5678B1Z2', 'Unit 15, MIDC Area, Mumbai, Maharashtra 400093', 'Nut specialist. Good for bulk nut orders.'),
('s3', 'Unbrako Industrial', '+91 20 55667788', '27UNBRK9012C1Z9', 'Plot 7, Bhosari MIDC, Pune, Maharashtra 411026', 'Grade 12.9 bolts. Premium quality, higher price.'),
('s4', 'Sundaram Fasteners', '+91 44 22334455', '33SNDRM3456D1Z3', 'Chennai Industrial Park, Chennai, Tamil Nadu 600119', 'Washer supplier. Reliable delivery.'),
('s5', 'APL Apollo', '+91 11 66554433', '06APLAP7890E1Z7', 'Hisar Road, Bahadurgarh, Haryana 124507', 'Nuts and anchor bolts. Best price on M10 nuts.'),
('s6', 'Panchscrew Industries', '+91 755 99887766', '23PNCHR1234F1Z4', 'Industry House, Mandideep, Madhya Pradesh 462046', 'Screw specialist. Sometimes delays due to raw material.'),
('s7', 'GKW Hardware', '+91 33 22446688', '19GKWHW5678G1Z1', 'Howrah Industrial Zone, Howrah, West Bengal 711101', 'Threaded rods. Local to Howrah market.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO sales (id, invoice, customer, phone, date, item_count, subtotal, discount, gst_rate, gst_amount, grand_total, amount_paid, payment_method, status, channel) VALUES
('s1', 'INV-2041', 'Shree Balaji Hardware', '+91 98250 12345', '2026-08-02', 1500, 1625, 25, 18, 288, 1888, 1888, 'UPI', 'paid', 'wholesale'),
('s2', 'INV-2040', 'Walk-in Customer', '—', '2026-08-02', 100, 125, 0, 18, 22.50, 147.50, 147.50, 'Cash', 'paid', 'in-store'),
('s3', 'INV-2039', 'Patel Construction Co.', '+91 99250 67890', '2026-08-01', 220, 2000, 100, 18, 342, 2242, 1000, 'Card', 'partially-paid', 'wholesale'),
('s4', 'INV-2038', 'Mahalaxmi Steel Works', '+91 98250 33221', '2026-07-31', 3000, 3250, 50, 18, 576, 3776, 3776, 'UPI', 'paid', 'wholesale'),
('s5', 'INV-2037', 'Rahul Sharma', '+91 90990 11223', '2026-07-30', 50, 87.50, 0, 18, 15.75, 103.25, 0, 'Cash', 'pending', 'in-store'),
('s6', 'INV-2036', 'Walk-in Customer', '—', '2026-07-30', 300, 500, 0, 18, 90, 590, 590, 'Cash', 'paid', 'in-store'),
('s7', 'INV-2035', 'Jai Bhavani Enterprises', '+91 98250 44556', '2026-07-29', 500, 3750, 50, 18, 666, 4366, 4366, 'UPI', 'paid', 'wholesale'),
('s8', 'INV-2034', 'Krishna Hardware Mart', '+91 99250 77889', '2026-07-28', 10, 750, 0, 18, 135, 885, 0, 'Card', 'pending', 'online')
ON CONFLICT (id) DO NOTHING;

INSERT INTO sale_items (sale_id, product_id, name, price, qty, sort_order) VALUES
('s1', 'p1', 'HB 3x10', 1.50, 500, 0),
('s1', 'p4', 'M8 Nut', 1.00, 500, 1),
('s1', 'p7', 'M8 Washer', 0.75, 500, 2),
('s2', 'p9', 'CSK Screw M6x20', 1.25, 100, 0),
('s3', 'p13', 'Threaded Rod M12', 75.00, 20, 0),
('s3', 'p2', 'HB 4x20', 2.50, 200, 1),
('s4', 'p1', 'HB 3x10', 1.50, 1000, 0),
('s4', 'p4', 'M8 Nut', 1.00, 1000, 1),
('s4', 'p7', 'M8 Washer', 0.75, 1000, 2),
('s5', 'p10', 'CSK Screw M8x25', 1.75, 50, 0),
('s6', 'p16', 'Rivet Nut M6', 3.00, 100, 0),
('s6', 'p8', 'M10 Washer', 1.00, 200, 1),
('s7', 'p15', 'Anchor Bolt M10', 15.00, 200, 0),
('s7', 'p2', 'HB 4x20', 2.50, 300, 1),
('s8', 'p13', 'Threaded Rod M12', 75.00, 10, 0)
ON CONFLICT DO NOTHING;

INSERT INTO purchases (id, po_number, supplier, supplier_invoice, phone, date, expected_delivery, received_date, item_count, subtotal, gst_rate, gst_amount, grand_total, payment_status, payment_method, status, notes) VALUES
('po1', 'PO-3101', 'TVS Fasteners Ltd', 'TVS-INV-5521', '+91 44 12345678', '2026-08-01', '2026-08-05', '2026-08-01', 5200, 13000, 18, 2340, 15340, 'Paid', 'Bank Transfer', 'received', ''),
('po2', 'PO-3100', 'LPS Fasteners', 'LPS-2026-0890', '+91 22 98765432', '2026-07-30', '2026-08-08', NULL, 13000, 9500, 18, 1710, 11210, 'Pending', 'UPI', 'ordered', 'Awaiting delivery from Mumbai warehouse'),
('po3', 'PO-3099', 'Unbrako Industrial', 'UNB-77332', '+91 20 55667788', '2026-07-28', '2026-08-03', '2026-07-30', 5000, 8600, 18, 1548, 10148, 'Paid', 'Bank Transfer', 'received', ''),
('po4', 'PO-3098', 'Sundaram Fasteners', 'SF-44567', '+91 44 22334455', '2026-07-25', '2026-07-30', '2026-07-27', 15000, 5500, 18, 990, 6490, 'Paid', 'Cash', 'received', ''),
('po5', 'PO-3097', 'Panchscrew Industries', 'PSI-2026-334', '+91 755 99887766', '2026-07-22', '2026-07-29', NULL, 8000, 4800, 18, 864, 5664, 'Pending', 'Bank Transfer', 'ordered', 'Delayed — supplier awaiting raw material'),
('po6', 'PO-3096', 'APL Apollo', 'APL-118822', '+91 11 66554433', '2026-07-20', '2026-07-25', '2026-07-24', 7000, 20000, 18, 3600, 23600, 'Paid', 'Bank Transfer', 'received', '')
ON CONFLICT (id) DO NOTHING;

INSERT INTO purchase_items (purchase_id, product_id, name, cost, qty, gst_rate, sort_order) VALUES
('po1', 'p1', 'HB 3x10', 0.80, 5000, 18, 0),
('po1', 'p13', 'Threaded Rod M12', 45.00, 200, 18, 1),
('po2', 'p4', 'M8 Nut', 0.50, 10000, 18, 0),
('po2', 'p16', 'Rivet Nut M6', 1.50, 3000, 18, 1),
('po3', 'p2', 'HB 4x20', 1.20, 3000, 18, 0),
('po3', 'p11', 'Allen Bolt M8x25', 2.50, 2000, 18, 1),
('po4', 'p7', 'M8 Washer', 0.30, 10000, 18, 0),
('po4', 'p8', 'M10 Washer', 0.50, 5000, 18, 1),
('po5', 'p9', 'CSK Screw M6x20', 0.60, 8000, 18, 0),
('po6', 'p5', 'M10 Nut', 0.80, 5000, 18, 0),
('po6', 'p15', 'Anchor Bolt M10', 8.00, 2000, 18, 1)
ON CONFLICT DO NOTHING;

INSERT INTO verifications (id, product_id, date, user_name, remark, previous_estimate, observed_estimate, box_status) VALUES
('v1', 'p1', '2026-07-28', 'Tanishq Nain', 'Box nearly full after delivery', 3800, 4200, 'Full'),
('v2', 'p5', '2026-07-25', 'Tanishq Nain', 'Confirmed empty', 120, 0, 'Empty'),
('v3', 'p8', '2026-07-20', 'Staff', 'Less than half box left', 1200, 480, 'Very Low')
ON CONFLICT (id) DO NOTHING;
`;

async function migrateSchema(db: PGlite): Promise<void> {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS cheques (
        id text PRIMARY KEY,
        type text NOT NULL DEFAULT 'received',
        sale_id text NOT NULL DEFAULT '',
        purchase_id text NOT NULL DEFAULT '',
        customer_id text NOT NULL DEFAULT '',
        customer_name text NOT NULL DEFAULT '',
        supplier_id text NOT NULL DEFAULT '',
        supplier_name text NOT NULL DEFAULT '',
        invoice_number text NOT NULL DEFAULT '',
        cheque_number text NOT NULL,
        bank_name text NOT NULL,
        cheque_date text NOT NULL,
        amount numeric NOT NULL DEFAULT 0,
        status text NOT NULL DEFAULT 'pending_clearance',
        bounce_reason text NOT NULL DEFAULT '',
        bounce_date text NOT NULL DEFAULT '',
        notes text NOT NULL DEFAULT '',
        created_at timestamptz DEFAULT now()
      );
    `);
  } catch (err) {
    console.error('Error creating cheques table in migration:', err);
  }

  const migrations: { table: string; column: string; type: string; default?: string }[] = [
    { table: 'products', column: 'box_status_mode', type: 'text', default: "'auto'" },
    { table: 'products', column: 'manual_box_status', type: 'text', default: "'Empty'" },
    { table: 'products', column: 'size', type: 'text', default: "''" },
    { table: 'sales', column: 'discount_type', type: 'text', default: "'amount'" },
    { table: 'sales', column: 'customer_id', type: 'text', default: "''" },
    { table: 'sales', column: 'customer_gstin', type: 'text', default: "''" },
    { table: 'sales', column: 'customer_state', type: 'text', default: "''" },
    { table: 'sales', column: 'customer_state_code', type: 'text', default: "''" },
    { table: 'sales', column: 'gst_type', type: 'text', default: "'auto'" },
    { table: 'sales', column: 'cgst_amount', type: 'numeric', default: '0' },
    { table: 'sales', column: 'sgst_amount', type: 'numeric', default: '0' },
    { table: 'sales', column: 'igst_amount', type: 'numeric', default: '0' },
    { table: 'sales', column: 'document_type', type: 'text', default: "'TAX INVOICE'" },
    { table: 'sales', column: 'po_number', type: 'text', default: "''" },
    { table: 'sales', column: 'po_date', type: 'text', default: "''" },
    { table: 'sales', column: 'transport_mode', type: 'text', default: "''" },
    { table: 'sales', column: 'vehicle_number', type: 'text', default: "''" },
    { table: 'sales', column: 'eway_bill', type: 'text', default: "''" },
    { table: 'sales', column: 'vendor_code', type: 'text', default: "''" },
    { table: 'sales', column: 'bank_name', type: 'text', default: "''" },
    { table: 'sales', column: 'bank_account', type: 'text', default: "''" },
    { table: 'sales', column: 'bank_ifsc', type: 'text', default: "''" },
    { table: 'sales', column: 'seller_gstin', type: 'text', default: "''" },
    { table: 'sales', column: 'seller_pan', type: 'text', default: "''" },
    { table: 'sales', column: 'due_date', type: 'text', default: "''" },
    { table: 'sales', column: 'payment_terms', type: 'text', default: "''" },
    { table: 'sales', column: 'notes', type: 'text', default: "''" },
    { table: 'sales', column: 'cheque_no', type: 'text', default: "''" },
    { table: 'sales', column: 'cheque_bank', type: 'text', default: "''" },
    { table: 'sales', column: 'cheque_date', type: 'text', default: "''" },
    { table: 'sales', column: 'cheque_status', type: 'text', default: "''" },
    { table: 'sales', column: 'cheque_bounce_reason', type: 'text', default: "''" },
    { table: 'sales', column: 'cheque_bounce_date', type: 'text', default: "''" },
    { table: 'sales', column: 'pi_expiration_date', type: 'text', default: "''" },
    { table: 'sales', column: 'converted_from_pi_number', type: 'text', default: "''" },
    { table: 'sales', column: 'converted_from_po_number', type: 'text', default: "''" },
    { table: 'sales', column: 'expected_delivery_date', type: 'text', default: "''" },
    { table: 'sales', column: 'converted_to_invoice', type: 'text', default: "''" },
    { table: 'sales', column: 'converted_at', type: 'text', default: "''" },
    { table: 'purchases', column: 'due_date', type: 'text', default: "''" },
    { table: 'purchases', column: 'amount_paid', type: 'numeric', default: '0' },
    { table: 'purchases', column: 'cheque_no', type: 'text', default: "''" },
    { table: 'purchases', column: 'cheque_bank', type: 'text', default: "''" },
    { table: 'purchases', column: 'cheque_date', type: 'text', default: "''" },
    { table: 'purchases', column: 'cheque_status', type: 'text', default: "''" },
    { table: 'cheques', column: 'type', type: 'text', default: "'received'" },
    { table: 'cheques', column: 'purchase_id', type: 'text', default: "''" },
    { table: 'cheques', column: 'supplier_id', type: 'text', default: "''" },
    { table: 'cheques', column: 'supplier_name', type: 'text', default: "''" },
    { table: 'sale_items', column: 'cost', type: 'numeric', default: '0' },
    { table: 'sale_items', column: 'is_custom', type: 'boolean', default: 'false' },
    { table: 'sale_items', column: 'hsn_code', type: 'text', default: "''" },
    { table: 'sale_items', column: 'discount', type: 'numeric', default: '0' },
    { table: 'purchase_items', column: 'is_new_product', type: 'boolean', default: 'false' },
    { table: 'purchase_items', column: 'category', type: 'text', default: "''" },
    { table: 'purchase_items', column: 'rack_number', type: 'text', default: "''" },
    { table: 'purchase_items', column: 'size', type: 'text', default: "''" },
    { table: 'purchase_items', column: 'selling_price', type: 'numeric', default: '0' },
    { table: 'purchase_items', column: 'box_capacity', type: 'integer', default: '1000' },
    { table: 'purchase_items', column: 'reorder_level', type: 'integer', default: '100' },
    { table: 'purchase_items', column: 'hsn_code', type: 'text', default: "''" },
    { table: 'customers', column: 'business_name', type: 'text', default: "''" },
    { table: 'customers', column: 'email', type: 'text', default: "''" },
    { table: 'customers', column: 'state', type: 'text', default: "''" },
    { table: 'customers', column: 'state_code', type: 'text', default: "''" },
    { table: 'suppliers', column: 'contact_person', type: 'text', default: "''" },
    { table: 'suppliers', column: 'email', type: 'text', default: "''" },
    { table: 'suppliers', column: 'state', type: 'text', default: "''" },
    { table: 'suppliers', column: 'state_code', type: 'text', default: "''" },
  ];
  try {
    const { rows: colRows } = await db.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
    );
    const existingSet = new Set(colRows.map((r) => `${r.table_name}.${r.column_name}`));

    for (const m of migrations) {
      if (!existingSet.has(`${m.table}.${m.column}`)) {
        const sql = m.default
          ? `ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.type} NOT NULL DEFAULT ${m.default}`
          : `ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.type}`;
        try {
          await db.exec(sql);
        } catch {
          // Column might already exist or table doesn't exist yet — skip
        }
      }
    }
  } catch (err) {
    console.error('Error during schema column migration:', err);
  }
}

export async function getDb(): Promise<PGlite> {
  if (dbInstance) return dbInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Request persistent storage so the browser will never evict local customer & inventory data
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      try {
        await navigator.storage.persist();
      } catch {
        // Non-fatal if browser environment restricts storage.persist()
      }
    }

    const db = new PGlite('idb://nain-tools-db');
    await db.exec(SCHEMA_SQL);

    await migrateSchema(db);

    try {
      await populateRealInventory(db);
    } catch (err) {
      console.error('Error in populateRealInventory:', err);
      const { rows } = await db.query<{ count: string }>('SELECT COUNT(*)::text as count FROM products');
      if (parseInt(rows[0]?.count || '0', 10) === 0) {
        await db.exec(SEED_SQL);
      }
    }

    dbInstance = db;
    return db;
  })();

  return initPromise;
}

export async function getDbInfo(): Promise<{
  schemaVersion: string;
  appVersion: string;
  dbLocation: string;
  storageType: string;
}> {
  const db = await getDb();
  let schemaVersion = '1';
  let appVersion = '1.0.0';
  try {
    const { rows } = await db.query<{ value: string }>("SELECT value FROM _meta WHERE key = 'schema_version'");
    if (rows.length > 0) schemaVersion = rows[0].value;
    const { rows: rows2 } = await db.query<{ value: string }>("SELECT value FROM _meta WHERE key = 'app_version'");
    if (rows2.length > 0) appVersion = rows2[0].value;
  } catch {
    // _meta table might not exist in older databases
  }
  return {
    schemaVersion,
    appVersion,
    dbLocation: 'IndexedDB: nain-tools-db',
    storageType: 'PGlite (PostgreSQL WASM)',
  };
}

export async function verifyIntegrity(): Promise<{ ok: boolean; missingTables: string[] }> {
  const db = await getDb();
  const tables = ['products', 'customers', 'suppliers', 'sales', 'sale_items', 'purchases', 'purchase_items', 'verifications', '_meta'];
  const missing: string[] = [];
  for (const table of tables) {
    try {
      await db.query(`SELECT 1 FROM ${table} LIMIT 1`);
    } catch {
      missing.push(table);
    }
  }
  return { ok: missing.length === 0, missingTables: missing };
}
