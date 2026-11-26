import type {
  Customer,
  Supplier,
  SaleRecord,
  PurchaseRecord,
  ChequeRecord,
  CompanySettings,
} from '@/lib/types';
import { resolveBusinessDetails } from '@/components/PrintableInvoice';
import { money } from '@/utils/analytics';

function esc(s: unknown): string {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface CustomerLedgerEntry {
  id: string;
  date: string;
  voucherType: string;
  refNo: string;
  particulars: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

export interface CustomerLedgerData {
  partyType?: 'customer' | 'supplier';
  customer: Customer & { contactPerson?: string };
  fromDate: string;
  toDate: string;
  periodLabel: string;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  entries: CustomerLedgerEntry[];
  cheques: ChequeRecord[];
}

export function buildCustomerLedgerData(
  customer: Customer,
  sales: SaleRecord[],
  cheques: ChequeRecord[],
  options?: { fromDate?: string; toDate?: string; periodLabel?: string },
): CustomerLedgerData {
  const fromDate = (options?.fromDate || '').trim();
  const toDate = (options?.toDate || '').trim();
  const normCustName = customer.name.trim().toLowerCase();

  // Chronological matching customer vouchers excluding drafts, cancelled, and supplier bills
  const matchingSales = sales
    .filter((s) => {
      if (s.status === 'draft' || s.status === 'cancelled') return false;
      if (s.documentType === 'PURCHASE BILL' || s.documentType === 'CREDIT NOTE' || s.documentType === 'PROFORMA INVOICE') {
        return false;
      }
      const matchId = Boolean(s.customerId && s.customerId === customer.id);
      const matchName = Boolean(normCustName && s.customer && s.customer.trim().toLowerCase() === normCustName);
      return matchId || matchName;
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.invoice.localeCompare(b.invoice));

  const matchingCheques = cheques
    .filter((c) => {
      const matchId = Boolean(c.customerId && c.customerId === customer.id);
      const matchName = Boolean(normCustName && c.customerName && c.customerName.trim().toLowerCase() === normCustName);
      return matchId || matchName;
    })
    .sort((a, b) => a.chequeDate.localeCompare(b.chequeDate));

  let openingBalance = 0;
  let running = 0;
  let totalDebit = 0;
  let totalCredit = 0;
  const entries: CustomerLedgerEntry[] = [];

  for (const s of matchingSales) {
    const dt = (s.date || '').slice(0, 10);
    const debitAmt = Number(s.grandTotal) || 0;
    const creditAmt = Number(s.amountPaid) || 0;

    if (fromDate && dt < fromDate) {
      openingBalance += debitAmt - creditAmt;
      continue;
    }
    if (toDate && dt > toDate) continue;

    if (entries.length === 0 && Math.abs(openingBalance) > 0.005) {
      running = openingBalance;
    }

    // 1. Invoice / Debit entry
    running += debitAmt;
    totalDebit += debitAmt;
    const docLabel =
      s.documentType === 'DEBIT NOTE'
        ? 'Debit Note'
        : s.documentType === 'PURCHASE ORDER'
        ? 'Sales Order'
        : 'Tax Invoice';

    entries.push({
      id: `${s.id}-dr`,
      date: dt,
      voucherType: docLabel,
      refNo: s.invoice,
      particulars: `${docLabel} #${s.invoice} (${s.itemCount} item${s.itemCount === 1 ? '' : 's'}${s.poNumber ? `, PO: ${s.poNumber}` : ''})`,
      debit: debitAmt,
      credit: 0,
      runningBalance: running,
    });

    // 2. Payment / Receipt entry (if paid in part or full)
    if (creditAmt > 0.005) {
      running -= creditAmt;
      totalCredit += creditAmt;
      entries.push({
        id: `${s.id}-cr`,
        date: dt,
        voucherType: 'Receipt',
        refNo: s.invoice,
        particulars: `Payment Received (${s.paymentMethod || 'Cash'}) agst #${s.invoice}`,
        debit: 0,
        credit: creditAmt,
        runningBalance: running,
      });
    }
  }

  // Handle case when all transactions fell strictly before fromDate
  if (entries.length === 0) {
    running = openingBalance;
  }

  const periodLabel =
    options?.periodLabel ||
    (fromDate || toDate ? `${fromDate || 'Beginning'} to ${toDate || 'Today'}` : 'All Dates');

  return {
    partyType: 'customer',
    customer,
    fromDate,
    toDate,
    periodLabel,
    openingBalance: +openingBalance.toFixed(2),
    totalDebit: +totalDebit.toFixed(2),
    totalCredit: +totalCredit.toFixed(2),
    closingBalance: +running.toFixed(2),
    entries,
    cheques: matchingCheques,
  };
}

/**
 * Builds chronological Supplier Account Ledger combining Purchase Orders (purchases)
 * and GST Purchase Bills / Credit Notes (sales store), plus issued cheques.
 */
export function buildSupplierLedgerData(
  supplier: Supplier,
  purchases: PurchaseRecord[],
  sales: SaleRecord[],
  cheques: ChequeRecord[],
  options?: { fromDate?: string; toDate?: string; periodLabel?: string },
): CustomerLedgerData {
  const fromDate = (options?.fromDate || '').trim();
  const toDate = (options?.toDate || '').trim();
  const normSupName = supplier.name.trim().toLowerCase();

  type RawSupplierTxn = {
    id: string;
    date: string;
    refNo: string;
    voucherType: string;
    particulars: string;
    creditAmt: number;
    debitAmt: number;
  };

  const txns: RawSupplierTxn[] = [];

  for (const p of purchases) {
    if (p.status === 'cancelled') continue;
    if (!p.supplier || p.supplier.trim().toLowerCase() !== normSupName) continue;
    const billed = Number(p.grandTotal) || 0;
    const paid = p.paymentStatus === 'Paid' ? billed : 0;
    const ref = p.poNumber;
    const extra = p.supplierInvoice ? ` · Inv: ${p.supplierInvoice}` : '';
    txns.push({
      id: `po-${p.id}`,
      date: (p.date || '').slice(0, 10),
      refNo: ref,
      voucherType: p.status === 'received' ? 'Purchase Bill / PO' : 'Purchase Order',
      particulars: `${p.status === 'received' ? 'Goods Received' : 'PO Ordered'} #${ref} (${p.itemCount} item${p.itemCount === 1 ? '' : 's'}${extra})`,
      creditAmt: billed,
      debitAmt: paid,
    });
  }

  for (const s of sales) {
    if (s.status === 'draft' || s.status === 'cancelled') continue;
    const isSupDoc = s.documentType === 'PURCHASE BILL' || s.documentType === 'CREDIT NOTE';
    if (!isSupDoc) continue;
    const matchId = Boolean(s.customerId && s.customerId === supplier.id);
    const matchName = Boolean(normSupName && s.customer && s.customer.trim().toLowerCase() === normSupName);
    if (!matchId && !matchName) continue;

    const total = Number(s.grandTotal) || 0;
    const paid = Number(s.amountPaid) || 0;
    if (s.documentType === 'CREDIT NOTE') {
      txns.push({
        id: `pb-${s.id}`,
        date: (s.date || '').slice(0, 10),
        refNo: s.invoice,
        voucherType: 'Credit Note',
        particulars: `Credit Note / Return #${s.invoice}`,
        creditAmt: 0,
        debitAmt: total,
      });
    } else {
      txns.push({
        id: `pb-${s.id}`,
        date: (s.date || '').slice(0, 10),
        refNo: s.invoice,
        voucherType: 'Purchase Bill',
        particulars: `Purchase Bill #${s.invoice} (${s.itemCount} item${s.itemCount === 1 ? '' : 's'}${s.poNumber ? `, Ref: ${s.poNumber}` : ''})`,
        creditAmt: total,
        debitAmt: paid,
      });
    }
  }

  txns.sort((a, b) => a.date.localeCompare(b.date) || a.refNo.localeCompare(b.refNo));

  const matchingCheques = cheques
    .filter(
      (c) =>
        (c.supplierId && c.supplierId === supplier.id) ||
        (normSupName && (c.supplierName || '').trim().toLowerCase() === normSupName) ||
        (normSupName && (c.customerName || '').trim().toLowerCase() === normSupName),
    )
    .sort((a, b) => a.chequeDate.localeCompare(b.chequeDate));

  let openingBalance = 0;
  let running = 0;
  let totalDebit = 0;
  let totalCredit = 0;
  const entries: CustomerLedgerEntry[] = [];

  for (const t of txns) {
    if (fromDate && t.date < fromDate) {
      openingBalance += t.creditAmt - t.debitAmt;
      continue;
    }
    if (toDate && t.date > toDate) continue;

    if (entries.length === 0 && Math.abs(openingBalance) > 0.005) {
      running = openingBalance;
    }

    if (t.creditAmt > 0.005) {
      running += t.creditAmt;
      totalCredit += t.creditAmt;
      entries.push({
        id: `${t.id}-cr`,
        date: t.date,
        voucherType: t.voucherType,
        refNo: t.refNo,
        particulars: t.particulars,
        debit: 0,
        credit: t.creditAmt,
        runningBalance: running,
      });
    }

    if (t.debitAmt > 0.005) {
      running -= t.debitAmt;
      totalDebit += t.debitAmt;
      entries.push({
        id: `${t.id}-dr`,
        date: t.date,
        voucherType: t.voucherType === 'Credit Note' ? 'Credit Note' : 'Payment Made',
        refNo: t.refNo,
        particulars:
          t.voucherType === 'Credit Note' ? t.particulars : `Payment Made agst #${t.refNo}`,
        debit: t.debitAmt,
        credit: 0,
        runningBalance: running,
      });
    }
  }

  if (entries.length === 0) {
    running = openingBalance;
  }

  const periodLabel =
    options?.periodLabel ||
    (fromDate || toDate ? `${fromDate || 'Beginning'} to ${toDate || 'Today'}` : 'All Dates');

  return {
    partyType: 'supplier',
    customer: {
      id: supplier.id,
      name: supplier.name,
      businessName: supplier.contactPerson && supplier.contactPerson !== supplier.name ? `Attn: ${supplier.contactPerson}` : '',
      contactPerson: supplier.contactPerson,
      phone: supplier.phone || '',
      gstin: supplier.gstin || '',
      email: supplier.email || '',
      address: supplier.address || '',
      state: supplier.state || '',
      stateCode: supplier.stateCode || '',
      notes: supplier.notes || '',
    },
    fromDate,
    toDate,
    periodLabel,
    openingBalance: +openingBalance.toFixed(2),
    totalDebit: +totalDebit.toFixed(2),
    totalCredit: +totalCredit.toFixed(2),
    closingBalance: +running.toFixed(2),
    entries,
    cheques: matchingCheques,
  };
}

function fmtBal(val: number, partyType: 'customer' | 'supplier' = 'customer'): string {
  const abs = money(Math.abs(val));
  if (Math.abs(val) < 0.01) return `${money(0)}`;
  if (partyType === 'supplier') {
    return val >= 0 ? `${abs} Cr` : `${abs} Dr`;
  }
  return val >= 0 ? `${abs} Dr` : `${abs} Cr`;
}

export function buildCustomerLedgerHTML(
  ledger: CustomerLedgerData,
  cs?: CompanySettings | null,
  autoPrint = true,
): string {
  const biz = resolveBusinessDetails(cs);
  const generatedOn = new Date().toISOString().slice(0, 10);
  const pType = ledger.partyType === 'supplier' ? 'supplier' : 'customer';
  const isSupplier = pType === 'supplier';

  const rowsHtml = [
    ...(Math.abs(ledger.openingBalance) > 0.005 || ledger.fromDate
      ? [
          `<tr style="background:#f8fafc; font-weight:700;">
            <td>${esc(ledger.fromDate || 'Opening')}</td>
            <td>Opening</td>
            <td>—</td>
            <td>Opening Balance Brought Forward (b/f)</td>
            <td class="num">—</td>
            <td class="num">—</td>
            <td class="num">${esc(fmtBal(ledger.openingBalance, pType))}</td>
          </tr>`,
        ]
      : []),
    ...ledger.entries.map(
      (row) => `
      <tr>
        <td>${esc(row.date)}</td>
        <td>${esc(row.voucherType)}</td>
        <td style="font-family:monospace; font-weight:600;">${esc(row.refNo)}</td>
        <td>${esc(row.particulars)}</td>
        <td class="num" style="${isSupplier && row.debit > 0 ? 'color:#047857; font-weight:600;' : ''}">${row.debit > 0 ? esc(money(row.debit)) : '—'}</td>
        <td class="num" style="${!isSupplier && row.credit > 0 ? 'color:#047857; font-weight:600;' : ''}">${row.credit > 0 ? esc(money(row.credit)) : '—'}</td>
        <td class="num" style="font-weight:700;">${esc(fmtBal(row.runningBalance, pType))}</td>
      </tr>`,
    ),
  ].join('\n');

  const chequesHtml =
    ledger.cheques.length > 0
      ? `
    <div style="margin-top:14px;">
      <div class="section-title">Cheques / Post-Dated Instruments Summary</div>
      <table>
        <thead>
          <tr>
            <th>Cheque #</th>
            <th>Bank Name</th>
            <th>Cheque Date</th>
            <th>Invoice Ref</th>
            <th class="num">Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${ledger.cheques
            .map(
              (c) => `
            <tr>
              <td style="font-family:monospace; font-weight:700;">#${esc(c.chequeNumber)}</td>
              <td>${esc(c.bankName)}</td>
              <td>${esc(c.chequeDate)}</td>
              <td>${esc(c.invoiceNumber || '—')}</td>
              <td class="num">${esc(money(c.amount))}</td>
              <td>${esc(c.status.replace('_', ' ').toUpperCase())}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>`
      : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Ledger — ${esc(ledger.customer.name)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; background: #fff; padding: 14px; font-size: 11px; line-height: 1.35; }
  .ledger-container { max-width: 820px; margin: 0 auto; background: #fff; border: 1.5px solid #0f172a; }
  .header { padding: 12px 16px; border-bottom: 1.5px solid #0f172a; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  .biz-name { font-size: 18px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.4px; }
  .biz-meta { font-size: 10px; color: #334155; margin-top: 2px; }
  .doc-badge { text-align: right; }
  .doc-title { font-size: 13px; font-weight: 900; text-transform: uppercase; background: #0f3a2e; color: #fff; padding: 5px 10px; border-radius: 4px; display: inline-block; }
  .doc-sub { font-size: 10px; color: #334155; margin-top: 4px; font-weight: 600; }
  .party-bar { padding: 10px 16px; border-bottom: 1px solid #cbd5e1; background: #f8fafc; display: flex; justify-content: space-between; gap: 16px; }
  .party-name { font-size: 13px; font-weight: 800; text-transform: uppercase; }
  .party-meta { font-size: 10px; color: #475569; margin-top: 2px; }
  .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); border-bottom: 1.5px solid #0f172a; }
  .sum-cell { padding: 8px 12px; border-right: 1px solid #cbd5e1; }
  .sum-cell:last-child { border-right: none; background: #fffbeb; }
  .sum-lbl { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b; }
  .sum-val { font-size: 13px; font-weight: 900; margin-top: 2px; font-family: monospace; }
  .section-title { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #334155; padding: 6px 12px 4px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f1f5f9; border-bottom: 1px solid #0f172a; border-right: 1px solid #cbd5e1; padding: 6px 8px; font-size: 10px; font-weight: 800; text-align: left; }
  th:last-child, td:last-child { border-right: none; }
  td { border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; padding: 5px 8px; font-size: 10px; vertical-align: top; }
  th.num, td.num { text-align: right; font-family: monospace; white-space: nowrap; }
  .totals-row td { background: #f1f5f9; font-weight: 900; border-top: 1.5px solid #0f172a; border-bottom: 1.5px solid #0f172a; font-size: 11px; }
  .footer-bar { padding: 10px 16px; display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; border-top: 1px solid #cbd5e1; }
  .bank-box { font-size: 9.5px; color: #334155; }
  .sign-box { text-align: right; font-size: 10px; font-weight: 700; }
  @media print {
    body { padding: 0; }
    .ledger-container { max-width: 100%; }
    @page { margin: 10mm; size: A4 portrait; }
  }
</style>
</head>
<body>
  <div class="ledger-container">
    <div class="header">
      <div>
        <div class="biz-name">${esc(biz.name)}</div>
        <div class="biz-meta">${esc(biz.address)}</div>
        <div class="biz-meta">Ph: ${esc(biz.phone)}${biz.email ? ` | Email: ${esc(biz.email)}` : ''}</div>
        <div class="biz-meta"><strong>GSTIN: ${esc(biz.gstin)}</strong> | PAN: ${esc(biz.pan)}</div>
      </div>
      <div class="doc-badge">
        <div class="doc-title">${isSupplier ? 'Supplier Ledger Statement' : 'Customer Ledger Statement'}</div>
        <div class="doc-sub">Period: ${esc(ledger.periodLabel)}</div>
        <div class="doc-sub">Statement Date: ${esc(generatedOn)}</div>
      </div>
    </div>

    <div class="party-bar">
      <div>
        <div style="font-size:9px; font-weight:700; color:#64748b; text-transform:uppercase;">Account Holder / ${isSupplier ? 'Supplier' : 'Customer'}</div>
        <div class="party-name">${esc(ledger.customer.name)}</div>
        ${ledger.customer.businessName && ledger.customer.businessName !== ledger.customer.name ? `<div class="party-meta">${esc(ledger.customer.businessName)}</div>` : ''}
        ${ledger.customer.address ? `<div class="party-meta">${esc(ledger.customer.address)}</div>` : ''}
      </div>
      <div style="text-align:right;">
        ${ledger.customer.phone ? `<div class="party-meta"><strong>Phone:</strong> ${esc(ledger.customer.phone)}</div>` : ''}
        ${ledger.customer.email ? `<div class="party-meta"><strong>Email:</strong> ${esc(ledger.customer.email)}</div>` : ''}
        ${ledger.customer.gstin ? `<div class="party-meta"><strong>GSTIN:</strong> <span style="font-family:monospace;">${esc(ledger.customer.gstin)}</span></div>` : ''}
      </div>
    </div>

    <div class="summary-grid">
      <div class="sum-cell">
        <div class="sum-lbl">Opening Balance</div>
        <div class="sum-val">${esc(fmtBal(ledger.openingBalance, pType))}</div>
      </div>
      <div class="sum-cell">
        <div class="sum-lbl">${isSupplier ? 'Total Purchased (Cr)' : 'Total Billed (Dr)'}</div>
        <div class="sum-val">${esc(money(isSupplier ? ledger.totalCredit : ledger.totalDebit))}</div>
      </div>
      <div class="sum-cell">
        <div class="sum-lbl">${isSupplier ? 'Total Paid (Dr)' : 'Total Received (Cr)'}</div>
        <div class="sum-val" style="color:#047857;">${esc(money(isSupplier ? ledger.totalDebit : ledger.totalCredit))}</div>
      </div>
      <div class="sum-cell">
        <div class="sum-lbl">${isSupplier ? 'Closing Balance Payable' : 'Closing Balance Due'}</div>
        <div class="sum-val" style="color:${ledger.closingBalance > 0.01 ? '#b45309' : '#047857'};">${esc(fmtBal(ledger.closingBalance, pType))}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:78px;">Date</th>
          <th style="width:82px;">Type</th>
          <th style="width:105px;">Ref No.</th>
          <th>Particulars</th>
          <th class="num" style="width:92px;">Debit (₹)</th>
          <th class="num" style="width:92px;">Credit (₹)</th>
          <th class="num" style="width:105px;">Balance</th>
        </tr>
      </thead>
      <tbody>
        ${
          rowsHtml ||
          `<tr><td colspan="7" style="text-align:center; padding:18px; color:#64748b;">No ledger transactions recorded for this period.</td></tr>`
        }
        <tr class="totals-row">
          <td colspan="4" style="text-align:right;">TOTALS FOR PERIOD (${esc(ledger.periodLabel)}):</td>
          <td class="num">${esc(money(ledger.totalDebit))}</td>
          <td class="num" style="${!isSupplier ? 'color:#047857;' : ''}">${esc(money(ledger.totalCredit))}</td>
          <td class="num">${esc(fmtBal(ledger.closingBalance, pType))}</td>
        </tr>
      </tbody>
    </table>

    ${chequesHtml}

    <div class="footer-bar">
      <div class="bank-box">
        <strong>Payment / Bank Details (NEFT / RTGS / IMPS):</strong><br/>
        Bank: ${esc(biz.bank.name)} (${esc(biz.bank.branch)}) | A/C: ${esc(biz.bank.account)} | IFSC: ${esc(biz.bank.ifsc)}
      </div>
      <div class="sign-box">
        For ${esc(biz.name)}<br/><br/>
        Authorized Signatory
      </div>
    </div>
  </div>
  ${autoPrint ? `<script>window.onload=function(){window.print();}</script>` : ''}
</body>
</html>`;
}

export function printCustomerLedger(ledger: CustomerLedgerData, cs?: CompanySettings | null): void {
  const html = buildCustomerLedgerHTML(ledger, cs, true);
  const w = window.open('', '_blank', 'width=940,height=760');
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}
