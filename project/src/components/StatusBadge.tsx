type StatusBadgeProps = {
  status: string;
  variant?: 'default' | 'stock' | 'box';
};

const toneMap: Record<string, string> = {
  // sale statuses
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
  'partially-paid': 'bg-amber-50 text-amber-700 border-amber-200/80',
  pending: 'bg-amber-50 text-amber-700 border-amber-200/80',
  draft: 'bg-slate-50 text-slate-600 border-slate-200/80',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200/80',
  overdue: 'bg-rose-50 text-rose-700 border-rose-200/80',
  // purchase statuses
  received: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
  ordered: 'bg-blue-50 text-blue-700 border-blue-200/80',
  'partially-received': 'bg-amber-50 text-amber-700 border-amber-200/80',
  // stock
  'in-stock': 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
  'low-stock': 'bg-amber-50 text-amber-700 border-amber-200/80',
  'out-of-stock': 'bg-rose-50 text-rose-700 border-rose-200/80',
  // box status
  'Full': 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
  '75% Full': 'bg-blue-50 text-blue-700 border-blue-200/80',
  'Half': 'bg-amber-50 text-amber-700 border-amber-200/80',
  'Very Low': 'bg-orange-50 text-orange-700 border-orange-200/80',
  'Almost Empty': 'bg-rose-50 text-rose-700 border-rose-200/80',
  'Empty': 'bg-slate-100 text-slate-600 border-slate-200/80',
};

const labelMap: Record<string, string> = {
  'in-stock': 'In Stock',
  'low-stock': 'Low Stock',
  'out-of-stock': 'Out of Stock',
  'partially-paid': 'Partially Paid',
  'partially-received': 'Partially Received',
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const tone = toneMap[status] ?? 'bg-slate-50 text-slate-600 border-slate-200/80';
  const label = labelMap[status] ?? (status.charAt(0).toUpperCase() + status.slice(1));
  const isPulsing = status === 'in-stock' || status === 'paid' || status === 'received' || status === 'low-stock';

  return (
    <span className={`badge ${tone} border shadow-xs hover:scale-105 select-none transition-all duration-200`}>
      <span className="relative flex h-2 w-2 items-center justify-center">
        {isPulsing && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-40" />
        )}
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current" />
      </span>
      {label}
    </span>
  );
}
