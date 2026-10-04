/**
 * 🔍 Fuzzy & Phonetic Search Engine for OOH Media Locations
 * 
 * Provides robust phonetic normalization (Indian English transliteration),
 * alias expansion (Begam ⇄ Begum, Dehli ⇄ Delhi), and Levenshtein edit distance
 * so users and search queries never return 0 results due to minor spelling differences.
 */

/**
 * Compute Levenshtein distance between two strings
 * @param {string} a 
 * @param {string} b 
 * @returns {number}
 */
export const levenshteinDistance = (a = '', b = '') => {
  const s1 = String(a).toLowerCase();
  const s2 = String(b).toLowerCase();
  if (s1 === s2) return 0;
  if (!s1.length) return s2.length;
  if (!s2.length) return s1.length;

  const matrix = Array.from({ length: s2.length + 1 }, () => new Array(s1.length + 1).fill(0));
  for (let i = 0; i <= s1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= s2.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= s2.length; j++) {
    for (let i = 1; i <= s1.length; i++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,       // deletion
        matrix[j - 1][i] + 1,       // insertion
        matrix[j - 1][i - 1] + cost // substitution
      );
    }
  }

  return matrix[s2.length][s1.length];
};

/**
 * Common Indian OOH Location Aliases & Transliteration Equivalences
 */
export const LOCATION_ALIASES = {
  'begam': 'begum',
  'begum': 'begum',
  'dehli': 'delhi',
  'delhi': 'delhi',
  'bachha': 'bacha',
  'bachcha': 'bacha',
  'bacha': 'bacha',
  'sotiganj': 'soti ganj',
  'modipuram': 'modi puram',
  'tejgarhi': 'tej garhi',
  'chawk': 'chowk',
  'chauraha': 'chowk',
  'chowk': 'chowk',
  'cant': 'cantt',
  'cantt': 'cantt',
  'cantonment': 'cantt',
  'shastri': 'sastri',
  'sastri': 'sastri',
  'rd': 'road',
  'stn': 'station',
  'st': 'station',
  'metro': 'metro',
};

/**
 * Canonical phonetic normalizer for Indian English transliteration.
 * Normalizes vowel variants (ee->i, oo->u, a/u in begam/begum) and repeated consonants.
 * @param {string} str 
 * @returns {string}
 */
export const normalizePhonetic = (str = '') => {
  if (!str) return '';
  let s = String(str).toLowerCase().trim();

  // Normalize delimiters to spaces
  s = s.replace(/[-_./,\\]+/g, ' ');

  // Direct alias replacement for whole tokens
  const words = s.split(/\s+/).map(w => {
    if (LOCATION_ALIASES[w]) return LOCATION_ALIASES[w];
    // Begam -> Begum rule
    if (w === 'begam' || w === 'bagam' || w === 'begham') return 'begum';
    return w;
  });
  s = words.join(' ');

  // Standard phonetic transforms
  s = s
    .replace(/\bthe\b/g, '')
    .replace(/ph/g, 'f')
    .replace(/sh/g, 's')
    .replace(/chh/g, 'ch')
    .replace(/kh/g, 'k')
    .replace(/gh/g, 'g')
    .replace(/th/g, 't')
    .replace(/dh/g, 'd')
    .replace(/bh/g, 'b')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/ea/g, 'i')
    .replace(/aa/g, 'a')
    .replace(/ai/g, 'e')
    .replace(/au/g, 'o')
    .replace(/ou/g, 'o')
    .replace(/w/g, 'v')
    .replace(/z/g, 'j');

  // Collapse consecutive duplicate characters (e.g. tt -> t, mm -> m, ll -> l)
  s = s.replace(/([a-z])\1+/g, '$1');

  // Begam / Begum unification: 'bgm' or 'begm'
  s = s.replace(/begam/g, 'begum');

  return s.trim();
};

/**
 * Checks if a single keyword matches a target string fuzzily or phonetically.
 * @param {string} targetText 
 * @param {string} keyword 
 * @returns {boolean}
 */
export const matchesKeywordFuzzy = (targetText = '', keyword = '') => {
  const t = String(targetText || '').toLowerCase().trim();
  const k = String(keyword || '').toLowerCase().trim();
  if (!k) return true;
  if (!t) return false;

  // 1. Direct substring match (fastest)
  if (t.includes(k)) return true;

  // 2. Compact / punctuation-stripped match
  const tCompact = t.replace(/[\s\-_,.]+/g, '');
  const kCompact = k.replace(/[\s\-_,.]+/g, '');
  if (kCompact && tCompact.includes(kCompact)) return true;

  // 3. Phonetic normalization match
  const tPhonetic = normalizePhonetic(t);
  const kPhonetic = normalizePhonetic(k);
  if (kPhonetic && tPhonetic.includes(kPhonetic)) return true;

  const tPhoneticCompact = tPhonetic.replace(/[\s\-_,.]+/g, '');
  const kPhoneticCompact = kPhonetic.replace(/[\s\-_,.]+/g, '');
  if (kPhoneticCompact && tPhoneticCompact.includes(kPhoneticCompact)) return true;

  // 4. Token-level fuzzy match (handles typos, Levenshtein edit distance <= 1 or 2)
  const targetWords = t.split(/[\s\-_,.]+/).filter(w => w.length > 1);
  const keyWords = k.split(/[\s\-_,.]+/).filter(w => w.length > 1);

  // If keyword is a multi-word phrase and not directly found, check if each keyword token matches a target token
  if (keyWords.length > 1) {
    return keyWords.every(kw => {
      return targetWords.some(tw => {
        if (tw.includes(kw) || kw.includes(tw)) return true;
        const normTw = normalizePhonetic(tw);
        const normKw = normalizePhonetic(kw);
        if (normTw === normKw || normTw.includes(normKw) || normKw.includes(normTw)) return true;
        const maxDist = kw.length >= 6 ? 2 : (kw.length >= 4 ? 1 : 0);
        return levenshteinDistance(tw, kw) <= maxDist;
      });
    });
  }

  // Single keyword matching against any target word
  const maxDistance = k.length >= 6 ? 2 : (k.length >= 4 ? 1 : 0);
  for (const word of targetWords) {
    if (word.includes(k) || k.includes(word)) return true;
    const normW = normalizePhonetic(word);
    if (normW === kPhonetic || normW.includes(kPhonetic)) return true;
    if (maxDistance > 0 && levenshteinDistance(word, k) <= maxDistance) return true;
  }

  return false;
};

/**
 * Checks if all keywords in a query match the target text (with phonetic & fuzzy tolerance).
 * @param {string} targetText 
 * @param {string|string[]} queryOrKeywords 
 * @returns {boolean}
 */
export const matchesAllKeywordsFuzzy = (targetText = '', queryOrKeywords = '') => {
  if (!queryOrKeywords) return true;
  if (!targetText) return false;

  const keywords = Array.isArray(queryOrKeywords)
    ? queryOrKeywords
    : String(queryOrKeywords).trim().split(/\s+/).filter(Boolean);

  if (!keywords.length) return true;

  // Check full query phrase first
  const fullQuery = Array.isArray(queryOrKeywords) ? queryOrKeywords.join(' ') : queryOrKeywords;
  if (matchesKeywordFuzzy(targetText, fullQuery)) return true;

  // Otherwise ensure EVERY individual keyword matches
  return keywords.every(kw => matchesKeywordFuzzy(targetText, kw));
};
