import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';

async function buildDump() {
  console.log('Starting PGlite database build in Node...');
  const db = new PGlite();

  // Read schema
  const dbTs = fs.readFileSync('src/lib/db.ts', 'utf8');
  const schemaMatch = dbTs.match(/const SCHEMA_SQL = `([\s\S]*?)`;/);
  if (!schemaMatch) throw new Error('Schema not found');
  await db.exec(schemaMatch[1]);
  console.log('Base schema created.');

  // Apply migrations
  await db.exec(`
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
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS firm_code text NOT NULL DEFAULT 'NT1';
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS tag_color text NOT NULL DEFAULT 'brand';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS firm_id integer NOT NULL DEFAULT 1;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS firm_id integer NOT NULL DEFAULT 1;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS box_status_mode text NOT NULL DEFAULT 'auto';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS manual_box_status text NOT NULL DEFAULT 'Empty';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS size text NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount_type text NOT NULL DEFAULT 'amount';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_id text NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_gstin text NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_state text NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_state_code text NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS gst_type text NOT NULL DEFAULT 'auto';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS cgst_amount numeric NOT NULL DEFAULT 0;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS sgst_amount numeric NOT NULL DEFAULT 0;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS igst_amount numeric NOT NULL DEFAULT 0;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'TAX INVOICE';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS po_number text NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS po_date text NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS transport_mode text NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS vehicle_number text NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS eway_bill text NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS vendor_code text NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS bank_name text NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS bank_account text NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS bank_ifsc text NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS seller_gstin text NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS seller_pan text NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS due_date text NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_terms text NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS cheque_no text NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS cheque_bank text NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS cheque_date text NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS cheque_status text NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS cheque_bounce_reason text NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS cheque_bounce_date text NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS pi_expiration_date text NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS converted_from_pi_number text NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS converted_from_po_number text NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS expected_delivery_date text NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS converted_to_invoice text NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS converted_at text NOT NULL DEFAULT '';
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS due_date text NOT NULL DEFAULT '';
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS cheque_no text NOT NULL DEFAULT '';
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS cheque_bank text NOT NULL DEFAULT '';
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS cheque_date text NOT NULL DEFAULT '';
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS cheque_status text NOT NULL DEFAULT '';
    ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS cost numeric NOT NULL DEFAULT 0;
    ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS is_custom boolean NOT NULL DEFAULT false;
    ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS hsn_code text NOT NULL DEFAULT '';
    ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0;
    ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS is_new_product boolean NOT NULL DEFAULT false;
    ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '';
    ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS rack_number text NOT NULL DEFAULT '';
    ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS size text NOT NULL DEFAULT '';
    ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS selling_price numeric NOT NULL DEFAULT 0;
    ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS box_capacity integer NOT NULL DEFAULT 1000;
    ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS reorder_level integer NOT NULL DEFAULT 100;
    ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS hsn_code text NOT NULL DEFAULT '';
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS business_name text NOT NULL DEFAULT '';
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT '';
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS state_code text NOT NULL DEFAULT '';
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_person text NOT NULL DEFAULT '';
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT '';
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS state_code text NOT NULL DEFAULT '';
  `);
  console.log('Schema migrations applied.');

  let jsonText = fs.readFileSync('public/nain-tools-backup-migrated.json', 'utf8');
  if (jsonText.charCodeAt(0) === 0xFEFF) jsonText = jsonText.slice(1);
  const p = JSON.parse(jsonText);
  const data = p.data;

  const insertOrder = ['company_settings', 'categories', 'products', 'customers', 'suppliers', 'sales', 'sale_items', 'purchases', 'purchase_items'];
  
  await db.exec('BEGIN;');
  await db.exec('DELETE FROM company_settings;');

  for (const table of insertOrder) {
    const rows = data[table];
    if (!rows || rows.length === 0) continue;
    console.log(`Inserting ${rows.length} rows into ${table}...`);

    const columnSet = new Set();
    for (const r of rows) {
      if (r && typeof r === 'object') {
        for (const k of Object.keys(r)) columnSet.add(k);
      }
    }
    const columns = Array.from(columnSet);
    const colList = columns.join(', ');

    const chunkSize = 50;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const valueClauses = [];
      const allParams = [];
      let paramIdx = 1;

      for (const row of chunk) {
        const placeholders = [];
        for (const col of columns) {
          placeholders.push(`$${paramIdx++}`);
          let val = row[col];
          if (col === 'item_count' && (val === null || val === undefined)) val = 1;
          if ((col === 'subtotal' || col === 'grand_total' || col === 'amount_paid' || col === 'gst_amount' || col === 'cgst_amount' || col === 'sgst_amount' || col === 'igst_amount' || col === 'discount' || col === 'cost' || col === 'price' || col === 'selling_price' || col === 'stock' || col === 'box_capacity' || col === 'reorder_level') && (val === null || val === undefined)) val = 0;
          if (col === 'qty' && (val === null || val === undefined)) val = 1;
          if (col === 'firm_id' && (val === null || val === undefined)) val = 1;
          if (val === undefined) val = null;
          allParams.push(val);
        }
        valueClauses.push(`(${placeholders.join(', ')})`);
      }

      await db.query(
        `INSERT INTO ${table} (${colList}) VALUES ${valueClauses.join(', ')}`,
        allParams
      );
    }
    console.log(`Table ${table} inserted successfully!`);
  }

  await db.exec(`
    INSERT INTO _meta (key, value) VALUES ('excel_inventory_imported', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true';
    INSERT INTO _meta (key, value) VALUES ('disable_demo_seed', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true';
    INSERT INTO _meta (key, value) VALUES ('migrated_data_imported', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true';
    INSERT INTO _meta (key, value) VALUES ('data_wipe_executed', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true';
  `);

  await db.exec('COMMIT;');
  console.log('All 80,000+ records committed.');

  console.log('Dumping complete PGlite data directory to compressed tarball...');
  const blob = await db.dumpDataDir();
  const buffer = Buffer.from(await blob.arrayBuffer());
  const outPath = 'public/migrated-db.tar.gz';
  fs.writeFileSync(outPath, buffer);
  console.log(`SUCCESS! Dump saved to ${outPath} (${(buffer.length / (1024 * 1024)).toFixed(2)} MB)`);
}

buildDump().catch(console.error);
