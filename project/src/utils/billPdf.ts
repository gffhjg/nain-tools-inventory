import type { SaleRecord, PurchaseRecord, CompanySettings } from '@/lib/types';
import {
  buildInvoiceHTML,
  buildPurchaseHTML,
  resolveBusinessDetails,
} from '@/components/PrintableInvoice';
import {
  buildCustomerLedgerHTML,
  type CustomerLedgerData,
} from '@/components/PrintableLedger';
import { money } from '@/utils/analytics';

export interface GeneratedBillPdf {
  file: File;
  blob: Blob;
  filename: string;
  sizeKB: number;
  previewImageBlob: Blob | null;
}

function sanitizeFilename(raw: string): string {
  return (raw || 'Bill').replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function getBillDocMeta(
  mode: 'sale' | 'purchase',
  record: SaleRecord | PurchaseRecord,
  cs?: CompanySettings | null,
) {
  const biz = resolveBusinessDetails(cs);
  if (mode === 'sale') {
    const s = record as SaleRecord;
    const dt = s.documentType || 'TAX INVOICE';
    const label =
      dt === 'PROFORMA INVOICE'
        ? 'Proforma Invoice'
        : dt === 'PURCHASE ORDER'
        ? 'Purchase Order'
        : dt === 'DEBIT NOTE'
        ? 'Debit Note'
        : dt === 'CREDIT NOTE'
        ? 'Credit Note'
        : dt === 'PURCHASE BILL'
        ? 'Purchase Bill'
        : 'Tax Invoice';
    return {
      docLabel: label,
      docNo: s.invoice,
      partyName: s.customer || 'Customer',
      phone: s.phone || '',
      date: s.date,
      grandTotal: s.grandTotal,
      biz,
    };
  }
  const p = record as PurchaseRecord;
  const billNo = p.poNumber.startsWith('PO-') ? 'PB-' + p.poNumber.slice(3) : p.poNumber;
  return {
    docLabel: p.status === 'received' ? 'Purchase Bill' : 'Purchase Order',
    docNo: billNo,
    partyName: p.supplier || 'Supplier',
    phone: p.phone || '',
    date: p.date,
    grandTotal: p.grandTotal,
    biz,
  };
}

export function buildPdfCoverCaption(
  mode: 'sale' | 'purchase',
  record: SaleRecord | PurchaseRecord,
  cs?: CompanySettings | null,
): string {
  const meta = getBillDocMeta(mode, record, cs);
  const dueLine =
    mode === 'sale' &&
    (record as SaleRecord).documentType !== 'PURCHASE ORDER' &&
    (record as SaleRecord).documentType !== 'PROFORMA INVOICE' &&
    (record as SaleRecord).status !== 'paid'
      ? ` (Balance Due: ${money((record as SaleRecord).grandTotal - ((record as SaleRecord).amountPaid || 0))})`
      : '';

  return [
    `Hello ${meta.partyName},`,
    '',
    `Please find attached the PDF copy of *${meta.docLabel} #${meta.docNo}* dated ${meta.date} for *${money(meta.grandTotal)}*${dueLine}.`,
    '',
    `Regards,`,
    `${meta.biz.name}`,
    `Ph: ${meta.biz.phone}`,
  ].join('\n');
}

/**
 * Shared HTML -> multi-page A4 PDF renderer used by Invoice, Purchase Bill, PO, and Customer Ledger exports.
 */
async function renderHtmlToA4Pdf(
  html: string,
  containerSelector: string,
  filename: string,
): Promise<GeneratedBillPdf> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '860px';
  iframe.style.height = '1400px';
  iframe.style.border = 'none';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error('Unable to create offscreen renderer');
    doc.open();
    doc.write(html);
    doc.close();

    // Let browser compute fonts and layout
    await new Promise((resolve) => setTimeout(resolve, 90));

    const containers = Array.from(doc.querySelectorAll<HTMLElement>(containerSelector));
    const targets = containers.length > 0 ? containers : [doc.body];

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pageWidthMm = 210;
    const pageHeightMm = 297;
    const marginMm = 7;
    const printableWidthMm = pageWidthMm - marginMm * 2;
    const printableHeightMm = pageHeightMm - marginMm * 2;

    let previewImageBlob: Blob | null = null;
    let isFirstPdfPage = true;

    for (let tIdx = 0; tIdx < targets.length; tIdx++) {
      const el = targets[tIdx];
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        windowWidth: 860,
      });

      if (tIdx === 0 && !previewImageBlob) {
        previewImageBlob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), 'image/png'),
        );
      }

      const imgData = canvas.toDataURL('image/jpeg', 0.94);
      const renderedHeightMm = (canvas.height * printableWidthMm) / canvas.width;

      let heightLeft = renderedHeightMm;
      let yOffsetMm = 0;

      while (heightLeft > 0.5) {
        if (!isFirstPdfPage) {
          pdf.addPage();
        }
        isFirstPdfPage = false;

        pdf.addImage(
          imgData,
          'JPEG',
          marginMm,
          marginMm + yOffsetMm,
          printableWidthMm,
          renderedHeightMm,
          undefined,
          'FAST',
        );

        if (yOffsetMm < 0) {
          pdf.setFillColor(255, 255, 255);
          pdf.rect(0, 0, pageWidthMm, marginMm, 'F');
        }
        if (heightLeft > printableHeightMm) {
          pdf.setFillColor(255, 255, 255);
          pdf.rect(0, pageHeightMm - marginMm, pageWidthMm, marginMm, 'F');
        }

        heightLeft -= printableHeightMm;
        yOffsetMm -= printableHeightMm;
      }
    }

    const blob = pdf.output('blob');
    const file = new File([blob], filename, { type: 'application/pdf' });
    return {
      file,
      blob,
      filename,
      sizeKB: Math.max(1, Math.round(blob.size / 1024)),
      previewImageBlob,
    };
  } finally {
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  }
}

