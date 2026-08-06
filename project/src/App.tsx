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

function App() {
  return (
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

            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </HashRouter>
      </StoreProvider>
    </NotificationProvider>
  );
}

export default App;
