import React from 'react';

/**
 * Utility helpers for ERP numeric inputs to ensure:
 * 1. Initial '0' or any existing number is auto-selected on focus/click so typing immediately replaces it without backspace.
 * 2. If '0' is not selected and a digit is typed, '0' is cleared instantly without leaving a leading zero.
 * 3. Leading zeros (like '0100') are automatically cleaned to '100'.
 */

export const handleNumericFocus = (e: React.FocusEvent<HTMLInputElement>) => {
  e.target.select();
};

export const handleNumericClick = (e: React.MouseEvent<HTMLInputElement>) => {
  // If value is 0 or 0.00, select all so typing immediately overwrites
  if (e.currentTarget.value === '0' || e.currentTarget.value === '0.00') {
    e.currentTarget.select();
  }
};

export const handleNumericKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
  // When current value is exactly '0' or '0.00' and a number key 0-9 is pressed, clear the 0 so it doesn't become '0100'
  if ((e.currentTarget.value === '0' || e.currentTarget.value === '0.00') && /^[0-9]$/.test(e.key)) {
    e.currentTarget.value = '';
  }
};

/**
 * Strips accidental leading zeros like "0100" -> "100", while preserving "0" and decimals like "0.5"
 */
export const cleanLeadingZeros = (val: string): string => {
  if (!val) return '';
  return val.replace(/^0+(?=\d)/, '');
};

export const autoSelectNumberProps = {
  onFocus: handleNumericFocus,
  onClick: handleNumericClick,
  onKeyDown: handleNumericKeyDown,
};
