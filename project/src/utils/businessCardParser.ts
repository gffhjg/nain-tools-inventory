import { getStateByCode, validateGstin } from '@/lib/constants';
import {
  getGeminiApiKey,
  fileToBase64,
} from '@/utils/smartOrderParser';

export interface ParsedBusinessCard {
  businessName: string;
  contactPerson: string;
  phone: string;
  altPhone: string;
  gstin: string;
  pan: string;
  email: string;
  address: string;
  state: string;
  stateCode: string;
  notes: string;
  rawText: string;
}

const NOISE_LINE_REGEX =
  /^(activate\s*windows|go\s*to\s*settings|powered\s*by|scan\s*qr|follow\s*us)/i;

const TAGLINE_KEYWORDS_REGEX =
  /\b(dealers?\s+in|manufacturers?|suppliers?|stockists?|traders?\s+in|specialists?\s+in|job\s*work|all\s+kinds?\s+of|all\s+types?\s+of|laser\s+cutting|jali\s+cut|designs?|wholesale|retail|ISO\s*\d+)\b/i;

const COMPANY_SUFFIX_REGEX =
  /\b(engineering|enterprises|enterprise|industries|industry|traders|hardware|fasteners|tools|steels|steel|metals|metal|works|pvt|ltd|llp|corp|corporation|agencies|associates|exports|impex|solutions|sales|marketing|systems|alloys|bolts|components|services|co\.?|company)\b/i;

const ADDRESS_KEYWORDS_REGEX =
  /\b(plot|shop|flat|floor|flr|bldg|building|complex|tower|chambers|plaza|arcade|market|chowk|colony|nagar|vihar|enclave|extn|extension|phase|sec|sector|sec\.|road|rd|marg|street|st\.|gali|lane|main|near|opp|opposite|behind|beside|front|indl|industrial|area|estate|gidc|midc|hsiidc|tehsil|dist|district|faridabad|delhi|new\s+delhi|noida|gurgaon|gurugram|ghaziabad|ballabhgarh|palwal|panipat|sonipat|ambala|rohtak|hisar|karnal|bhiwadi|manesar|jaipur|mumbai|thane|pune|nashik|nagpur|ahmedabad|surat|vadodara|rajkot|jamnagar|ludhiana|jalandhar|amritsar|chandigarh|chennai|coimbatore|bengaluru|bangalore|hyderabad|kolkata|howrah|indore|bhopal|kanpur|lucknow|haryana|punjab|rajasthan|gujarat|maharashtra|uttar\s+pradesh|tamil\s+nadu|karnataka|india)\b/i;

const HEADER_LABEL_PREFIX =
  /^(gstin|gst|tin|pan|e-?mail|mail|mob|mobile|ph|phone|tel|call|web|website|url|address|add|off|office|works|factory|contact|prop|proprietor)\b[\s.:/-]*/i;

const DIGIT_FROM_OCR: Record<string, string> = {
  O: '0',
  Q: '0',
  D: '0',
  I: '1',
  L: '1',
  Z: '2',
  S: '5',
  G: '6',
  B: '8',
};

const ALPHA_FROM_OCR: Record<string, string> = {
  '0': 'O',
  '1': 'I',
  '2': 'Z',
  '5': 'S',
  '8': 'B',
};

const GSTIN_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function isValidGstinChecksum(gstin: string): boolean {
  if (!validateGstin(gstin).valid) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const val = GSTIN_CHARSET.indexOf(gstin[i]);
    if (val < 0) return false;
    const prod = val * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(prod / 36) + (prod % 36);
  }
  const checkIdx = (36 - (sum % 36)) % 36;
  return gstin[14] === GSTIN_CHARSET[checkIdx];
}

const OCR_LOOKALIKES: Record<string, string[]> = {
  O: ['Q', 'D', 'C'],
  Q: ['O', 'G'],
  D: ['O', '0'],
  C: ['G', 'O'],
  G: ['C', '6'],
  '5': ['6', 'S'],
  '6': ['5', 'G'],
  '0': ['8', '6', '9'],
  '8': ['0', 'B'],
  '1': ['7', 'I'],
  '7': ['1'],
  '2': ['Z'],
  Z: ['2'],
};

