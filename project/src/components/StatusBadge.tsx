type StatusBadgeProps = {
  status: string;
  variant?: 'default' | 'stock' | 'box';
};

const toneMap: Record<string, string> = {
  // sale statuses
  paid: 'bg-accent-100 text-accent-700',
  'partially-paid': 'bg-amber-100 text-amber-600',
  pending: 'bg-warn-100 text-warn-600',
  draft: 'bg-slate-100 text-slate-600',
  cancelled: 'bg-err-100 text-err-600',
  overdue: 'bg-err-100 text-err-600',
  // purchase statuses
  received: 'bg-accent-100 text-accent-700',
  ordered: 'bg-brand-100 text-brand-700',
  'partially-received': 'bg-amber-100 text-amber-600',
  // stock
  'in-stock': 'bg-accent-100 text-accent-700',
  'low-stock': 'bg-warn-100 text-warn-600',
  'out-of-stock': 'bg-err-100 text-err-600',
  // box status
  'Full': 'bg-accent-100 text-accent-700',
  '75% Full': 'bg-brand-100 text-brand-700',
  'Half': 'bg-amber-100 text-amber-600',
  'Very Low': 'bg-orange-100 text-orange-600',
  'Almost Empty': 'bg-err-100 text-err-600',
  'Empty': 'bg-slate-200 text-slate-600',
};

const labelMap: Record<string, string> = {
  'in-stock': 'In Stock',
  'low-stock': 'Low Stock',
  'out-of-stock': 'Out of Stock',
  'partially-paid': 'Partially Paid',
  'partially-received': 'Partially Received',
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const tone = toneMap[status] ?? 'bg-slate-100 text-slate-600';
  const label = labelMap[status] ?? (status.charAt(0).toUpperCase() + status.slice(1));

  return (
    <span className={`badge ${tone}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
