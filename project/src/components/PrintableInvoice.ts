import type { SaleRecord, PurchaseRecord, CompanySettings } from '@/lib/types';
import { computeDiscountAmount } from '@/lib/constants';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const BUSINESS = {
  name: 'NAIN TOOLS & SS BOLT CO.',
  address: '17/1, INDUSTRIAL AREA WHIRLPOOL CHOWK, NIT FARIDABAD',
  phone: '9213469582  7053795074  129 4870974',
  email: 'narendernain2011@gmail.com',
  gstin: '06CCCPK0841B1ZA',
  pan: 'CCCPK0841B',
  bank: {
    name: 'HDFC BANK',
    account: '50200088182531',
    ifsc: 'HDFC0002034',
    branch: 'FARIDABAD',
  },
};

export function resolveBusinessDetails(cs?: CompanySettings | null) {
  return {
    name: cs?.companyName?.trim() || BUSINESS.name,
    address: cs?.address?.trim() || BUSINESS.address,
    phone: cs?.phone?.trim() || BUSINESS.phone,
    email: cs?.email?.trim() || BUSINESS.email,
    gstin: cs?.gstin?.trim() || BUSINESS.gstin,
    pan: cs?.pan?.trim() || BUSINESS.pan,
    bank: {
      name: cs?.bankName?.trim() || BUSINESS.bank.name,
      account: cs?.bankAccount?.trim() || BUSINESS.bank.account,
      ifsc: cs?.bankIfsc?.trim() || BUSINESS.bank.ifsc,
      branch: cs?.bankBranch?.trim() || BUSINESS.bank.branch,
    },
  };
}

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