function healGstinByChecksum(base: string, preferredStateCode = ''): { gstin: string; cost: number } {
  const statePenalty = (g: string) =>
    preferredStateCode && g.slice(0, 2) !== preferredStateCode ? 12 : 0;

  if (isValidGstinChecksum(base)) {
    return { gstin: base, cost: statePenalty(base) };
  }

  // Build candidate alternatives per position with perceptual OCR cost
  // O<->Q is visually tiny (stroke tail), whereas mutating check digit pos 14 is expensive
  const altsPerPos: { ch: string; cost: number }[][] = base.split('').map((ch, idx) => {
    const rawAlts = OCR_LOOKALIKES[ch] || [];
    const out: { ch: string; cost: number }[] = [];
    for (const alt of rawAlts) {
      if ((idx <= 1 || (idx >= 7 && idx <= 10)) && !/[0-9]/.test(alt)) continue;
      if (((idx >= 2 && idx <= 6) || idx === 11) && !/[A-Z]/.test(alt)) continue;
      const isOQ = (ch === 'O' && alt === 'Q') || (ch === 'Q' && alt === 'O');
      const cost = idx === 14 ? 5 : isOQ ? 1 : 2.5;
      out.push({ ch: alt, cost });
    }
    return out;
  });

  let best: { gstin: string; cost: number } | null = null;

  const tryPick = (cand: string, editCost: number) => {
    if (!isValidGstinChecksum(cand)) return;
    const total = editCost + statePenalty(cand);
    if (!best || total < best.cost) best = { gstin: cand, cost: total };
  };

  // Pass 1: 1-character visual OCR fixes
  for (let i = 0; i < 15; i++) {
    for (const { ch, cost } of altsPerPos[i]) {
      const arr = base.split('');
      arr[i] = ch;
      tryPick(arr.join(''), cost);
    }
  }

  // Pass 2: 2-character visual OCR fixes (e.g. both Qs read as O across green card text)
  for (let i = 0; i < 15; i++) {
    if (altsPerPos[i].length === 0) continue;
    for (let j = i + 1; j < 15; j++) {
      if (altsPerPos[j].length === 0) continue;
      for (const a1 of altsPerPos[i]) {
        for (const a2 of altsPerPos[j]) {
          const arr = base.split('');
          arr[i] = a1.ch;
          arr[j] = a2.ch;
          tryPick(arr.join(''), a1.cost + a2.cost);
        }
      }
    }
  }

  return best || { gstin: base, cost: 50 + statePenalty(base) };
}

/**
 * Normalizes a 15-char Indian GSTIN candidate using positional character constraints
 * and official Mod-36 GSTIN checksum recovery for visual OCR confusions (O<->Q, 5<->6, etc.).
 */
function repairGstinCandidate(
  rawToken: string,
  preferredStateCode = '',
): { gstin: string; score: number } | null {
  const cleaned = rawToken.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (cleaned.length !== 15) return null;

  const chars = cleaned.split('');
  const mapDigit = (c: string) => (/[0-9]/.test(c) ? c : DIGIT_FROM_OCR[c] || c);
  const mapAlpha = (c: string) => (/[A-Z]/.test(c) ? c : ALPHA_FROM_OCR[c] || c);

  let rawCoercions = 0;
  for (const idx of [0, 1, 7, 8, 9, 10]) {
    if (!/[0-9]/.test(chars[idx])) rawCoercions += 1;
    chars[idx] = mapDigit(chars[idx]);
  }
  for (const idx of [2, 3, 4, 5, 6, 11]) {
    if (!/[A-Z]/.test(chars[idx])) rawCoercions += 1;
    chars[idx] = mapAlpha(chars[idx]);
  }
  if (chars[13] === '2' || chars[13] === '7') chars[13] = 'Z';
  if (chars[14] === 'O' || chars[14] === 'Q') chars[14] = '0';

  const fixed = chars.join('');
  if (!validateGstin(fixed).valid) return null;

  const healed = healGstinByChecksum(fixed, preferredStateCode);
  return { gstin: healed.gstin, score: healed.cost + rawCoercions * 1.5 };
}

