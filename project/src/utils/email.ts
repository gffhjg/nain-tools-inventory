import type { SaleRecord, PurchaseRecord, CompanySettings } from '@/lib/types';
import { computeDiscountAmount } from '@/lib/constants';
import { money } from '@/utils/analytics';
import { resolveBusinessDetails, buildInvoiceHTML, buildPurchaseHTML } from '@/components/PrintableInvoice';
import type { CustomerLedgerData } from '@/components/PrintableLedger';

export interface EmailJSConfig {
  serviceId: string;
  templateId: string;
  publicKey: string;
}

const EMAILJS_STORAGE_KEY = 'nain_emailjs_config';

export function getEmailJSConfig(): EmailJSConfig {
  try {
    const raw = localStorage.getItem(EMAILJS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        serviceId: parsed.serviceId || '',
        templateId: parsed.templateId || '',
        publicKey: parsed.publicKey || '',
      };
    }
  } catch {}
  return { serviceId: '', templateId: '', publicKey: '' };
}

export function saveEmailJSConfig(cfg: EmailJSConfig): void {
  try {
    localStorage.setItem(EMAILJS_STORAGE_KEY, JSON.stringify(cfg));
  } catch {}
}

export function isEmailJSConfigured(cfg?: EmailJSConfig): boolean {
  const c = cfg || getEmailJSConfig();
  return Boolean(c.serviceId.trim() && c.templateId.trim() && c.publicKey.trim());
}

/**
 * Generates clean email subject & itemized plain-text body for any Sale/Proforma/PO/DebitNote/PurchaseBill.
 */
export function buildSaleEmailData(
  sale: SaleRecord,
  cs?: CompanySettings | null,
): { subject: string; body: string } {
  const biz = resolveBusinessDetails(cs);
  const docType = sale.documentType || 'TAX INVOICE';
  const docTitle =
    docType === 'PROFORMA INVOICE'
      ? 'Proforma Invoice / Quote'
      : docType === 'PURCHASE ORDER'
      ? 'Purchase Order Confirmation'
      : docType === 'DEBIT NOTE'
      ? 'Debit Note'
      : docType === 'CREDIT NOTE'
      ? 'Credit Note'
      : docType === 'PURCHASE BILL'
      ? 'Purchase Bill'
      : 'Tax Invoice';

  const subject = `${docTitle} #${sale.invoice} from ${biz.name} (${money(sale.grandTotal)})`;

  const discAmt = computeDiscountAmount(sale.subtotal, sale.discount, sale.discountType);
  const freightAmt = sale.freightCharges || 0;
  const taxableVal = Math.max(0, sale.subtotal - discAmt + freightAmt);
  const isCentral = sale.gstType === 'igst';
  const dueBal = Math.max(0, sale.grandTotal - (sale.amountPaid || 0));

  const lines: string[] = [
    `Dear ${sale.customer || 'Sir/Madam'},`,
    '',
    `Please find below the details of your ${docTitle} from ${biz.name}:`,
    '',
    `Document No : ${sale.invoice}`,
    `Date        : ${sale.date}`,
    ...(sale.poNumber ? [`PO Ref      : ${sale.poNumber}${sale.poDate ? ` (Dated ${sale.poDate})` : ''}`] : []),
    `Total Amount: ${money(sale.grandTotal)}`,
    ...(docType === 'TAX INVOICE'
      ? [
          dueBal > 0.5
            ? `Payment Status: Pending / Partial (Paid: ${money(sale.amountPaid || 0)} | Balance Due: ${money(dueBal)})`
            : `Payment Status: Paid in Full (${sale.paymentMethod || 'Cash'})`,
        ]
      : []),
    ...(sale.piExpirationDate && docType === 'PROFORMA INVOICE'
      ? [`Valid Until : ${sale.piExpirationDate}`]
      : []),
    '',
    '------------------------------------------------------------',
    'ITEMIZED DETAILS:',
    '------------------------------------------------------------',
  ];

  sale.items.forEach((it, idx) => {
    const netUnit =
      typeof it.discount === 'number' && it.discount > 0
        ? it.discountType === 'amount'
          ? Math.max(0, it.price - it.discount / Math.max(1, it.qty))
          : it.price * (1 - it.discount / 100)
        : it.price;
    const lineTotal = +(netUnit * it.qty).toFixed(2);
    lines.push(
      `${idx + 1}. ${it.name}${it.hsnCode ? ` [HSN: ${it.hsnCode}]` : ''}`,
      `   Qty: ${it.qty} PCS  x  Rate: ₹${netUnit.toFixed(2)}  =  ₹${lineTotal.toFixed(2)}`
    );
  });

  lines.push('------------------------------------------------------------');
  lines.push(`Subtotal       : ${money(sale.subtotal)}`);
  if (discAmt > 0) lines.push(`Discount       : -${money(discAmt)}`);
  if (freightAmt > 0) lines.push(`Freight        : ${money(freightAmt)}`);
  lines.push(`Taxable Amount : ${money(taxableVal)}`);
  if (sale.gstAmount > 0) {
    if (isCentral) {
      lines.push(`IGST (${sale.gstRate || 18}%)   : ${money(sale.igstAmount || sale.gstAmount)}`);
    } else {
      const half = (sale.gstRate || 18) / 2;
      lines.push(`CGST (${half}%)     : ${money(sale.cgstAmount || +(sale.gstAmount / 2).toFixed(2))}`);
      lines.push(`SGST (${half}%)     : ${money(sale.sgstAmount || +(sale.gstAmount / 2).toFixed(2))}`);
    }
  }
  lines.push(`GRAND TOTAL    : ${money(sale.grandTotal)}`);
  lines.push('------------------------------------------------------------');
  lines.push('');
  lines.push('Bank Details for NEFT / RTGS / IMPS:');
  lines.push(`Bank   : ${biz.bank.name} (${biz.bank.branch})`);
  lines.push(`A/C No : ${biz.bank.account}`);
  lines.push(`IFSC   : ${biz.bank.ifsc}`);
  lines.push('');
  lines.push('Warm regards,');
  lines.push(biz.name);
  lines.push(`GSTIN: ${biz.gstin} | Ph: ${biz.phone}`);
  if (biz.email) lines.push(`Email: ${biz.email}`);

  return { subject, body: lines.join('\n') };
}

