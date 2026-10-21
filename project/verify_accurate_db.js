import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';

async function verify() {
  const buffer = fs.readFileSync('public/migrated-db.tar.gz');
  const blob = new Blob([buffer]);
  console.log('Testing restore from updated tarball. Size:', (blob.size / 1024 / 1024).toFixed(2), 'MB');
  const db = new PGlite({ loadDataDir: blob });

  const s = await db.query('SELECT count(*) FROM sales;');
  const p = await db.query('SELECT count(*) FROM products;');
  const c = await db.query('SELECT count(*) FROM customers;');
  const po = await db.query('SELECT count(*) FROM purchases;');
  const chqs = await db.query('SELECT count(*) FROM cheques;');

  const rec = await db.query(`
    SELECT firm_id, SUM(grand_total - amount_paid) AS pending_receivables
    FROM sales
    WHERE status != 'paid'
    GROUP BY firm_id
    ORDER BY firm_id;
  `);

  const pay = await db.query(`
    SELECT firm_id, SUM(grand_total - amount_paid) AS pending_payables
    FROM purchases
    WHERE payment_status = 'Pending'
    GROUP BY firm_id
    ORDER BY firm_id;
  `);

  const topCust = await db.query(`
    SELECT customer, SUM(grand_total - amount_paid) AS total_pending, COUNT(*) AS pending_bills
    FROM sales
    WHERE status != 'paid'
    GROUP BY customer
    ORDER BY total_pending DESC
    LIMIT 6;
  `);

  const topSupp = await db.query(`
    SELECT supplier, SUM(grand_total - amount_paid) AS total_pending, COUNT(*) AS pending_bills
    FROM purchases
    WHERE payment_status = 'Pending'
    GROUP BY supplier
    ORDER BY total_pending DESC
    LIMIT 6;
  `);

  console.log('\n=== REAL-WORLD VERIFICATION RESULTS ===');
  console.log('Total Sales Invoices:', s.rows[0].count);
  console.log('Total Products:', p.rows[0].count);
  console.log('Total Customers:', c.rows[0].count);
  console.log('Total Purchases:', po.rows[0].count);
  console.log('Total Cheques:', chqs.rows[0].count);
  console.log('\nPending Customer Receivables by Firm:');
  for (const r of rec.rows) {
    const firmName = r.firm_id === 1 ? 'NAIN TOOLS & SS BOLT CO.' : 'NR FASTNER';
    console.log(`  Firm ${r.firm_id} (${firmName}): Rs. ${Number(r.pending_receivables).toLocaleString('en-IN')}`);
  }
  console.log('\nPending Supplier Payables by Firm:');
  for (const r of pay.rows) {
    const firmName = r.firm_id === 1 ? 'NAIN TOOLS & SS BOLT CO.' : 'NR FASTNER';
    console.log(`  Firm ${r.firm_id} (${firmName}): Rs. ${Number(r.pending_payables).toLocaleString('en-IN')}`);
  }
  console.log('\nTop Customers with Real Pending Receivables:');
  for (const r of topCust.rows) {
    console.log(`  ${r.customer} : Rs. ${Number(r.total_pending).toLocaleString('en-IN')} (${r.pending_bills} pending bills)`);
  }
  console.log('\nTop Suppliers with Real Pending Payables:');
  for (const r of topSupp.rows) {
    console.log(`  ${r.supplier} : Rs. ${Number(r.total_pending).toLocaleString('en-IN')} (${r.pending_bills} pending bills)`);
  }
}

verify().catch(console.error);
