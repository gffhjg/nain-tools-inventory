import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useStore } from '@/store/AppStore';
import { Boxes, RefreshCw, AlertTriangle } from 'lucide-react';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { loading, error, refreshData } = useStore();

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden w-full">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:pl-64 w-full min-w-0 flex flex-col min-h-screen">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="px-3 py-4 sm:px-6 sm:py-6 w-full min-w-0 flex-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-600 via-indigo-600 to-brand-700 text-white shadow-xl shadow-brand-500/25">
                <Boxes className="h-8 w-8 animate-pulse" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 tracking-tight">
                  Loading Nain Tools Inventory
                </h3>
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  Connecting to database &amp; loading 5,376+ sales and 6,744 products...
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-brand-600 bg-brand-50 px-3 py-1.5 rounded-full border border-brand-200 shadow-2xs mt-1">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Syncing Database</span>
              </div>
            </div>
          ) : error ? (
            <div className="max-w-xl mx-auto my-12 p-6 rounded-2xl bg-rose-50 border border-rose-200 text-center space-y-4 shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-rose-600 text-white flex items-center justify-center mx-auto shadow-md">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-rose-950">Database Notice</h3>
                <p className="text-xs text-rose-800 mt-1">{error}</p>
              </div>
              <button
                type="button"
                onClick={() => refreshData()}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
              >
                Retry Database Connection
              </button>
            </div>
          ) : (
            <div className="w-full min-w-0">
              <Outlet />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
