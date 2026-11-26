import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Sparkles,
  MessageSquare,
  Camera,
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Search,
  Trash2,
  Plus,
  Loader2,
  KeyRound,
  Check,
  Wand2,
  Clipboard,
} from 'lucide-react';
import Modal from '@/components/Modal';
import { smartFilterItems } from '@/utils/search';
import { money } from '@/utils/analytics';
import {
  parseWhatsAppOrEmailText,
  parseSpreadsheetFile,
  runLocalImageOCR,
  extractItemsWithGeminiAI,
  getGeminiApiKey,
  saveGeminiApiKey,
  type ParsedOrderLine,
} from '@/utils/smartOrderParser';
import type { Product } from '@/lib/types';

export interface ScannedImportItem {
  productId?: string;
  name: string;
  qty: number;
  price?: number;
  hsnCode?: string;
  isCustom?: boolean;
}

export interface DocTypeChoice {
  value: string;
  label: string;
}

export interface SmartOrderScannerModalProps {
  open: boolean;
  onClose: () => void;
  mode: 'sale' | 'purchase';
  products: Product[];
  onImportItems: (items: ScannedImportItem[], targetDocType?: string) => void;
  initialTab?: 'text' | 'image' | 'excel';
  initialImageFile?: File | Blob | null;
  autoScanOnImageSelect?: boolean;
  docTypeChoices?: DocTypeChoice[];
  defaultDocType?: string;
}

type InputTab = 'text' | 'image' | 'excel';

function toNamedFile(file: File | Blob): File {
  if (file instanceof File && file.name) return file;
  const ext = (file.type || 'image/png').split('/')[1]?.split(';')[0] || 'png';
  return new File([file], `snipping-tool-${Date.now()}.${ext}`, {
    type: file.type || 'image/png',
  });
}

const SAMPLE_WHATSAPP = `Bhaiya yeh material bhej dena urgent:
1. SS 304 Hex Bolt 8x25 - 500 pcs @ 4.50
2. MS Allen Bolt 10x16 Unbrako qty 1000
3. SS 316 Plain Washer 16x30x3mm - 2000 nos
4. Nylock Nut M8 - 300`;

