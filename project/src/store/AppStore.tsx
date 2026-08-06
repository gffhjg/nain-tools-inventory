import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { withComputed } from '@/lib/constants';
import { useNotifications } from '@/store/NotificationStore';
import type {
  Product, SaleRecord, PurchaseRecord, VerificationRecord,
  Customer, Supplier, SaleStatus, PurchaseStatus,
} from '@/lib/types';

export type ProductFormData = Omit<Product, 'id' | 'status' | 'boxStatus' | 'stock' | 'lastPhysicalObservation' | 'boxStatusMode' | 'manualBoxStatus'>;

type StoreContextValue = {
  products: Product[];
  sales: SaleRecord[];
  purchases: PurchaseRecord[];
  verifications: VerificationRecord[];
  customers: Customer[];
  suppliers: Supplier[];
  loading: boolean;
  error: string | null;
  addProduct: (data: ProductFormData) => Promise<void>;
  updateProduct: (id: string, data: ProductFormData) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  addSale: (sale: SaleRecord) => Promise<void>;
  updateSaleStatus: (id: string, status: SaleStatus, amountPaid: number) => Promise<void>;
  addPurchase: (po: PurchaseRecord) => Promise<void>;
  markPurchaseReceived: (id: string) => Promise<void>;
  updatePurchaseStatus: (id: string, status: PurchaseStatus) => Promise<void>;
  addVerification: (v: VerificationRecord) => Promise<void>;
  updateBoxStatusMode: (id: string, mode: 'auto' | 'manual', manualBoxStatus?: import('@/lib/types').BoxStatus) => Promise<void>;
  addCustomer: (c: Customer) => Promise<void>;
  updateCustomer: (id: string, c: Customer) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  addSupplier: (s: Supplier) => Promise<void>;
  updateSupplier: (id: string, s: Supplier) => Promise<void>;
  deleteSupplier: (id: string) => Promise<void>;
};

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [verifications, setVerifications] = useState<VerificationRecord[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { addNotification } = useNotifications();
  const notifiedStockRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, s, po, v, c, sup] = await Promise.all([
          api.getProducts(),
          api.getSales(),
          api.getPurchases(),
          api.getVerifications(),
          api.getCustomers(),
          api.getSuppliers(),
        ]);
        if (cancelled) return;
        setProducts(p);
        setSales(s);
        setPurchases(po);
        setVerifications(v);
        setCustomers(c);
        setSuppliers(sup);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load data');
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Auto-generate stock notifications
  useEffect(() => {
    if (loading) return;
    for (const p of products) {
      const key = `${p.id}:${p.status}`;
      if (notifiedStockRef.current.has(key)) continue;
      if (p.status === 'out-of-stock') {
        notifiedStockRef.current.add(key);
        addNotification('out-of-stock', 'Out of Stock', `${p.name} is completely out of stock. Reorder immediately.`);
      } else if (p.status === 'low-stock') {
        notifiedStockRef.current.add(key);
        addNotification('low-stock', 'Low Stock Alert', `${p.name} is running low (${p.stock} pieces, reorder at ${p.reorderLevel}).`);
      }
      // Clean up keys for products no longer in a bad state
      if (p.status === 'in-stock') {
        notifiedStockRef.current.delete(`${p.id}:out-of-stock`);
        notifiedStockRef.current.delete(`${p.id}:low-stock`);
      }
    }
  }, [products, loading, addNotification]);

  const addProduct = useCallback(async (data: ProductFormData) => {
    const id = `p${Date.now()}`;
    const product = await api.createProduct(id, data);
    setProducts((prev) => [product, ...prev]);
    addNotification('success', 'Product Created', `${product.name} has been added to inventory.`);
  }, [addNotification]);

  const updateProduct = useCallback(async (id: string, data: ProductFormData) => {
    await api.updateProduct(id, data);
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const computed = withComputed(p.stock, data.boxCapacity, data.reorderLevel);
        const boxStatus = p.boxStatusMode === 'manual' ? p.manualBoxStatus : computed.boxStatus;
        return { ...p, ...data, id, stock: p.stock, boxStatus, status: computed.status };
      }),
    );
    addNotification('success', 'Product Updated', `${data.name} has been updated.`);
  }, [addNotification]);

  const deleteProduct = useCallback(async (id: string) => {
    await api.deleteProduct(id);
    setProducts((prev) => prev.filter((p) => p.id !== id));
    addNotification('info', 'Product Deleted', 'Product has been removed from inventory.');
  }, [addNotification]);

  const addSale = useCallback(async (sale: SaleRecord) => {
    await api.createSale(sale);
    setSales((prev) => [sale, ...prev]);
    addNotification('success', 'Sale Recorded', `Invoice ${sale.invoice} for ${sale.customer} has been recorded.`);
    if (sale.status !== 'draft' && sale.status !== 'cancelled') {
      const stockUpdates: { id: string; stock: number; boxCapacity: number; reorderLevel: number }[] = [];
      setProducts((prev) =>
        prev.map((p) => {
          const soldQty = sale.items
            .filter((item) => item.productId === p.id)
            .reduce((sum, item) => sum + item.qty, 0);
          if (soldQty === 0) return p;
          const stock = Math.max(0, p.stock - soldQty);
          stockUpdates.push({ id: p.id, stock, boxCapacity: p.boxCapacity, reorderLevel: p.reorderLevel });
          const computed = withComputed(stock, p.boxCapacity, p.reorderLevel);
          const boxStatus = p.boxStatusMode === 'manual' ? p.manualBoxStatus : computed.boxStatus;
          return { ...p, stock, boxStatus, status: computed.status };
        }),
      );
      for (const u of stockUpdates) {
        await api.updateProductStock(u.id, u.stock, u.boxCapacity, u.reorderLevel);
      }
    }
  }, [addNotification]);

  const updateSaleStatus = useCallback(async (id: string, status: SaleStatus, amountPaid: number) => {
    await api.updateSaleStatus(id, status, amountPaid);
    setSales((prev) => prev.map((s) => (s.id === id ? { ...s, status, amountPaid } : s)));
  }, []);

  const applyReceivedStock = useCallback(async (po: PurchaseRecord) => {
    const stockUpdates: { id: string; stock: number; boxCapacity: number; reorderLevel: number }[] = [];
    setProducts((prev) =>
      prev.map((p) => {
        const receivedQty = po.items
          .filter((item) => item.productId === p.id)
          .reduce((sum, item) => sum + item.qty, 0);
        if (receivedQty === 0) return p;
        const stock = p.stock + receivedQty;
        stockUpdates.push({ id: p.id, stock, boxCapacity: p.boxCapacity, reorderLevel: p.reorderLevel });
        const computed = withComputed(stock, p.boxCapacity, p.reorderLevel);
        const boxStatus = p.boxStatusMode === 'manual' ? p.manualBoxStatus : computed.boxStatus;
        return { ...p, stock, boxStatus, status: computed.status };
      }),
    );
    for (const u of stockUpdates) {
      await api.updateProductStock(u.id, u.stock, u.boxCapacity, u.reorderLevel);
    }
  }, []);

  const addPurchase = useCallback(async (po: PurchaseRecord) => {
    await api.createPurchase(po);
    setPurchases((prev) => [po, ...prev]);
    addNotification('success', 'Purchase Order Created', `PO ${po.poNumber} for ${po.supplier} has been recorded.`);
    if (po.status === 'received') {
      await applyReceivedStock(po);
    }
  }, [applyReceivedStock, addNotification]);

  const markPurchaseReceived = useCallback(async (id: string) => {
    setPurchases((prev) => {
      const po = prev.find((p) => p.id === id);
      if (!po || po.status === 'received') return prev;
      const updated: PurchaseRecord = {
        ...po,
        status: 'received',
        receivedDate: new Date().toISOString().slice(0, 10),
      };
      void applyReceivedStock(updated);
      void api.markPurchaseReceived(id);
      return prev.map((p) => (p.id === id ? updated : p));
    });
  }, [applyReceivedStock]);

  const updatePurchaseStatus = useCallback(async (id: string, status: PurchaseStatus) => {
    setPurchases((prev) => {
      const po = prev.find((p) => p.id === id);
      if (!po) return prev;
      const wasReceived = po.status === 'received';
      const willBeReceived = status === 'received';
      const updated: PurchaseRecord = {
        ...po,
        status,
        receivedDate: willBeReceived && !po.receivedDate
          ? new Date().toISOString().slice(0, 10)
          : po.receivedDate,
      };
      if (!wasReceived && willBeReceived) {
        void applyReceivedStock(updated);
      }
      void api.updatePurchaseStatus(id, status);
      return prev.map((p) => (p.id === id ? updated : p));
    });
  }, [applyReceivedStock]);

  const addVerification = useCallback(async (v: VerificationRecord) => {
    await api.createVerification(v);
    setVerifications((prev) => [v, ...prev]);
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== v.productId) return p;
        const stock = v.observedEstimate;
        const computed = withComputed(stock, p.boxCapacity, p.reorderLevel);
        const boxStatus = p.boxStatusMode === 'manual' ? p.manualBoxStatus : computed.boxStatus;
        return {
          ...p, stock, boxStatus, status: computed.status,
          lastPhysicalObservation: { observedStock: v.observedEstimate, boxStatus: v.boxStatus, date: v.date, user: v.user },
        };
      }),
    );
    void api.setPhysicalObservation(v.productId, v.observedEstimate, v.boxStatus, v.date, v.user);
  }, []);

  const updateBoxStatusMode = useCallback(async (id: string, mode: 'auto' | 'manual', manualBoxStatus?: import('@/lib/types').BoxStatus) => {
    await api.updateBoxStatusMode(id, mode, manualBoxStatus);
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const newManual = manualBoxStatus ?? p.manualBoxStatus;
        const autoBoxStatus = withComputed(p.stock, p.boxCapacity, p.reorderLevel).boxStatus;
        const boxStatus = mode === 'manual' ? newManual : autoBoxStatus;
        return { ...p, boxStatusMode: mode, manualBoxStatus: newManual, boxStatus };
      }),
    );
  }, []);

  const addCustomer = useCallback(async (c: Customer) => {
    await api.createCustomer(c);
    setCustomers((prev) => [c, ...prev]);
  }, []);

  const updateCustomer = useCallback(async (id: string, c: Customer) => {
    await api.updateCustomer(id, c);
    setCustomers((prev) => prev.map((x) => (x.id === id ? c : x)));
  }, []);

  const deleteCustomer = useCallback(async (id: string) => {
    await api.deleteCustomer(id);
    setCustomers((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const addSupplier = useCallback(async (s: Supplier) => {
    await api.createSupplier(s);
    setSuppliers((prev) => [s, ...prev]);
  }, []);

  const updateSupplier = useCallback(async (id: string, s: Supplier) => {
    await api.updateSupplier(id, s);
    setSuppliers((prev) => prev.map((x) => (x.id === id ? s : x)));
  }, []);

  const deleteSupplier = useCallback(async (id: string) => {
    await api.deleteSupplier(id);
    setSuppliers((prev) => prev.filter((x) => x.id !== id));
  }, []);

  return (
    <StoreContext.Provider
      value={{
        products, sales, purchases, verifications, customers, suppliers,
        loading, error,
        addProduct, updateProduct, deleteProduct,
        addSale, updateSaleStatus, addPurchase, markPurchaseReceived, updatePurchaseStatus, addVerification, updateBoxStatusMode,
        addCustomer, updateCustomer, deleteCustomer,
        addSupplier, updateSupplier, deleteSupplier,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
