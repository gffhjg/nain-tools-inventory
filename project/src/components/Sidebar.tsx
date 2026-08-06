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
  { to: '/purchase', label: 'Purchase Bills', icon: Truck },
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
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-brand-950 text-slate-200 transition-transform duration-300 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-white shadow-lg shadow-brand-500/30">
              <Boxes className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <span className="block text-base font-bold tracking-tight text-white">Nain Tools</span>
              <span className="block text-[11px] font-medium text-brand-300">Bolt & Fastener Co.</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="mt-2 flex-1 space-y-1 px-3">
          <p className="px-3 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-wider text-brand-400/70">
            Menu
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
                  `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/25'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Footer card */}
        <div className="m-4 rounded-2xl bg-gradient-to-br from-brand-600/30 to-brand-800/20 p-4 ring-1 ring-white/10">
          <p className="text-sm font-semibold text-white">Need help?</p>
          <p className="mt-1 text-xs text-brand-200/80">
            Check the docs or contact support for setup guidance.
          </p>
          <button className="mt-3 w-full rounded-lg bg-white/10 py-2 text-xs font-semibold text-white transition hover:bg-white/20">
            View Docs
          </button>
        </div>
      </aside>
    </>
  );
}
