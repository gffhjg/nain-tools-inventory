import { useState, useEffect } from 'react';
import { ClipboardCheck, CheckCircle2 } from 'lucide-react';
import Modal from '@/components/Modal';
import StatusBadge from '@/components/StatusBadge';
import { boxStatuses, computeBoxStatus } from '@/lib/constants';
import type { Product, BoxStatus, VerificationRecord } from '@/lib/types';

type VerificationModalProps = {
  open: boolean;
  product: Product | null;
  onClose: () => void;
  onSave: (v: VerificationRecord) => void;
};

const boxLabelMap: Record<BoxStatus, string> = {
  'Full': 'Full (90-100%)',
  '75% Full': '75% Full (70-89%)',
  'Half': 'Half (40-69%)',
  'Very Low': 'Very Low (15-39%)',
  'Almost Empty': 'Almost Empty (1-14%)',
  'Empty': 'Empty (0%)',
};

export default function VerificationModal({ open, product, onClose, onSave }: VerificationModalProps) {
  const [mode, setMode] = useState<'boxstatus' | 'quantity'>('boxstatus');
  const [selectedStatus, setSelectedStatus] = useState<BoxStatus>('Full');
  const [quantity, setQuantity] = useState(0);
  const [remark, setRemark] = useState('');
  const [user, setUser] = useState('Tanishq Nain');

  useEffect(() => {
    if (product) {
      setMode('boxstatus');
      setSelectedStatus(product.boxStatus);
      setQuantity(product.stock);
      setRemark('');
      setUser('Tanishq Nain');
    }
  }, [product]);

  if (!product) return null;

  const previousEstimate = product.stock;

  const observedEstimate = mode === 'quantity' ? Math.max(0, quantity) : estimateFromBoxStatus(selectedStatus, product.boxCapacity);

  const handleSave = () => {
    const v: VerificationRecord = {
      id: `v${Date.now()}`,
      productId: product.id,
      date: new Date().toISOString().slice(0, 10),
      user: user.trim() || 'Staff',
      remark: remark.trim(),
      previousEstimate,
      observedEstimate,
      boxStatus: mode === 'quantity' ? computeBoxStatus(observedEstimate, product.boxCapacity) : selectedStatus,
    };
    onSave(v);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Physical Verification"
      subtitle={`${product.name} · Rack ${product.rackNumber}`}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave}>
            <CheckCircle2 className="h-4 w-4" />
            Save Verification
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Current state */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-400">Previous Estimate</p>
            <p className="mt-0.5 text-lg font-bold text-slate-900">{previousEstimate.toLocaleString('en-IN')} pcs</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-400">Box Capacity</p>
            <p className="mt-0.5 text-lg font-bold text-slate-900">{product.boxCapacity.toLocaleString('en-IN')} pcs</p>
          </div>
        </div>

        {/* Mode toggle */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Verification Method</label>
          <div className="flex gap-2">
            <button
              onClick={() => setMode('boxstatus')}
              className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition ${
                mode === 'boxstatus' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Box Status Level
            </button>
            <button
              onClick={() => setMode('quantity')}
              className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition ${
                mode === 'quantity' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Approximate Quantity
            </button>
          </div>
        </div>

        {mode === 'boxstatus' ? (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Select Box Status</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {boxStatuses.map((bs) => (
                <button
                  key={bs}
                  onClick={() => setSelectedStatus(bs)}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                    selectedStatus === bs ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {boxLabelMap[bs]}
                  {selectedStatus === bs && <CheckCircle2 className="h-4 w-4 text-brand-500" />}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Will set observed stock to ~{estimateFromBoxStatus(selectedStatus, product.boxCapacity).toLocaleString('en-IN')} pieces.
            </p>
          </div>
        ) : (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Approximate Remaining Quantity (Pieces)</label>
            <input
              type="number"
              min="0"
              value={quantity || ''}
              onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 0)}
              placeholder="e.g. 3500"
              className="input"
            />
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-slate-400">Box Status will be:</span>
              <StatusBadge status={computeBoxStatus(observedEstimate, product.boxCapacity)} variant="box" />
            </div>
          </div>
        )}

        {/* User + Remark */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Verified By</label>
            <input
              type="text"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="Your name"
              className="input"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Remark (Optional)</label>
            <input
              type="text"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="e.g. Checked rack A-01 visually"
              className="input"
            />
          </div>
        </div>

        {/* Summary */}
        <div className="flex items-center gap-2.5 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <ClipboardCheck className="h-5 w-5 shrink-0 text-brand-600" />
          <p className="text-sm font-medium text-brand-700">
            Observed estimate: <span className="font-bold">{observedEstimate.toLocaleString('en-IN')}</span> pieces
            {observedEstimate !== previousEstimate && (
              <span className="text-slate-500"> ({observedEstimate > previousEstimate ? '+' : ''}{(observedEstimate - previousEstimate).toLocaleString('en-IN')} pcs)</span>
            )}
          </p>
        </div>
      </div>
    </Modal>
  );
}

function estimateFromBoxStatus(status: BoxStatus, boxCapacity: number): number {
  const midpoints: Record<BoxStatus, number> = {
    'Full': 0.95,
    '75% Full': 0.80,
    'Half': 0.55,
    'Very Low': 0.27,
    'Almost Empty': 0.07,
    'Empty': 0,
  };
  return Math.round(boxCapacity * midpoints[status]);
}
