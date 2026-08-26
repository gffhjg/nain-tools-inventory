import type { BoxStatus, Product, DiscountType, GstType } from './types';

export const productCategories: string[] = [];

export const boxStatuses: BoxStatus[] = ['Full', '75% Full', 'Half', 'Very Low', 'Almost Empty', 'Empty'];

export const GST_RATE = 18;

export const indianStates: { state: string; code: string }[] = [
  { state: 'Andaman and Nicobar Islands', code: '35' },
  { state: 'Andhra Pradesh', code: '37' },
  { state: 'Arunachal Pradesh', code: '12' },
  { state: 'Assam', code: '18' },
  { state: 'Bihar', code: '10' },
  { state: 'Chandigarh', code: '04' },
  { state: 'Chhattisgarh', code: '22' },
  { state: 'Dadra and Nagar Haveli and Daman and Diu', code: '26' },
  { state: 'Delhi', code: '07' },
  { state: 'Goa', code: '30' },
  { state: 'Gujarat', code: '24' },
  { state: 'Haryana', code: '06' },
  { state: 'Himachal Pradesh', code: '02' },
  { state: 'Jammu and Kashmir', code: '01' },
  { state: 'Jharkhand', code: '20' },
  { state: 'Karnataka', code: '29' },
  { state: 'Kerala', code: '32' },
  { state: 'Ladakh', code: '38' },
  { state: 'Lakshadweep', code: '31' },
  { state: 'Madhya Pradesh', code: '23' },
  { state: 'Maharashtra', code: '27' },
  { state: 'Manipur', code: '14' },
  { state: 'Meghalaya', code: '17' },
  { state: 'Mizoram', code: '15' },
  { state: 'Nagaland', code: '13' },
  { state: 'Odisha', code: '21' },
  { state: 'Puducherry', code: '34' },
  { state: 'Punjab', code: '03' },
  { state: 'Rajasthan', code: '08' },
  { state: 'Sikkim', code: '11' },
  { state: 'Tamil Nadu', code: '33' },
  { state: 'Telangana', code: '36' },
  { state: 'Tripura', code: '16' },
  { state: 'Uttar Pradesh', code: '09' },
  { state: 'Uttarakhand', code: '05' },
  { state: 'West Bengal', code: '19' },
];

export function getStateCode(state: string): string {
  const found = indianStates.find((s) => s.state.toLowerCase() === state.toLowerCase());
  return found ? found.code : '';
}

export function getStateByCode(code: string): string {
  const found = indianStates.find((s) => s.code === code);
  return found ? found.state : '';
}

export function validateGstin(gstin: string): { valid: boolean; error?: string } {
  const trimmed = gstin.trim().toUpperCase();
  if (!trimmed) return { valid: true };
  if (trimmed.length !== 15) return { valid: false, error: 'GSTIN must be exactly 15 characters' };
  const regex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{3}$/;
  if (!regex.test(trimmed)) return { valid: false, error: 'Invalid GSTIN format (expected: 2 digits, 5 letters, 4 digits, 1 letter, 3 alphanumeric)' };
  const stateCode = trimmed.substring(0, 2);
  const state = getStateByCode(stateCode);
  if (!state) return { valid: false, error: `Invalid state code "${stateCode}" in GSTIN` };
  return { valid: true };
}

export function resolveGstType(
  companyState: string,
  customerState: string,
  manualType: GstType = 'auto',
): { type: GstType; isCgstSgst: boolean; isIgst: boolean; isExempt: boolean } {
  if (manualType === 'exempt') return { type: 'exempt', isCgstSgst: false, isIgst: false, isExempt: true };
  if (manualType === 'cgst-sgst') return { type: 'cgst-sgst', isCgstSgst: true, isIgst: false, isExempt: false };
  if (manualType === 'igst') return { type: 'igst', isCgstSgst: false, isIgst: true, isExempt: false };
  const sameState =
    companyState.trim().toLowerCase() === customerState.trim().toLowerCase() &&
    companyState.trim() !== '';
  return sameState
    ? { type: 'cgst-sgst', isCgstSgst: true, isIgst: false, isExempt: false }
    : { type: 'igst', isCgstSgst: false, isIgst: true, isExempt: false };
}

export function computeGstSplit(gstAmount: number, gstType: GstType, companyState: string, customerState: string): { cgstAmount: number; sgstAmount: number; igstAmount: number } {
  const resolved = resolveGstType(companyState, customerState, gstType);
  if (resolved.isIgst) return { cgstAmount: 0, sgstAmount: 0, igstAmount: gstAmount };
  if (resolved.isExempt) return { cgstAmount: 0, sgstAmount: 0, igstAmount: 0 };
  return { cgstAmount: +(gstAmount / 2).toFixed(2), sgstAmount: +(gstAmount / 2).toFixed(2), igstAmount: 0 };
}

export function computeBoxStatus(stock: number, boxCapacity: number): BoxStatus {
  if (stock <= 0) return 'Empty';
  if (boxCapacity <= 0) return 'Empty';
  const pct = (stock / boxCapacity) * 100;
  if (pct >= 90) return 'Full';
  if (pct >= 70) return '75% Full';
  if (pct >= 40) return 'Half';
  if (pct >= 15) return 'Very Low';
  if (pct >= 1) return 'Almost Empty';
  return 'Empty';
}

export function computeStockStatus(stock: number, reorderLevel: number): Product['status'] {
  if (stock <= 0) return 'out-of-stock';
  if (stock <= reorderLevel) return 'low-stock';
  return 'in-stock';
}

export function withComputed(stock: number, boxCapacity: number, reorderLevel: number) {
  return {
    boxStatus: computeBoxStatus(stock, boxCapacity),
    status: computeStockStatus(stock, reorderLevel),
  };
}

export function computeDiscountAmount(subtotal: number, discount: number, discountType: DiscountType): number {
  if (discount <= 0) return 0;
  if (discountType === 'percent') {
    return +(subtotal * Math.min(discount, 100) / 100).toFixed(2);
  }
  return Math.min(discount, subtotal);
}

export function computeGrandTotal(
  subtotal: number,
  discount: number,
  discountType: DiscountType,
  gstRate: number,
  freightCharges: number = 0
): {
  discountAmount: number;
  taxableAmount: number;
  gstAmount: number;
  rawTotal: number;
  roundOff: number;
  grandTotal: number;
  hasRoundOff: boolean;
} {
  const discountAmount = computeDiscountAmount(subtotal, discount, discountType);
  const taxableAmount = Math.max(0, subtotal - discountAmount + (freightCharges || 0));
  const gstAmount = +(taxableAmount * (gstRate / 100)).toFixed(2);
  const rawTotal = +(taxableAmount + gstAmount).toFixed(2);
  const grandTotal = Math.round(rawTotal);
  const roundOff = +(grandTotal - rawTotal).toFixed(2);
  const hasRoundOff = Math.abs(roundOff) >= 0.01;
  return { discountAmount, taxableAmount, gstAmount, rawTotal, roundOff, grandTotal, hasRoundOff };
}