/**
 * Generates clean email subject & body for Purchase Order / Purchase Bill sent to a supplier.
 */
export function buildPurchaseEmailData(
  po: PurchaseRecord,
  cs?: CompanySettings | null,
): { subject: string; body: string } {
  const biz = resolveBusinessDetails(cs);
  const billNo = po.poNumber.startsWith('PO-') ? 'PB-' + po.poNumber.slice(3) : po.poNumber;
  const isReceived = po.status === 'received';
  const docLabel = isReceived ? 'Purchase Bill' : 'Purchase Order';

  const subject = `${docLabel} #${billNo} from ${biz.name} (${money(po.grandTotal)})`;

  const lines: string[] = [
    `Dear ${po.supplier || 'Supplier'},`,
    '',
    `Please find below our ${docLabel} details from ${biz.name}:`,
    '',
    `Reference No     : ${billNo}`,
    ...(po.supplierInvoice ? [`Supplier Inv No  : ${po.supplierInvoice}`] : []),
    `Date             : ${po.date}`,
    ...(po.expectedDelivery ? [`Expected Delivery: ${po.expectedDelivery}`] : []),
    `Status           : ${po.status.toUpperCase()} (${po.paymentStatus})`,
    '',
    '------------------------------------------------------------',
    'ORDER / BILL ITEMS:',
    '------------------------------------------------------------',
  ];

  po.items.forEach((it, idx) => {
    const lineTotal = +(it.cost * it.qty).toFixed(2);
    lines.push(
      `${idx + 1}. ${it.name}${it.hsnCode ? ` [HSN: ${it.hsnCode}]` : ''}`,
      `   Qty: ${it.qty} PCS  x  Rate: ₹${it.cost.toFixed(2)}  =  ₹${lineTotal.toFixed(2)}`
    );
  });

  lines.push('------------------------------------------------------------');
  lines.push(`Subtotal       : ${money(po.subtotal)}`);
  if (po.gstAmount > 0) lines.push(`GST (${po.gstRate}%)      : ${money(po.gstAmount)}`);
  lines.push(`GRAND TOTAL    : ${money(po.grandTotal)}`);
  lines.push('------------------------------------------------------------');
  if (po.notes) {
    lines.push('');
    lines.push(`Notes: ${po.notes}`);
  }
  lines.push('');
  lines.push('Shipping & Billing Address:');
  lines.push(biz.name);
  lines.push(biz.address);
  lines.push(`GSTIN: ${biz.gstin} | Ph: ${biz.phone}`);

  return { subject, body: lines.join('\n') };
}