function renderInvoiceCopyHTML(sale: SaleRecord, copyTag: string, cs?: CompanySettings | null): string {
  const biz = resolveBusinessDetails(cs);
  const discountAmt = computeDiscountAmount(sale.subtotal, sale.discount, sale.discountType);
  const freightAmt = sale.freightCharges || 0;
  const taxableValue = Math.max(0, sale.subtotal - discountAmt + freightAmt);
  const isCentral = sale.gstType === 'igst';
  const splitRate = ((sale.gstRate || 18) / 2).toFixed(2);
  const cgst = sale.cgstAmount || +(sale.gstAmount / 2).toFixed(2);
  const sgst = sale.sgstAmount || +(sale.gstAmount / 2).toFixed(2);
  const igst = sale.igstAmount || sale.gstAmount;
  const totalGst = isCentral ? igst : (cgst + sgst);

  const rawTotal = taxableValue + totalGst;
  const grandTotalInt = Math.round(sale.grandTotal || rawTotal);
  const roundOff = +(grandTotalInt - rawTotal).toFixed(2);
  const showRoundOff = Math.abs(roundOff) >= 0.01;

  const isAmountDisc = sale.discountType === 'amount' && sale.discount && sale.discount > 0;
  const isPercentDisc = sale.discountType === 'percent' && sale.discount && sale.discount > 0;

  const itemRows = sale.items
    .map((it, i) => {
      const unitPrice = it.price;
      const grossTotal = unitPrice * it.qty;
      const hasPerItemDisc = typeof it.discount === 'number' && !isNaN(it.discount) && it.discount >= 0;
      
      let itemDiscPercent = 0;
      if (hasPerItemDisc) {
        itemDiscPercent = it.discountType === 'amount'
          ? (grossTotal > 0 ? (it.discount! / grossTotal) * 100 : 0)
          : (it.discount || 0);
      } else if (isPercentDisc) {
        itemDiscPercent = sale.discount || 0;
      } else if (isAmountDisc && sale.subtotal > 0) {
        itemDiscPercent = (sale.discount / sale.subtotal) * 100;
      }

      const netUnitPrice = unitPrice * (1 - itemDiscPercent / 100);
      const lineNetTotal = it.qty * netUnitPrice;
      const discDisplay = itemDiscPercent > 0 ? itemDiscPercent.toFixed(2) : 'NIL';

      return `
      <tr>
        <td style="text-align: center; border-right: 1px solid #000; padding: 5px 3px;">${i + 1}</td>
        <td style="text-align: left; border-right: 1px solid #000; padding: 5px; font-weight: bold;">${esc(it.name)}</td>
        <td style="text-align: center; border-right: 1px solid #000; padding: 5px 3px;">${esc(it.hsnCode || '7318150')}</td>
        <td style="text-align: right; border-right: 1px solid #000; padding: 5px 4px;">${it.qty.toFixed(2)} PCS</td>
        <td style="text-align: right; border-right: 1px solid #000; padding: 5px 4px;">${unitPrice.toFixed(2)}</td>
        <td style="text-align: right; border-right: 1px solid #000; padding: 5px 4px;">${discDisplay}</td>
        <td style="text-align: right; border-right: 1px solid #000; padding: 5px 4px; font-weight: bold;">${netUnitPrice.toFixed(2)}</td>
        <td style="text-align: right; padding: 5px 4px; font-weight: bold;">${lineNetTotal.toFixed(2)}</td>
      </tr>`;
    })
    .join('');

  const minRows = 6;
  let fillerRows = '';
  if (sale.items.length < minRows) {
    for (let i = sale.items.length; i < minRows; i++) {
      fillerRows += `
      <tr style="height: 30px;">
        <td style="border-right: 1px solid #000;"></td>
        <td style="border-right: 1px solid #000;"></td>
        <td style="border-right: 1px solid #000;"></td>
        <td style="border-right: 1px solid #000;"></td>
        <td style="border-right: 1px solid #000;"></td>
        <td style="border-right: 1px solid #000;"></td>
        <td style="border-right: 1px solid #000;"></td>
        <td></td>
      </tr>`;
    }
  }

  const bankName = sale.bankName || biz.bank.name;
  const bankAccount = sale.bankAccount || biz.bank.account;
  const bankIfsc = sale.bankIfsc || biz.bank.ifsc;

  const sellerGstin = sale.sellerGstin || biz.gstin;
  const sellerPan = sale.sellerPan || biz.pan;

  const docType = sale.documentType || 'TAX INVOICE';

  return `
  <div class="invoice-container">
    <div class="top-right-label">${esc(copyTag)}</div>
    
    <div class="main-box">
      <div class="title-bar">${esc(docType)}</div>
      
      <!-- Company Header -->
      <div class="company-section">
        <div class="company-title">${esc(biz.name)}</div>
        <div class="company-sub">${esc(biz.address)}</div>
        <div class="company-contact">EMAIL : ${esc(biz.email)} &nbsp;|&nbsp; ${esc(biz.phone)}</div>
        <div class="company-gst">GSTIN No. ${esc(sellerGstin)}</div>
      </div>
      
      <!-- PAN & Reverse Charge -->
      <div class="pan-bar">
        <div>PAN No. &nbsp;&nbsp;&nbsp;&nbsp; <strong>${esc(sellerPan)}</strong></div>
        <div>Tax is Payable on Reverse Charge : <strong>No</strong></div>
      </div>
      
      <!-- Invoice & Transport Details -->
      <div class="two-col-row">
        <div class="col-left">
          <div class="meta-line">
            <span>${sale.documentType === 'DEBIT NOTE' ? 'Debit Note No. :' : sale.documentType === 'CREDIT NOTE' ? 'Credit Note No. :' : sale.documentType === 'PROFORMA INVOICE' ? 'Proforma Invoice No. :' : sale.documentType === 'PURCHASE BILL' ? 'Purchase Bill No. :' : 'Invoice No. :'} &nbsp;&nbsp;&nbsp; <strong>${esc(sale.invoice)}</strong></span>
            <span>Date : &nbsp;&nbsp; <strong>${esc(sale.date)}</strong></span>
          </div>
          <div class="meta-line"><span>P.O. No. :</span> <strong>${esc(sale.poNumber || '—')}</strong></div>
          <div class="meta-line"><span>P.O. Date :</span> <strong>${esc(sale.poDate || '—')}</strong></div>
        </div>
        <div class="col-right">
          <div class="meta-line"><span>Mode of Transport :</span> <strong>${esc(sale.transportMode || '—')}</strong></div>
          <div class="meta-line"><span>Vehicle No. :</span> <strong>${esc(sale.vehicleNumber || '—')}</strong></div>
          <div class="meta-line"><span>Date &amp; Time of Supply :</span> <span>${esc(sale.date)} 01:29 PM</span></div>
          <div class="meta-line"><span>Place of Supply :</span> <span><strong>${esc((sale.customerState || 'HARYANA').toUpperCase())}</strong></span></div>
        </div>
      </div>
      
      <!-- Party Details (Receiver & Consignee) -->
      <div class="two-col-row">
        <div class="col-left">
          <div class="party-head"><span>Receiver Details (Billed to)</span> <span>Vendor Code : <strong>${esc(sale.vendorCode || '—')}</strong></span></div>
          <div class="party-name">M/s ${esc(sale.customer)}</div>
          <div class="party-text">${esc(sale.customerAddress || 'FARIDABAD, HARYANA')}</div>
          <div style="margin-top: 10px;" class="party-text">
            <div>GSTIN No. : &nbsp;&nbsp;&nbsp;&nbsp; <strong>${esc(sale.customerGstin || '06AAECA0878K1ZJ')}</strong></div>
            <div>State : &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <strong>${esc(sale.customerState || 'Haryana')}</strong> &nbsp;&nbsp; Code : <strong>${esc(sale.customerStateCode || '06')}</strong></div>
          </div>
        </div>
        <div class="col-right">
          <div class="party-head"><span>Consignee Details (Shipped to)</span></div>
          <div class="party-name">M/s ${esc(sale.customer)}</div>
          <div class="party-text">${esc(sale.customerAddress || 'FARIDABAD, HARYANA')}</div>
          <div style="margin-top: 10px;" class="party-text">
            <div>GSTIN No. : &nbsp;&nbsp;&nbsp;&nbsp; <strong>${esc(sale.customerGstin || '06AAECA0878K1ZJ')}</strong></div>
            <div>State : &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <strong>${esc(sale.customerState || 'Haryana')}</strong> &nbsp;&nbsp; Code : <strong>${esc(sale.customerStateCode || '06')}</strong></div>
          </div>
        </div>
      </div>
      
      <!-- Goods Table Grid -->
      <div class="table-wrap">
        <table class="goods-table">
          <thead>
            <tr>
              <th style="width: 35px;">Sr No</th>
              <th style="text-align: left; padding-left: 6px;">Description of Goods</th>
              <th style="width: 70px;">HSN Code</th>
              <th style="width: 70px;">Qty</th>
              <th style="width: 70px;">Rate (Rs.)</th>
              <th style="width: 60px;">Disc %</th>
              <th style="width: 75px;">Net Rate (Rs.)</th>
              <th style="width: 85px;">Amount (Rs.)</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
            ${fillerRows}
          </tbody>
        </table>
      </div>
      
      <!-- Summary Section -->
      <div class="summary-row">
        <div class="summary-left-box">
          <div>
            <div style="font-size: 10px; font-weight: bold; margin-bottom: 6px;">E-Way Bill No : <strong>${esc(sale.ewayBill || '—')}</strong></div>
            
            <div class="section-label">Bank Details :</div>
            <div style="font-size: 10px; font-weight: bold; margin-bottom: 6px;">
              <div>${esc(bankName)}</div>
              <div>${esc(bankAccount)}</div>
              <div>IFSC CODE :${esc(bankIfsc)}</div>
            </div>
            
            <div style="font-size: 9.5px; margin-bottom: 6px;">
              <strong>Invoice Amount in words (Rs.) :</strong><br/>
              Rupees ${numberToWords(sale.grandTotal)}
            </div>
            ${(sale.paymentMethod === 'Cheque' && sale.chequeNo) ? `
            <div style="font-size: 9.5px; margin-bottom: 6px; background-color: #f0fdf4; padding: 3px 6px; border: 1px solid #bbf7d0; border-radius: 3px; color: #166534;">
              <strong>Cheque Details:</strong> #${esc(sale.chequeNo)} ${sale.chequeBank ? `&nbsp;|&nbsp; <strong>Bank:</strong> ${esc(sale.chequeBank)}` : ''} ${sale.chequeDate ? `&nbsp;|&nbsp; <strong>Claimable Date:</strong> ${esc(sale.chequeDate)}` : ''} ${sale.chequeStatus === 'bounced' ? `<span style="color:#b91c1c; font-weight:bold;">(BOUNCED)</span>` : sale.chequeStatus === 'cleared' ? `<span style="color:#15803d; font-weight:bold;">(CLEARED)</span>` : ''}
            </div>
            ` : ''}
            ${(sale.paymentTerms || sale.dueDate) ? `
            <div style="font-size: 9.5px; margin-bottom: 6px; background-color: #f8fafc; padding: 3px 6px; border: 1px solid #e2e8f0; border-radius: 3px;">
              <strong>Payment Terms:</strong> ${esc(sale.paymentTerms || 'Credit / Pay Later')} ${sale.dueDate ? `&nbsp;|&nbsp; <strong>Due Date:</strong> ${esc(sale.dueDate)}` : ''}
            </div>
            ` : ''}
          </div>
          
          <div>
            <div class="cert-text">Certified that the Particulars given above are true and correct</div>
            <div class="section-label" style="margin-top: 4px;">Terms &amp; Conditions :</div>
            <ol class="terms-list">
              <li>1. Interest @ 24% p.a. will be charged for delayed payments</li>
              <li>2. Our risk &amp; responsibility ceases as soon as Goods leave our factory</li>
              <li>3. All disputes are subject to Faridabad Jurisdiction only.</li>
              <li>4. E&amp;OE</li>
            </ol>
            
            <div style="display: flex; justify-content: space-between; margin-top: 16px; font-weight: bold; font-size: 10px;">
              <div>Receiver's Signature</div>
              <div style="text-align: right;">For <strong>${esc(biz.name)}</strong></div>
            </div>
            <div style="text-align: right; font-weight: bold; font-size: 10px; margin-top: 16px;">
              Authorised Signatory
            </div>
          </div>
        </div>
        
        <div class="summary-right-box">
          <div class="sum-line">
            <span>Total Amount</span>
            <span>${sale.subtotal.toFixed(2)}</span>
          </div>
          ${discountAmt > 0 ? `
          <div class="sum-line" style="color: #b45309;">
            <span>Discount (Less)</span>
            <span>-${discountAmt.toFixed(2)}</span>
          </div>
          ` : ''}
          ${sale.freightCharges && sale.freightCharges > 0 ? `
          <div class="sum-line" style="font-weight: bold; color: #1e293b;">
            <span>FREIGHT</span>
            <span>${sale.freightCharges.toFixed(2)}</span>
          </div>
          ` : ''}
          <div class="sum-line" style="font-weight: bold;">
            <span>Taxable Amount</span>
            <span>${taxableValue.toFixed(2)}</span>
          </div>
          ${!isCentral ? `
          <div class="sum-line">
            <span>CGST @ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${splitRate} %</span>
            <span>${cgst.toFixed(2)}</span>
          </div>
          <div class="sum-line">
            <span>SGST @ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${splitRate} %</span>
            <span>${sgst.toFixed(2)}</span>
          </div>
          ` : `
          <div class="sum-line">
            <span>IGST @ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${(sale.gstRate || 18).toFixed(2)} %</span>
            <span>${igst.toFixed(2)}</span>
          </div>
          `}
          ${showRoundOff ? `
          <div class="sum-line">
            <span>Round Off</span>
            <span>${roundOff > 0 ? '+' + roundOff.toFixed(2) : roundOff.toFixed(2)}</span>
          </div>
          ` : ''}
          <div class="sum-line grand" style="margin-top: 10px;">
            <span>Invoice Amount (Rs.)</span>
            <span>${grandTotalInt.toFixed(2)}</span>
          </div>
          ${(sale.status === 'pending' || sale.status === 'partially-paid' || (sale.amountPaid || 0) < sale.grandTotal) ? `
          <div class="sum-line" style="color: #166534; font-weight: bold; border-top: 1px dashed #cbd5e1; padding-top: 2px;">
            <span>Amount Paid (${sale.paymentMethod || 'Cash'})</span>
            <span>${(sale.amountPaid || 0).toFixed(2)}</span>
          </div>
          <div class="sum-line" style="color: #b45309; font-weight: 800; border-top: 1px solid #cbd5e1; padding-top: 2px;">
            <span>Balance Due ${sale.dueDate ? `(Due: ${sale.dueDate})` : ''}</span>
            <span>${(sale.grandTotal - (sale.amountPaid || 0)).toFixed(2)}</span>
          </div>
          ` : `
          <div class="sum-line" style="color: #166534; font-weight: bold; border-top: 1px dashed #cbd5e1; padding-top: 2px;">
            <span>Payment Status</span>
            <span>PAID IN FULL</span>
          </div>
          `}
        </div>
      </div>
    </div>
  </div>`;
}

