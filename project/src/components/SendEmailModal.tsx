import { useState, useEffect, useMemo } from 'react';
import {
  Mail,
  Send,
  Copy,
  Check,
  Download,
  Printer,
  ExternalLink,
  AlertTriangle,
  Settings,
  CheckCircle2,
  Loader2,
  UserCheck,
  FileText,
  Share2,
} from 'lucide-react';
import Modal from '@/components/Modal';
import { useStore } from '@/store/AppStore';
import { printInvoice, printPurchase } from '@/components/PrintableInvoice';
import { printCustomerLedger, type CustomerLedgerData } from '@/components/PrintableLedger';
import {
  buildSaleEmailData,
  buildPurchaseEmailData,
  buildReminderEmailData,
  buildLedgerEmailData,
  buildGmailComposeUrl,
  buildMailtoUrl,
  getEmailJSConfig,
  saveEmailJSConfig,
  isEmailJSConfigured,
  sendViaEmailJS,
  type EmailJSConfig,
} from '@/utils/email';
import {
  generateBillPdf,
  generateLedgerPdf,
  downloadPdfFile,
  buildPdfCoverCaption,
  buildLedgerCoverCaption,
  canNativeShareFile,
  nativeSharePdfFile,
  copyBillImageToClipboard,
  type GeneratedBillPdf,
} from '@/utils/billPdf';
import type { SaleRecord, PurchaseRecord, CompanySettings } from '@/lib/types';

export interface SendEmailModalProps {
  open: boolean;
  onClose: () => void;
  mode: 'sale' | 'purchase' | 'reminder' | 'ledger';
  sale?: SaleRecord | null;
  purchase?: PurchaseRecord | null;
  ledgerData?: CustomerLedgerData | null;
  reminderData?: {
    customerId?: string;
    customerName: string;
    email?: string;
    amount: number;
    invoiceNumber?: string;
  } | null;
  companySettings?: CompanySettings | null;
}