/**
 * Generates payment reminder email subject & body.
 */
export function buildReminderEmailData(
  customerName: string,
  amountDue: number,
  invoiceNumber?: string,
  cs?: CompanySettings | null,
): { subject: string; body: string } {
  const biz = resolveBusinessDetails(cs);
  const subject = invoiceNumber
    ? `Payment Reminder: Invoice #${invoiceNumber} (${money(amountDue)} Due) — ${biz.name}`
    : `Account Statement & Payment Reminder (${money(amountDue)} Due) — ${biz.name}`;

  const body = [
    `Dear ${customerName},`,
    '',
    `This is a polite reminder regarding your pending balance with ${biz.name}.`,
    '',
    ...(invoiceNumber ? [`Invoice Number : ${invoiceNumber}`] : []),
    `Pending Balance: ${money(amountDue)}`,
    '',
    'Please arrange payment at your earliest convenience via NEFT / RTGS / IMPS / UPI:',
    `Bank   : ${biz.bank.name} (${biz.bank.branch})`,
    `A/C No : ${biz.bank.account}`,
    `IFSC   : ${biz.bank.ifsc}`,
    '',
    'Kindly ignore if payment has already been processed.',
    '',
    'Thank you for your business!',
    biz.name,
    `Ph: ${biz.phone}`,
  ].join('\n');

  return { subject, body };
}

/**
 * Generates clean email subject & optional itemized ledger text summary for a Customer Account Ledger.
 */
export function buildLedgerEmailData(
  ledger: CustomerLedgerData,
  cs?: CompanySettings | null,
): { subject: string; body: string } {
  const biz = resolveBusinessDetails(cs);
  const isSupplier = ledger.partyType === 'supplier';
  const balTxt =
    Math.abs(ledger.closingBalance) < 0.01
      ? money(0)
      : isSupplier
      ? ledger.closingBalance > 0
        ? `${money(ledger.closingBalance)} Cr`
        : `${money(Math.abs(ledger.closingBalance))} Dr`
      : ledger.closingBalance > 0
      ? `${money(ledger.closingBalance)} Dr`
      : `${money(Math.abs(ledger.closingBalance))} Cr`;

  const partyKind = isSupplier ? 'Supplier Account Ledger' : 'Customer Account Ledger';
  const subject = `${partyKind} (${ledger.periodLabel}) — ${ledger.customer.name} | ${biz.name}`;

  const lines: string[] = [
    `Dear ${ledger.customer.name},`,
    '',
    `Please find attached your ${partyKind} Statement PDF (${ledger.periodLabel}) from ${biz.name}.`,
    '',
    `Opening Balance    : ${money(Math.abs(ledger.openingBalance))}`,
    ...(isSupplier
      ? [
          `Total Purchased (Cr): ${money(ledger.totalCredit)}`,
          `Total Paid (Dr)     : ${money(ledger.totalDebit)}`,
          `Closing Balance     : ${balTxt}`,
        ]
      : [
          `Total Billed (Dr)   : ${money(ledger.totalDebit)}`,
          `Total Paid (Cr)     : ${money(ledger.totalCredit)}`,
          `Closing Balance     : ${balTxt}`,
        ]),
    '',
    '------------------------------------------------------------',
    'LEDGER TRANSACTIONS SUMMARY:',
    '------------------------------------------------------------',
  ];

  ledger.entries.forEach((e) => {
    const amt = e.debit > 0 ? `Dr ${money(e.debit)}` : `Cr ${money(e.credit)}`;
    const balSide = isSupplier
      ? e.runningBalance >= 0
        ? 'Cr'
        : 'Dr'
      : e.runningBalance >= 0
      ? 'Dr'
      : 'Cr';
    lines.push(`${e.date} | ${e.voucherType} #${e.refNo} | ${amt} | Bal: ${money(Math.abs(e.runningBalance))} ${balSide}`);
  });

  lines.push('------------------------------------------------------------');
  lines.push('');
  lines.push(`Bank: ${biz.bank.name} (${biz.bank.branch}) | A/C: ${biz.bank.account} | IFSC: ${biz.bank.ifsc}`);
  lines.push('');
  lines.push('Warm regards,');
  lines.push(biz.name);
  lines.push(`Ph: ${biz.phone}`);

  return { subject, body: lines.join('\n') };
}