/**
 * Renders the formatted GST Invoice / PO / Purchase Bill HTML into a genuine multi-page A4 PDF File
 * matching PrintableInvoice pixel-for-pixel, plus a crisp PNG snapshot for instant clipboard pasting.
 */
export async function generateBillPdf(
  mode: 'sale' | 'purchase',
  record: SaleRecord | PurchaseRecord,
  cs?: CompanySettings | null,
  selectedCopies?: string[],
): Promise<GeneratedBillPdf> {
  const html =
    mode === 'sale'
      ? buildInvoiceHTML(
          record as SaleRecord,
          selectedCopies && selectedCopies.length > 0 ? selectedCopies : ['Original For Recipient'],
          cs,
          false,
        )
      : buildPurchaseHTML(record as PurchaseRecord, cs, false);

  const meta = getBillDocMeta(mode, record, cs);
  const prefix = meta.docLabel.replace(/\s+/g, '_');
  const filename = `${sanitizeFilename(meta.docNo)}_${prefix}.pdf`;
  return renderHtmlToA4Pdf(html, mode === 'sale' ? '.invoice-container' : '.invoice', filename);
}

export function buildLedgerCoverCaption(
  ledger: CustomerLedgerData,
  cs?: CompanySettings | null,
): string {
  const biz = resolveBusinessDetails(cs);
  const isSupplier = ledger.partyType === 'supplier';
  const balTxt =
    Math.abs(ledger.closingBalance) < 0.01
      ? money(0)
      : isSupplier
      ? ledger.closingBalance > 0
        ? `${money(ledger.closingBalance)} Cr (Payable)`
        : `${money(Math.abs(ledger.closingBalance))} Dr (Advance)`
      : ledger.closingBalance > 0
      ? `${money(ledger.closingBalance)} Dr (Due)`
      : `${money(Math.abs(ledger.closingBalance))} Cr (Advance)`;

  const docName = isSupplier ? 'Supplier Account Ledger Statement' : 'Customer Account Ledger Statement';

  return [
    `Hello ${ledger.customer.name},`,
    '',
    `Please find attached your *${docName}* PDF (${ledger.periodLabel}) from ${biz.name}.`,
    '',
    ...(isSupplier
      ? [
          `• Total Purchased (Cr): ${money(ledger.totalCredit)}`,
          `• Total Paid (Dr): ${money(ledger.totalDebit)}`,
          `• Closing Balance: *${balTxt}*`,
        ]
      : [
          `• Total Billed (Dr): ${money(ledger.totalDebit)}`,
          `• Total Received (Cr): ${money(ledger.totalCredit)}`,
          `• Closing Balance: *${balTxt}*`,
        ]),
    '',
    `Regards,`,
    `${biz.name}`,
    `Ph: ${biz.phone}`,
  ].join('\n');
}

/**
 * Renders a Customer or Supplier Account Ledger Statement into a genuine multi-page A4 PDF File.
 */
export async function generateLedgerPdf(
  ledger: CustomerLedgerData,
  cs?: CompanySettings | null,
): Promise<GeneratedBillPdf> {
  const html = buildCustomerLedgerHTML(ledger, cs, false);
  const dateTag = new Date().toISOString().slice(0, 10);
  const suffix = ledger.partyType === 'supplier' ? 'Supplier_Ledger' : 'Ledger';
  const filename = `${sanitizeFilename(ledger.customer.name)}_${suffix}_${dateTag}.pdf`;
  return renderHtmlToA4Pdf(html, '.ledger-container', filename);
}

export function downloadPdfFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function canNativeShareFile(file?: File | null): boolean {
  if (!file || typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) {
    return false;
  }
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export async function nativeSharePdfFile(
  file: File,
  title: string,
  text: string,
): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (!canNativeShareFile(file)) return 'unsupported';
  try {
    await navigator.share({
      files: [file],
      title,
      text,
    });
    return 'shared';
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return 'cancelled';
    return 'unsupported';
  }
}

export async function copyBillImageToClipboard(blob: Blob | null): Promise<boolean> {
  if (!blob || typeof navigator === 'undefined' || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    return false;
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}