function buildInvoiceHTML(sale: SaleRecord, selectedCopies?: string[], cs?: CompanySettings | null): string {
  const defaultCopies = [
    'Original For Recipient',
    'Duplicate For Transporter',
    'Triplicate For Supplier',
    'Extra Copy'
  ];
  const copyLabels = (selectedCopies && selectedCopies.length > 0) ? selectedCopies : defaultCopies;

  const docType = sale.documentType || 'TAX INVOICE';
  const copiesHTML = copyLabels.map((tag) => renderInvoiceCopyHTML(sale, tag, cs)).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(docType)} — ${esc(sale.invoice)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; padding: 15px; font-size: 11px; line-height: 1.3; }
  .invoice-container { max-width: 820px; margin: 0 auto 30px auto; background: #fff; page-break-after: always; }
  .invoice-container:last-child { page-break-after: avoid; margin-bottom: 0; }
  .top-right-label { text-align: right; font-size: 10px; font-weight: bold; margin-bottom: 2px; }
  .main-box { border: 1.5px solid #000; width: 100%; border-collapse: collapse; }
  
  .title-bar { text-align: center; font-weight: bold; font-size: 11px; border-bottom: 1px solid #000; padding: 3px; text-transform: uppercase; }
  .company-section { text-align: center; padding: 8px 10px; border-bottom: 1px solid #000; }
  .company-title { font-size: 20px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; font-family: Arial, sans-serif; }
  .company-sub { font-size: 10px; font-weight: bold; margin-top: 2px; }
  .company-contact { font-size: 10px; font-weight: normal; margin-top: 1px; }
  .company-gst { font-size: 11px; font-weight: bold; margin-top: 4px; }
  
  .pan-bar { display: flex; justify-content: space-between; padding: 4px 8px; border-bottom: 1px solid #000; font-size: 10px; font-weight: bold; }
  
  .two-col-row { display: flex; border-bottom: 1px solid #000; }
  .col-left { flex: 1; padding: 5px 8px; border-right: 1px solid #000; }
  .col-right { flex: 1; padding: 5px 8px; }
  
  .meta-line { display: flex; justify-content: space-between; margin-bottom: 2px; font-size: 10px; }
  
  .party-head { text-decoration: underline; font-weight: bold; display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 10px; }
  .party-name { font-weight: bold; font-size: 11px; text-transform: uppercase; margin-bottom: 2px; }
  .party-text { font-size: 10px; line-height: 1.3; }
  
  .table-wrap { border-bottom: 1px solid #000; min-height: 240px; }
  table.goods-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.goods-table th { border-bottom: 1px solid #000; border-right: 1px solid #000; padding: 5px 3px; font-size: 10px; font-weight: bold; text-align: center; background: #fff; }
  table.goods-table th:last-child { border-right: none; }
  table.goods-table td { font-size: 10px; padding: 4px; vertical-align: top; }
  
  .summary-row { display: flex; border-bottom: 1px solid #000; }
  .summary-left-box { flex: 1.4; border-right: 1px solid #000; padding: 6px 8px; display: flex; flex-direction: column; justify-content: space-between; }
  .summary-right-box { flex: 1; padding: 0; }
  
  .sum-line { display: flex; justify-content: space-between; padding: 4px 8px; border-bottom: 1px solid #000; font-size: 10px; font-weight: bold; }
  .sum-line:last-child { border-bottom: none; }
  .sum-line.grand { font-size: 11px; padding: 6px 8px; font-weight: 900; }
  
  .section-label { font-weight: bold; text-decoration: underline; margin-bottom: 2px; font-size: 10px; }
  .terms-list { font-size: 8.5px; line-height: 1.3; list-style: none; padding-left: 0; margin-top: 2px; }
  .terms-list li { margin-bottom: 1px; }

  .cert-text { font-size: 8.5px; color: #333; margin-top: 4px; font-style: italic; }

  @media print {
    body { padding: 0; background: #fff; }
    .invoice-container { max-width: 100%; margin: 0 0 0 0; page-break-after: always; }
    .invoice-container:last-child { page-break-after: avoid; }
    @page { margin: 8mm; size: A4 portrait; }
  }
</style>
</head>
<body>
  ${copiesHTML}
  <script>window.onload = () => { setTimeout(() => window.print(), 200); };</script>
</body>
</html>`;
}

export function printInvoice(sale: SaleRecord, selectedCopies?: string[], cs?: CompanySettings | null) {
  const win = window.open('', '_blank', 'width=820,height=900');
  if (!win) return;
  win.document.write(buildInvoiceHTML(sale, selectedCopies, cs));
  win.document.close();
}

function buildPurchaseHTML(po: PurchaseRecord, cs?: CompanySettings | null): string {
  const biz = resolveBusinessDetails(cs);
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
<title>${po.poNumber} — ${esc(biz.name)}</title>
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
          <div class="brand-name">${esc(biz.name)}</div>
          <div class="brand-sub">Stainless Steel Fastener Specialists</div>
          <div class="brand-addr">${esc(biz.address)}</div>
          <div class="brand-contact">Ph: ${esc(biz.phone)} &nbsp;|&nbsp; ${esc(biz.email)}</div>
          <div class="brand-gst">GSTIN: ${esc(biz.gstin)} &nbsp;|&nbsp; PAN: ${esc(biz.pan)}</div>
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
        <div class="party-name">${esc(biz.name)}</div>
        <div class="party-detail">${esc(biz.address)}</div>
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
        <div class="sign-label">For ${esc(biz.name)}</div>
        <div class="sign-line"></div>
        <div class="sign-name">Authorised Signatory</div>
      </div>
    </div>

    <div class="footer">
      <div class="footer-text">This is a computer-generated purchase order. | ${esc(biz.name)} | ${esc(biz.phone)} | ${esc(biz.email)}</div>
    </div>
  </div>
  <script>window.onload = () => { setTimeout(() => window.print(), 200); };</script>
</body>
</html>`;
}

export function printPurchase(po: PurchaseRecord, cs?: CompanySettings | null) {
  const win = window.open('', '_blank', 'width=820,height=900');
  if (!win) return;
  win.document.write(buildPurchaseHTML(po, cs));
  win.document.close();
}
