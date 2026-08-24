import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { withComputed } from '@/lib/constants';
import { useNotifications } from '@/store/NotificationStore';
import type {
  Product, SaleRecord, PurchaseRecord, VerificationRecord,
  Customer, Supplier, SaleStatus, PurchaseStatus, CompanySettings,
  ChequeRecord, ChequeStatus,
} from '@/lib/types';

export type ProductFormData = Omit<Product, 'id' | 'status' | 'boxStatus' | 'stock' | 'lastPhysicalObservation' | 'boxStatusMode' | 'manualBoxStatus'>;

type StoreContextValue = {
  products: Product[];
  sales: SaleRecord[];
  purchases: PurchaseRecord[];
  verifications: VerificationRecord[];
  customers: Customer[];
  suppliers: Supplier[];
  cheques: ChequeRecord[];
  companySettings: CompanySettings | null;
  loading: boolean;
  error: string | null;
  addProduct: (data: ProductFormData) => Promise<void>;
  updateProduct: (id: string, data: ProductFormData) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  addSale: (sale: SaleRecord) => Promise<void>;
  updateSale: (sale: SaleRecord) => Promise<void>;
  deleteSale: (id: string) => Promise<void>;
  updateSaleStatus: (id: string, status: SaleStatus, amountPaid: number) => Promise<void>;
  updateSaleDocumentType: (id: string, documentType: 'TAX INVOICE' | 'DEBIT NOTE' | 'CREDIT NOTE' | 'PURCHASE BILL' | 'PROFORMA INVOICE', invoice: string) => Promise<void>;
  addPurchase: (po: PurchaseRecord) => Promise<void>;
  updatePurchase: (po: PurchaseRecord) => Promise<void>;
  deletePurchase: (id: string) => Promise<void>;
  updatePurchasePayment: (id: string, paymentStatus: 'Paid' | 'Pending', amountPaid: number, paymentMethod: import('@/lib/types').PurchasePaymentMethod, chequeNo?: string, chequeBank?: string, chequeDate?: string, chequeStatus?: ChequeStatus) => Promise<void>;
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
  addCheque: (cheque: ChequeRecord) => Promise<void>;
  updateCheque: (cheque: ChequeRecord) => Promise<void>;
  confirmChequeClearance: (chequeId: string) => Promise<void>;
  confirmChequeBounce: (chequeId: string, reason: string, bounceDate?: string) => Promise<void>;
  deleteCheque: (id: string) => Promise<void>;
  updateCompanySettings: (s: CompanySettings) => Promise<void>;
};

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [verifications, setVerifications] = useState<VerificationRecord[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [cheques, setCheques] = useState<ChequeRecord[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { addNotification } = useNotifications();
  const notifiedStockRef = useRef<Set<string>>(new Set());
  const notifiedChequesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, s, po, v, c, sup, chqs, cs] = await Promise.all([
          api.getProducts(),
          api.getSales(),
          api.getPurchases(),
          api.getVerifications(),
          api.getCustomers(),
          api.getSuppliers(),
          api.getCheques().catch(() => []),
          api.getCompanySettings().catch(() => null),
        ]);
        if (cancelled) return;
        setProducts(p);
        setSales(s);
        setPurchases(po);
        setVerifications(v);
        setCustomers(c);
        setSuppliers(sup);
        setCheques(chqs);
        if (cs) setCompanySettings(cs);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load data');
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Auto-generate claimable / overdue cheque notifications
  useEffect(() => {
    if (loading) return;
    const today = new Date().toISOString().slice(0, 10);
    for (const chq of cheques) {
      if (chq.status !== 'pending_clearance') continue;
      const key = `${chq.id}:${chq.chequeDate}:${chq.status}`;
      if (notifiedChequesRef.current.has(key)) continue;

      if (chq.chequeDate <= today) {
        notifiedChequesRef.current.add(key);
        const isOverdue = chq.chequeDate < today;
        addNotification(
          'info',
          isOverdue ? 'Cheque Overdue for Deposit' : 'Cheque Claimable Today',
          `Cheque #${chq.chequeNumber} (${chq.bankName}) for ${chq.customerName} (₹${chq.amount.toLocaleString('en-IN')}) is ${isOverdue ? 'overdue since ' + chq.chequeDate : 'ready to claim/deposit today'}.`,
        );
      }
    }
  }, [cheques, loading, addNotification]);

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

    if (sale.paymentMethod === 'Cheque' || sale.chequeNo) {
      const chequeRec: ChequeRecord = {
        id: `chq_${sale.id}`,
        saleId: sale.id,
        customerId: sale.customerId,
        customerName: sale.customer,
        invoiceNumber: sale.invoice,
        chequeNumber: sale.chequeNo || 'CHQ-' + sale.invoice,
        bankName: sale.chequeBank || 'Bank Cheque',
        chequeDate: sale.chequeDate || sale.date,
        amount: sale.amountPaid > 0 ? sale.amountPaid : sale.grandTotal,
        status: (sale.chequeStatus || 'pending_clearance') as ChequeStatus,
        bounceReason: sale.chequeBounceReason || '',
        bounceDate: sale.chequeBounceDate || '',
        notes: sale.notes || '',
      };
      await api.createCheque(chequeRec);
      setCheques((prev) => [chequeRec, ...prev]);
    }

    if (sale.status !== 'draft' && sale.status !== 'cancelled') {
      const stockUpdates: { id: string; stock: number; boxCapacity: number; reorderLevel: number }[] = [];
      setProducts((prev) =>
        prev.map((p) => {
          const soldQty = sale.items
            .filter((item) => !item.isCustom && item.productId === p.id)
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
    const oldSale = sales.find((s) => s.id === id);
    if (oldSale && oldSale.status !== status) {
      const wasActive = oldSale.status !== 'draft' && oldSale.status !== 'cancelled';
      const isNowActive = status !== 'draft' && status !== 'cancelled';

      if (wasActive && !isNowActive) {
        const stockUpdates: { id: string; stock: number; boxCapacity: number; reorderLevel: number }[] = [];
        setProducts((prev) =>
          prev.map((p) => {
            const qty = oldSale.items
              .filter((i) => !i.isCustom && i.productId === p.id)
              .reduce((sum, i) => sum + i.qty, 0);
            if (qty === 0) return p;
            const stock = p.stock + qty;
            stockUpdates.push({ id: p.id, stock, boxCapacity: p.boxCapacity, reorderLevel: p.reorderLevel });
            const computed = withComputed(stock, p.boxCapacity, p.reorderLevel);
            const boxStatus = p.boxStatusMode === 'manual' ? p.manualBoxStatus : computed.boxStatus;
            return { ...p, stock, boxStatus, status: computed.status };
          }),
        );
        for (const u of stockUpdates) {
          await api.updateProductStock(u.id, u.stock, u.boxCapacity, u.reorderLevel);
        }
      } else if (!wasActive && isNowActive) {
        const stockUpdates: { id: string; stock: number; boxCapacity: number; reorderLevel: number }[] = [];
        setProducts((prev) =>
          prev.map((p) => {
            const qty = oldSale.items
              .filter((i) => !i.isCustom && i.productId === p.id)
              .reduce((sum, i) => sum + i.qty, 0);
            if (qty === 0) return p;
            const stock = Math.max(0, p.stock - qty);
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
    }

    await api.updateSaleStatus(id, status, amountPaid);
    setSales((prev) => prev.map((s) => (s.id === id ? { ...s, status, amountPaid } : s)));
  }, [sales]);

  const deleteSale = useCallback(async (id: string) => {
    const sale = sales.find((s) => s.id === id);
    if (!sale) return;

    if (sale.status !== 'draft' && sale.status !== 'cancelled') {
      const stockUpdates: { id: string; stock: number; boxCapacity: number; reorderLevel: number }[] = [];
      setProducts((prev) =>
        prev.map((p) => {
          const soldQty = sale.items
            .filter((item) => !item.isCustom && item.productId === p.id)
            .reduce((sum, item) => sum + item.qty, 0);
          if (soldQty === 0) return p;
          const stock = p.stock + soldQty;
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

    await api.deleteSale(id);
    setSales((prev) => prev.filter((s) => s.id !== id));
    setCheques((prev) => prev.filter((c) => c.saleId !== id));
    addNotification('info', 'Invoice Deleted', `Invoice ${sale.invoice} deleted. Item quantities returned to inventory stock.`);
  }, [sales, addNotification]);

  const updateSale = useCallback(async (updatedSale: SaleRecord) => {
    const oldSale = sales.find((s) => s.id === updatedSale.id);
    if (!oldSale) return;

    const oldActive = oldSale.status !== 'draft' && oldSale.status !== 'cancelled';
    const newActive = updatedSale.status !== 'draft' && updatedSale.status !== 'cancelled';

    const stockUpdates: { id: string; stock: number; boxCapacity: number; reorderLevel: number }[] = [];
    setProducts((prev) =>
      prev.map((p) => {
        const oldQty = oldActive ? oldSale.items.filter((i) => !i.isCustom && i.productId === p.id).reduce((s, i) => s + i.qty, 0) : 0;
        const newQty = newActive ? updatedSale.items.filter((i) => !i.isCustom && i.productId === p.id).reduce((s, i) => s + i.qty, 0) : 0;
        const diff = newQty - oldQty;
        if (diff === 0) return p;
        const stock = Math.max(0, p.stock - diff);
        stockUpdates.push({ id: p.id, stock, boxCapacity: p.boxCapacity, reorderLevel: p.reorderLevel });
        const computed = withComputed(stock, p.boxCapacity, p.reorderLevel);
        const boxStatus = p.boxStatusMode === 'manual' ? p.manualBoxStatus : computed.boxStatus;
        return { ...p, stock, boxStatus, status: computed.status };
      }),
    );
    for (const u of stockUpdates) {
      await api.updateProductStock(u.id, u.stock, u.boxCapacity, u.reorderLevel);
    }

    await api.updateSale(updatedSale);
    setSales((prev) => prev.map((s) => (s.id === updatedSale.id ? updatedSale : s)));
    addNotification('success', 'Invoice Updated', `Invoice ${updatedSale.invoice} updated and inventory stock adjusted.`);
  }, [sales, addNotification]);

  const updateSaleDocumentType = useCallback(async (id: string, documentType: 'TAX INVOICE' | 'DEBIT NOTE' | 'CREDIT NOTE' | 'PURCHASE BILL' | 'PROFORMA INVOICE', invoice: string) => {
    await api.updateSaleDocument(id, documentType, invoice);
    setSales((prev) => prev.map((s) => (s.id === id ? { ...s, documentType, invoice } : s)));
    addNotification('success', 'Document Converted', `Converted to ${documentType} (${invoice}).`);
  }, [addNotification]);

  const applyReceivedStock = useCallback(async (po: PurchaseRecord) => {
    const existingProducts = await api.getProducts();
    const stockUpdates: { id: string; stock: number; boxCapacity: number; reorderLevel: number }[] = [];
    const newProductsToCreate: Product[] = [];

    for (let idx = 0; idx < po.items.length; idx++) {
      const item = po.items[idx];
      const match = existingProducts.find(
        (p) => p.id === item.productId || p.name.trim().toLowerCase() === item.name.trim().toLowerCase()
      );

      if (!match || item.isNewProduct) {
        // Auto-add new product directly into Main Inventory
        const newId = match ? match.id : (item.productId && !item.productId.startsWith('new_') ? item.productId : `p${Date.now()}_${idx}`);
        if (!match) {
          try {
            const created = await api.createProduct(newId, {
              name: item.name.trim(),
              category: item.category?.trim() || 'Fasteners',
              supplier: po.supplier.trim(),
              rackNumber: item.rackNumber?.trim() || 'General',
              size: item.size?.trim() || '',
              cost: item.cost,
              price: item.sellingPrice && item.sellingPrice > 0 ? item.sellingPrice : +(item.cost * 1.3).toFixed(2),
              boxCapacity: item.boxCapacity || 1000,
              reorderLevel: item.reorderLevel || 100,
              notes: item.isNewProduct ? `Auto-created from PO ${po.poNumber}` : '',
              image: '',
              hsnCode: item.hsnCode || '7318150',
            });
            // Update initial stock to received qty
            await api.updateProductStock(newId, item.qty, created.boxCapacity, created.reorderLevel);
            const computed = withComputed(item.qty, created.boxCapacity, created.reorderLevel);
            newProductsToCreate.push({
              ...created,
              stock: item.qty,
              boxStatus: computed.boxStatus,
              status: computed.status,
            });
          } catch (err) {
            console.error('Failed to auto-create new product from purchase:', err);
          }
        }
      }
    }

    setProducts((prev) => {
      let nextList = prev.map((p) => {
        const receivedQty = po.items
          .filter((item) => item.productId === p.id || item.name.trim().toLowerCase() === p.name.trim().toLowerCase())
          .reduce((sum, item) => sum + item.qty, 0);
        if (receivedQty === 0) return p;
        const stock = p.stock + receivedQty;
        stockUpdates.push({ id: p.id, stock, boxCapacity: p.boxCapacity, reorderLevel: p.reorderLevel });
        const computed = withComputed(stock, p.boxCapacity, p.reorderLevel);
        const boxStatus = p.boxStatusMode === 'manual' ? p.manualBoxStatus : computed.boxStatus;
        return { ...p, stock, boxStatus, status: computed.status };
      });

      // Append any newly auto-created products
      if (newProductsToCreate.length > 0) {
        nextList = [...newProductsToCreate, ...nextList.filter((p) => !newProductsToCreate.some((np) => np.id === p.id))];
      }
      return nextList;
    });

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
    if (po.paymentMethod === 'Cheque' || (po.chequeNo && po.chequeNo.trim() !== '')) {
      const chq: ChequeRecord = {
        id: `chq-po-${po.id}-${Date.now()}`,
        type: 'issued',
        purchaseId: po.id,
        supplierName: po.supplier,
        customerName: po.supplier,
        invoiceNumber: po.poNumber,
        chequeNumber: po.chequeNo || 'CHQ-PO',
        bankName: po.chequeBank || 'Company Bank',
        chequeDate: po.chequeDate || po.date,
        amount: po.grandTotal,
        status: po.chequeStatus || 'pending_clearance',
        notes: `Cheque issued to supplier for PO #${po.poNumber}`,
      };
      await api.createCheque(chq);
      setCheques((prev) => [chq, ...prev]);
    }
  }, [applyReceivedStock, addNotification]);

  const updatePurchase = useCallback(async (po: PurchaseRecord) => {
    await api.updatePurchase(po);
    setPurchases((prev) => prev.map((p) => (p.id === po.id ? po : p)));
    addNotification('success', 'Purchase Updated', `PO ${po.poNumber} has been updated.`);
  }, [addNotification]);

  const deletePurchase = useCallback(async (id: string) => {
    await api.deletePurchase(id);
    setPurchases((prev) => prev.filter((p) => p.id !== id));
    setCheques((prev) => prev.filter((c) => c.purchaseId !== id));
    addNotification('info', 'Purchase Deleted', 'Purchase record removed.');
  }, [addNotification]);

  const updatePurchasePayment = useCallback(async (
    id: string,
    paymentStatus: PurchaseRecord['paymentStatus'],
    amountPaid: number,
    paymentMethod: import('@/lib/types').PurchasePaymentMethod,
    chequeNo = '',
    chequeBank = '',
    chequeDate = '',
    chequeStatus: ChequeStatus = 'pending_clearance'
  ) => {
    await api.updatePurchasePayment(id, paymentStatus, amountPaid, paymentMethod, chequeNo, chequeBank, chequeDate, chequeStatus);
    setPurchases((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, paymentStatus, amountPaid, paymentMethod, chequeNo, chequeBank, chequeDate, chequeStatus }
          : p
      )
    );
    if (paymentMethod === 'Cheque' && chequeNo) {
      const po = purchases.find((p) => p.id === id);
      if (po) {
        const chq: ChequeRecord = {
          id: `chq-po-${po.id}-${Date.now()}`,
          type: 'issued',
          purchaseId: po.id,
          supplierName: po.supplier,
          customerName: po.supplier,
          invoiceNumber: po.poNumber,
          chequeNumber: chequeNo,
          bankName: chequeBank || 'Company Bank',
          chequeDate: chequeDate || new Date().toISOString().slice(0, 10),
          amount: amountPaid,
          status: chequeStatus,
          notes: `Cheque payment issued for PO #${po.poNumber}`,
        };
        await api.createCheque(chq);
        setCheques((prev) => [chq, ...prev]);
      }
    }
    addNotification('success', 'Payment Recorded', `Payment recorded for purchase.`);
  }, [purchases, addNotification]);

  const markPurchaseReceived = useCallback(async (id: string) => {
    const po = purchases.find((p) => p.id === id);
    if (!po || po.status === 'received') return;
    const updated: PurchaseRecord = {
      ...po,
      status: 'received',
      receivedDate: new Date().toISOString().slice(0, 10),
    };
    setPurchases((prev) => prev.map((p) => (p.id === id ? updated : p)));
    await applyReceivedStock(updated);
    await api.markPurchaseReceived(id);
    addNotification('success', 'Purchase Received', `PO ${po.poNumber} marked as received. Main inventory has been updated.`);
  }, [purchases, applyReceivedStock, addNotification]);

  const updatePurchaseStatus = useCallback(async (id: string, status: PurchaseStatus) => {
    const po = purchases.find((p) => p.id === id);
    if (!po) return;
    const wasReceived = po.status === 'received';
    const willBeReceived = status === 'received';
    const updated: PurchaseRecord = {
      ...po,
      status,
      receivedDate: willBeReceived && !po.receivedDate
        ? new Date().toISOString().slice(0, 10)
        : po.receivedDate,
    };
    setPurchases((prev) => prev.map((p) => (p.id === id ? updated : p)));
    if (!wasReceived && willBeReceived) {
      await applyReceivedStock(updated);
      addNotification('success', 'Inventory Updated', `PO ${po.poNumber} received. Stock added to Main Inventory.`);
    }
    await api.updatePurchaseStatus(id, status);
  }, [purchases, applyReceivedStock, addNotification]);

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

  const addCheque = useCallback(async (cheque: ChequeRecord) => {
    await api.createCheque(cheque);
    setCheques((prev) => [cheque, ...prev]);
    addNotification('info', 'Cheque Recorded', `Cheque #${cheque.chequeNumber} (${cheque.bankName}) for ${cheque.customerName || cheque.supplierName} recorded.`);
  }, [addNotification]);

  const updateCheque = useCallback(async (cheque: ChequeRecord) => {
    await api.updateCheque(cheque);
    setCheques((prev) => prev.map((c) => (c.id === cheque.id ? cheque : c)));
    addNotification('success', 'Cheque Updated', `Cheque #${cheque.chequeNumber} updated.`);
  }, [addNotification]);

  const confirmChequeClearance = useCallback(async (chequeId: string) => {
    const chq = cheques.find((c) => c.id === chequeId);
    if (!chq) return;

    await api.updateChequeStatus(chequeId, 'cleared');
    setCheques((prev) => prev.map((c) => (c.id === chequeId ? { ...c, status: 'cleared' } : c)));

    if (chq.saleId) {
      const s = sales.find((sale) => sale.id === chq.saleId);
      if (s) {
        const updatedSale: SaleRecord = {
          ...s,
          chequeStatus: 'cleared',
          amountPaid: s.grandTotal,
          status: 'paid',
        };
        await api.updateSale(updatedSale);
        setSales((prev) => prev.map((sale) => (sale.id === s.id ? updatedSale : sale)));
      }
    }
    if (chq.purchaseId) {
      const po = purchases.find((p) => p.id === chq.purchaseId);
      if (po) {
        const updatedPo: PurchaseRecord = {
          ...po,
          chequeStatus: 'cleared',
          amountPaid: po.grandTotal,
          paymentStatus: 'Paid',
        };
        await api.updatePurchase(updatedPo);
        setPurchases((prev) => prev.map((p) => (p.id === po.id ? updatedPo : p)));
      }
    }
    addNotification(
      'success',
      'Cheque Cleared',
      `Cheque #${chq.chequeNumber} (${chq.bankName}) of ₹${chq.amount.toLocaleString('en-IN')} for ${chq.customerName || chq.supplierName} is confirmed CLEARED and reconciled!`,
    );
  }, [cheques, sales, purchases, addNotification]);

  const confirmChequeBounce = useCallback(async (chequeId: string, reason: string, bounceDate?: string) => {
    const chq = cheques.find((c) => c.id === chequeId);
    if (!chq) return;
    const bDate = bounceDate || new Date().toISOString().slice(0, 10);

    await api.updateChequeStatus(chequeId, 'bounced', reason, bDate);
    setCheques((prev) => prev.map((c) => (c.id === chequeId ? { ...c, status: 'bounced', bounceReason: reason, bounceDate: bDate } : c)));

    if (chq.saleId) {
      const s = sales.find((sale) => sale.id === chq.saleId);
      if (s) {
        const remainingPaid = Math.max(0, (s.amountPaid || 0) - chq.amount);
        const newStatus: SaleStatus = remainingPaid === 0 ? 'pending' : (remainingPaid >= s.grandTotal ? 'paid' : 'partially-paid');
        const updatedSale: SaleRecord = {
          ...s,
          chequeStatus: 'bounced',
          chequeBounceReason: reason,
          chequeBounceDate: bDate,
          amountPaid: remainingPaid,
          status: newStatus,
        };
        await api.updateSale(updatedSale);
        setSales((prev) => prev.map((sale) => (sale.id === s.id ? updatedSale : sale)));
      }
    }
    if (chq.purchaseId) {
      const po = purchases.find((p) => p.id === chq.purchaseId);
      if (po) {
        const remainingPaid = Math.max(0, (po.amountPaid || 0) - chq.amount);
        const updatedPo: PurchaseRecord = {
          ...po,
          chequeStatus: 'bounced',
          amountPaid: remainingPaid,
          paymentStatus: remainingPaid >= po.grandTotal ? 'Paid' : 'Pending',
        };
        await api.updatePurchase(updatedPo);
        setPurchases((prev) => prev.map((p) => (p.id === po.id ? updatedPo : p)));
      }
    }
    addNotification(
      'out-of-stock',
      '🚨 Cheque Bounced (Dishonoured)',
      `Cheque #${chq.chequeNumber} for ₹${chq.amount.toLocaleString('en-IN')} for ${chq.customerName || chq.supplierName} has BOUNCED (${reason}). Ledger balance updated.`,
    );
  }, [cheques, sales, purchases, addNotification]);

  const deleteCheque = useCallback(async (id: string) => {
    await api.deleteCheque(id);
    setCheques((prev) => prev.filter((c) => c.id !== id));
    addNotification('info', 'Cheque Deleted', 'Cheque record removed.');
  }, [addNotification]);

  const updateCompanySettings = useCallback(async (s: CompanySettings) => {
    await api.updateCompanySettings(s);
    setCompanySettings(s);
  }, []);

  return (
    <StoreContext.Provider
      value={{
        products, sales, purchases, verifications, customers, suppliers, cheques, companySettings,
        loading, error,
        addProduct, updateProduct, deleteProduct,
        addSale, updateSale, deleteSale, updateSaleStatus, updateSaleDocumentType,
        addPurchase, updatePurchase, deletePurchase, updatePurchasePayment, markPurchaseReceived, updatePurchaseStatus,
        addVerification, updateBoxStatusMode,
        addCustomer, updateCustomer, deleteCustomer,
        addSupplier, updateSupplier, deleteSupplier,
        addCheque, updateCheque, confirmChequeClearance, confirmChequeBounce, deleteCheque,
        updateCompanySettings,
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
