import * as XLSX from 'xlsx';
import type { Product } from '@/lib/types';
import { compactSearchText, normalizeSearchText, levenshtein } from '@/utils/search';

export type MatchConfidence = 'exact' | 'strong' | 'fuzzy' | 'none';

export interface ParsedOrderLine {
  id: string;
  rawLine: string;
  searchQuery: string;
  qty: number;
  unit?: string;
  detectedRate?: number;
  matchedProduct: Product | null;
  confidence: MatchConfidence;
  suggestions: Product[];
  useCustomName?: boolean;
  selected: boolean;
}

const GEMINI_KEY_STORAGE = 'nain_gemini_api_key';

export function getGeminiApiKey(): string {
  try {
    return localStorage.getItem(GEMINI_KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

export function saveGeminiApiKey(key: string): void {
  try {
    if (key.trim()) localStorage.setItem(GEMINI_KEY_STORAGE, key.trim());
    else localStorage.removeItem(GEMINI_KEY_STORAGE);
  } catch {}
}

/**
 * Hardware/fastener abbreviations commonly texted in WhatsApp orders or supplier chats.
 */
const HARDWARE_ABBREVIATIONS: [RegExp, string][] = [
  [/\bhb\b/gi, 'hex bolt'],
  [/\bab\b/gi, 'allen bolt'],
  [/\bhn\b/gi, 'hex nut'],
  [/\bnn\b/gi, 'nylock nut'],
  [/\bnyloc\b/gi, 'nylock'],
  [/\bp\/?w\b|\bp\.w\.?\b/gi, 'plain washer'],
  [/\bs\/?w\b|\bs\.w\.?\b/gi, 'spring washer'],
  [/\bss\s*304\b/gi, 'ss 304'],
  [/\bss\s*316\b/gi, 'ss 316'],
  [/\bss\s*202\b/gi, 'ss 202'],
  [/\bgi\b/gi, 'gi'],
  [/\bbh\b/gi, 'button head'],
];

const CHAT_NOISE_LINE = /^(hi|hello|dear|bhaiya|sir|madam|ok|okay|thanks|thank you|regards|please|pls|plz|send|bhej|bhejna|urgent|total|subtotal|grand total|gst|cgst|sgst|igst|tax|date|invoice|bill|po|order|sr\.?\s*no|item|description|qty|quantity|rate|price|amount|bank|ifsc|gstin|phone|address)[\s:.\-,]*$/i;

const UNIT_PATTERN = '(?:pcs|pc|pieces|piece|nos|no\\.?|units|unit|box|boxes|pkt|pkts|packet|packets|bag|bags|set|sets|kg|kgs|mtr|mtrs|meter|meters|m)';

/** Steel grades & bolt standards that must NEVER be mistaken for item quantity */
const GRADE_OR_STANDARD_NUMBERS = new Set(['304', '316', '202', '410', '430', '12.9', '10.9', '8.8', '4.6']);

/**
 * Cleans WhatsApp chat timestamps like `[26/11/26, 10:15 AM] Ramesh:` or `26/11/2026, 10:15 - Name:`
 */
function stripChatMetadata(line: string): string {
  let clean = line.trim();
  // WhatsApp desktop/mobile export prefix
  clean = clean.replace(/^\[?\d{1,4}[/\-.]\d{1,2}[/\-.]\d{2,4}[,\s]+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?\]?\s*[-–]?\s*[^:\n]{1,35}:\s*/, '');
  // Leading numbering like "1.", "1)", "(1)", "1-", "#1"
  clean = clean.replace(/^(?:\(\d+\)|#?\d+\s*[.)]|[-*•‣▪])\s+/, '');
  return clean.trim();
}

function expandHardwareTerms(text: string): string {
  let out = text;
  for (const [pattern, replacement] of HARDWARE_ABBREVIATIONS) {
    out = out.replace(pattern, replacement);
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Extracts raw description, qty, unit, and optional rate from one line of WhatsApp/Email/OCR text.
 */
export function extractLineParts(rawLine: string): {
  query: string;
  qty: number;
  unit?: string;
  rate?: number;
} {
  let work = stripChatMetadata(rawLine);

  // Check if tabular (tab-separated or 3+ spaces separating columns or pipe-separated)
  const isPipeOrTab = work.includes('\t') || work.includes('|');
  const cols = isPipeOrTab
    ? work.split(/\t|\|/).map((c) => c.trim()).filter(Boolean)
    : work.split(/\s{3,}/).map((c) => c.trim()).filter(Boolean);

  if (cols.length >= 2) {
    // Find description column (usually longest non-numeric column)
    const nonNumericCols = cols.filter((c) => !/^₹?\s*[\d,]+(?:\.\d+)?\s*(?:pcs|nos|box|pkt|kg|mtr)?$/i.test(c));
    const numericCols = cols.filter((c) => /^₹?\s*[\d,]+(?:\.\d+)?(?:\s*[a-zA-Z.]+)?$/i.test(c));

    if (nonNumericCols.length >= 1 && numericCols.length >= 1) {
      // Drop pure serial number column at start if any (e.g. "1")
      const cleanNonNum = nonNumericCols.filter((c, i) => !(i === 0 && /^\d{1,3}$/.test(c)));
      const desc = (cleanNonNum[0] || nonNumericCols[0]).trim();

      let qty = 1;
      let unit: string | undefined;
      let rate: number | undefined;

      // Parse numeric columns: first integer/unit-bearing number is typically Qty, decimal or next number is Rate
      const parsedNums = numericCols
        .map((nc) => {
          const m = nc.match(new RegExp(`^₹?\\s*([\\d,]+(?:\\.\\d+)?)\\s*(${UNIT_PATTERN})?$`, 'i'));
          if (!m) return null;
          const val = parseFloat(m[1].replace(/,/g, ''));
          return { val, unit: m[2], hasCurrency: nc.includes('₹'), hasDec: m[1].includes('.') };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null && x.val > 0);

      if (parsedNums.length === 1) {
        qty = Math.max(1, Math.round(parsedNums[0].val));
        unit = parsedNums[0].unit;
      } else if (parsedNums.length >= 2) {
        // Ignore leading serial number if accidentally included
        const filtered = parsedNums[0].val <= 50 && cols[0] === String(parsedNums[0].val) && parsedNums.length >= 3
          ? parsedNums.slice(1)
          : parsedNums;
        const withUnit = filtered.find((n) => n.unit);
        if (withUnit) {
          qty = Math.max(1, Math.round(withUnit.val));
          unit = withUnit.unit;
          const other = filtered.find((n) => n !== withUnit);
          if (other && other.val < 50000) rate = other.val;
        } else {
          qty = Math.max(1, Math.round(filtered[0].val));
          // Next value: check if 3rd value looks like qty * rate (total amount)
          if (filtered.length >= 3 && Math.abs(filtered[0].val * filtered[1].val - filtered[2].val) < Math.max(2, filtered[2].val * 0.05)) {
            rate = filtered[1].val;
          } else if (filtered[1].val < filtered[0].val * 10 || filtered[1].hasDec || filtered[1].hasCurrency) {
            rate = filtered[1].val;
          }
        }
      }

      return { query: expandHardwareTerms(desc), qty, unit, rate };
    }
  }

  // Freeform text parsing (WhatsApp chat / Email bullets)
  let rate: number | undefined;
  let qty = 1;
  let unit: string | undefined;

  // 1. Extract explicit Rate markers: "@ 4.50", "rate 4.50", "rs 4.50", "₹4.50"
  const rateRegex = /(?:@|rate\s*[:=\-]?\s*|price\s*[:=\-]?\s*|rs\.?\s*[:=\-]?\s*|₹\s*)(\d+(?:\.\d{1,2})?)/i;
  const rateMatch = work.match(rateRegex);
  if (rateMatch) {
    rate = parseFloat(rateMatch[1]);
    work = work.replace(rateMatch[0], ' ').trim();
  }

  // 2. Extract explicit Qty with unit: "500 pcs", "1000 nos", "10 box", "qty: 500", "qty 500"
  const explicitQtyUnitRegex = new RegExp(`(?:qty\\s*[:=\\-]?\\s*)?(\\d+)\\s*(${UNIT_PATTERN})\\b`, 'i');
  const qUnitMatch = work.match(explicitQtyUnitRegex);
  if (qUnitMatch) {
    qty = Math.max(1, parseInt(qUnitMatch[1], 10));
    unit = qUnitMatch[2];
    work = work.replace(qUnitMatch[0], ' ').trim();
  } else {
    // Check explicit `qty: 500` or `q: 500`
    const explicitQtyWordRegex = /\b(?:qty|quantity|q)\s*[:=\-]?\s*(\d+)\b/i;
    const qWordMatch = work.match(explicitQtyWordRegex);
    if (qWordMatch) {
      qty = Math.max(1, parseInt(qWordMatch[1], 10));
      work = work.replace(qWordMatch[0], ' ').trim();
    } else {
      // Check leading multiplier: "500 x Hex Bolt 8x20" (only if followed by space and letters)
      const prefixMult = work.match(/^(\d+)\s*[x*×]\s+([a-zA-Z].+)$/);
      if (prefixMult) {
        qty = Math.max(1, parseInt(prefixMult[1], 10));
        work = prefixMult[2].trim();
      } else {
        // Check trailing separator + quantity: "SS Hex Bolt 8x20 - 500", "M10 Nut : 200", "Allen 6x25 = 100", "Hex Bolt 8x20 * 500"
        const sepQty = work.match(/^(.*?)\s*(?:[-–—:=]|(?:\s+[x*×]\s+))\s*(\d+)\s*$/);
        if (sepQty && sepQty[1].trim().length >= 2) {
          qty = Math.max(1, parseInt(sepQty[2], 10));
          work = sepQty[1].trim();
        } else {
          // Trailing standalone integer not glued to dimension / inch / M / SS grade
          const trailingNum = work.match(/^(.*\S)\s+(\d+)\s*$/);
          if (trailingNum) {
            const prefix = trailingNum[1].trim();
            const candidateStr = trailingNum[2];
            const prevWord = (prefix.split(/\s+/).pop() || '').toLowerCase();
            const isProtectedPrefix =
              ['ss', 'grade', 'gr', 'm', 'no', 'no.', 'size', 'type', 'sr'].includes(prevWord) ||
              GRADE_OR_STANDARD_NUMBERS.has(candidateStr);

            if (!isProtectedPrefix && prefix.length >= 2) {
              qty = Math.max(1, parseInt(candidateStr, 10));
              work = prefix;
            }
          }
        }
      }
    }
  }

  // Clean dangling separators like trailing "-" or ":" or ","
  work = work.replace(/[-–—:,]+$/, '').replace(/^[-–—:,]+/, '').trim();
  return {
    query: expandHardwareTerms(work),
    qty,
    unit,
    rate,
  };
}

/**
 * Scores how well a catalog Product matches a cleaned fastener/hardware query.
 */
function scoreProductMatch(product: Product, rawQuery: string): number {
  const normProd = normalizeSearchText(`${product.name} ${product.size || ''}`);
  const normQuery = normalizeSearchText(rawQuery);
  if (!normProd || !normQuery) return 0;

  if (normProd === normQuery || normalizeSearchText(product.name) === normQuery) {
    return 1000;
  }

  const compactProd = compactSearchText(product.name);
  const compactQuery = compactSearchText(rawQuery);
  if (compactQuery.length >= 3 && compactProd === compactQuery) {
    return 950;
  }

  const queryTokens = normQuery.split(/\s+/).filter(Boolean);
  const prodTokens = normProd.split(/\s+/).filter(Boolean);
  if (queryTokens.length === 0) return 0;

  // Separate dimension tokens (e.g., 8x25, 1/2x2, m10, 6.5mm) vs word tokens
  const isDimensionToken = (t: string) =>
    /\d+[x/]\d+/i.test(t) || /^m\d+$/i.test(t) || /^\d+(\.\d+)?mm$/i.test(t);

  let matchedCount = 0;
  let score = 0;

  for (const qt of queryTokens) {
    const qDim = isDimensionToken(qt);
    const qtCompact = compactSearchText(qt);

    if (prodTokens.includes(qt)) {
      matchedCount++;
      score += qDim ? 90 : 40;
      continue;
    }

    if (qtCompact.length >= 2 && compactProd.includes(qtCompact)) {
      // Caution: avoid "8x20" matching "8x200" unless no boundary mismatch
      const exactDimRegex = qDim ? new RegExp(`(^|[^0-9])${qt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^0-9]|$)`) : null;
      if (exactDimRegex) {
        if (exactDimRegex.test(normProd)) {
          matchedCount++;
          score += 85;
        }
      } else {
        matchedCount++;
        score += 32;
      }
      continue;
    }

    // Typo tolerance for longer words (>= 4 chars)
    if (!qDim && qt.length >= 4) {
      let bestFuzzy = false;
      for (const pt of prodTokens) {
        if (pt.startsWith(qt) || qt.startsWith(pt)) {
          matchedCount++;
          score += 24;
          bestFuzzy = true;
          break;
        }
        if (Math.abs(pt.length - qt.length) <= 1 && levenshtein(qt, pt) === 1) {
          matchedCount++;
          score += 18;
          bestFuzzy = true;
          break;
        }
      }
      if (bestFuzzy) continue;
    }

    // Missing dimension penalty is strong
    if (qDim) score -= 50;
  }

  if (matchedCount === 0) return 0;

  const coverage = matchedCount / queryTokens.length;
  score += coverage * 120;

  // Bonus if query is a substring
  if (normProd.includes(normQuery)) score += 60;

  // Slight tie-breaker for shorter/cleaner product names and higher coverage
  const extraTokens = Math.max(0, prodTokens.length - matchedCount);
  score -= extraTokens * 3;

  return Math.round(score);
}

/**
 * Matches a list of pre-extracted item objects against the Product Catalog.
 */
export function matchItemsToCatalog(
  extracted: { rawLine: string; query: string; qty: number; unit?: string; rate?: number }[],
  products: Product[],
): ParsedOrderLine[] {
  return extracted.map((item, idx) => {
    const scored: { product: Product; score: number }[] = [];
    const q = item.query.trim();

    if (q.length >= 2) {
      for (const p of products) {
        const s = scoreProductMatch(p, q);
        if (s > 35) {
          scored.push({ product: p, score: s });
        }
      }
      scored.sort((a, b) => b.score - a.score);
    }

    const best = scored[0];
    let confidence: MatchConfidence = 'none';
    if (best) {
      if (best.score >= 220) confidence = 'exact';
      else if (best.score >= 135) confidence = 'strong';
      else if (best.score >= 70) confidence = 'fuzzy';
      else confidence = 'none';
    }

    const matchedProduct = confidence !== 'none' && best ? best.product : null;
    const suggestions = scored.slice(0, 6).map((s) => s.product);

    return {
      id: `scan_${Date.now()}_${idx}_${Math.floor(Math.random() * 1000)}`,
      rawLine: item.rawLine,
      searchQuery: q || item.rawLine,
      qty: Math.max(1, item.qty || 1),
      unit: item.unit,
      detectedRate: item.rate,
      matchedProduct,
      confidence,
      suggestions,
      useCustomName: !matchedProduct,
      selected: Boolean(matchedProduct) || q.length >= 2,
    };
  });
}

/**
 * Parses pasted WhatsApp chats, emails, or multi-line item lists into matched catalog lines.
 */
export function parseWhatsAppOrEmailText(rawText: string, products: Product[]): ParsedOrderLine[] {
  const rawLines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const candidates: string[] = [];

  for (const line of rawLines) {
    const clean = stripChatMetadata(line);
    if (!clean || clean.length < 2) continue;
    if (CHAT_NOISE_LINE.test(clean)) continue;

    // Skip lines that look like email headers / phone numbers / greetings
    if (/^(from|to|subject|sent|cc|date|mobile|ph|gstin|email|thank|please find|hello|dear)\s*:/i.test(clean)) {
      continue;
    }

    // Skip conversational intro / closing / header lines with no numbers
    if (!/\d/.test(clean)) {
      if (
        clean.endsWith(':') ||
        /\b(bhaiya|bhai|sir|madam|please|pls|plz|bhej|dena|urgent|material|following|below|attached|regards|thanks|thank\s+you|find\s+attached|quotation|inquiry|enquiry)\b/i.test(clean)
      ) {
        continue;
      }
    }

    // Check if single line has multiple comma-separated items WITH quantities: e.g. "M8 nut 500, M10 nut 200"
    if (clean.includes(',') && !clean.includes('\t')) {
      const parts = clean.split(',').map((p) => p.trim()).filter(Boolean);
      const everyPartLooksLikeItem =
        parts.length >= 2 &&
        parts.every((p) => /[a-zA-Z]{2,}/.test(p) && /\d+/.test(p));
      if (everyPartLooksLikeItem) {
        candidates.push(...parts);
        continue;
      }
    }

    candidates.push(line);
  }

  const extracted = candidates
    .map((raw) => {
      const parsed = extractLineParts(raw);
      return { rawLine: raw, ...parsed };
    })
    .filter((item) => item.query.length >= 2 && /[a-zA-Z]/.test(item.query));

  return matchItemsToCatalog(extracted, products);
}

/**
 * Extracts items from an Excel (.xlsx/.xls) or CSV file sent over WhatsApp/Email.
 */
export async function parseSpreadsheetFile(file: File, products: Product[]): Promise<ParsedOrderLine[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) return [];

  const ws = wb.Sheets[firstSheet];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rows.length === 0) return [];

  // Auto-detect header row in first 5 rows
  let headerIdx = -1;
  let colNameIdx = -1;
  let colQtyIdx = -1;
  let colRateIdx = -1;

  for (let r = 0; r < Math.min(8, rows.length); r++) {
    const row = rows[r].map((c) => String(c || '').toLowerCase().trim());
    const nameI = row.findIndex((c) => /(item|product|description|particular|material|name)/i.test(c));
    const qtyI = row.findIndex((c) => /(qty|quantity|nos|pcs|units)/i.test(c));
    const rateI = row.findIndex((c) => /(rate|price|cost|unit\s*price)/i.test(c));

    if (nameI !== -1 && (qtyI !== -1 || rateI !== -1)) {
      headerIdx = r;
      colNameIdx = nameI;
      colQtyIdx = qtyI;
      colRateIdx = rateI;
      break;
    }
  }

  const extracted: { rawLine: string; query: string; qty: number; rate?: number }[] = [];

  if (headerIdx !== -1 && colNameIdx !== -1) {
    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      const rawName = String(row[colNameIdx] || '').trim();
      if (!rawName || rawName.length < 2 || /^(total|subtotal|grand\s*total|gst)/i.test(rawName)) continue;

      const rawQty = colQtyIdx !== -1 ? parseFloat(String(row[colQtyIdx] || '1').replace(/[^0-9.]/g, '')) : 1;
      const rawRate = colRateIdx !== -1 ? parseFloat(String(row[colRateIdx] || '').replace(/[^0-9.]/g, '')) : NaN;

      extracted.push({
        rawLine: `${rawName}${colQtyIdx !== -1 ? ` (${row[colQtyIdx]})` : ''}`,
        query: expandHardwareTerms(rawName),
        qty: isNaN(rawQty) || rawQty <= 0 ? 1 : Math.round(rawQty),
        rate: !isNaN(rawRate) && rawRate > 0 ? rawRate : undefined,
      });
    }
  } else {
    // Fallback: join non-empty cells and run text line parser
    const text = rows
      .map((row) => row.map((c) => String(c || '').trim()).filter(Boolean).join('\t'))
      .filter(Boolean)
      .join('\n');
    return parseWhatsAppOrEmailText(text, products);
  }

  return matchItemsToCatalog(extracted, products);
}

/**
 * Preprocesses Snipping Tool screenshots & chat captures for cleaner Tesseract OCR:
 * - Upscales small snips (< 1200px wide) so small fonts become legible
 * - Detects dark-mode screenshots (e.g. WhatsApp/Teams dark theme) and auto-inverts
 * - Applies mild grayscale contrast stretch while falling back safely on error
 */
export async function preprocessImageForOCR(file: File | Blob): Promise<File | Blob> {
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    try {
      const srcW = bitmap.width;
      const srcH = bitmap.height;
      if (!srcW || !srcH) return file;

      const scale = srcW < 1200 ? Math.min(2, 1400 / srcW) : 1;
      const dstW = Math.round(srcW * scale);
      const dstH = Math.round(srcH * scale);

      const canvas = document.createElement('canvas');
      canvas.width = dstW;
      canvas.height = dstH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return file;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, dstW, dstH);

      const imgData = ctx.getImageData(0, 0, dstW, dstH);
      const d = imgData.data;
      const pixelCount = dstW * dstH;
      const stride = Math.max(1, Math.floor(pixelCount / 15000)) * 4;

      let lumSum = 0;
      let sampled = 0;
      for (let i = 0; i < d.length; i += stride) {
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        lumSum += lum;
        sampled++;
      }
      const avgLum = sampled > 0 ? lumSum / sampled : 255;
      const isDarkMode = avgLum < 125;

      for (let i = 0; i < d.length; i += 4) {
        let gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        if (isDarkMode) gray = 255 - gray;
        // Mild contrast boost centered around mid-tone
        const contrasted = Math.max(0, Math.min(255, Math.round((gray - 128) * 1.25 + 128)));
        d[i] = contrasted;
        d[i + 1] = contrasted;
        d[i + 2] = contrasted;
      }

      ctx.putImageData(imgData, 0, 0);

      const enhancedBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((blob) => resolve(blob), 'image/png'),
      );
      return enhancedBlob || file;
    } finally {
      bitmap.close();
    }
  } catch {
    return file;
  }
}

/**
 * Runs local browser OCR on an image file/blob using Tesseract.js (zero API key required).
 */
export async function runLocalImageOCR(
  file: File | Blob,
  onProgress?: (pct: number, statusText: string) => void,
): Promise<string> {
  const preparedFile = await preprocessImageForOCR(file);
  const Tesseract = await import('tesseract.js');
  const worker = await Tesseract.createWorker('eng', 1, {
    logger: (m) => {
      if (onProgress && m.status) {
        const pct = typeof m.progress === 'number' ? Math.round(m.progress * 100) : 0;
        const label =
          m.status === 'recognizing text'
            ? `Scanning text... ${pct}%`
            : m.status === 'loading language traineddata'
            ? `Downloading OCR engine (first time only)... ${pct}%`
            : `${m.status}...`;
        onProgress(pct, label);
      }
    },
  });

  try {
    const { data } = await worker.recognize(preparedFile);
    return data.text || '';
  } finally {
    await worker.terminate();
  }
}

/**
 * Converts a File/Blob to Base64 without the data URI prefix.
 */
export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Uses user's Gemini API key to extract clean JSON line items from handwritten slips,
 * bill photos, screenshots, PDFs, or messy WhatsApp chats.
 */
export async function extractItemsWithGeminiAI(
  input: { file?: File | Blob; mimeType?: string; text?: string },
  apiKey: string,
  products: Product[],
): Promise<{
  items: ParsedOrderLine[];
  rawSummaryText: string;
}> {
  if (!apiKey.trim()) {
    throw new Error('Please enter your Google Gemini API key first.');
  }

  const prompt = `You are an expert hardware, fasteners, stainless steel bolts/nuts/washers, and tools ERP data-entry assistant for an Indian industrial distributor (Nain Tools & SS Bolt Co.).
Extract every line item ordered or billed from the provided content (image, PDF invoice, screenshot, handwritten slip, WhatsApp message, or email).

Rules:
- For each product item, return its normalized hardware description (e.g. "SS 304 HEX BOLT 8X25", "MS ALLEN BOLT 10X16", "PLAIN WASHER M8"), integer quantity, optional unit ("pcs", "box", etc.), and optional unit rate (number only, WITHOUT multiplying by qty).
- Keep size/dimensions inside the product name (e.g., 1/2"X2", 8X25, M10, 304, 316). Do NOT confuse dimensions with quantity!
- Ignore headers, GST summaries, bank details, greetings, timestamps, and total rows.
- Respond ONLY with valid JSON matching:
{
  "items": [
    { "name": "string", "qty": 100, "unit": "pcs", "rate": 2.5 }
  ]
}`;

  const parts: Record<string, unknown>[] = [{ text: prompt }];
  if (input.file) {
    const base64 = await fileToBase64(input.file);
    parts.push({
      inline_data: {
        mime_type: input.mimeType || input.file.type || 'image/jpeg',
        data: base64,
      },
    });
  }
  if (input.text && input.text.trim()) {
    parts.push({ text: `Input text:\n${input.text}` });
  }

  const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
  let lastError: Error | null = null;
  let responseJson: any = null;

  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey.trim())}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json',
            },
          }),
        },
      );
      if (!res.ok) {
        const errBody = await res.text().catch(() => res.statusText);
        throw new Error(`Gemini API error (${res.status}): ${errBody}`);
      }
      responseJson = await res.json();
      break;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  if (!responseJson) {
    throw lastError || new Error('Gemini Vision request failed');
  }

  const rawOutput =
    responseJson?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

  let parsedPayload: { items?: { name?: string; qty?: number; unit?: string; rate?: number }[] } = {};
  try {
    const cleanedJson = rawOutput.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    parsedPayload = JSON.parse(cleanedJson);
  } catch {
    throw new Error('Could not parse AI response as structured items.');
  }

  const rawItems = Array.isArray(parsedPayload.items) ? parsedPayload.items : [];
  const extracted = rawItems
    .filter((i) => i && i.name && String(i.name).trim().length > 0)
    .map((i) => {
      const nameStr = String(i.name).trim();
      const qtyNum = Math.max(1, Math.round(Number(i.qty) || 1));
      const rateNum = typeof i.rate === 'number' && i.rate > 0 ? i.rate : undefined;
      return {
        rawLine: `${nameStr} — ${qtyNum}${i.unit ? ' ' + i.unit : ''}${rateNum ? ' @ ₹' + rateNum : ''}`,
        query: expandHardwareTerms(nameStr),
        qty: qtyNum,
        unit: i.unit,
        rate: rateNum,
      };
    });

  const matched = matchItemsToCatalog(extracted, products);
  const rawSummaryText = extracted.map((e) => e.rawLine).join('\n');
  return { items: matched, rawSummaryText };
}