function inferStateFromText(text: string): { state: string; stateCode: string } {
  const lowerAll = (text || '').toLowerCase();
  if (/\b(faridabad|gurugram|gurgaon|panipat|sonipat|ambala|rohtak|hisar|karnal|manesar|ballabhgarh|palwal|haryana|121\d{3}|122\d{3})\b/.test(lowerAll)) {
    return { state: 'Haryana', stateCode: '06' };
  }
  if (/\b(new\s+delhi|delhi|110\d{3})\b/.test(lowerAll)) {
    return { state: 'Delhi', stateCode: '07' };
  }
  if (/\b(noida|ghaziabad|kanpur|lucknow|agra|uttar\s+pradesh|201\d{3})\b/.test(lowerAll)) {
    return { state: 'Uttar Pradesh', stateCode: '09' };
  }
  if (/\b(ludhiana|jalandhar|amritsar|punjab|141\d{3})\b/.test(lowerAll)) {
    return { state: 'Punjab', stateCode: '03' };
  }
  if (/\b(mumbai|pune|thane|nashik|nagpur|maharashtra|400\d{3}|411\d{3})\b/.test(lowerAll)) {
    return { state: 'Maharashtra', stateCode: '27' };
  }
  if (/\b(ahmedabad|surat|vadodara|rajkot|jamnagar|gujarat|380\d{3}|360\d{3})\b/.test(lowerAll)) {
    return { state: 'Gujarat', stateCode: '24' };
  }
  return { state: '', stateCode: '' };
}

function extractGstin(text: string, preferredStateCode = ''): string {
  const scoredCandidates: { gstin: string; score: number }[] = [];

  // 1. Collect explicitly labeled GSTIN tokens (allowing slight spaces OCR inserts)
  const labeledMatches = text.matchAll(
    /(?:GSTIN|GST\s*(?:NO\.?|IN)?|G\.?S\.?T\.?)[\s.:/-]*([A-Z0-9][A-Z0-9\s-]{13,18}[A-Z0-9])/gi,
  );
  for (const m of labeledMatches) {
    const compact = m[1].replace(/[\s-]/g, '');
    if (compact.length >= 15) {
      const candidate = repairGstinCandidate(compact.slice(0, 15), preferredStateCode);
      if (candidate) scoredCandidates.push({ gstin: candidate.gstin, score: candidate.score - 2 });
    }
  }

  // 2. Fallback: scan every 15-char alphanumeric token in text
  const tokens = text.toUpperCase().match(/[A-Z0-9]{15}/g) || [];
  for (const tok of tokens) {
    const candidate = repairGstinCandidate(tok, preferredStateCode);
    if (candidate) scoredCandidates.push(candidate);
  }

  const validOnly = scoredCandidates.filter((c) => isValidGstinChecksum(c.gstin));
  const pool = validOnly.length > 0 ? validOnly : scoredCandidates;
  pool.sort((a, b) => a.score - b.score);
  return pool[0]?.gstin || '';
}

function extractEmails(text: string): string[] {
  // Collapse accidental spaces around '@' that OCR sometimes introduces in footers
  const normalized = text.replace(/\s*@\s*/g, '@');
  const matches = normalized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const lower = m.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      out.push(lower);
    }
  }
  return out;
}

function extractPhones(text: string, gstin: string): string[] {
  const candidates: string[] = [];
  // Strip out GSTIN and email blocks so numbers inside PAN/GST/email don't interfere
  const masked = gstin ? text.replace(new RegExp(gstin, 'gi'), ' ') : text;

  // Look for Indian mobile numbers (with optional +91 / 91 / 0 and spacing/hyphens)
  const rx = /(?:\+91[\s.-]*|91[\s.-]*|0)?([6-9](?:[\s.-]*\d){9})(?!\d)/g;
  for (const m of masked.matchAll(rx)) {
    const digits = m[1].replace(/\D/g, '');
    if (digits.length === 10 && !candidates.includes(digits)) {
      candidates.push(digits);
    }
  }

  return candidates;
}

function cleanCardLines(rawText: string): string[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/[|•▪▫●◆►]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= 2 && !NOISE_LINE_REGEX.test(l));

  // Deduplicate near-identical lines produced across multi-pass OCR (case-insensitive)
  const unique: string[] = [];
  const seenNorm = new Set<string>();
  for (const line of lines) {
    const norm = line.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!norm || norm.length < 2) continue;
    if (!seenNorm.has(norm)) {
      seenNorm.add(norm);
      unique.push(line);
    }
  }
  return unique;
}

/**
 * Parses OCR'd or pasted text from an Indian business card / visiting card / shop board
 * or email/WhatsApp signature into structured customer/supplier fields.
 */
