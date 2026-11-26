import { useState, useEffect, useRef } from 'react';
import { CreditCard, Clipboard, Upload, MessageSquare } from 'lucide-react';
import BusinessCardScannerModal, {
  type AppliedBusinessCardResult,
  type PartyMatchCandidate,
} from '@/components/BusinessCardScannerModal';

export interface BusinessCardDropBarProps {
  partyType: 'customer' | 'supplier';
  existingParties?: PartyMatchCandidate[];
  onApplyParty: (data: AppliedBusinessCardResult) => void;
  showSaveToMasterOption?: boolean;
}

/**
 * Compact Business Card / Visiting Card scanner bar placed at Party Details
 * in Invoices, Company POs, Purchase Orders, Purchase Bills, Customers & Suppliers.
 * Listens only for image Ctrl+V pastes so normal text pasting inside form inputs works seamlessly.
 */
export default function BusinessCardDropBar({
  partyType,
  existingParties = [],
  onApplyParty,
  showSaveToMasterOption = true,
}: BusinessCardDropBarProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'image' | 'text'>('image');
  const [capturedImage, setCapturedImage] = useState<File | Blob | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const partyLabel = partyType === 'supplier' ? 'Supplier' : 'Customer';

  const openWithCardImage = (file: File | Blob) => {
    setCapturedImage(file);
    setModalTab('image');
    setModalOpen(true);
  };

  useEffect(() => {
    if (modalOpen) return;
    const onPaste = (e: ClipboardEvent) => {
      if (document.querySelector('[data-scanner-modal="true"]')) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            openWithCardImage(blob);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [modalOpen]);

  const handlePasteClick = async () => {
    try {
      if (navigator.clipboard && 'read' in navigator.clipboard) {
        const clipItems = await navigator.clipboard.read();
        for (const item of clipItems) {
          const imgType = item.types.find((t) => t.startsWith('image/'));
          if (imgType) {
            const blob = await item.getType(imgType);
            openWithCardImage(blob);
            return;
          }
        }
      }
      setCapturedImage(null);
      setModalTab('image');
      setModalOpen(true);
    } catch {
      setCapturedImage(null);
      setModalTab('image');
      setModalOpen(true);
    }
  };

  return (
    <>
      <div
        data-testid="business-card-drop-bar"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) openWithCardImage(f);
        }}
        className={`rounded-xl border-2 border-dashed px-3.5 py-2.5 transition ${
          isDragOver
            ? 'border-indigo-500 bg-indigo-50/90 shadow-sm'
            : 'border-indigo-200/90 bg-gradient-to-r from-indigo-50/75 via-white to-emerald-50/60'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) openWithCardImage(f);
            e.target.value = '';
          }}
          className="hidden"
        />

        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <CreditCard className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-extrabold text-indigo-950">
                  Scan {partyLabel} Business Card
                </span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                  Auto-Fills GSTIN · Phone · Email · Address
                </span>
              </div>
              <p className="text-[11px] text-slate-600 truncate sm:whitespace-normal">
                Snip a visiting card (<kbd className="px-1 py-0.5 rounded bg-white border border-slate-300 font-mono text-[10px]">Win+Shift+S</kbd>) &amp; press{' '}
                <kbd className="px-1 py-0.5 rounded bg-white border border-slate-300 font-mono text-[10px]">Ctrl+V</kbd>, or drop/upload card photo
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handlePasteClick}
              className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
            >
              <Clipboard className="h-3.5 w-3.5" />
              <span>Paste Card SS</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-indigo-200 text-indigo-800 text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Upload Card</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setCapturedImage(null);
                setModalTab('text');
                setModalOpen(true);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
              title="Paste contact details or WhatsApp card signature text"
            >
              <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
              <span>Paste Contact</span>
            </button>
          </div>
        </div>
      </div>

      <BusinessCardScannerModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setCapturedImage(null);
        }}
        partyType={partyType}
        existingParties={existingParties}
        initialTab={modalTab}
        initialImageFile={capturedImage}
        onApplyParty={onApplyParty}
        showSaveToMasterOption={showSaveToMasterOption}
      />
    </>
  );
}
