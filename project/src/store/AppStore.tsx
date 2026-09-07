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
  importProducts: (items: Array<ProductFormData & { initialStock?: number; stock?: number }>) => Promise<number>;
  updateProduct: (id: string, data: ProductFormData & { stock?: number }) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  addSale: (sale: SaleRecord) => Promise<void>;
  updateSale: (sale: SaleRecord) => Promise<void>;
  deleteSale: (id: string) => Promise<void>;
  updateSaleStatus: (id: string, status: SaleStatus, amountPaid: number) => Promise<void>;
  updateSaleDocumentType: (id: string, documentType: 'TAX INVOICE' | 'DEBIT NOTE' | 'CREDIT NOTE' | 'PURCHASE BILL' | 'PROFORMA INVOICE' | 'PURCHASE ORDER', invoice: string, convertedFromNumber?: string, isPoConversion?: boolean) => Promise<void>;
  addPurchase: (po: PurchaseRecord) => Promise<void>;
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
  refreshData: (forcePopulate?: boolean) => Promise<void>;
};

const StoreContext = createContext<StoreContextValue | null>(null);

export function getSaleStockMultiplier(docType?: string, status?: string): number {
  if (status === 'draft' || status === 'cancelled') return 0;
  if (docType === 'PURCHASE BILL' || docType === 'CREDIT NOTE') return +1;
  if (docType === 'PURCHASE ORDER' || docType === 'PROFORMA INVOICE') return 0;
  if (!docType || docType === 'TAX INVOICE' || docType === 'DEBIT NOTE') return -1;
  return -1;
}

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

  const refreshData = useCallback(async (forcePopulate = false) => {
    try {
      setLoading(true);
      if (forcePopulate) {
        await api.forceRepopulateInventory();
      }
      let p = await api.getProducts();
      if (p.length < 900) {
        await api.forceRepopulateInventory();
        p = await api.getProducts();
      }
      const [s, po, v, c, sup, chqs, cs] = await Promise.all([
        api.getSales(),
        api.getPurchases(),
        api.getVerifications(),
        api.getCustomers(),
        api.getSuppliers(),
        api.getCheques().catch(() => []),
        api.getCompanySettings().catch(() => null),
      ]);
      setProducts(p);
      setSales(s);
      setPurchases(po);
      setVerifications(v);
      setCustomers(c);
      setSuppliers(sup);
      setCheques(chqs);
      if (cs) setCompanySettings(cs);
      setError(null);
      console.log(`[AppStore] refreshData complete: ${p.length} products, ${po.length} purchases, ${s.length} sales`);
    } catch (err) {
      console.error('[AppStore] refreshData error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let p = await api.getProducts();
        if (p.length < 900) {
          console.log('[AppStore] Products count < 900, populating full Excel inventory...');
          await api.forceRepopulateInventory();
          p = await api.getProducts();
        }
        const [s, po, v, c, sup, chqs, cs] = await Promise.all([
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
        console.log(`[AppStore] Initial load complete: ${p.length} products, ${po.length} purchases, ${s.length} sales`);
      } catch (err) {
        if (cancelled) return;
        console.error('[AppStore] Initial load error:', err);
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
    const id = `p${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const product = await api.createProduct(id, data);
    setProducts((prev) => [product, ...prev]);
    addNotification('success', 'Product Created', `${product.name} has been added to inventory.`);
  }, [addNotification]);

  const importProducts = useCallback(async (
    items: Array<ProductFormData & { initialStock?: number; stock?: number }>
  ): Promise<number> => {
    const created = await api.createProductsBatch(items);
    if (created.length > 0) {
      setProducts((prev) => [...[...created].reverse(), ...prev]);
      addNotification(
        'success',
        'Products Imported',
        `Successfully imported ${created.length} product${created.length > 1 ? 's' : ''} into inventory.`,
      );
    }
    return created.length;
  }, [addNotification]);

  const updateProduct = useCallback(async (id: string, data: ProductFormData & { stock?: number }) => {
    await api.updateProduct(id, data);
    if (data.stock !== undefined) {
      await api.updateProductStock(id, data.stock, data.boxCapacity, data.reorderLevel);
    }
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const newStock = data.stock !== undefined ? data.stock : p.stock;
        const computed = withComputed(newStock, data.boxCapacity, data.reorderLevel);
        const boxStatus = p.boxStatusMode === 'manual' ? p.manualBoxStatus : computed.boxStatus;
        return { ...p, ...data, id, stock: newStock, boxStatus, status: computed.status };
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

    const docType = sale.documentType || 'TAX INVOICE';
    if (docType === 'PURCHASE BILL') {
      addNotification('success', 'Purchase Bill Recorded', `Bill ${sale.invoice} recorded. Items have been added to inventory stock.`);
    } else if (docType === 'CREDIT NOTE') {
      addNotification('success', 'Credit Note Recorded', `Credit Note ${sale.invoice} recorded. Items added back to inventory stock.`);
    } else if (docType === 'PURCHASE ORDER') {
      addNotification('success', 'Company Purchase Order Recorded', `Purchase Order ${sale.invoice} recorded from ${sale.customer}. (Stock unchanged until Tax Invoice is generated).`);
    } else if (docType === 'PROFORMA INVOICE') {
      addNotification('success', 'Proforma Invoice Generated', `Proforma Invoice ${sale.invoice} generated for ${sale.customer}.`);
    } else {
      addNotification('success', 'Sale Recorded', `Invoice ${sale.invoice} for ${sale.customer} recorded. Items deducted from inventory.`);
    }

    if (sale.paymentMethod === 'Cheque' && sale.chequeNo) {
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

    const mult = getSaleStockMultiplier(sale.documentType, sale.status);
    if (mult !== 0) {
      const stockUpdates: { id: string; stock: number; boxCapacity: number; reorderLevel: number }[] = [];
      setProducts((prev) =>
        prev.map((p) => {
          const itemQty = sale.items
            .filter((item) => !item.isCustom && item.productId === p.id)
            .reduce((sum, item) => sum + item.qty, 0);
          if (itemQty === 0) return p;
          const stock = Math.max(0, p.stock + (itemQty * mult));
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
      const oldMult = getSaleStockMultiplier(oldSale.documentType, oldSale.status);
      const newMult = getSaleStockMultiplier(oldSale.documentType, status);
      const multDiff = newMult - oldMult;

      if (multDiff !== 0) {
        const stockUpdates: { id: string; stock: number; boxCapacity: number; reorderLevel: number }[] = [];
        setProducts((prev) =>
          prev.map((p) => {
            const qty = oldSale.items
              .filter((i) => !i.isCustom && i.productId === p.id)
              .reduce((sum, i) => sum + i.qty, 0);
            if (qty === 0) return p;
            const stock = Math.max(0, p.stock + (qty * multDiff));
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

    const mult = getSaleStockMultiplier(sale.documentType, sale.status);
    if (mult !== 0) {
      const reverseMult = -mult;
      const stockUpdates: { id: string; stock: number; boxCapacity: number; reorderLevel: number }[] = [];
      setProducts((prev) =>
        prev.map((p) => {
          const itemQty = sale.items
            .filter((item) => !item.isCustom && item.productId === p.id)
            .reduce((sum, item) => sum + item.qty, 0);
          if (itemQty === 0) return p;
          const stock = Math.max(0, p.stock + (itemQty * reverseMult));
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
    addNotification('info', 'Record Deleted', `${sale.documentType || 'Invoice'} ${sale.invoice} deleted. Inventory stock adjusted.`);
  }, [sales, addNotification]);

  const updateSale = useCallback(async (updatedSale: SaleRecord) => {
    const oldSale = sales.find((s) => s.id === updatedSale.id);
    if (!oldSale) return;

    const oldMult = getSaleStockMultiplier(oldSale.documentType, oldSale.status);
    const newMult = getSaleStockMultiplier(updatedSale.documentType, updatedSale.status);

    const stockUpdates: { id: string; stock: number; boxCapacity: number; reorderLevel: number }[] = [];
    setProducts((prev) =>
      prev.map((p) => {
        const oldQty = oldMult !== 0 ? oldSale.items.filter((i) => !i.isCustom && i.productId === p.id).reduce((s, i) => s + i.qty, 0) : 0;
        const newQty = newMult !== 0 ? updatedSale.items.filter((i) => !i.isCustom && i.productId === p.id).reduce((s, i) => s + i.qty, 0) : 0;
        const netChange = (newQty * newMult) - (oldQty * oldMult);
        if (netChange === 0) return p;
        const stock = Math.max(0, p.stock + netChange);
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

    if (updatedSale.paymentMethod === 'Cheque' && updatedSale.chequeNo) {
      const chequeRec: ChequeRecord = {
        id: `chq_${updatedSale.id}`,
        saleId: updatedSale.id,
        customerId: updatedSale.customerId,
        customerName: updatedSale.customer,
        invoiceNumber: updatedSale.invoice,
        chequeNumber: updatedSale.chequeNo,
        bankName: updatedSale.chequeBank || 'Bank Cheque',
        chequeDate: updatedSale.chequeDate || updatedSale.date,
        amount: updatedSale.amountPaid > 0 ? updatedSale.amountPaid : updatedSale.grandTotal,
        status: (updatedSale.chequeStatus || 'pending_clearance') as ChequeStatus,
        bounceReason: updatedSale.chequeBounceReason || '',
        bounceDate: updatedSale.chequeBounceDate || '',
        notes: updatedSale.notes || '',
      };
      await api.createCheque(chequeRec);
      setCheques((prev) => {
        const idx = prev.findIndex((c) => c.saleId === updatedSale.id || c.id === chequeRec.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = chequeRec;
          return next;
        }
        return [chequeRec, ...prev];
      });
    } else {
      setCheques((prev) => prev.filter((c) => c.saleId !== updatedSale.id));
    }

    addNotification('success', 'Record Updated', `${updatedSale.documentType || 'Invoice'} ${updatedSale.invoice} updated and inventory stock adjusted.`);
  }, [sales, addNotification]);

  const updateSaleDocumentType = useCallback(async (
    id: string,
    documentType: 'TAX INVOICE' | 'DEBIT NOTE' | 'CREDIT NOTE' | 'PURCHASE BILL' | 'PROFORMA INVOICE' | 'PURCHASE ORDER',
    invoice: string,
    convertedFromNumber: string = '',
    isPoConversion: boolean = false
  ) => {
    const oldSale = sales.find((s) => s.id === id);
    if (oldSale) {
      const oldMult = getSaleStockMultiplier(oldSale.documentType, oldSale.status);
      const newStatus: SaleStatus = documentType === 'TAX INVOICE' && (oldSale.status === 'draft' || oldSale.documentType === 'PURCHASE ORDER') ? 'pending' : oldSale.status;
      const newMult = getSaleStockMultiplier(documentType, newStatus);
      const multDiff = newMult - oldMult;

      if (multDiff !== 0) {
        const stockUpdates: { id: string; stock: number; boxCapacity: number; reorderLevel: number }[] = [];
        setProducts((prev) =>
          prev.map((p) => {
            const qty = oldSale.items
              .filter((i) => !i.isCustom && i.productId === p.id)
              .reduce((sum, i) => sum + i.qty, 0);
            if (qty === 0) return p;
            const stock = Math.max(0, p.stock + (qty * multDiff));
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

      await api.updateSaleDocument(id, documentType, invoice, convertedFromNumber, isPoConversion);
      const today = new Date().toISOString().slice(0, 10);
      setSales((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                documentType,
                invoice,
                status: newStatus,
                ...(isPoConversion ? { convertedFromPoNumber: convertedFromNumber } : { convertedFromPiNumber: convertedFromNumber }),
                convertedAt: convertedFromNumber ? today : s.convertedAt,
              }
            : s,
        ),
      );
      addNotification('success', 'Document Converted', `Successfully converted to ${documentType} (${invoice}). Inventory stock updated.`);
    }
  }, [sales, addNotification]);

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
        loading, error, refreshData,
        addProduct, importProducts, updateProduct, deleteProduct,
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
