import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Truck,
  BarChart3,
  Settings,
  Boxes,
  Users,
  Building2,
  X,
} from 'lucide-react';

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/sales', label: 'Sales', icon: ShoppingCart },
  { to: '/purchase', label: 'Purchases', icon: Truck },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/suppliers', label: 'Suppliers', icon: Building2 },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

type SidebarProps = {
  open: boolean;
  onClose: () => void;
};

export default function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm transition-opacity lg:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-white/95 backdrop-blur-xl border-r border-slate-200/80 text-slate-700 shadow-sm transition-transform duration-300 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between px-5 border-b border-slate-200/70">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 via-indigo-600 to-brand-700 text-white shadow-md shadow-brand-500/25 ring-1 ring-brand-500/20">
              <Boxes className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <span className="block text-base font-extrabold tracking-tight text-slate-900">Nain Tools</span>
              <span className="block text-[10.5px] font-bold text-brand-600 tracking-wider uppercase">Bolt &amp; Fastener Co.</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="mt-3 flex-1 space-y-1 px-3">
          <p className="px-3 pb-1.5 pt-2 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
            Navigation
          </p>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={onClose}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-r from-brand-600 via-indigo-600 to-brand-700 text-white shadow-md shadow-brand-600/25 ring-1 ring-brand-500/20 translate-x-0.5'
                      : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-950 hover:translate-x-0.5'
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-3" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Database & System Live Indicator */}
        <div className="p-3 m-3 rounded-xl bg-slate-50/90 border border-slate-200/80 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[11px] font-bold text-slate-700">Local Database Online</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5 font-mono">PGlite WASM · IndexedDB</p>
        </div>
      </aside>
    </>
  );
}