/**
 * Builds a safe mailto: URL capping body length so OS mail clients don't fail silently.
 */
export function buildMailtoUrl(to: string, subject: string, body: string): { url: string; truncated: boolean } {
  const maxBodyChars = 1500;
  let finalBody = body;
  let truncated = false;
  if (body.length > maxBodyChars) {
    finalBody =
      body.slice(0, maxBodyChars) +
      '\n\n... [Full itemized bill copied to your clipboard — press Ctrl+V to paste complete details]';
    truncated = true;
  }
  const url = `mailto:${encodeURIComponent(to.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(finalBody)}`;
  return { url, truncated };
}

/**
 * Builds a Gmail Web Compose URL.
 */
export function buildGmailComposeUrl(to: string, subject: string, body: string): { url: string; truncated: boolean } {
  const maxBodyChars = 5500;
  let finalBody = body;
  let truncated = false;
  if (body.length > maxBodyChars) {
    finalBody =
      body.slice(0, maxBodyChars) +
      '\n\n... [Full itemized bill copied to clipboard — press Ctrl+V if any bottom lines were trimmed]';
    truncated = true;
  }
  const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to.trim())}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(finalBody)}`;
  return { url, truncated };
}

/**
 * Downloads a clean standalone HTML bill file suitable for attaching to an email.
 */
export function downloadBillHTMLForEmail(
  mode: 'sale' | 'purchase',
  record: SaleRecord | PurchaseRecord,
  cs?: CompanySettings | null,
): string {
  const html =
    mode === 'sale'
      ? buildInvoiceHTML(record as SaleRecord, ['Original For Recipient'], cs, false)
      : buildPurchaseHTML(record as PurchaseRecord, cs, false);

  const docNo =
    mode === 'sale'
      ? (record as SaleRecord).invoice
      : (record as PurchaseRecord).poNumber;
  const safeName = docNo.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${safeName}_Bill.html`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return filename;
}

/**
 * Sends email automatically in-background using user-configured EmailJS keys.
 */
export async function sendViaEmailJS(params: {
  toEmail: string;
  toName: string;
  subject: string;
  messageText: string;
  messageHtml?: string;
  fromName?: string;
  replyTo?: string;
  config?: EmailJSConfig;
}): Promise<void> {
  const cfg = params.config || getEmailJSConfig();
  if (!isEmailJSConfigured(cfg)) {
    throw new Error('EmailJS credentials are not configured yet.');
  }

  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: cfg.serviceId.trim(),
      template_id: cfg.templateId.trim(),
      user_id: cfg.publicKey.trim(),
      template_params: {
        to_email: params.toEmail.trim(),
        to_name: params.toName,
        from_name: params.fromName || 'Nain Tools & Bolt Co.',
        reply_to: params.replyTo || '',
        subject: params.subject,
        message: params.messageText,
        message_html: params.messageHtml || params.messageText.replace(/\n/g, '<br/>'),
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`EmailJS failed (${res.status}): ${errText}`);
  }
}
