import type { SaleRecord, PurchaseRecord } from '@/lib/types';
import { computeDiscountAmount } from '@/lib/constants';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const BUSINESS = {
  name: 'Nain Tools & Bolt Co.',
  address: 'Plot 42, GIDC Industrial Estate, Jamnagar, Gujarat 361004',
  phone: '+91 288 255 1234',
  email: 'sales@naintools.in',
  gstin: '24ABCDE1234F1Z5',
  pan: 'ABCDE1234F',
  bank: {
    name: 'HDFC Bank, Jamnagar Branch',
    account: '50200012345678',
    ifsc: 'HDFC0001234',
    branch: 'Jamnagar GIDC',
  },
};

function numberToWords(num: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function twoDigits(n: number): string {
    if (n < 20) return ones[n];
    return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  }
  function threeDigits(n: number): string {
    const h = Math.floor(n / 100);
    const r = n % 100;
    let str = '';
    if (h > 0) str += ones[h] + ' Hundred';
    if (r > 0) str += (h > 0 ? ' ' : '') + twoDigits(r);
    return str;
  }

  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);
  let words = '';

  if (rupees === 0) {
    words = 'Zero';
  } else {
    const crore = Math.floor(rupees / 10000000);
    const lakh = Math.floor((rupees % 10000000) / 100000);
    const thousand = Math.floor((rupees % 100000) / 1000);
    const remainder = rupees % 1000;

    if (crore > 0) words += threeDigits(crore) + ' Crore ';
    if (lakh > 0) words += threeDigits(lakh) + ' Lakh ';
    if (thousand > 0) words += threeDigits(thousand) + ' Thousand ';
    if (remainder > 0) words += threeDigits(remainder);
  }

  words = words.trim() + ' Rupees';
  if (paise > 0) words += ' and ' + twoDigits(paise) + ' Paise';
  words += ' Only';
  return words;
}