export function parseBusinessCardText(rawText: string): ParsedBusinessCard {
  const cleanRaw = (rawText || '').trim();
  const lines = cleanCardLines(cleanRaw);

  const inferredLoc = inferStateFromText(cleanRaw);
  const gstin = extractGstin(cleanRaw, inferredLoc.stateCode);
  const panMatch = cleanRaw.toUpperCase().match(/\bPAN[\s.:/-]*([A-Z]{5}[0-9]{4}[A-Z])\b/);
  const pan = gstin ? gstin.slice(2, 12) : panMatch ? panMatch[1] : '';

  const emails = extractEmails(cleanRaw);
  const email = emails[0] || '';

  const phones = extractPhones(cleanRaw, gstin);
  const phone = phones[0] || '';
  const altPhone = phones[1] || '';

  const stateCode = gstin ? gstin.slice(0, 2) : inferredLoc.stateCode;
  const state = (stateCode ? getStateByCode(stateCode) : '') || inferredLoc.state;

  // Extract explicit contact person
  let contactPerson = '';
  for (const line of lines) {
    const cpMatch = line.match(
      /^(?:prop\.?|proprietor|contact(?:\s+person)?|attn|director|partner|mr\.?|mrs\.?|shri)\s*[:.-]?\s*([A-Za-z][A-Za-z.\s]{2,35})$/i,
    );
    if (cpMatch && !COMPANY_SUFFIX_REGEX.test(cpMatch[1])) {
      contactPerson = cpMatch[1].trim();
      break;
    }
  }

  // Extract Address lines (strip trailing email/phone/GST fragments appended on same footer line)
  const addressParts: string[] = [];
  for (const line of lines) {
    // Skip lines that are ONLY header meta like GSTIN + Phone
    const strippedMeta = line
      .replace(/(?:GSTIN|GST\s*NO\.?)[\s.:/-]*[A-Z0-9-]{8,20}/gi, '')
      .replace(/[A-Z0-9._%+-]+\s*@\s*[A-Z0-9.-]+\.[A-Z]{2,}/gi, '')
      .replace(/(?:E-?mail|Mail|Ph\.?|Phone|Mob\.?|Mobile|Tel\.?|Web|Website)[\s.:/-]*/gi, '')
      .replace(/(?:\+91[\s.-]*)?[6-9](?:[\s.-]*\d){9}/g, '')
      .replace(/^[,.\s:/-]+|[,.\s:/-]+$/g, '')
      .trim();

    if (!strippedMeta || strippedMeta.length < 6) continue;

    const hasPin = /\b[1-9][0-9]{5}\b/.test(strippedMeta);
    const hasAddressHint = ADDRESS_KEYWORDS_REGEX.test(strippedMeta);

    if (hasPin || hasAddressHint) {
      // Avoid grabbing pure product/tagline lines that merely mention SS/MS or material work
      if (TAGLINE_KEYWORDS_REGEX.test(strippedMeta) && !hasPin && !/\b(plot|road|Complex|nagar|sec|sector|near|opp|shop|floor|street)\b/i.test(strippedMeta)) {
        continue;
      }
      if (!addressParts.some((p) => p.toLowerCase() === strippedMeta.toLowerCase())) {
        addressParts.push(strippedMeta);
      }
    }
  }

  // Merge multi-line address segments cleanly
  const address = addressParts
    .join(', ')
    .replace(/\s*,\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/^[,\s]+|[,\s]+$/g, '');

  // Score candidate lines to pick the best Business / Firm Name
  let businessName = '';
  let bestScore = -1;
  const specialtyParts: string[] = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    if (HEADER_LABEL_PREFIX.test(line) && !COMPANY_SUFFIX_REGEX.test(line)) continue;
    if (/^[0-9+\s-]{6,}$/.test(line)) continue;
    if (/@|https?:\/\/|www\./i.test(line) && line.split(/\s+/).length <= 3) continue;

    // Clean any leading short logo monogram separated by space e.g. "HB" line vs "HB ENGINEERING"
    const cleanLine = line
      .replace(/(?:GSTIN|GST\s*NO\.?)[\s.:/-]*[A-Z0-9-]{8,20}/gi, '')
      .replace(/(?:\+91[\s.-]*)?[6-9](?:[\s.-]*\d){9}/g, '')
      .trim();
    if (!cleanLine || cleanLine.length < 3) continue;

    if (TAGLINE_KEYWORDS_REGEX.test(cleanLine) && !COMPANY_SUFFIX_REGEX.test(cleanLine)) {
      const cleanedTag = cleanLine.replace(/^[^A-Za-z0-9]+/, '').replace(/;/g, ',').trim();
      const wordsTag = cleanedTag.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
      const isDuplicateTag = specialtyParts.some((existing) => {
        const exWords = new Set(existing.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2));
        const shared = wordsTag.filter((w) => exWords.has(w)).length;
        return wordsTag.length > 0 && shared / wordsTag.length >= 0.6;
      });
      if (cleanedTag && !isDuplicateTag) specialtyParts.push(cleanedTag);
      continue;
    }

    const isAddressLine =
      ADDRESS_KEYWORDS_REGEX.test(cleanLine) || /\b[1-9][0-9]{5}\b/.test(cleanLine);
    if (isAddressLine && !COMPANY_SUFFIX_REGEX.test(cleanLine)) continue;

    const words = cleanLine.split(/\s+/);
    const alphaChars = (cleanLine.match(/[A-Za-z]/g) || []).length;
    if (alphaChars < 3) continue;

    let score = 0;
    if (COMPANY_SUFFIX_REGEX.test(cleanLine)) score += 60;
    if (cleanLine === cleanLine.toUpperCase() && words.length >= 1 && words.length <= 6) score += 25;
    if (words.length >= 2 && words.length <= 5) score += 20;
    if (idx <= 3) score += 12;
    if (cleanLine.includes(',')) score -= 25;
    if (/\d/.test(cleanLine)) score -= 12;
    // Penalize tiny 2-3 char logo monograms (e.g. "HB") when a full name exists
    if (cleanLine.length <= 4 && words.length === 1) score -= 35;

    if (score > bestScore) {
      bestScore = score;
      businessName = cleanLine;
    }
  }

  return {
    businessName: businessName
      .replace(/^[\s'"‘’“”`~•*|\\/:;.,-]+|[\s'"‘’“”`~•*|\\/:;.,-]+$/g, '')
      .trim(),
    contactPerson,
    phone,
    altPhone,
    gstin,
    pan,
    email,
    address,
    state,
    stateCode,
    notes: specialtyParts.join(' | '),
    rawText: cleanRaw,
  };
}

/**
 * Generates dual preprocessed PNG variants for mixed bright/dark colorful business cards:
 * 1) Upscaled chromatic-min luminance contrast (separates green/red/blue ink sharply on yellow/colored banners)
 * 2) Upscaled inverted luminance contrast (separates white text cleanly on dark-green/navy/black footers)
 */
async function buildBusinessCardOcrVariants(file: File | Blob): Promise<(File | Blob)[]> {
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') {
    return [file];
  }
  try {
    const bitmap = await createImageBitmap(file);
    try {
      const srcW = bitmap.width;
      const srcH = bitmap.height;
      if (!srcW || !srcH) return [file];

      const scale = srcW < 2100 ? Math.min(2.5, 2100 / srcW) : 1;
      const dstW = Math.round(srcW * scale);
      const dstH = Math.round(srcH * scale);

      const makeVariant = async (mode: 'std' | 'chroma' | 'invert'): Promise<Blob | null> => {
        const canvas = document.createElement('canvas');
        canvas.width = dstW;
        canvas.height = dstH;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return null;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bitmap, 0, 0, dstW, dstH);

        const imgData = ctx.getImageData(0, 0, dstW, dstH);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i];
          const g = d[i + 1];
          const b = d[i + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          let val: number;
          if (mode === 'invert') {
            val = (255 - lum - 128) * 1.45 + 128;
          } else if (mode === 'chroma') {
            val = (Math.min(r, g) * 0.75 + lum * 0.25 - 132) * 1.45 + 128;
          } else {
            val = (lum - 128) * 1.25 + 128;
          }
          const out = Math.max(0, Math.min(255, Math.round(val)));
          d[i] = out;
          d[i + 1] = out;
          d[i + 2] = out;
        }
        ctx.putImageData(imgData, 0, 0);
        return new Promise<Blob | null>((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
      };

      const [stdBlob, chromaBlob, invBlob] = await Promise.all([
        makeVariant('std'),
        makeVariant('chroma'),
        makeVariant('invert'),
      ]);
      const out: (File | Blob)[] = [];
      if (stdBlob) out.push(stdBlob);
      if (chromaBlob) out.push(chromaBlob);
      if (invBlob) out.push(invBlob);
      return out.length > 0 ? out : [file];
    } finally {
      bitmap.close();
    }
  } catch {
    return [file];
  }
}

