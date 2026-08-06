import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Search, Bell, ChevronDown, Package, Truck, ShoppingCart, Users, Building2, Boxes, CheckCheck, Trash2, AlertTriangle, XCircle, Info, CheckCircle2 } from 'lucide-react';
import { useStore } from '@/store/AppStore';
import { useNotifications, type NotificationType } from '@/store/NotificationStore';

type SearchResult = {
  id: string;
  label: string;
  sublabel: string;
  type: 'product' | 'sale' | 'purchase' | 'customer' | 'supplier';
  route: string;
  icon: React.ComponentType<{ className?: string }>;
};

type TopbarProps = {
  onMenuClick: () => void;
};

const notifIcon: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
  'low-stock': AlertTriangle,
  'out-of-stock': XCircle,
  'info': Info,
  'success': CheckCircle2,
  'warning': AlertTriangle,
  'error': XCircle,
};

const notifTone: Record<NotificationType, string> = {
  'low-stock': 'bg-warn-50 text-warn-600',
  'out-of-stock': 'bg-err-50 text-err-600',
  'info': 'bg-brand-50 text-brand-600',
  'success': 'bg-success-50 text-success-600',
  'warning': 'bg-warn-50 text-warn-600',
  'error': 'bg-err-50 text-err-600',
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function Topbar({ onMenuClick }: TopbarProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const navigate = useNavigate();
  const searchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const { products, sales, purchases, customers, suppliers } = useStore();
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } = useNotifications();

  const results = useMemo<SearchResult[]>(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return [];
    const matches: SearchResult[] = [];

    for (const p of products) {
      const haystack = `${p.name} ${p.category} ${p.rackNumber} ${p.supplier}`.toLowerCase();
      if (haystack.includes(q)) {
        matches.push({ id: p.id, label: p.name, sublabel: `Product · Rack ${p.rackNumber} · ${p.category}`, type: 'product', route: `/products/${p.id}`, icon: Package });
      }
    }
    for (const s of sales) {
      const haystack = `${s.invoice} ${s.customer} ${s.phone}`.toLowerCase();
      if (haystack.includes(q)) {
        matches.push({ id: s.id, label: s.invoice, sublabel: `Sale · ${s.customer} · ${s.date}`, type: 'sale', route: '/sales', icon: ShoppingCart });
      }
    }
    for (const p of purchases) {
      const haystack = `${p.poNumber} ${p.supplier} ${p.supplierInvoice}`.toLowerCase();
      if (haystack.includes(q)) {
        matches.push({ id: p.id, label: p.poNumber, sublabel: `Purchase · ${p.supplier}`, type: 'purchase', route: `/purchase/${p.id}`, icon: Truck });
      }
    }
    for (const c of customers) {
      const haystack = `${c.name} ${c.phone} ${c.gstin}`.toLowerCase();
      if (haystack.includes(q)) {
        matches.push({ id: c.id, label: c.name, sublabel: `Customer · ${c.phone}${c.gstin ? ' · ' + c.gstin : ''}`, type: 'customer', route: `/customers/${c.id}`, icon: Users });
      }
    }
    for (const s of suppliers) {
      const haystack = `${s.name} ${s.phone} ${s.gstin}`.toLowerCase();
      if (haystack.includes(q)) {
        matches.push({ id: s.id, label: s.name, sublabel: `Supplier · ${s.phone}${s.gstin ? ' · ' + s.gstin : ''}`, type: 'supplier', route: `/suppliers/${s.id}`, icon: Building2 });
      }
    }

    return matches.slice(0, 8);
  }, [searchQuery, products, sales, purchases, customers, suppliers]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleResultClick = (route: string) => {
    navigate(route);
    setSearchQuery('');
    setSearchFocused(false);
  };

  const handleNotifClick = (id: string) => {
    markAsRead(id);
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur-md lg:px-6">
      <button
        onClick={onMenuClick}
        className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Global search */}
      <div ref={searchRef} className="relative hidden flex-1 max-w-md sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          placeholder="Search products, invoices, POs, suppliers, customers, racks…"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
        {searchFocused && searchQuery && (
          <div className="absolute mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
            {results.length > 0 ? (
              results.map((r) => {
                const Icon = r.icon;
                return (
                  <button
                    key={`${r.type}-${r.id}`}
                    onClick={() => handleResultClick(r.route)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                      <Icon className="h-4 w-4 text-slate-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{r.label}</p>
                      <p className="truncate text-xs text-slate-400">{r.sublabel}</p>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-400">
                <Boxes className="h-4 w-4" />
                No results found for "{searchQuery}"
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
        {/* Notification bell */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => setNotifOpen((v) => !v)}
            className="relative rounded-xl p-2.5 text-slate-600 transition hover:bg-slate-100"
            title="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute right-2 top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-err-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-full z-30 mt-2 w-80 animate-scale-in origin-top-right overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-slate-500" />
                  <h3 className="text-sm font-semibold text-slate-800">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="rounded-full bg-err-50 px-2 py-0.5 text-xs font-semibold text-err-600">{unreadCount} new</span>
                  )}
                </div>
                {notifications.length > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="flex items-center gap-1 text-xs font-medium text-brand-600 transition hover:text-brand-700"
                    title="Mark all as read"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Mark all read
                  </button>
                )}
              </div>

              {/* List */}
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                    <Bell className="h-8 w-8 text-slate-200" />
                    <p className="text-sm text-slate-400">No notifications</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {notifications.map((n) => {
                      const Icon = notifIcon[n.type];
                      return (
                        <button
                          key={n.id}
                          onClick={() => handleNotifClick(n.id)}
                          className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${!n.read ? 'bg-brand-50/30' : ''}`}
                        >
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${notifTone[n.type]}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-slate-800">{n.title}</p>
                              {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-err-500" />}
                            </div>
                            <p className="mt-0.5 text-xs text-slate-500">{n.message}</p>
                            <p className="mt-1 text-xs text-slate-400">{timeAgo(n.timestamp)}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              {notifications.length > 0 && (
                <div className="border-t border-slate-100 px-4 py-2.5">
                  <button
                    onClick={clearAll}
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-err-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Clear all
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mx-1 hidden h-8 w-px bg-slate-200 sm:block" />

        <div className="relative">
          <button
            onClick={() => setProfileOpen((v) => !v)}
            className="flex items-center gap-2.5 rounded-xl p-1.5 pr-2 transition hover:bg-slate-100"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white">
              NT
            </div>
            <div className="hidden text-left leading-tight sm:block">
              <p className="text-sm font-semibold text-slate-800">Tanishq Nain</p>
              <p className="text-xs text-slate-500">Owner</p>
            </div>
            <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
          </button>

          {profileOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} />
              <div className="absolute right-0 top-full z-20 mt-2 w-56 animate-scale-in origin-top-right rounded-xl border border-slate-200 bg-white p-1.5 shadow-card">
                <div className="border-b border-slate-100 px-3 py-2.5">
                  <p className="text-sm font-semibold text-slate-800">Tanishq Nain</p>
                  <p className="text-xs text-slate-500">tanishq@naintools.in</p>
                </div>
                <div className="py-1">
                  <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50">
                    My Profile
                  </button>
                  <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50">
                    Account Settings
                  </button>
                  <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50">
                    Notifications
                  </button>
                </div>
                <div className="border-t border-slate-100 pt-1">
                  <button className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-err-600 hover:bg-err-50">
                    Sign out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