export default function SendEmailModal({
  open,
  onClose,
  mode,
  sale,
  purchase,
  ledgerData,
  reminderData,
  companySettings: propCompanySettings,
}: SendEmailModalProps) {
  const {
    customers,
    suppliers,
    updateCustomer,
    updateSupplier,
    companySettings: storeCompanySettings,
  } = useStore();

  const cs = propCompanySettings ?? storeCompanySettings;

  // Match party from master list for automatic email lookup & update
  const isSupplierLedger = mode === 'ledger' && ledgerData?.partyType === 'supplier';

  const matchedCustomer = useMemo(() => {
    if (mode === 'sale' && sale) {
      return (
        customers.find((c) => sale.customerId && c.id === sale.customerId) ||
        customers.find((c) => c.name.trim().toLowerCase() === (sale.customer || '').trim().toLowerCase())
      );
    }
    if (mode === 'reminder' && reminderData) {
      return (
        customers.find((c) => reminderData.customerId && c.id === reminderData.customerId) ||
        customers.find((c) => c.name.trim().toLowerCase() === reminderData.customerName.trim().toLowerCase())
      );
    }
    if (mode === 'ledger' && ledgerData && ledgerData.partyType !== 'supplier') {
      return (
        customers.find((c) => c.id === ledgerData.customer.id) ||
        (ledgerData.customer as typeof customers[number])
      );
    }
    return undefined;
  }, [mode, sale, ledgerData, reminderData, customers]);

  const matchedSupplier = useMemo(() => {
    if (mode === 'purchase' && purchase) {
      return suppliers.find((s) => s.name.trim().toLowerCase() === (purchase.supplier || '').trim().toLowerCase());
    }
    if (mode === 'ledger' && ledgerData && ledgerData.partyType === 'supplier') {
      return suppliers.find((s) => s.id === ledgerData.customer.id);
    }
    return undefined;
  }, [mode, purchase, ledgerData, suppliers]);

  const [toEmail, setToEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saveEmailToMaster, setSaveEmailToMaster] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copiedImg, setCopiedImg] = useState(false);
  const [downloadedFile, setDownloadedFile] = useState<string | null>(null);
  const [pdfData, setPdfData] = useState<GeneratedBillPdf | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [autoDownloadPdfOnCompose, setAutoDownloadPdfOnCompose] = useState(true);
  const [includeItemTextInBody, setIncludeItemTextInBody] = useState(false);
  const [sendingAuto, setSendingAuto] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const [showEmailJSSetup, setShowEmailJSSetup] = useState(false);
  const [ejConfig, setEjConfig] = useState<EmailJSConfig>(() => getEmailJSConfig());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatusBanner(null);
    setCopied(false);
    setCopiedImg(false);
    setDownloadedFile(null);
    setPdfData(null);

    if (mode === 'sale' && sale) {
      const { subject: s, body: fullBody } = buildSaleEmailData(sale, cs);
      setToEmail(matchedCustomer?.email || '');
      setSubject(s);
      setBody(
        includeItemTextInBody
          ? fullBody
          : buildPdfCoverCaption('sale', sale, cs).replace(/\*/g, ''),
      );
      setGeneratingPdf(true);
      generateBillPdf('sale', sale, cs)
        .then((res) => {
          if (!cancelled) {
            setPdfData(res);
            setGeneratingPdf(false);
          }
        })
        .catch(() => {
          if (!cancelled) setGeneratingPdf(false);
        });
    } else if (mode === 'purchase' && purchase) {
      const { subject: s, body: fullBody } = buildPurchaseEmailData(purchase, cs);
      setToEmail(matchedSupplier?.email || '');
      setSubject(s);
      setBody(
        includeItemTextInBody
          ? fullBody
          : buildPdfCoverCaption('purchase', purchase, cs).replace(/\*/g, ''),
      );
      setGeneratingPdf(true);
      generateBillPdf('purchase', purchase, cs)
        .then((res) => {
          if (!cancelled) {
            setPdfData(res);
            setGeneratingPdf(false);
          }
        })
        .catch(() => {
          if (!cancelled) setGeneratingPdf(false);
        });
    } else if (mode === 'ledger' && ledgerData) {
      const { subject: s, body: fullBody } = buildLedgerEmailData(ledgerData, cs);
      setToEmail(ledgerData.customer.email || (isSupplierLedger ? matchedSupplier?.email : matchedCustomer?.email) || '');
      setSubject(s);
      setBody(
        includeItemTextInBody
          ? fullBody
          : buildLedgerCoverCaption(ledgerData, cs).replace(/\*/g, ''),
      );
      setGeneratingPdf(true);
      generateLedgerPdf(ledgerData, cs)
        .then((res) => {
          if (!cancelled) {
            setPdfData(res);
            setGeneratingPdf(false);
          }
        })
        .catch(() => {
          if (!cancelled) setGeneratingPdf(false);
        });
    } else if (mode === 'reminder' && reminderData) {
      const { subject: s, body: b } = buildReminderEmailData(
        reminderData.customerName,
        reminderData.amount,
        reminderData.invoiceNumber,
        cs,
      );
      setToEmail(reminderData.email || matchedCustomer?.email || '');
      setSubject(s);
      setBody(b);
    }

    return () => {
      cancelled = true;
    };
  }, [open, mode, sale, purchase, ledgerData, reminderData, matchedCustomer, matchedSupplier, cs, includeItemTextInBody]);

  if (!open) return null;

  const partyName =
    mode === 'sale'
      ? sale?.customer || 'Customer'
      : mode === 'purchase'
      ? purchase?.supplier || 'Supplier'
      : mode === 'ledger'
      ? ledgerData?.customer.name || 'Customer'
      : reminderData?.customerName || 'Customer';

  const useSupplierRecord = mode === 'purchase' || isSupplierLedger;
  const existingMasterEmail = useSupplierRecord ? matchedSupplier?.email : matchedCustomer?.email;
  const emailChangedForMaster =
    Boolean(toEmail.trim()) &&
    toEmail.trim().toLowerCase() !== (existingMasterEmail || '').trim().toLowerCase() &&
    Boolean(useSupplierRecord ? matchedSupplier : matchedCustomer);

  const persistMasterEmailIfRequested = async () => {
    const cleaned = toEmail.trim();
    if (!cleaned || !saveEmailToMaster || !emailChangedForMaster) return;
    try {
      if (useSupplierRecord && matchedSupplier) {
        await updateSupplier(matchedSupplier.id, { ...matchedSupplier, email: cleaned });
      } else if (!useSupplierRecord && matchedCustomer) {
        await updateCustomer(matchedCustomer.id, { ...matchedCustomer, email: cleaned });
      }
    } catch (err) {
      console.warn('Could not update party email:', err);
    }
  };

  const handleCopyBody = async () => {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setStatusBanner({ type: 'error', text: 'Clipboard copy failed — please select text and press Ctrl+C.' });
    }
  };

  const ensurePdfAndDownload = async (quietBanner = false): Promise<GeneratedBillPdf | null> => {
    if (mode === 'reminder') return null;
    let activePdf = pdfData;
    if (!activePdf) {
      setGeneratingPdf(true);
      try {
        if (mode === 'sale' && sale) activePdf = await generateBillPdf('sale', sale, cs);
        else if (mode === 'purchase' && purchase) activePdf = await generateBillPdf('purchase', purchase, cs);
        else if (mode === 'ledger' && ledgerData) activePdf = await generateLedgerPdf(ledgerData, cs);
        if (activePdf) setPdfData(activePdf);
      } catch (err) {
        setStatusBanner({
          type: 'error',
          text: err instanceof Error ? err.message : 'PDF generation failed',
        });
        setGeneratingPdf(false);
        return null;
      } finally {
        setGeneratingPdf(false);
      }
    }
    if (activePdf && downloadedFile !== activePdf.filename) {
      downloadPdfFile(activePdf.blob, activePdf.filename);
      setDownloadedFile(activePdf.filename);
      if (!quietBanner) {
        setStatusBanner({
          type: 'info',
          text: `Downloaded PDF "${activePdf.filename}". Attach / drag it straight into your email!`,
        });
      }
    }
    return activePdf;
  };

  const handleDownloadBillFile = async () => {
    await ensurePdfAndDownload(false);
  };

  const handleCopyBillImage = async () => {
    const ok = await copyBillImageToClipboard(pdfData?.previewImageBlob || null);
    if (ok) {
      setCopiedImg(true);
      setStatusBanner({
        type: 'info',
        text: 'Copied bill image to clipboard — click inside Gmail body and press Ctrl+V to paste the full bill!',
      });
      setTimeout(() => setCopiedImg(false), 3000);
    } else {
      setStatusBanner({
        type: 'error',
        text: 'Browser blocked image clipboard — attach the downloaded PDF file directly.',
      });
    }
  };

  const handleOpenGmail = async () => {
    if (!toEmail.trim()) {
      setStatusBanner({ type: 'error', text: 'Please enter the recipient Email address first.' });
      return;
    }
    await persistMasterEmailIfRequested();
    if (autoDownloadPdfOnCompose && mode !== 'reminder') {
      const pdf = await ensurePdfAndDownload(true);
      if (pdf) {
        setStatusBanner({
          type: 'success',
          text: `Downloaded "${pdf.filename}" & opened Gmail — drag/attach the PDF file into the email!`,
        });
      }
    }
    const { url, truncated } = buildGmailComposeUrl(toEmail, subject, body);
    if (truncated) {
      try {
        await navigator.clipboard.writeText(body);
      } catch {}
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleOpenMailApp = async () => {
    if (!toEmail.trim()) {
      setStatusBanner({ type: 'error', text: 'Please enter the recipient Email address first.' });
      return;
    }
    await persistMasterEmailIfRequested();
    if (autoDownloadPdfOnCompose && mode !== 'reminder') {
      const pdf = await ensurePdfAndDownload(true);
      if (pdf) {
        setStatusBanner({
          type: 'success',
          text: `Downloaded "${pdf.filename}" & opened Mail app — attach the PDF file from Downloads!`,
        });
      }
    }
    const { url, truncated } = buildMailtoUrl(toEmail, subject, body);
    if (truncated) {
      try {
        await navigator.clipboard.writeText(body);
      } catch {}
    }
    window.location.href = url;
  };

  const handleSendDirectEmailJS = async () => {
    if (!toEmail.trim()) {
      setStatusBanner({ type: 'error', text: 'Please enter the recipient Email address first.' });
      return;
    }
    setSendingAuto(true);
    setStatusBanner(null);
    try {
      await persistMasterEmailIfRequested();
      await sendViaEmailJS({
        toEmail,
        toName: partyName,
        subject,
        messageText: body,
        fromName: cs?.companyName || 'Nain Tools & SS Bolt Co.',
        replyTo: cs?.email || '',
        config: ejConfig,
      });
      setStatusBanner({ type: 'success', text: `Email sent successfully to ${toEmail}!` });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to send via EmailJS',
      });
    } finally {
      setSendingAuto(false);
    }
  };

  const docLabel =
    mode === 'sale'
      ? `${sale?.documentType || 'Invoice'} #${sale?.invoice || ''}`
      : mode === 'purchase'
      ? `Purchase #${purchase?.poNumber || ''}`
      : mode === 'ledger'
      ? `Account Ledger (${ledgerData?.periodLabel || 'Statement'})`
      : `Payment Reminder`;

  const emailJSReady = isEmailJSConfigured(ejConfig);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={`Send ${docLabel} via Email`}
      subtitle={`Recipient: ${partyName}`}
      footer={
        <div className="flex flex-wrap items-center justify-between w-full gap-2">
          <button
            type="button"
            onClick={() => setShowEmailJSSetup((v) => !v)}
            className="text-xs font-semibold text-slate-600 hover:text-brand-700 flex items-center gap-1.5 cursor-pointer"
          >
            <Settings className="h-3.5 w-3.5" />
            <span>{emailJSReady ? '1-Click Auto-Send Ready (EmailJS)' : 'Setup 1-Click Auto-Send (Optional)'}</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onClose} className="btn-secondary text-xs">
              Close
            </button>
            <button
              type="button"
              onClick={handleOpenMailApp}
              className="btn-secondary text-xs flex items-center gap-1.5 border-slate-300"
              title="Opens Outlook / Windows Mail app"
            >
              <Mail className="h-3.5 w-3.5 text-slate-600" />
              <span>Default Mail App</span>
            </button>
            <button
              type="button"
              onClick={handleOpenGmail}
              className="btn-primary bg-rose-600 hover:bg-rose-700 text-xs flex items-center gap-1.5 shadow-sm"
              title="Opens Gmail Compose directly in Chrome"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Compose in Gmail</span>
            </button>
            {emailJSReady && (
              <button
                type="button"
                onClick={handleSendDirectEmailJS}
                disabled={sendingAuto}
                className="btn-primary bg-emerald-600 hover:bg-emerald-700 text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {sendingAuto ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                <span>{sendingAuto ? 'Sending...' : '⚡ Send Now'}</span>
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        {statusBanner && (
          <div
            className={`p-3 rounded-xl border flex items-center gap-2 font-medium ${
              statusBanner.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : statusBanner.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : 'bg-blue-50 border-blue-200 text-blue-900'
            }`}
          >
            {statusBanner.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : statusBanner.type === 'error' ? (
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            ) : (
              <Mail className="h-4 w-4 text-blue-600 shrink-0" />
            )}
            <span>{statusBanner.text}</span>
          </div>
        )}

        {/* Recipient Email */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="font-bold text-slate-700">To (Recipient Email) *</label>
            {existingMasterEmail && (
              <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                <UserCheck className="h-3 w-3" /> Loaded from master profile
              </span>
            )}
          </div>
          <input
            type="email"
            value={toEmail}
            onChange={(e) => setToEmail(e.target.value)}
            placeholder={`Enter ${partyName}'s email address (e.g. accounts@company.com)`}
            className="input bg-white text-xs font-medium"
            autoFocus
          />
          {emailChangedForMaster && (
            <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand-700 cursor-pointer pt-0.5">
              <input
                type="checkbox"
                checked={saveEmailToMaster}
                onChange={(e) => setSaveEmailToMaster(e.target.checked)}
                className="rounded border-slate-300 text-brand-600"
              />
              <span>Save this email to {partyName}&apos;s master record for next time</span>
            </label>
          )}
        </div>

        {/* Subject */}
        <div className="space-y-1">
          <label className="font-bold text-slate-700">Email Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="input bg-white text-xs font-semibold"
          />
        </div>

        {/* PDF Attachment & Quick Helper Bar */}
        {mode !== 'reminder' && (
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[11px] text-slate-700">
                <div className="h-8 w-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                  {generatingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                </div>
                <div>
                  <strong className="text-slate-900 block">
                    {generatingPdf
                      ? 'Generating Full GST Bill PDF...'
                      : pdfData
                      ? `Bill PDF Ready: ${pdfData.filename} (${pdfData.sizeKB} KB)`
                      : 'Attach Whole Bill PDF (.pdf)'}
                  </strong>
                  <span className="text-slate-500">
                    Downloads as a real multi-page A4 .pdf file (auto-downloaded on Gmail / Mail open).
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleDownloadBillFile}
                  disabled={generatingPdf}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>{downloadedFile ? 'Downloaded PDF ✓' : 'Download PDF (.pdf)'}</span>
                </button>
                {canNativeShareFile(pdfData?.file) && (
                  <button
                    type="button"
                    onClick={() =>
                      pdfData?.file &&
                      nativeSharePdfFile(pdfData.file, subject, body)
                    }
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    <span>Share PDF</span>
                  </button>
                )}
                {pdfData?.previewImageBlob && (
                  <button
                    type="button"
                    onClick={handleCopyBillImage}
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-bold text-[11px] flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    title="Copies bill image so you can paste Ctrl+V inside Gmail compose body"
                  >
                    {copiedImg ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-indigo-600" />}
                    <span>{copiedImg ? 'Copied Image!' : 'Copy Bill Image'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (mode === 'sale' && sale) printInvoice(sale, ['Original For Recipient'], cs);
                    else if (mode === 'purchase' && purchase) printPurchase(purchase, cs);
                    else if (mode === 'ledger' && ledgerData) printCustomerLedger(ledgerData, cs);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-bold text-[11px] flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Printer className="h-3.5 w-3.5 text-slate-600" />
                  <span>Print</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-200/80 text-[11px]">
              <label className="inline-flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoDownloadPdfOnCompose}
                  onChange={(e) => setAutoDownloadPdfOnCompose(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <span>Auto-download .pdf when opening Gmail / Mail app</span>
              </label>

              <label className="inline-flex items-center gap-1.5 font-semibold text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeItemTextInBody}
                  onChange={(e) => setIncludeItemTextInBody(e.target.checked)}
                  className="rounded border-slate-300 text-brand-600"
                />
                <span>Also include text table inside email body</span>
              </label>
            </div>
          </div>
        )}

        {/* Message Body Preview */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="font-bold text-slate-700">Message Body (Editable)</label>
            {mode === 'reminder' && (
              <button
                type="button"
                onClick={handleCopyBody}
                className="text-[11px] font-bold text-brand-600 hover:underline flex items-center gap-1"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                <span>{copied ? 'Copied' : 'Copy Text'}</span>
              </button>
            )}
          </div>
          <textarea
            rows={10}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="input bg-white font-mono text-[11.5px] leading-relaxed w-full"
          />
        </div>

        {/* Optional EmailJS Direct Config */}
        {showEmailJSSetup && (
          <div className="p-3.5 rounded-xl border border-indigo-200 bg-indigo-50/60 space-y-2.5 animate-fade-in">
            <div>
              <h4 className="font-bold text-xs text-indigo-950">Optional: 1-Click Silent Email Sending (via EmailJS)</h4>
              <p className="text-[11px] text-indigo-800 mt-0.5">
                Since this app runs offline on your computer, &ldquo;Compose in Gmail&rdquo; opens Chrome&apos;s Gmail window for free.
                If you prefer 1-click silent sending without leaving the app, paste free EmailJS keys below (supports up to 200 emails/month free):
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="Service ID (e.g. service_xxx)"
                value={ejConfig.serviceId}
                onChange={(e) => setEjConfig((c) => ({ ...c, serviceId: e.target.value }))}
                className="input bg-white text-xs py-1.5 font-mono"
              />
              <input
                type="text"
                placeholder="Template ID (e.g. template_xxx)"
                value={ejConfig.templateId}
                onChange={(e) => setEjConfig((c) => ({ ...c, templateId: e.target.value }))}
                className="input bg-white text-xs py-1.5 font-mono"
              />
              <input
                type="text"
                placeholder="Public Key"
                value={ejConfig.publicKey}
                onChange={(e) => setEjConfig((c) => ({ ...c, publicKey: e.target.value }))}
                className="input bg-white text-xs py-1.5 font-mono"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] text-indigo-700">
                Template variables sent: <code>to_email</code>, <code>to_name</code>, <code>subject</code>, <code>message</code>, <code>message_html</code>
              </span>
              <button
                type="button"
                onClick={() => {
                  saveEmailJSConfig(ejConfig);
                  setStatusBanner({ type: 'success', text: 'EmailJS configuration saved!' });
                  setShowEmailJSSetup(false);
                }}
                className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] cursor-pointer"
              >
                Save Keys
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