export default function SmartOrderScannerModal({
  open,
  onClose,
  mode,
  products,
  onImportItems,
  initialTab = 'text',
  initialImageFile = null,
  autoScanOnImageSelect = true,
  docTypeChoices,
  defaultDocType,
}: SmartOrderScannerModalProps) {
  const [activeTab, setActiveTab] = useState<InputTab>(initialTab);
  const [selectedDocType, setSelectedDocType] = useState<string>(
    defaultDocType || docTypeChoices?.[0]?.value || '',
  );
  const [rawText, setRawText] = useState('');
  const [parsedLines, setParsedLines] = useState<ParsedOrderLine[]>([]);
  const [step, setStep] = useState<'input' | 'review'>('input');

  // Scanning / OCR / AI state
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // Rate preference when importing
  const [preferDetectedRate, setPreferDetectedRate] = useState(true);

  // Optional Gemini Vision API Key for handwriting/PDFs
  const [geminiKey, setGeminiKey] = useState(() => getGeminiApiKey());
  const [showKeyInput, setShowKeyInput] = useState(false);

  // Inline product picker modal/dropdown for a row
  const [mappingRowId, setMappingRowId] = useState<string | null>(null);
  const [mappingSearch, setMappingSearch] = useState('');

  const imageInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const handleImageSelectedRef = useRef<(file: File | Blob) => void>(() => {});

  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
    setProgressMsg('');
    setMappingRowId(null);
    setMappingSearch('');
    setStep('input');
    setParsedLines([]);
    setRawText('');
    setUploadedFile(null);
    setActiveTab(initialImageFile ? 'image' : initialTab);
    setSelectedDocType(defaultDocType || docTypeChoices?.[0]?.value || '');
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
      setImagePreviewUrl(null);
    }
    if (initialImageFile) {
      // Trigger after reset state settles in next microtask
      queueMicrotask(() => {
        handleImageSelectedRef.current(initialImageFile);
      });
    }
  }, [open, initialTab, initialImageFile, defaultDocType, docTypeChoices]);

  // Listen for Ctrl+V image paste while modal is open
  useEffect(() => {
    if (!open) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            setActiveTab('image');
            handleImageSelectedRef.current(blob);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [open]);

  const handleImageSelected = (rawFile: File | Blob) => {
    const file = toNamedFile(rawFile);
    setErrorMsg(null);
    setUploadedFile(file);
    setImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    });

    if (autoScanOnImageSelect) {
      if (file.type === 'application/pdf') {
        if (geminiKey.trim()) {
          void handleScanImageOrPdf(true, file);
        }
      } else {
        void handleScanImageOrPdf(Boolean(geminiKey.trim()), file);
      }
    }
  };
  handleImageSelectedRef.current = handleImageSelected;

  const handleParseText = () => {
    setErrorMsg(null);
    if (!rawText.trim()) {
      setErrorMsg('Please paste a WhatsApp order, email message, or item list first.');
      return;
    }
    const items = parseWhatsAppOrEmailText(rawText, products);
    if (items.length === 0) {
      setErrorMsg('No recognizable item lines were found. Make sure each item is on its own line with product words.');
      return;
    }
    setParsedLines(items);
    setStep('review');
  };

  const handleParseWithGeminiText = async () => {
    setErrorMsg(null);
    if (!rawText.trim()) {
      setErrorMsg('Paste message text first.');
      return;
    }
    if (!geminiKey.trim()) {
      setShowKeyInput(true);
      setErrorMsg('Please enter your free Google Gemini API key to use AI parsing, or click standard "Extract & Match Items".');
      return;
    }
    setIsProcessing(true);
    setProgressMsg('AI reading and structuring order...');
    try {
      const { items } = await extractItemsWithGeminiAI({ text: rawText }, geminiKey, products);
      if (items.length === 0) {
        setErrorMsg('AI could not find any line items in that text.');
      } else {
        setParsedLines(items);
        setStep('review');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'AI extraction failed');
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  const handleScanImageOrPdf = async (useAI: boolean, explicitFile?: File | null) => {
    const targetFile = explicitFile ?? uploadedFile;
    if (!targetFile) {
      setErrorMsg('Please upload or paste (Ctrl+V) a Snipping Tool screenshot, photo, or PDF first.');
      return;
    }
    setErrorMsg(null);
    setIsProcessing(true);

    try {
      if (useAI) {
        if (!geminiKey.trim()) {
          setShowKeyInput(true);
          setIsProcessing(false);
          setErrorMsg('Enter your Google Gemini API key below for AI Vision scanning (best for handwritten slips & PDFs), or use "Free Offline Scan (OCR)".');
          return;
        }
        setProgressMsg('AI Vision analyzing screenshot/PDF...');
        const { items, rawSummaryText } = await extractItemsWithGeminiAI(
          { file: targetFile, mimeType: targetFile.type },
          geminiKey,
          products,
        );
        setRawText(rawSummaryText);
        if (items.length === 0) {
          setErrorMsg('AI Vision could not find clear order items. Try editing the extracted text tab manually.');
        } else {
          setParsedLines(items);
          setStep('review');
        }
      } else {
        if (targetFile.type === 'application/pdf') {
          setErrorMsg('Direct PDF scanning requires Gemini AI Vision (configure free key below), or copy/paste text from the PDF into the "WhatsApp / Email Text" tab.');
          setIsProcessing(false);
          return;
        }
        setProgressMsg('Enhancing screenshot & starting offline OCR...');
        const text = await runLocalImageOCR(targetFile, (_pct, status) => setProgressMsg(status));
        setRawText(text);
        const items = parseWhatsAppOrEmailText(text, products);
        if (items.length === 0) {
          setErrorMsg('OCR extracted text (now visible in Text tab), but could not auto-split clear item rows. Switch to the Text tab to adjust & extract!');
          setActiveTab('text');
        } else {
          setParsedLines(items);
          setStep('review');
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  const handlePasteFromClipboardButton = async () => {
    setErrorMsg(null);
    try {
      if (navigator.clipboard && 'read' in navigator.clipboard) {
        const clipItems = await navigator.clipboard.read();
        for (const item of clipItems) {
          const imgType = item.types.find((t) => t.startsWith('image/'));
          if (imgType) {
            const blob = await item.getType(imgType);
            handleImageSelected(blob);
            return;
          }
        }
      }
      if (navigator.clipboard && 'readText' in navigator.clipboard) {
        const text = (await navigator.clipboard.readText())?.trim();
        if (text) {
          setRawText(text);
          setActiveTab('text');
          const items = parseWhatsAppOrEmailText(text, products);
          if (items.length > 0) {
            setParsedLines(items);
            setStep('review');
          }
          return;
        }
      }
      setErrorMsg('No screenshot found in clipboard yet — capture one with Win+Shift+S first, or press Ctrl+V directly anywhere here.');
    } catch {
      setErrorMsg('Browser blocked clipboard read button — simply press Ctrl+V directly anywhere in this window to paste your screenshot!');
    }
  };

  const handleExcelUpload = async (file: File) => {
    setErrorMsg(null);
    setIsProcessing(true);
    setProgressMsg(`Reading ${file.name}...`);
    try {
      const items = await parseSpreadsheetFile(file, products);
      if (items.length === 0) {
        setErrorMsg('Could not find item rows in this spreadsheet. Ensure it has Item Name and Qty columns.');
      } else {
        setParsedLines(items);
        setStep('review');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to read spreadsheet');
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  const mappingCandidates = useMemo(() => {
    if (!mappingRowId) return [];
    const targetRow = parsedLines.find((r) => r.id === mappingRowId);
    const q = mappingSearch.trim() || targetRow?.searchQuery || '';
    if (!q) return products.slice(0, 15);
    return smartFilterItems(products, q, (p) => [p.name, p.size, p.rackNumber, p.hsnCode], { maxResults: 20 });
  }, [mappingRowId, mappingSearch, parsedLines, products]);

  const selectedCount = parsedLines.filter((l) => l.selected).length;

  const handleConfirmImport = () => {
    const toImport: ScannedImportItem[] = parsedLines
      .filter((l) => l.selected && l.qty > 0)
      .map((l) => {
        if (l.matchedProduct && !l.useCustomName) {
          const catalogRate = mode === 'purchase' ? (l.matchedProduct.cost || l.matchedProduct.price) : l.matchedProduct.price;
          const finalPrice = preferDetectedRate && l.detectedRate && l.detectedRate > 0 ? l.detectedRate : catalogRate;
          return {
            productId: l.matchedProduct.id,
            name: l.matchedProduct.name,
            qty: l.qty,
            price: finalPrice,
            hsnCode: l.matchedProduct.hsnCode || '7318150',
            isCustom: false,
          };
        }
        return {
          name: l.searchQuery || l.rawLine,
          qty: l.qty,
          price: l.detectedRate || 0,
          hsnCode: '7318150',
          isCustom: true,
        };
      });

    if (toImport.length === 0) return;
    onImportItems(toImport, selectedDocType || undefined);
    onClose();
  };

  const activeDocLabel =
    docTypeChoices?.find((d) => d.value === selectedDocType)?.label ||
    (mode === 'purchase' ? 'Purchase' : 'Invoice');

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="2xl"
      title={`Smart Scan & Import — ${mode === 'purchase' ? 'Purchase Items' : 'Sale / Order Items'}`}
      subtitle="Paste Snipping Tool screenshots (Ctrl+V), WhatsApp chats, emails, spreadsheets, or bill photos to auto-fill items"
      footer={
        <div className="flex flex-wrap items-center justify-between w-full gap-2">
          <div className="flex items-center gap-2">
            {step === 'review' ? (
              <button
                type="button"
                onClick={() => setStep('input')}
                className="btn-secondary text-xs"
              >
                &larr; Back to Input
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowKeyInput((v) => !v)}
                className="text-xs font-semibold text-slate-600 hover:text-brand-700 flex items-center gap-1 cursor-pointer"
              >
                <KeyRound className="h-3.5 w-3.5" />
                <span>{geminiKey ? 'Gemini AI Key Saved ✓' : 'Setup AI Key (For Handwriting / PDFs)'}</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {step === 'review' && docTypeChoices && docTypeChoices.length > 0 && (
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 mr-1">
                {docTypeChoices.map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    onClick={() => setSelectedDocType(choice.value)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                      selectedDocType === choice.value
                        ? 'bg-brand-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            )}
            <button type="button" onClick={onClose} className="btn-secondary text-xs">
              Cancel
            </button>
            {step === 'review' && (
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={selectedCount === 0}
                className="btn-primary bg-emerald-600 hover:bg-emerald-700 text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>
                  {docTypeChoices && docTypeChoices.length > 0
                    ? `Create ${activeDocLabel} (${selectedCount} ${selectedCount === 1 ? 'Item' : 'Items'})`
                    : `Add ${selectedCount} ${selectedCount === 1 ? 'Item' : 'Items'} to ${activeDocLabel}`}
                </span>
              </button>
            )}
          </div>
        </div>
      }
    >
      <div data-scanner-modal="true" className="space-y-4 text-xs">
        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Optional Gemini AI Key Box */}
        {showKeyInput && step === 'input' && (
          <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-2 animate-fade-in">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-indigo-950 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                Google Gemini AI Vision Key (Optional)
              </h4>
              <span className="text-[10.5px] text-indigo-700">Free from Google AI Studio · Stored locally only</span>
            </div>
            <p className="text-[11px] text-indigo-800">
              Text chats, Excel/CSV, and clear photos already work offline for free. Adding a Gemini API key unlocks AI reading for messy <strong>handwritten slips</strong> and <strong>PDF supplier invoices</strong>.
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="Paste Gemini API Key (AIza...)"
                className="input bg-white text-xs font-mono flex-1 py-1.5"
              />
              <button
                type="button"
                onClick={() => {
                  saveGeminiApiKey(geminiKey);
                  setShowKeyInput(false);
                }}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1 cursor-pointer"
              >
                <Check className="h-3.5 w-3.5" /> Save Key
              </button>
            </div>
          </div>
        )}

        {/* STEP 1: INPUT SOURCE */}
        {step === 'input' && (
          <div className="space-y-4">
            {/* Method Tabs */}
            <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setActiveTab('text')}
                className={`py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'text' ? 'bg-white text-brand-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <MessageSquare className="h-4 w-4 text-emerald-600" />
                <span>WhatsApp / Email Text</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('image')}
                className={`py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'image' ? 'bg-white text-brand-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Camera className="h-4 w-4 text-indigo-600" />
                <span>Photo / Screenshot / PDF</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('excel')}
                className={`py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'excel' ? 'bg-white text-brand-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
                <span>Excel / CSV File</span>
              </button>
            </div>

            {/* TAB 1: TEXT / WHATSAPP / EMAIL */}
            {activeTab === 'text' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800">
                    Paste WhatsApp chat, Email order list, or copied items:
                  </label>
                  <button
                    type="button"
                    onClick={() => setRawText(SAMPLE_WHATSAPP)}
                    className="text-[11px] font-bold text-brand-600 hover:underline cursor-pointer"
                  >
                    Try Sample WhatsApp Message
                  </button>
                </div>

                <textarea
                  rows={8}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder={`Example formats automatically understood:\n• SS 304 Hex Bolt 8x25 - 500 pcs\n• Allen Bolt 10x16 Unbrako qty 1000 @ 4.28\n• [26/11, 10:15] Sharma: Plain washer 8mm 2000\n• Copied email / Excel rows with Item, Qty, Rate`}
                  className="input bg-white font-mono text-xs leading-relaxed w-full"
                  autoFocus
                />

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] text-slate-500">
                    Automatically understands SS 304/316, MS, HB/AB/PW/NN abbreviations &amp; fastener sizes without confusing sizes with qty.
                  </span>
                  <div className="flex items-center gap-2">
                    {geminiKey && (
                      <button
                        type="button"
                        onClick={handleParseWithGeminiText}
                        disabled={isProcessing}
                        className="btn-secondary border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100 text-xs font-bold flex items-center gap-1.5"
                      >
                        {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                        <span>Parse with Gemini AI</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleParseText}
                      disabled={isProcessing}
                      className="btn-primary text-xs font-bold flex items-center gap-1.5"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Extract &amp; Match Items</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: PHOTO / SCREENSHOT / PDF */}
            {activeTab === 'image' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-indigo-50/80 border border-indigo-200/80">
                  <div className="flex items-center gap-2 text-indigo-950">
                    <span className="font-bold">Snipping Tool Workflow:</span>
                    <span>
                      Take SS with <kbd className="px-1.5 py-0.5 rounded bg-white border border-indigo-300 font-mono text-[10px]">Win+Shift+S</kbd> then press{' '}
                      <kbd className="px-1.5 py-0.5 rounded bg-white border border-indigo-300 font-mono text-[10px]">Ctrl+V</kbd> — scans automatically!
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handlePasteFromClipboardButton}
                    disabled={isProcessing}
                    className="btn-primary bg-indigo-600 hover:bg-indigo-700 text-xs py-1.5 px-3 flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                  >
                    <Clipboard className="h-3.5 w-3.5" />
                    <span>Paste Screenshot (Clipboard)</span>
                  </button>
                </div>

                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*,application/pdf,.pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImageSelected(f);
                  }}
                  className="hidden"
                />

                <div
                  onClick={() => imageInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f) handleImageSelected(f);
                  }}
                  className="border-2 border-dashed border-slate-300 hover:border-brand-500 rounded-2xl p-6 text-center bg-slate-50/70 hover:bg-brand-50/20 transition cursor-pointer"
                >
                  {imagePreviewUrl ? (
                    <div className="space-y-2">
                      <img
                        src={imagePreviewUrl}
                        alt="Uploaded bill preview"
                        className="max-h-52 mx-auto rounded-xl border border-slate-200 shadow-xs object-contain"
                      />
                      <p className="font-bold text-slate-700">{uploadedFile?.name} (Click or Ctrl+V another screenshot to replace)</p>
                    </div>
                  ) : uploadedFile ? (
                    <div className="py-4 space-y-1">
                      <Upload className="h-8 w-8 mx-auto text-indigo-600" />
                      <p className="font-bold text-slate-800">{uploadedFile.name}</p>
                      <p className="text-[11px] text-slate-500">PDF ready for AI Vision scan</p>
                    </div>
                  ) : (
                    <div className="py-4 space-y-2">
                      <Camera className="h-10 w-10 mx-auto text-indigo-500" />
                      <p className="font-bold text-slate-800 text-sm">
                        Press <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-300 text-[11px] font-mono">Ctrl+V</kbd> to paste Snipping Tool SS, drop image/PDF, or click to browse
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Auto-enhances dark-mode WhatsApp/Email snips &amp; scans immediately on paste
                      </p>
                    </div>
                  )}
                </div>

                {isProcessing && (
                  <div className="p-3 rounded-xl bg-brand-50 border border-brand-200 text-brand-900 flex items-center gap-2 font-bold">
                    <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
                    <span>{progressMsg || 'Scanning document...'}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => handleScanImageOrPdf(false)}
                    disabled={!uploadedFile || isProcessing}
                    className="btn-secondary text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Search className="h-3.5 w-3.5 text-slate-700" />
                    <span>Re-Scan Offline (OCR)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleScanImageOrPdf(true)}
                    disabled={!uploadedFile || isProcessing}
                    className="btn-primary bg-indigo-600 hover:bg-indigo-700 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    <span>Scan with AI Vision</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 3: EXCEL / CSV */}
            {activeTab === 'excel' && (
              <div className="space-y-3">
                <input
                  ref={excelInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleExcelUpload(f);
                  }}
                  className="hidden"
                />

                <div
                  onClick={() => excelInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f) handleExcelUpload(f);
                  }}
                  className="border-2 border-dashed border-emerald-300 hover:border-emerald-500 rounded-2xl p-8 text-center bg-emerald-50/30 hover:bg-emerald-50/70 transition cursor-pointer space-y-2"
                >
                  <FileSpreadsheet className="h-10 w-10 mx-auto text-emerald-600" />
                  <p className="font-bold text-slate-800 text-sm">
                    Select or Drop an Excel (.xlsx / .xls) or CSV Order Sheet
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Automatically detects Item/Description, Qty, and Rate columns and matches all rows against your 6,752 products.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: REVIEW & MAP TABLE */}
        {step === 'review' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800">
                  Found {parsedLines.length} {parsedLines.length === 1 ? 'item' : 'items'}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                  {parsedLines.filter((l) => l.matchedProduct && !l.useCustomName).length} Matched to Catalog
                </span>
              </div>

              <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={preferDetectedRate}
                  onChange={(e) => setPreferDetectedRate(e.target.checked)}
                  className="rounded border-slate-300 text-brand-600"
                />
                <span>Use rates detected in message/bill (when present)</span>
              </label>
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
              <div className="overflow-x-auto max-h-[50vh]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="px-2.5 py-2 w-8 text-center">Use</th>
                      <th className="px-3 py-2">WhatsApp / Scanned Line</th>
                      <th className="px-3 py-2 min-w-[240px]">Matched Inventory Product</th>
                      <th className="px-2.5 py-2 w-24 text-center">Qty</th>
                      <th className="px-2.5 py-2 w-28 text-right">Rate (₹)</th>
                      <th className="px-2 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedLines.map((row) => {
                      const activeRate =
                        preferDetectedRate && row.detectedRate !== undefined
                          ? row.detectedRate
                          : row.matchedProduct
                          ? mode === 'purchase'
                            ? row.matchedProduct.cost || row.matchedProduct.price
                            : row.matchedProduct.price
                          : row.detectedRate || 0;

                      const isMappingThis = mappingRowId === row.id;

                      return (
                        <tr key={row.id} className={!row.selected ? 'opacity-50 bg-slate-50' : 'hover:bg-slate-50/70'}>
                          <td className="px-2.5 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              onChange={(e) =>
                                setParsedLines((prev) =>
                                  prev.map((r) => (r.id === row.id ? { ...r, selected: e.target.checked } : r)),
                                )
                              }
                              className="rounded border-slate-300 text-brand-600"
                            />
                          </td>

                          <td className="px-3 py-2 align-top">
                            <p className="font-semibold text-slate-800">{row.searchQuery}</p>
                            <p className="text-[10px] text-slate-400 truncate max-w-[200px]" title={row.rawLine}>
                              {row.rawLine}
                            </p>
                          </td>

                          <td className="px-3 py-2 align-top">
                            {row.matchedProduct && !row.useCustomName ? (
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-1.5">
                                  <span className="font-bold text-slate-900">{row.matchedProduct.name}</span>
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[9.5px] font-black uppercase shrink-0 ${
                                      row.confidence === 'exact'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : row.confidence === 'strong'
                                        ? 'bg-blue-100 text-blue-800'
                                        : 'bg-amber-100 text-amber-800'
                                    }`}
                                  >
                                    {row.confidence}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-[10.5px] text-slate-500">
                                  <span>Stock: <strong>{row.matchedProduct.stock}</strong></span>
                                  {row.matchedProduct.rackNumber && <span>· Rack {row.matchedProduct.rackNumber}</span>}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setMappingRowId(isMappingThis ? null : row.id);
                                      setMappingSearch('');
                                    }}
                                    className="text-brand-600 font-bold hover:underline cursor-pointer"
                                  >
                                    {isMappingThis ? 'Close' : 'Change'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setParsedLines((prev) =>
                                        prev.map((r) => (r.id === row.id ? { ...r, useCustomName: true } : r)),
                                      )
                                    }
                                    className="text-purple-600 font-semibold hover:underline cursor-pointer"
                                  >
                                    Use Custom
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 font-bold text-[10px]">
                                    Custom / Unmatched Item
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setMappingRowId(isMappingThis ? null : row.id);
                                      setMappingSearch('');
                                    }}
                                    className="text-brand-600 font-bold text-[11px] hover:underline cursor-pointer flex items-center gap-0.5"
                                  >
                                    <Plus className="h-3 w-3" /> Pick from Catalog
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Quick Inline Product Re-mapper */}
                            {isMappingThis && (
                              <div className="mt-2 p-2 rounded-xl border border-brand-200 bg-brand-50/40 space-y-1.5">
                                <input
                                  type="text"
                                  value={mappingSearch}
                                  onChange={(e) => setMappingSearch(e.target.value)}
                                  placeholder="Search catalog product..."
                                  className="input bg-white text-xs py-1 w-full"
                                  autoFocus
                                />
                                <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 bg-white rounded-lg border border-slate-200">
                                  {mappingCandidates.map((cand) => (
                                    <button
                                      key={cand.id}
                                      type="button"
                                      onClick={() => {
                                        setParsedLines((prev) =>
                                          prev.map((r) =>
                                            r.id === row.id
                                              ? {
                                                  ...r,
                                                  matchedProduct: cand,
                                                  confidence: 'exact',
                                                  useCustomName: false,
                                                }
                                              : r,
                                          ),
                                        );
                                        setMappingRowId(null);
                                      }}
                                      className="w-full text-left px-2 py-1.5 hover:bg-indigo-50 text-[11px] flex items-center justify-between gap-2 cursor-pointer"
                                    >
                                      <span className="font-bold text-slate-800 truncate">{cand.name}</span>
                                      <span className="text-slate-500 shrink-0 font-mono">
                                        {money(mode === 'purchase' ? cand.cost || cand.price : cand.price)} · Qty:{cand.stock}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </td>

                          <td className="px-2.5 py-2 align-top">
                            <input
                              type="number"
                              min="1"
                              value={row.qty}
                              onChange={(e) => {
                                const q = Math.max(1, parseInt(e.target.value, 10) || 1);
                                setParsedLines((prev) =>
                                  prev.map((r) => (r.id === row.id ? { ...r, qty: q } : r)),
                                );
                              }}
                              className="input bg-white text-center font-bold text-xs py-1 px-1 w-20"
                            />
                          </td>

                          <td className="px-2.5 py-2 align-top text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={activeRate}
                              onChange={(e) => {
                                const val = Math.max(0, parseFloat(e.target.value) || 0);
                                setParsedLines((prev) =>
                                  prev.map((r) => (r.id === row.id ? { ...r, detectedRate: val } : r)),
                                );
                                setPreferDetectedRate(true);
                              }}
                              className="input bg-white text-right font-mono font-bold text-xs py-1 px-1.5 w-24"
                            />
                          </td>

                          <td className="px-2 py-2 align-top text-center">
                            <button
                              type="button"
                              onClick={() => setParsedLines((prev) => prev.filter((r) => r.id !== row.id))}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                              title="Remove row"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