function buildInvoiceHTML(sale: SaleRecord): string {
  const discountAmt = computeDiscountAmount(sale.subtotal, sale.discount, sale.discountType);
  const taxableValue = sale.subtotal - discountAmt;
  const isIGST = false;
  const cgst = +(sale.gstAmount / 2).toFixed(2);
  const sgst = +(sale.gstAmount / 2).toFixed(2);

  const itemRows = sale.items
    .map((it, i) => {
      const lineTotal = it.price * it.qty;
      const itemTaxable = lineTotal;
      const itemCgst = +(itemTaxable * (sale.gstRate / 100) / 2).toFixed(2);
      const itemSgst = +(itemTaxable * (sale.gstRate / 100) / 2).toFixed(2);
      return `
      <tr>
        <td class="t-c">${i + 1}</td>
        <td class="t-l"><span class="item-name">${esc(it.name)}</span></td>
        <td class="t-c">7318</td>
        <td class="t-c">PCS</td>
        <td class="t-r">${it.qty}</td>
        <td class="t-r">${it.price.toFixed(2)}</td>
        <td class="t-r">${itemTaxable.toFixed(2)}</td>
        ${isIGST
          ? `<td class="t-r">${sale.gstRate}%</td><td class="t-r">${(itemCgst + itemSgst).toFixed(2)}</td><td class="t-r">${(itemTaxable + itemCgst + itemSgst).toFixed(2)}</td>`
          : `<td class="t-r">${sale.gstRate / 2}%</td><td class="t-r">${itemCgst.toFixed(2)}</td><td class="t-r">${sale.gstRate / 2}%</td><td class="t-r">${itemSgst.toFixed(2)}</td><td class="t-r">${(itemTaxable + itemCgst + itemSgst).toFixed(2)}</td>`
        }
      </tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(sale.invoice)} — ${BUSINESS.name}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; background: #e2e8f0; padding: 20px; }
  .invoice { max-width: 800px; margin: 0 auto; background: #fff; border-radius: 4px; overflow: hidden; box-shadow: 0 4px 24px rgba(15,23,42,.12); font-size: 12px; }
  .top-bar { height: 6px; background: linear-gradient(90deg, #152156, #1a52f5); }
  .header { padding: 24px 32px 20px; display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #152156; }
  .brand { display: flex; align-items: center; gap: 14px; }
  .brand-logo { width: 52px; height: 52px; background: #152156; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 800; color: #fff; letter-spacing: 1px; }
  .brand-name { font-size: 18px; font-weight: 700; color: #0f172a; }
  .brand-sub { font-size: 10px; color: #64748b; margin-top: 2px; }
  .brand-addr { font-size: 10px; color: #94a3b8; margin-top: 4px; line-height: 1.4; }
  .brand-contact { font-size: 10px; color: #94a3b8; margin-top: 2px; }
  .brand-gst { font-size: 10px; color: #475569; margin-top: 4px; font-weight: 600; }
  .invoice-box { text-align: right; }
  .invoice-title { font-size: 28px; font-weight: 800; color: #152156; letter-spacing: 2px; }
  .invoice-no { font-size: 13px; font-weight: 700; color: #1e293b; margin-top: 4px; }
  .invoice-date { font-size: 11px; color: #64748b; margin-top: 2px; }
  .parties { padding: 20px 32px; display: flex; gap: 24px; }
  .party { flex: 1; }
  .party-label { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #152156; font-weight: 700; margin-bottom: 4px; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; }
  .party-name { font-size: 13px; font-weight: 700; color: #0f172a; }
  .party-detail { font-size: 10px; color: #64748b; line-height: 1.5; margin-top: 2px; }
  .party-gst { font-size: 10px; color: #475569; font-weight: 600; margin-top: 3px; }
  .meta-row { padding: 0 32px 16px; display: flex; gap: 16px; }
  .meta-item { font-size: 10px; }
  .meta-label { color: #94a3b8; }
  .meta-value { font-weight: 600; color: #1e293b; }
  .table-wrap { padding: 0 32px; }
  table { width: 100%; border-collapse: collapse; }
  thead th { font-size: 9px; text-transform: uppercase; letter-spacing: .5px; color: #fff; background: #152156; padding: 8px 6px; }
  thead th.t-l { text-align: left; }
  thead th.t-c { text-align: center; }
  thead th.t-r { text-align: right; }
  tbody td { padding: 8px 6px; border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #334155; }
  tbody td.t-l { text-align: left; }
  tbody td.t-c { text-align: center; }
  tbody td.t-r { text-align: right; }
  .item-name { font-weight: 600; color: #0f172a; }
  tfoot td { padding: 8px 6px; font-size: 11px; font-weight: 600; color: #1e293b; border-top: 2px solid #152156; background: #f1f5f9; }
  .totals { padding: 16px 32px; display: flex; justify-content: flex-end; }
  .totals-table { width: 300px; }
  .totals-table td { padding: 5px 8px; font-size: 11px; }
  .totals-table .label { color: #64748b; text-align: left; }
  .totals-table .value { text-align: right; font-weight: 600; color: #1e293b; }
  .totals-table .grand td { border-top: 2px solid #152156; padding-top: 8px; font-size: 14px; font-weight: 800; color: #152156; }
  .words-row { padding: 8px 32px 16px; }
  .words-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 8px 12px; font-size: 10px; color: #475569; }
  .words-label { font-weight: 700; color: #152156; }
  .bank-section { padding: 0 32px 16px; display: flex; gap: 24px; }
  .bank-box { flex: 1; border: 1px solid #e2e8f0; border-radius: 4px; padding: 10px 14px; }
  .bank-title { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #152156; font-weight: 700; margin-bottom: 6px; }
  .bank-row { font-size: 10px; color: #64748b; line-height: 1.6; }
  .bank-row strong { color: #1e293b; }
  .terms-box { flex: 1; }
  .terms-title { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #152156; font-weight: 700; margin-bottom: 4px; }
  .terms-text { font-size: 9px; color: #94a3b8; line-height: 1.6; }
  .sign-row { padding: 16px 32px 24px; display: flex; justify-content: space-between; align-items: flex-end; }
  .sign-box { text-align: center; }
  .sign-label { font-size: 10px; color: #64748b; }
  .sign-line { border-top: 1px solid #cbd5e1; width: 140px; margin-top: 32px; padding-top: 4px; }
  .sign-name { font-size: 11px; font-weight: 700; color: #1e293b; }
  .footer { padding: 12px 32px; background: #f1f5f9; text-align: center; border-top: 1px solid #e2e8f0; }
  .footer-text { font-size: 9px; color: #94a3b8; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 4px; font-size: 10px; font-weight: 600; }
  .badge-paid { background: #d1fae5; color: #047857; }
  .badge-pending { background: #fef3c7; color: #d97706; }
  .badge-overdue { background: #fee2e2; color: #dc2626; }
  @media print {
    body { padding: 0; background: #fff; }
    .invoice { box-shadow: none; max-width: 100%; border-radius: 0; }
    @page { margin: 12mm; size: A4 portrait; }
  }
</style>
</head>
<body>
  <div class="invoice">
    <div class="top-bar"></div>
    <div class="header">
      <div class="brand">
        <div class="brand-logo">NT</div>
        <div>
          <div class="brand-name">${BUSINESS.name}</div>
          <div class="brand-sub">Stainless Steel Fastener Specialists</div>
          <div class="brand-addr">${BUSINESS.address}</div>
          <div class="brand-contact">Ph: ${BUSINESS.phone} &nbsp;|&nbsp; ${BUSINESS.email}</div>
          <div class="brand-gst">GSTIN: ${BUSINESS.gstin} &nbsp;|&nbsp; PAN: ${BUSINESS.pan}</div>
        </div>
      </div>
      <div class="invoice-box">
        <div class="invoice-title">TAX INVOICE</div>
        <div class="invoice-no">Invoice No: ${esc(sale.invoice)}</div>
        <div class="invoice-date">Date: ${esc(sale.date)}</div>
        <div style="margin-top:6px;"><span class="badge ${sale.status === 'paid' ? 'badge-paid' : sale.status === 'cancelled' ? 'badge-overdue' : 'badge-pending'}">${esc(sale.status.toUpperCase())}</span></div>
      </div>
    </div>

    <div class="parties">
      <div class="party">
        <div class="party-label">Bill To</div>
        <div class="party-name">${esc(sale.customer)}</div>
        <div class="party-detail">${esc(sale.phone)}</div>
        <div class="party-gst">GSTIN: —</div>
      </div>
      <div class="party">
        <div class="party-label">Ship To</div>
        <div class="party-name">${esc(sale.customer)}</div>
        <div class="party-detail">Same as Billing Address</div>
      </div>
    </div>

    <div class="meta-row">
      <div class="meta-item"><span class="meta-label">Payment Method: </span><span class="meta-value">${esc(sale.paymentMethod)}</span></div>
      <div class="meta-item"><span class="meta-label">Channel: </span><span class="meta-value">${esc(sale.channel)}</span></div>
      ${sale.status !== 'paid' && sale.status !== 'cancelled' && sale.status !== 'draft' ? `<div class="meta-item"><span class="meta-label">Amount Paid: </span><span class="meta-value">₹${sale.amountPaid.toFixed(2)}</span></div><div class="meta-item"><span class="meta-label">Balance Due: </span><span class="meta-value" style="color:#dc2626;">₹${(sale.grandTotal - sale.amountPaid).toFixed(2)}</span></div>` : ''}
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="t-c" style="width:30px;">#</th>
            <th class="t-l">Description of Goods</th>
            <th class="t-c" style="width:50px;">HSN</th>
            <th class="t-c" style="width:45px;">Unit</th>
            <th class="t-r" style="width:50px;">Qty</th>
            <th class="t-r" style="width:70px;">Rate</th>
            <th class="t-r" style="width:80px;">Taxable</th>
            ${isIGST
              ? `<th class="t-r" style="width:50px;">IGST%</th><th class="t-r" style="width:60px;">IGST Amt</th><th class="t-r" style="width:80px;">Total</th>`
              : `<th class="t-r" style="width:45px;">CGST%</th><th class="t-r" style="width:55px;">CGST</th><th class="t-r" style="width:45px;">SGST%</th><th class="t-r" style="width:55px;">SGST</th><th class="t-r" style="width:80px;">Total</th>`
            }
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          <tr>
            <td class="t-r" colspan="4">Total</td>
            <td class="t-r">${sale.items.reduce((s, it) => s + it.qty, 0)}</td>
            <td></td>
            <td class="t-r">${taxableValue.toFixed(2)}</td>
            ${isIGST
              ? `<td></td><td class="t-r">${sale.gstAmount.toFixed(2)}</td><td class="t-r">${sale.grandTotal.toFixed(2)}</td>`
              : `<td></td><td class="t-r">${cgst.toFixed(2)}</td><td></td><td class="t-r">${sgst.toFixed(2)}</td><td class="t-r">${sale.grandTotal.toFixed(2)}</td>`
            }
          </tr>
        </tfoot>
      </table>
    </div>

    <div class="totals">
      <table class="totals-table">
        <tr><td class="label">Subtotal</td><td class="value">₹${sale.subtotal.toFixed(2)}</td></tr>
        ${discountAmt > 0 ? `<tr><td class="label">Discount${sale.discountType === 'percent' ? ` (${sale.discount}%)` : ''}</td><td class="value" style="color:#dc2626;">−₹${discountAmt.toFixed(2)}</td></tr>` : ''}
        <tr><td class="label">Taxable Value</td><td class="value">₹${taxableValue.toFixed(2)}</td></tr>
        ${isIGST
          ? `<tr><td class="label">IGST (${sale.gstRate}%)</td><td class="value">₹${sale.gstAmount.toFixed(2)}</td></tr>`
          : `<tr><td class="label">CGST (${sale.gstRate / 2}%)</td><td class="value">₹${cgst.toFixed(2)}</td></tr><tr><td class="label">SGST (${sale.gstRate / 2}%)</td><td class="value">₹${sgst.toFixed(2)}</td></tr>`
        }
        <tr class="grand"><td class="label">Grand Total</td><td class="value">₹${sale.grandTotal.toFixed(2)}</td></tr>
      </table>
    </div>

    <div class="words-row">
      <div class="words-box">
        <span class="words-label">Amount in Words: </span>${numberToWords(sale.grandTotal)}
      </div>
    </div>

    <div class="bank-section">
      <div class="bank-box">
        <div class="bank-title">Bank Details</div>
        <div class="bank-row"><strong>Bank:</strong> ${BUSINESS.bank.name}</div>
        <div class="bank-row"><strong>A/C No:</strong> ${BUSINESS.bank.account}</div>
        <div class="bank-row"><strong>IFSC:</strong> ${BUSINESS.bank.ifsc}</div>
        <div class="bank-row"><strong>Branch:</strong> ${BUSINESS.bank.branch}</div>
      </div>
      <div class="bank-box">
        <div class="terms-title">Terms &amp; Conditions</div>
        <div class="terms-text">
          1. Goods once sold will not be taken back or exchanged.<br/>
          2. All disputes are subject to Jamnagar jurisdiction.<br/>
          3. Payment is due within 30 days of invoice date.<br/>
          4. Interest at 18% p.a. will be charged on overdue payments.
        </div>
      </div>
    </div>

    <div class="sign-row">
      <div class="sign-box">
        <div class="sign-label">Receiver's Signature</div>
        <div class="sign-line"></div>
      </div>
      <div class="sign-box">
        <div class="sign-label">For ${BUSINESS.name}</div>
        <div class="sign-line"></div>
        <div class="sign-name">Authorised Signatory</div>
      </div>
    </div>

    <div class="footer">
      <div class="footer-text">This is a computer-generated invoice and does not require a physical seal. | ${BUSINESS.name} | ${BUSINESS.phone} | ${BUSINESS.email}</div>
    </div>
  </div>
  <script>window.onload = () => { setTimeout(() => window.print(), 200); };</script>
</body>
</html>`;
}

export function printInvoice(sale: SaleRecord) {
  const win = window.open('', '_blank', 'width=820,height=900');
  if (!win) return;
  win.document.write(buildInvoiceHTML(sale));
  win.document.close();
}

function buildPurchaseHTML(po: PurchaseRecord): string {
  const itemRows = po.items
    .map((it, i) => {
      const lineTotal = it.cost * it.qty;
      return `
      <tr>
        <td class="t-c">${i + 1}</td>
        <td class="t-l"><span class="item-name">${esc(it.name)}</span></td>
        <td class="t-c">7318</td>
        <td class="t-c">PCS</td>
        <td class="t-r">${it.qty}</td>
        <td class="t-r">${it.cost.toFixed(2)}</td>
        <td class="t-r">${lineTotal.toFixed(2)}</td>
      </tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${po.poNumber} — ${BUSINESS.name}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; background: #e2e8f0; padding: 20px; }
  .invoice { max-width: 800px; margin: 0 auto; background: #fff; border-radius: 4px; overflow: hidden; box-shadow: 0 4px 24px rgba(15,23,42,.12); font-size: 12px; }
  .top-bar { height: 6px; background: linear-gradient(90deg, #0f3a2e, #0d9488); }
  .header { padding: 24px 32px 20px; display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f3a2e; }
  .brand { display: flex; align-items: center; gap: 14px; }
  .brand-logo { width: 52px; height: 52px; background: #0f3a2e; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 800; color: #fff; }
  .brand-name { font-size: 18px; font-weight: 700; color: #0f172a; }
  .brand-sub { font-size: 10px; color: #64748b; margin-top: 2px; }
  .brand-addr { font-size: 10px; color: #94a3b8; margin-top: 4px; line-height: 1.4; }
  .brand-contact { font-size: 10px; color: #94a3b8; margin-top: 2px; }
  .brand-gst { font-size: 10px; color: #475569; margin-top: 4px; font-weight: 600; }
  .invoice-box { text-align: right; }
  .invoice-title { font-size: 28px; font-weight: 800; color: #0f3a2e; letter-spacing: 2px; }
  .invoice-no { font-size: 13px; font-weight: 700; color: #1e293b; margin-top: 4px; }
  .invoice-date { font-size: 11px; color: #64748b; margin-top: 2px; }
  .parties { padding: 20px 32px; display: flex; gap: 24px; }
  .party { flex: 1; }
  .party-label { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #0f3a2e; font-weight: 700; margin-bottom: 4px; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; }
  .party-name { font-size: 13px; font-weight: 700; color: #0f172a; }
  .party-detail { font-size: 10px; color: #64748b; line-height: 1.5; margin-top: 2px; }
  .meta-row { padding: 0 32px 16px; display: flex; gap: 16px; flex-wrap: wrap; }
  .meta-item { font-size: 10px; }
  .meta-label { color: #94a3b8; }
  .meta-value { font-weight: 600; color: #1e293b; }
  .table-wrap { padding: 0 32px; }
  table { width: 100%; border-collapse: collapse; }
  thead th { font-size: 9px; text-transform: uppercase; letter-spacing: .5px; color: #fff; background: #0f3a2e; padding: 8px 6px; }
  thead th.t-l { text-align: left; }
  thead th.t-c { text-align: center; }
  thead th.t-r { text-align: right; }
  tbody td { padding: 8px 6px; border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #334155; }
  tbody td.t-l { text-align: left; }
  tbody td.t-c { text-align: center; }
  tbody td.t-r { text-align: right; }
  .item-name { font-weight: 600; color: #0f172a; }
  tfoot td { padding: 8px 6px; font-size: 11px; font-weight: 600; color: #1e293b; border-top: 2px solid #0f3a2e; background: #f1f5f9; }
  .totals { padding: 16px 32px; display: flex; justify-content: flex-end; }
  .totals-table { width: 280px; }
  .totals-table td { padding: 5px 8px; font-size: 11px; }
  .totals-table .label { color: #64748b; text-align: left; }
  .totals-table .value { text-align: right; font-weight: 600; color: #1e293b; }
  .totals-table .grand td { border-top: 2px solid #0f3a2e; padding-top: 8px; font-size: 14px; font-weight: 800; color: #0f3a2e; }
  .sign-row { padding: 16px 32px 24px; display: flex; justify-content: space-between; align-items: flex-end; }
  .sign-box { text-align: center; }
  .sign-label { font-size: 10px; color: #64748b; }
  .sign-line { border-top: 1px solid #cbd5e1; width: 140px; margin-top: 32px; padding-top: 4px; }
  .sign-name { font-size: 11px; font-weight: 700; color: #1e293b; }
  .footer { padding: 12px 32px; background: #f1f5f9; text-align: center; border-top: 1px solid #e2e8f0; }
  .footer-text { font-size: 9px; color: #94a3b8; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 4px; font-size: 10px; font-weight: 600; }
  .badge-paid { background: #d1fae5; color: #047857; }
  .badge-pending { background: #fef3c7; color: #d97706; }
  @media print {
    body { padding: 0; background: #fff; }
    .invoice { box-shadow: none; max-width: 100%; border-radius: 0; }
    @page { margin: 12mm; size: A4 portrait; }
  }
</style>
</head>
<body>
  <div class="invoice">
    <div class="top-bar"></div>
    <div class="header">
      <div class="brand">
        <div class="brand-logo">NT</div>
        <div>
          <div class="brand-name">${BUSINESS.name}</div>
          <div class="brand-sub">Stainless Steel Fastener Specialists</div>
          <div class="brand-addr">${BUSINESS.address}</div>
          <div class="brand-contact">Ph: ${BUSINESS.phone} &nbsp;|&nbsp; ${BUSINESS.email}</div>
          <div class="brand-gst">GSTIN: ${BUSINESS.gstin} &nbsp;|&nbsp; PAN: ${BUSINESS.pan}</div>
        </div>
      </div>
      <div class="invoice-box">
        <div class="invoice-title">PURCHASE ORDER</div>
        <div class="invoice-no">PO No: ${po.poNumber}</div>
        <div class="invoice-date">Date: ${po.date}</div>
        <div style="margin-top:6px;"><span class="badge ${po.paymentStatus === 'Paid' ? 'badge-paid' : 'badge-pending'}">${po.paymentStatus.toUpperCase()}</span></div>
      </div>
    </div>

    <div class="parties">
      <div class="party">
        <div class="party-label">Supplier</div>
        <div class="party-name">${esc(po.supplier)}</div>
        <div class="party-detail">${esc(po.phone)}</div>
      </div>
      <div class="party">
        <div class="party-label">Ship To</div>
        <div class="party-name">${BUSINESS.name}</div>
        <div class="party-detail">${BUSINESS.address}</div>
      </div>
    </div>

    <div class="meta-row">
      <div class="meta-item"><span class="meta-label">Supplier Invoice: </span><span class="meta-value">${esc(po.supplierInvoice) || '—'}</span></div>
      <div class="meta-item"><span class="meta-label">Expected Delivery: </span><span class="meta-value">${esc(po.expectedDelivery) || '—'}</span></div>
      <div class="meta-item"><span class="meta-label">Payment Method: </span><span class="meta-value">${esc(po.paymentMethod)}</span></div>
      ${po.receivedDate ? `<div class="meta-item"><span class="meta-label">Received: </span><span class="meta-value">${esc(po.receivedDate)}</span></div>` : ''}
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="t-c" style="width:30px;">#</th>
            <th class="t-l">Description of Goods</th>
            <th class="t-c" style="width:50px;">HSN</th>
            <th class="t-c" style="width:45px;">Unit</th>
            <th class="t-r" style="width:50px;">Qty</th>
            <th class="t-r" style="width:70px;">Rate</th>
            <th class="t-r" style="width:80px;">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          <tr>
            <td class="t-r" colspan="4">Total</td>
            <td class="t-r">${po.items.reduce((s, it) => s + it.qty, 0)}</td>
            <td></td>
            <td class="t-r">${po.subtotal.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div class="totals">
      <table class="totals-table">
        <tr><td class="label">Subtotal</td><td class="value">₹${po.subtotal.toFixed(2)}</td></tr>
        <tr><td class="label">GST (${po.gstRate}%)</td><td class="value">₹${po.gstAmount.toFixed(2)}</td></tr>
        <tr class="grand"><td class="label">Grand Total</td><td class="value">₹${po.grandTotal.toFixed(2)}</td></tr>
      </table>
    </div>

    ${po.notes ? `<div style="padding:0 32px 16px;font-size:10px;color:#64748b;"><strong>Notes:</strong> ${esc(po.notes)}</div>` : ''}

    <div class="sign-row">
      <div class="sign-box">
        <div class="sign-label">Supplier's Signature</div>
        <div class="sign-line"></div>
      </div>
      <div class="sign-box">
        <div class="sign-label">For ${BUSINESS.name}</div>
        <div class="sign-line"></div>
        <div class="sign-name">Authorised Signatory</div>
      </div>
    </div>

    <div class="footer">
      <div class="footer-text">This is a computer-generated purchase order. | ${BUSINESS.name} | ${BUSINESS.phone} | ${BUSINESS.email}</div>
    </div>
  </div>
  <script>window.onload = () => { setTimeout(() => window.print(), 200); };</script>
</body>
</html>`;
}

export function printPurchase(po: PurchaseRecord) {
  const win = window.open('', '_blank', 'width=820,height=900');
  if (!win) return;
  win.document.write(buildPurchaseHTML(po));
  win.document.close();
}