/**
 * Runs multi-pass local Tesseract OCR on a business card image/screenshot (zero API key required),
 * reading bright/colored banners and light-on-dark footers cleanly.
 */
export async function scanBusinessCardOffline(
  file: File | Blob,
  onProgress?: (pct: number, statusText: string) => void,
): Promise<ParsedBusinessCard> {
  if (onProgress) onProgress(5, 'Enhancing business card contrast...');
  const variants = await buildBusinessCardOcrVariants(file);
  const Tesseract = await import('tesseract.js');

  const worker = await Tesseract.createWorker('eng', 1, {
    logger: (m) => {
      if (onProgress && m.status) {
        const pct = typeof m.progress === 'number' ? Math.round(m.progress * 100) : 0;
        const label =
          m.status === 'recognizing text'
            ? `Reading card text... ${pct}%`
            : m.status === 'loading language traineddata'
            ? `Loading OCR engine... ${pct}%`
            : `${m.status}...`;
        onProgress(pct, label);
      }
    },
  });

  try {
    const collectedTexts: string[] = [];
    for (let i = 0; i < variants.length; i++) {
      if (onProgress) {
        onProgress(
          Math.round(((i + 0.1) / variants.length) * 100),
          i === 0
            ? 'Scanning card header & firm name...'
            : i === 1
            ? 'Scanning GSTIN & colored text...'
            : 'Scanning card footer & address strip...',
        );
      }
      const { data } = await worker.recognize(variants[i]);
      if (data.text) collectedTexts.push(data.text);
    }

    const mergedRaw = collectedTexts.join('\n');
    return parseBusinessCardText(mergedRaw);
  } finally {
    await worker.terminate();
  }
}

