import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Camera,
  Clipboard,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Wand2,
  KeyRound,
  Building2,
  Search,
  UserCheck,
  CreditCard,
} from 'lucide-react';
import Modal from '@/components/Modal';
import { getGeminiApiKey, saveGeminiApiKey } from '@/utils/smartOrderParser';
import {
  parseBusinessCardText,
  scanBusinessCardOffline,
  scanBusinessCardWithGemini,
  type ParsedBusinessCard,
} from '@/utils/businessCardParser';
import { getStateByCode, indianStates, validateGstin } from '@/lib/constants';

export interface PartyMatchCandidate {
  id: string;
  name: string;
  businessName?: string;
  contactPerson?: string;
  phone: string;
  gstin: string;
  email: string;
  address: string;
  state: string;
  stateCode: string;
}

export interface AppliedBusinessCardResult extends ParsedBusinessCard {
  matchedPartyId?: string;
  saveToMaster: boolean;
}

export interface BusinessCardScannerModalProps {
  open: boolean;
  onClose: () => void;
  partyType: 'customer' | 'supplier';
  existingParties?: PartyMatchCandidate[];
  initialTab?: 'image' | 'text';
  initialImageFile?: File | Blob | null;
  onApplyParty: (data: AppliedBusinessCardResult) => void;
  showSaveToMasterOption?: boolean;
}

function toCardFile(file: File | Blob): File {
  if (file instanceof File && file.name) return file;
  const ext = (file.type || 'image/png').split('/')[1]?.split(';')[0] || 'png';
  return new File([file], `business-card-${Date.now()}.${ext}`, {
    type: file.type || 'image/png',
  });
}

const SAMPLE_CARD_TEXT = `HB ENGINEERING
GSTIN No.: 06ATQPK1273Q1Z0
Mob: 9990055025
SS, MS, BRASS, ALUMINIUM, COPPER JALI CUT DESIGNS JOB WORK
Plot No 88, Rishal Singh Complex, 33 Feet Road, Jeevan Nagar, Gaunchhi, Near Pal Public School, Sec. 55, Faridabad-121004
E-mail : hbengineering24@gmail.com`;

