type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
};

export default function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="sticky top-16 z-10 -mx-3 sm:-mx-6 mb-6 bg-slate-50/90 px-3 sm:px-6 py-3.5 backdrop-blur-md border-b border-slate-200/60 transition-all">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight bg-gradient-to-r from-slate-900 via-slate-800 to-brand-900 bg-clip-text text-transparent">
            {title}
          </h1>
          {subtitle && <p className="mt-1 text-xs font-medium text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2.5 flex-wrap">{actions}</div>}
      </div>
    </div>
  );
}
