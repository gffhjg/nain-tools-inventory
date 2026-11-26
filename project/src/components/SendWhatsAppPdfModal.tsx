import { useState, useEffect } from 'react';
import {
  MessageCircle,
  Download,
  FileText,
  Copy,
  Check,
  Loader2,
  Share2,
  ExternalLink,
  Printer,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import Modal from '@/components/Modal';
import { printInvoice, printPurchase } from '@/components/PrintableInvoice';
import { printCustomerLedger, type CustomerLedgerData } from '@/components/PrintableLedger';
import {
  generateBillPdf,
  generateLedgerPdf,
  downloadPdfFile,
  buildPdfCoverCaption,
  buildLedgerCoverCaption,
  getBillDocMeta,
  canNativeShareFile,
  nativeSharePdfFile,
  copyBillImageToClipboard,
  type GeneratedBillPdf,
} from '@/utils/billPdf';
import { resolveBusinessDetails } from '@/components/PrintableInvoice';
import type { SaleRecord, PurchaseRecord, CompanySettings } from '@/lib/types';

export interface SendWhatsAppPdfModalProps {
  open: boolean;
  onClose: () => void;
  mode: 'sale' | 'purchase' | 'ledger';
  sale?: SaleRecord | null;
  purchase?: PurchaseRecord | null;
  ledgerData?: CustomerLedgerData | null;
  companySettings?: CompanySettings | null;
}

export default function SendWhatsAppPdfModal({
  open,
  onClose,
  mode,
  sale,
  purchase,
  ledgerData,
  companySettings,
}: SendWhatsAppPdfModalProps) {
  const record = mode === 'sale' ? sale : mode === 'purchase' ? purchase : null;
  const activeTarget = mode === 'ledger' ? ledgerData : record;

  const [phoneInput, setPhoneInput] = useState('');
  const [caption, setCaption] = useState('');
  const [pdfData, setPdfData] = useState<GeneratedBillPdf | null>(null);
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'info'; text: string } | null>(null);
  const [copiedImg, setCopiedImg] = useState(false);

  useEffect(() => {
    if (!open || !activeTarget) return;
    let cancelled = false;

    if (mode === 'ledger' && ledgerData) {
      setPhoneInput(ledgerData.customer.phone || '');
      setCaption(buildLedgerCoverCaption(ledgerData, companySettings));
    } else if (record && (mode === 'sale' || mode === 'purchase')) {
      const meta = getBillDocMeta(mode, record, companySettings);
      setPhoneInput(meta.phone || '');
      setCaption(buildPdfCoverCaption(mode, record, companySettings));
    }

    setPdfData(null);
    setErrorMsg(null);
    setStatusBanner(null);
    setCopiedImg(false);
    setGenerating(true);

    const pdfPromise =
      mode === 'ledger' && ledgerData
        ? generateLedgerPdf(ledgerData, companySettings)
        : record && (mode === 'sale' || mode === 'purchase')
        ? generateBillPdf(mode, record, companySettings)
        : null;

    if (pdfPromise) {
      pdfPromise
        .then((res) => {
          if (!cancelled) {
            setPdfData(res);
            setGenerating(false);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setErrorMsg(err instanceof Error ? err.message : 'Failed to generate PDF');
            setGenerating(false);
          }
        });
    } else {
      setGenerating(false);
    }

    return () => {
      cancelled = true;
    };
  }, [open, mode, record, ledgerData, activeTarget, companySettings]);

  if (!open || !activeTarget) return null;

  const docTitle =
    mode === 'ledger' && ledgerData
      ? `${ledgerData.partyType === 'supplier' ? 'Supplier Ledger' : 'Customer Ledger'} (${ledgerData.customer.name})`
      : record && (mode === 'sale' || mode === 'purchase')
      ? (() => {
          const m = getBillDocMeta(mode, record, companySettings);
          return `${m.docLabel} #${m.docNo}`;
        })()
      : 'Document';
  const partyName =
    mode === 'ledger' && ledgerData
      ? ledgerData.customer.name
      : record && (mode === 'sale' || mode === 'purchase')
      ? getBillDocMeta(mode, record, companySettings).partyName
      : 'Party';
  const cleanDigits = phoneInput.replace(/[^0-9]/g, '');
  const fullWaPhone = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;
  const nativeShareAvailable = canNativeShareFile(pdfData?.file);

  const handleDownloadAndOpenWhatsApp = async () => {
    let activePdf = pdfData;
    if (!activePdf) {
      setGenerating(true);
      try {
        if (mode === 'ledger' && ledgerData) {
          activePdf = await generateLedgerPdf(ledgerData, companySettings);
        } else if (record && (mode === 'sale' || mode === 'purchase')) {
          activePdf = await generateBillPdf(mode, record, companySettings);
        }
        if (activePdf) setPdfData(activePdf);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'PDF generation failed');
        setGenerating(false);
        return;
      } finally {
        setGenerating(false);
      }
    }

    if (activePdf) {
      downloadPdfFile(activePdf.blob, activePdf.filename);
      setStatusBanner({
        type: 'success',
        text: `Downloaded "${activePdf.filename}" & opened WhatsApp — drag/drop the PDF file straight into the chat and send!`,
      });
    }

    const waUrl = fullWaPhone
      ? `https://wa.me/${fullWaPhone}?text=${encodeURIComponent(caption)}`
      : `https://wa.me/?text=${encodeURIComponent(caption)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleNativeShare = async () => {
    if (!pdfData?.file) return;
    const res = await nativeSharePdfFile(
      pdfData.file,
      `${docTitle} — ${resolveBusinessDetails(companySettings).name}`,
      caption,
    );
    if (res === 'shared') {
      setStatusBanner({ type: 'success', text: `Shared ${pdfData.filename}!` });
    } else if (res === 'unsupported') {
      handleDownloadAndOpenWhatsApp();
    }
  };

  const handleCopyBillImage = async () => {
    const ok = await copyBillImageToClipboard(pdfData?.previewImageBlob || null);
    if (ok) {
      setCopiedImg(true);
      setStatusBanner({
        type: 'info',
        text: `Copied ${mode === 'ledger' ? 'ledger' : 'bill'} image to clipboard! Open WhatsApp chat and press Ctrl+V to send it directly.`,
      });
      setTimeout(() => setCopiedImg(false), 3000);
    } else {
      setErrorMsg('Clipboard image copy blocked by browser — click "Download PDF & Open WhatsApp" instead.');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`Send ${docTitle} PDF via WhatsApp`}
      subtitle={
        mode === 'ledger' && ledgerData
          ? `Statement Period: ${ledgerData.periodLabel} · Complete Debit/Credit Account Ledger PDF`
          : `Party: ${partyName} · Whole formatted GST bill as PDF`
      }
      footer={
        <div className="flex flex-wrap items-center justify-between w-full gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (mode === 'ledger' && ledgerData) printCustomerLedger(ledgerData, companySettings);
                else if (mode === 'sale' && sale) printInvoice(sale, ['Original For Recipient'], companySettings);
                else if (mode === 'purchase' && purchase) printPurchase(purchase, companySettings);
              }}
              className="btn-secondary text-xs flex items-center gap-1.5"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print</span>
            </button>
            {pdfData && (
              <button
                type="button"
                onClick={() => {
                  downloadPdfFile(pdfData.blob, pdfData.filename);
                  setStatusBanner({ type: 'info', text: `Saved "${pdfData.filename}" to your Downloads folder.` });
                }}
                className="btn-secondary text-xs flex items-center gap-1.5"
              >
                <Download className="h-3.5 w-3.5 text-brand-600" />
                <span>Download PDF Only</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onClose} className="btn-secondary text-xs">
              Close
            </button>
            {nativeShareAvailable && (
              <button
                type="button"
                onClick={handleNativeShare}
                className="btn-secondary border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-bold flex items-center gap-1.5"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span>Direct Share PDF</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleDownloadAndOpenWhatsApp}
              disabled={generating}
              className="btn-primary bg-emerald-600 hover:bg-emerald-700 text-xs font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MessageCircle className="h-4 w-4" />
              )}
              <span>
                {generating ? 'Preparing PDF...' : 'Download PDF & Open WhatsApp'}
              </span>
              <ExternalLink className="h-3 w-3 opacity-80" />
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {statusBanner && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{statusBanner.text}</span>
          </div>
        )}

        {/* PDF Status Strip */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-5 w-5" />}
            </div>
            <div>
              <div className="font-bold text-slate-900">
                {generating
                  ? 'Rendering whole bill PDF...'
                  : pdfData
                  ? `${pdfData.filename} (${pdfData.sizeKB} KB)`
                  : 'PDF Ready'}
              </div>
              <p className="text-[11px] text-slate-500">
                Complete A4 GST bill formatted identically to print preview — no raw text dump!
              </p>
            </div>
          </div>

          {pdfData?.previewImageBlob && (
            <button
              type="button"
              onClick={handleCopyBillImage}
              className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-bold text-[11px] flex items-center gap-1.5 shadow-2xs cursor-pointer"
              title="Copies high-res bill image so you can press Ctrl+V inside WhatsApp chat"
            >
              {copiedImg ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-indigo-600" />
              )}
              <span>{copiedImg ? 'Copied Bill Image!' : 'Copy Bill Image (Ctrl+V)'}</span>
            </button>
          )}
        </div>

        <div className="space-y-1">
          <label className="font-bold text-slate-700">Customer / Supplier WhatsApp Number</label>
          <input
            type="text"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            placeholder="10-digit mobile (e.g. 9990055025) — leave empty to pick contact in WhatsApp"
            className="input bg-white font-mono text-xs"
          />
        </div>

        <div className="space-y-1">
          <label className="font-bold text-slate-700">WhatsApp Cover Caption (Sent Alongside PDF)</label>
          <textarea
            rows={5}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="input bg-white text-xs leading-relaxed w-full"
          />
        </div>
      </div>
    </Modal>
  );
}