export default function BusinessCardScannerModal({
  open,
  onClose,
  partyType,
  existingParties = [],
  initialTab = 'image',
  initialImageFile = null,
  onApplyParty,
  showSaveToMasterOption = true,
}: BusinessCardScannerModalProps) {
  const [activeTab, setActiveTab] = useState<'image' | 'text'>(initialTab);
  const [step, setStep] = useState<'input' | 'review'>('input');
  const [rawText, setRawText] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [geminiKey, setGeminiKey] = useState(() => getGeminiApiKey());
  const [showKeyInput, setShowKeyInput] = useState(false);

  const [card, setCard] = useState<ParsedBusinessCard>({
    businessName: '',
    contactPerson: '',
    phone: '',
    altPhone: '',
    gstin: '',
    pan: '',
    email: '',
    address: '',
    state: '',
    stateCode: '',
    notes: '',
    rawText: '',
  });
  const [matchedPartyId, setMatchedPartyId] = useState<string | undefined>(undefined);
  const [saveToMaster, setSaveToMaster] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileRef = useRef<(f: File | Blob) => void>(() => {});

  const partyLabel = partyType === 'supplier' ? 'Supplier' : 'Customer';

  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
    setProgressMsg('');
    setStep('input');
    setRawText('');
    setUploadedFile(null);
    setMatchedPartyId(undefined);
    setSaveToMaster(true);
    setActiveTab(initialImageFile ? 'image' : initialTab);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    if (initialImageFile) {
      queueMicrotask(() => handleFileRef.current(initialImageFile));
    }
  }, [open, initialTab, initialImageFile]);

  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            setActiveTab('image');
            handleFileRef.current(blob);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [open]);

  const applyExtractedCard = (parsed: ParsedBusinessCard) => {
    setCard(parsed);
    if (parsed.rawText) setRawText(parsed.rawText);

    // Check if GSTIN, phone, or firm name already exists in party master
    const normPhone = parsed.phone.replace(/\D/g, '').slice(-10);
    const normName = parsed.businessName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const found = existingParties.find((p) => {
      if (parsed.gstin && p.gstin && p.gstin.toUpperCase() === parsed.gstin.toUpperCase()) return true;
      const pPhone = (p.phone || '').replace(/\D/g, '').slice(-10);
      if (normPhone && normPhone.length === 10 && pPhone === normPhone) return true;
      const pName = (p.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return normName.length >= 4 && pName === normName;
    });
    setMatchedPartyId(found?.id);
    setStep('review');
  };

  const runImageScan = async (useAI: boolean, explicitFile?: File | null) => {
    const target = explicitFile ?? uploadedFile;
    if (!target) {
      setErrorMsg('Please paste a Snipping Tool screenshot (Ctrl+V) or upload a business card photo first.');
      return;
    }
    setErrorMsg(null);
    setIsProcessing(true);

    try {
      let parsed: ParsedBusinessCard;
      if (useAI) {
        if (!geminiKey.trim()) {
          setShowKeyInput(true);
          setIsProcessing(false);
          setErrorMsg('Enter your Gemini API key below, or click "Re-Scan Offline (OCR)".');
          return;
        }
        setProgressMsg('AI Vision reading business card...');
        parsed = await scanBusinessCardWithGemini({ file: target }, geminiKey);
      } else {
        setProgressMsg('Enhancing card & reading GSTIN, phone, email, address...');
        parsed = await scanBusinessCardOffline(target, (_pct, status) => setProgressMsg(status));
      }

      if (!parsed.businessName && !parsed.gstin && !parsed.phone && !parsed.email && !parsed.address) {
        setErrorMsg(
          'Could not read clear text from that photo. Switch to "Paste Contact Text" or configure a free Gemini AI key for angled/handwritten cards.',
        );
      } else {
        applyExtractedCard(parsed);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Business card scan failed');
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  const handleFileSelected = (rawFile: File | Blob) => {
    const file = toCardFile(rawFile);
    setErrorMsg(null);
    setUploadedFile(file);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    });
    void runImageScan(Boolean(geminiKey.trim()), file);
  };
  handleFileRef.current = handleFileSelected;

  const handlePasteClipboard = async () => {
    setErrorMsg(null);
    try {
      if (navigator.clipboard && 'read' in navigator.clipboard) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imgType = item.types.find((t) => t.startsWith('image/'));
          if (imgType) {
            const blob = await item.getType(imgType);
            handleFileSelected(blob);
            return;
          }
        }
      }
      if (navigator.clipboard && 'readText' in navigator.clipboard) {
        const text = (await navigator.clipboard.readText())?.trim();
        if (text) {
          setRawText(text);
          setActiveTab('text');
          applyExtractedCard(parseBusinessCardText(text));
          return;
        }
      }
      setErrorMsg('No screenshot found in clipboard yet — capture one with Win+Shift+S first, or press Ctrl+V.');
    } catch {
      setErrorMsg('Press Ctrl+V directly anywhere in this modal to paste your Snipping Tool screenshot.');
    }
  };

  const handleParseContactText = async (useAI: boolean) => {
    setErrorMsg(null);
    if (!rawText.trim()) {
      setErrorMsg('Paste contact details, WhatsApp card text, or email signature first.');
      return;
    }
    if (useAI) {
      if (!geminiKey.trim()) {
        setShowKeyInput(true);
        return;
      }
      setIsProcessing(true);
      setProgressMsg('AI structuring contact details...');
      try {
        const parsed = await scanBusinessCardWithGemini({ text: rawText }, geminiKey);
        applyExtractedCard(parsed);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'AI extraction failed');
      } finally {
        setIsProcessing(false);
        setProgressMsg('');
      }
    } else {
      applyExtractedCard(parseBusinessCardText(rawText));
    }
  };

  const matchedParty = useMemo(
    () => (matchedPartyId ? existingParties.find((p) => p.id === matchedPartyId) : undefined),
    [matchedPartyId, existingParties],
  );

  const gstinCheck = useMemo(() => validateGstin(card.gstin), [card.gstin]);

  const handleConfirm = () => {
    if (!card.businessName.trim() && !card.contactPerson.trim()) {
      setErrorMsg('Please enter at least the Business / Firm Name before applying.');
      return;
    }
    onApplyParty({
      ...card,
      businessName: card.businessName.trim() || card.contactPerson.trim(),
      gstin: card.gstin.trim().toUpperCase(),
      matchedPartyId,
      saveToMaster,
    });
    onClose();
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={`Scan Business Card — ${partyLabel} Details`}
      subtitle="Snip (Win+Shift+S), paste (Ctrl+V), or upload a visiting card photo to auto-fill Name, GSTIN, Phone, Email & Address"
      footer={
        <div className="flex flex-wrap items-center justify-between w-full gap-2">
          <div>
            {step === 'review' ? (
              <button type="button" onClick={() => setStep('input')} className="btn-secondary text-xs">
                &larr; Re-Scan Card
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowKeyInput((v) => !v)}
                className="text-xs font-semibold text-slate-600 hover:text-brand-700 flex items-center gap-1 cursor-pointer"
              >
                <KeyRound className="h-3.5 w-3.5" />
                <span>{geminiKey ? 'Gemini AI Key Saved ✓' : 'Setup AI Key (For Tilted / Handwritten Cards)'}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="btn-secondary text-xs">
              Cancel
            </button>
            {step === 'review' && (
              <button
                type="button"
                onClick={handleConfirm}
                className="btn-primary bg-emerald-600 hover:bg-emerald-700 text-xs flex items-center gap-1.5 shadow-sm"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Fill {partyLabel} Details</span>
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

        {showKeyInput && step === 'input' && (
          <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-indigo-950">Optional Google Gemini API Key</span>
              <button
                type="button"
                onClick={() => {
                  saveGeminiApiKey(geminiKey);
                  setShowKeyInput(false);
                }}
                className="btn-primary py-1 px-2.5 text-[11px]"
              >
                Save Key
              </button>
            </div>
            <input
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="Paste AIzaSy... Gemini key (optional — offline OCR works free without a key)"
              className="input bg-white font-mono text-xs"
            />
          </div>
        )}

        {step === 'input' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setActiveTab('image')}
                className={`py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'image' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Camera className="h-4 w-4 text-indigo-600" />
                <span>Business Card Photo / Snip SS</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('text')}
                className={`py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'text' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <MessageSquare className="h-4 w-4 text-emerald-600" />
                <span>Paste Contact / Signature Text</span>
              </button>
            </div>

            {activeTab === 'image' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-indigo-50/80 border border-indigo-200/80">
                  <div className="flex items-center gap-2 text-indigo-950">
                    <CreditCard className="h-4 w-4 text-indigo-600 shrink-0" />
                    <span>
                      Take SS with <kbd className="px-1.5 py-0.5 rounded bg-white border border-indigo-300 font-mono text-[10px]">Win+Shift+S</kbd> &amp; press{' '}
                      <kbd className="px-1.5 py-0.5 rounded bg-white border border-indigo-300 font-mono text-[10px]">Ctrl+V</kbd> — reads dark/light cards automatically!
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handlePasteClipboard}
                    disabled={isProcessing}
                    className="btn-primary bg-indigo-600 hover:bg-indigo-700 text-xs py-1.5 px-3 flex items-center gap-1.5 shrink-0"
                  >
                    <Clipboard className="h-3.5 w-3.5" />
                    <span>Paste Card SS (Clipboard)</span>
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelected(f);
                    e.target.value = '';
                  }}
                  className="hidden"
                />

                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f) handleFileSelected(f);
                  }}
                  className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl p-6 text-center bg-slate-50/70 hover:bg-indigo-50/20 transition cursor-pointer"
                >
                  {previewUrl ? (
                    <div className="space-y-2">
                      <img
                        src={previewUrl}
                        alt="Business card preview"
                        className="max-h-48 mx-auto rounded-xl border border-slate-200 shadow-xs object-contain"
                      />
                      <p className="font-bold text-slate-700">{uploadedFile?.name} (Click or Ctrl+V to replace)</p>
                    </div>
                  ) : (
                    <div className="py-4 space-y-2">
                      <Camera className="h-10 w-10 mx-auto text-indigo-500" />
                      <p className="font-bold text-slate-800 text-sm">
                        Press <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-300 text-[11px] font-mono">Ctrl+V</kbd> to paste Visiting Card SS, drop photo, or click to upload
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Reads Company Name, GSTIN, Phone, Email &amp; Address even on colorful or dark cards
                      </p>
                    </div>
                  )}
                </div>

                {isProcessing && (
                  <div className="p-3 rounded-xl bg-brand-50 border border-brand-200 text-brand-900 flex items-center gap-2 font-bold">
                    <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
                    <span>{progressMsg || 'Scanning business card...'}</span>
                  </div>
                )}

                {uploadedFile && !isProcessing && (
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => runImageScan(false)}
                      className="btn-secondary text-xs font-bold flex items-center gap-1.5"
                    >
                      <Search className="h-3.5 w-3.5" />
                      <span>Re-Scan Offline (OCR)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => runImageScan(true)}
                      className="btn-primary bg-indigo-600 hover:bg-indigo-700 text-xs font-bold flex items-center gap-1.5"
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                      <span>Scan with AI Vision</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'text' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800">
                    Paste Email Signature, WhatsApp Contact Info, or GST Certificate text:
                  </label>
                  <button
                    type="button"
                    onClick={() => setRawText(SAMPLE_CARD_TEXT)}
                    className="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer"
                  >
                    Try Sample Business Card
                  </button>
                </div>
                <textarea
                  rows={7}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Paste business card text, email footer, or GSTIN & address message..."
                  className="input bg-white font-mono text-xs leading-relaxed w-full"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  {geminiKey && (
                    <button
                      type="button"
                      onClick={() => handleParseContactText(true)}
                      disabled={isProcessing}
                      className="btn-secondary border-indigo-200 bg-indigo-50 text-indigo-800 font-bold text-xs flex items-center gap-1.5"
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                      <span>Extract with AI</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleParseContactText(false)}
                    disabled={isProcessing}
                    className="btn-primary text-xs font-bold flex items-center gap-1.5"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    <span>Extract {partyLabel} Fields</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-3">
            {matchedParty && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-emerald-700 shrink-0" />
                  <span>
                    Matched existing {partyLabel.toLowerCase()}: <strong>{matchedParty.name}</strong>
                    {matchedParty.gstin ? ` (${matchedParty.gstin})` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCard((prev) => ({
                      ...prev,
                      businessName: matchedParty.name || prev.businessName,
                      phone: matchedParty.phone || prev.phone,
                      gstin: matchedParty.gstin || prev.gstin,
                      email: matchedParty.email || prev.email,
                      address: matchedParty.address || prev.address,
                      state: matchedParty.state || prev.state,
                      stateCode: matchedParty.stateCode || prev.stateCode,
                    }));
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white border border-emerald-300 text-emerald-800 font-bold text-[11px] hover:bg-emerald-100 cursor-pointer"
                >
                  Use Saved Record Details
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Business / Firm Name *</label>
                <input
                  type="text"
                  value={card.businessName}
                  onChange={(e) => setCard((p) => ({ ...p, businessName: e.target.value }))}
                  className="input bg-white font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  GSTIN {card.gstin && (
                    <span className={`ml-1.5 text-[10px] font-mono px-1.5 py-0.5 rounded ${gstinCheck.valid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                      {gstinCheck.valid ? `Valid${card.state ? ` · ${card.state}` : ''}` : 'Check Format'}
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  value={card.gstin}
                  onChange={(e) => {
                    const g = e.target.value.toUpperCase();
                    const sc = g.length >= 2 ? g.slice(0, 2) : '';
                    const st = sc ? getStateByCode(sc) : '';
                    setCard((p) => ({
                      ...p,
                      gstin: g,
                      pan: g.length >= 12 ? g.slice(2, 12) : p.pan,
                      stateCode: st ? sc : p.stateCode,
                      state: st || p.state,
                    }));
                  }}
                  placeholder="15-digit GSTIN"
                  className="input bg-white font-mono uppercase"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Phone / Mobile</label>
                <input
                  type="text"
                  value={card.phone}
                  onChange={(e) => setCard((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="10-digit mobile"
                  className="input bg-white font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={card.email}
                  onChange={(e) => setCard((p) => ({ ...p, email: e.target.value }))}
                  placeholder="email@company.com"
                  className="input bg-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Contact Person</label>
                <input
                  type="text"
                  value={card.contactPerson}
                  onChange={(e) => setCard((p) => ({ ...p, contactPerson: e.target.value }))}
                  placeholder="Optional owner / contact name"
                  className="input bg-white"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">State</label>
                <select
                  value={card.state}
                  onChange={(e) => {
                    const st = e.target.value;
                    const found = indianStates.find((x) => x.state === st);
                    setCard((p) => ({ ...p, state: st, stateCode: found?.code || p.stateCode }));
                  }}
                  className="input bg-white"
                >
                  <option value="">Select State...</option>
                  {indianStates.map((s) => (
                    <option key={s.code} value={s.state}>
                      {s.state} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Billing / Shop Address</label>
                <textarea
                  rows={2}
                  value={card.address}
                  onChange={(e) => setCard((p) => ({ ...p, address: e.target.value }))}
                  className="input bg-white w-full"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Business Category / Card Notes</label>
                <input
                  type="text"
                  value={card.notes}
                  onChange={(e) => setCard((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Products, job work, specialty..."
                  className="input bg-white"
                />
              </div>
            </div>

            {showSaveToMasterOption && !matchedParty && (
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={saveToMaster}
                  onChange={(e) => setSaveToMaster(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>
                  Also save this scanned business card directly to {partyLabel} Master (keeps Email &amp; Notes)
                </span>
              </label>
            )}

            {card.rawText && (
              <details className="text-[11px] text-slate-500">
                <summary className="cursor-pointer font-semibold hover:text-slate-700">
                  View raw OCR / extracted text
                </summary>
                <pre className="mt-1.5 p-2.5 rounded-lg bg-slate-100 border border-slate-200 whitespace-pre-wrap font-mono text-[10.5px] max-h-28 overflow-y-auto">
                  {card.rawText}
                </pre>
              </details>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
