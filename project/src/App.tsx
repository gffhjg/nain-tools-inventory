import React, { Component, type ReactNode } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Products from '@/pages/Products';
import Sales from '@/pages/Sales';
import Purchase from '@/pages/Purchase';
import Reports from '@/pages/Reports';
import Settings from '@/pages/Settings';
import ProductHistory from '@/pages/ProductHistory';
import ImportProducts from '@/pages/ImportProducts';
import Customers from '@/pages/Customers';
import Suppliers from '@/pages/Suppliers';
import CustomerDetail from '@/pages/CustomerDetail';
import SupplierDetail from '@/pages/SupplierDetail';
import PurchaseDetails from '@/pages/PurchaseDetails';
import NotFound from '@/pages/NotFound';
import { StoreProvider } from '@/store/AppStore';
import { NotificationProvider } from '@/store/NotificationStore';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Unhandled UI exception in App:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-6 text-center space-y-4">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center mx-auto">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">Something went wrong</h2>
              <p className="text-xs text-slate-500 mt-1">
                {this.state.error?.message || 'An unexpected rendering error occurred.'}
              </p>
            </div>
            <div className="flex gap-2 justify-center pt-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-xs cursor-pointer"
              >
                Reload Page
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.removeItem('nain_tools_seeded_v6');
                    localStorage.removeItem('nain_tools_seeded_v5');
                  } catch {}
                  window.location.reload();
                }}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Reset &amp; Reload
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <ErrorBoundary>
      <NotificationProvider>
        <StoreProvider>
          <HashRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/products" element={<Products />} />
                <Route path="/sales" element={<Sales />} />
                <Route path="/purchase" element={<Purchase />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/suppliers" element={<Suppliers />} />
                <Route path="/products/:id" element={<ProductHistory />} />
                <Route path="/purchase/:id" element={<PurchaseDetails />} />
                <Route path="/customers/:id" element={<CustomerDetail />} />
                <Route path="/suppliers/:id" element={<SupplierDetail />} />
                <Route path="/import" element={<ImportProducts />} />
                <Route path="/import-products" element={<ImportProducts />} />

                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </HashRouter>
        </StoreProvider>
      </NotificationProvider>
    </ErrorBoundary>
  );
}

export default App;
