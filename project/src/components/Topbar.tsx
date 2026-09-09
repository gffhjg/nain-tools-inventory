import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Search, Bell, ChevronDown, Package, Truck, ShoppingCart, Users, Building2, Boxes, CheckCheck, Trash2, AlertTriangle, XCircle, Info, CheckCircle2, Command, X } from 'lucide-react';
import { useStore } from '@/store/AppStore';
import { useNotifications, type NotificationType } from '@/store/NotificationStore';
import { smartSearchMatch } from '@/utils/search';

type SearchResult = {
  id: string;
  label: string;
  sublabel: string;
  type: 'product' | 'sale' | 'purchase' | 'customer' | 'supplier';
  route: string;
  icon: React.ComponentType<{ className?: string }>;
  score?: number;
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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const navigate = useNavigate();
  const searchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const paletteInputRef = useRef<HTMLInputElement>(null);
  const { products, sales, purchases, customers, suppliers } = useStore();
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } = useNotifications();

  const results = useMemo<SearchResult[]>(() => {
    const q = searchQuery.trim();
    if (!q) return [];
    const matches: SearchResult[] = [];

    for (const p of products) {
      const match = smartSearchMatch([p.name, p.category, p.rackNumber, p.supplier, p.size], q);
      if (match.matched) {
        matches.push({ id: p.id, label: p.name, sublabel: `Product · Rack ${p.rackNumber} · ${p.category}`, type: 'product', route: `/products/${p.id}`, icon: Package, score: match.score });
      }
    }
    for (const s of sales) {
      const match = smartSearchMatch([s.invoice, s.customer, s.phone], q);
      if (match.matched) {
        matches.push({ id: s.id, label: s.invoice, sublabel: `Sale Invoice · ${s.customer} · ${s.date}`, type: 'sale', route: '/sales', icon: ShoppingCart, score: match.score });
      }
    }
    for (const p of purchases) {
      const match = smartSearchMatch([p.poNumber, p.supplier, p.supplierInvoice], q);
      if (match.matched) {
        matches.push({ id: p.id, label: p.poNumber, sublabel: `Purchase Order · ${p.supplier}`, type: 'purchase', route: `/purchase/${p.id}`, icon: Truck, score: match.score });
      }
    }
    for (const c of customers) {
      const match = smartSearchMatch([c.name, c.phone, c.gstin], q);
      if (match.matched) {
        matches.push({ id: c.id, label: c.name, sublabel: `Customer · ${c.phone}${c.gstin ? ' · GST: ' + c.gstin : ''}`, type: 'customer', route: `/customers/${c.id}`, icon: Users, score: match.score });
      }
    }
    for (const s of suppliers) {
      const match = smartSearchMatch([s.name, s.phone, s.gstin], q);
      if (match.matched) {
        matches.push({ id: s.id, label: s.name, sublabel: `Supplier · ${s.phone}${s.gstin ? ' · GST: ' + s.gstin : ''}`, type: 'supplier', route: `/suppliers/${s.id}`, icon: Building2, score: match.score });
      }
    }

    matches.sort((a, b) => (b.score || 0) - (a.score || 0));
    return matches.slice(0, 10);
  }, [searchQuery, products, sales, purchases, customers, suppliers]);

  // Handle global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
        setTimeout(() => paletteInputRef.current?.focus(), 50);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

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
    setPaletteOpen(false);
  };

  const handlePaletteKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        handleResultClick(results[selectedIndex].route);
      }
    } else if (e.key === 'Escape') {
      setPaletteOpen(false);
    }
  };

  const handleNotifClick = (id: string) => {
    markAsRead(id);
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-md lg:px-6">
      <button
        onClick={onMenuClick}
        className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Global Inline Search Bar */}
      <div ref={searchRef} className="relative hidden flex-1 max-w-md sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          placeholder="Search products, invoices, customers, suppliers... (Ctrl+K)"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-12 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
        <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
          <span>⌘K</span>
        </div>

        {searchFocused && searchQuery && (
          <div className="absolute mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg z-30 animate-fade-in">
            {results.length > 0 ? (
              results.map((r) => {
                const Icon = r.icon;
                return (
                  <button
                    key={`${r.type}-${r.id}`}
                    onClick={() => handleResultClick(r.route)}
                    className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-slate-50"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{r.label}</p>
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

      {/* Floating Ctrl+K Command Palette Modal */}
      {paletteOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div
            className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center border-b border-slate-200 px-4 py-3">
              <Search className="h-5 w-5 text-brand-600 mr-3" />
              <input
                ref={paletteInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handlePaletteKeyDown}
                placeholder="Type to search products, customers, suppliers, invoices..."
                className="w-full bg-transparent text-base text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              <button
                onClick={() => setPaletteOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto p-2">
              {results.length > 0 ? (
                results.map((r, idx) => {
                  const Icon = r.icon;
                  const isSelected = idx === selectedIndex;
                  return (
                    <button
                      key={`palette-${r.type}-${r.id}`}
                      onClick={() => handleResultClick(r.route)}
                      className={`flex w-full items-center gap-3.5 rounded-xl px-3.5 py-3 text-left transition ${
                        isSelected ? 'bg-brand-50 text-brand-900 ring-1 ring-brand-200' : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isSelected ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{r.label}</p>
                        <p className="truncate text-xs text-slate-500">{r.sublabel}</p>
                      </div>
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        {r.type}
                      </span>
                    </button>
                  );
                })
              ) : searchQuery ? (
                <div className="py-12 text-center text-sm text-slate-400">
                  No records matching <span className="font-semibold text-slate-600">"{searchQuery}"</span>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">
                  Search across Products, Customers, Suppliers, Sales, and Purchase records.
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/80 px-4 py-2 text-xs text-slate-500">
              <div className="flex items-center gap-3">
                <span><kbd className="font-semibold text-slate-700">↑↓</kbd> navigate</span>
                <span><kbd className="font-semibold text-slate-700">↵</kbd> select</span>
                <span><kbd className="font-semibold text-slate-700">esc</kbd> close</span>
              </div>
              <span className="text-brand-600 font-semibold">Nain Tools Search</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
        {/* Quick Command Palette Button for mobile & desktop */}
        <button
          onClick={() => {
            setPaletteOpen(true);
            setTimeout(() => paletteInputRef.current?.focus(), 50);
          }}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 sm:hidden"
        >
          <Search className="h-4 w-4 text-brand-600" />
          Search
        </button>

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