/**
 * Optional Gemini 2.5 Flash Vision extractor for stylized, tilted, or handwritten cards.
 */
export async function scanBusinessCardWithGemini(
  input: { file?: File | Blob; text?: string },
  apiKey: string,
): Promise<ParsedBusinessCard> {
  const key = (apiKey || getGeminiApiKey()).trim();
  if (!key) {
    throw new Error('Gemini API key is not configured.');
  }

  const prompt = `Extract Indian business card / visiting card / letterhead party details cleanly.
Return ONLY raw JSON (no markdown fences) with these string keys:
{
  "businessName": "Firm or Company Name in Title or Uppercase",
  "contactPerson": "Person name if mentioned else empty string",
  "phone": "Primary 10-digit mobile/phone digits only",
  "altPhone": "Secondary phone if any else empty string",
  "gstin": "15-char uppercase Indian GSTIN if shown else empty string",
  "pan": "10-char PAN if shown else empty string",
  "email": "Email address else empty string",
  "address": "Complete shop/plot/sector/city/pincode address",
  "notes": "Short tagline or products/services mentioned on card"
}`;

  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (input.file) {
    const base64 = await fileToBase64(input.file);
    parts.push({
      inline_data: {
        mime_type: input.file.type || 'image/jpeg',
        data: base64,
      },
    });
  } else if (input.text) {
    parts.push({ text: `CONTACT / CARD TEXT:\n${input.text}` });
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.1 },
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini API Error (${res.status}): ${errText.slice(0, 180)}`);
  }

  const data = await res.json();
  const rawOut: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const cleanedJson = rawOut.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  const parsed = JSON.parse(cleanedJson) as Partial<ParsedBusinessCard>;

  const rawAddress = String(parsed.address || '').trim();
  const inferred = inferStateFromText(rawAddress);
  const rawGstin = String(parsed.gstin || '').toUpperCase().replace(/\s+/g, '');
  const repairedGstin = rawGstin ? repairGstinCandidate(rawGstin, inferred.stateCode)?.gstin || rawGstin : '';
  const stateCode = (repairedGstin.length >= 2 ? repairedGstin.slice(0, 2) : '') || inferred.stateCode;
  const state = (stateCode ? getStateByCode(stateCode) : '') || inferred.state;

  return {
    businessName: String(parsed.businessName || '').trim(),
    contactPerson: String(parsed.contactPerson || '').trim(),
    phone: String(parsed.phone || '').replace(/^\+?91[\s-]*/, '').replace(/\s+/g, '').trim(),
    altPhone: String(parsed.altPhone || '').trim(),
    gstin: repairedGstin,
    pan: String(parsed.pan || (repairedGstin.length >= 12 ? repairedGstin.slice(2, 12) : '')).trim(),
    email: String(parsed.email || '').trim().toLowerCase(),
    address: String(parsed.address || '').trim(),
    state,
    stateCode,
    notes: String(parsed.notes || '').trim(),
    rawText: input.text || rawOut,
  };
}
