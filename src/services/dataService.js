import Papa from 'papaparse';
import { getAdminSession, postStaffPhoto, submitAdminOperation } from './secureApi';

const fetchWithTimeout = async (url, options = {}, timeoutMs = 35000) => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
};

const requestText = async (url, options = {}, timeoutMs) => {
  const response = await fetchWithTimeout(url, options, timeoutMs);
  if (!response.ok) throw new Error(`Network request failed (${response.status}).`);
  return response.text();
};

const requestJson = async (url, options = {}, timeoutMs) => {
  const response = await fetchWithTimeout(url, options, timeoutMs);
  if (!response.ok) throw new Error(`Network request failed (${response.status}).`);
  return response.json();
};

// 📡 LIVE GOOGLE SHEET CONFIGURATION
const SHEET_ID = '1DBGLmkjT_7v-xqdomp8x9SogVFEa5iHhrx5Qrhl-ih0';
const SHEET_NAME = 'Hoardings_Master';
const GOOGLE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${SHEET_NAME}`;
export const STAFF_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwBpAJ0e7kYoDusrtkvaSj0A2PErD4vcMsNzL60EkzMELGTj6dpT16BaM9htFyDVI9a-Q/exec';

/**
 * 🛠 ADVANCED IMAGE TRANSFORMER
 * Expertly handles Google Drive links to ensure they load in browsers.
 * Uses the THUMBNAIL format which is the most reliable for public/shared Drive files.
 */
const getDirectDriveLink = (url) => {
  if (!url || typeof url !== 'string') return '';
  const cleanUrl = url.trim();

  // If it's already an lh3 link, return it as it's the most robust
  if (cleanUrl.includes('lh3.googleusercontent.com')) return cleanUrl;

  // Extract the unique File ID from any Google Drive URL format (direct, preview, thumbnail, etc.)
  const idMatch = cleanUrl.match(/\/file\/d\/([^/?#]+)/) || 
                  cleanUrl.match(/[?&]id=([^&]+)/) || 
                  cleanUrl.match(/\/d\/([^/?#]+)/);

  if (idMatch && idMatch[1]) {
    const fileId = idMatch[1];
    // ⚡ Using lh3.googleusercontent.com/d/[ID] which is faster and bypasses many auth issues
    return `https://lh3.googleusercontent.com/d/${fileId}`;
  }

  return cleanUrl;
};

const imageValuesFromHistory = (history) => {
  if (Array.isArray(history)) {
    return history.map((item) => typeof item === 'string' ? item : item?.url);
  }

  if (typeof history === 'string') {
    return history.split(',').map((item) => item.split('|')[0]);
  }

  return [];
};

// A primary Drive link can be stale while an approved image still exists in history.
// Keep each usable candidate so the app can fall back without hiding a real photo.
export const getHoardingImageCandidates = (hoarding = {}) => {
  const values = [
    hoarding.ImageURL,
    hoarding.imageurl,
    hoarding['Image URL'],
    hoarding.Photo,
    ...imageValuesFromHistory(hoarding.History),
    ...imageValuesFromHistory(hoarding.ExecutionHistory)
  ];

  return [...new Set(values
    .map((value) => getDirectDriveLink(value))
    .filter(Boolean))];
};

/**
 * 🚀 FETCH LIVE DATA
 * Syncs with the spreadsheet and maps columns precisely.
 */
export const fetchHoardings = async () => {
  try {
    const rawData = await requestText(GOOGLE_SHEET_URL, { cache: 'no-store' }, 45000);
    const parsed = Papa.parse(rawData, { header: true, skipEmptyLines: true });
    if (!parsed.data || parsed.data.length === 0) throw new Error('No data found in spreadsheet');
    return parsed.data.filter(item => item.City && item.City.toLowerCase() !== 'total');
  } catch (error) {
    console.error("Live Spreadsheet Fetch Failed:", error);
    return [];
  }
};

/**
 * 🛠️ IMAGE COMPRESSION UTILITY
 * Reduces high-resolution photos to a optimized size (~1200px max) before upload.
 * This makes the 'Update Photo' action 5x-10x faster.
 */
export const compressImage = async (file, maxWidth = 1280, quality = 0.7) => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = (maxWidth / width) * height;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                // ⚡ Compress with custom quality
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
        };
    });
};

/**
 * 🔄 CENTRALIZED SYNC ENGINE (Real-Time)
 * Handles all Add/Update/Delete operations with optimized payload delivery.
 * Includes auto-retry and diagnostic logging for mission-critical reliability.
 */
export const syncToGoogleSheet = async (payload, retryCount = 1) => {
    try {
        console.log(`📡 [Real-Time Sync] Action: ${payload.action} | Site: ${payload.siteName || 'New Site'}`);
        
        // Final catch-all compression check
        if (payload.fileData && payload.fileData.length > 5 * 1024 * 1024) {
            console.warn("⚠️ Large payload detected. Processing might be slow.");
        }

        const result = await submitAdminOperation({
            type: payload.action,
            payload,
            siteId: payload.siteId || '',
            baseVersion: payload.baseVersion ?? null,
            operationId: payload.operationId
        });

        // Even with no-cors, we can verify that the network request didn't throw.
        console.log(`✅ [Sync Success] ${payload.action} signal delivered to Google Script.`);
        window.dispatchEvent(new CustomEvent('hoardings:sync-requested', { detail: payload }));
        return { success: true, ...result };
    } catch (error) {
        if (retryCount > 0) {
            console.warn(`🔄 [Sync Retry] Retrying ${payload.action}...`);
            await new Promise(r => setTimeout(r, 2000));
            return syncToGoogleSheet(payload, retryCount - 1);
        }
        console.error("❌ [Critical Sync Failure]:", error);
        throw error;
    }
};

/**
 * 🖼️ IMAGE HANDLER
 */
export const getImageUrl = (hoarding) => {
  const [imageUrl] = getHoardingImageCandidates(hoarding);
  if (imageUrl) return imageUrl;
  // High-quality premium fallback
  return 'https://images.unsplash.com/photo-1541535650810-10d26f592a7d?auto=format&fit=crop&q=80&w=800';
};

export const fetchStaffUploads = async () => {
  try {
    const data = await requestJson(`${STAFF_SCRIPT_URL}?action=staffUploads&sessionToken=${encodeURIComponent(getAdminSession())}&t=${Date.now()}`, { cache: 'no-store' }, 60000);
    return Array.isArray(data.uploads)
      ? data.uploads
          .filter(item => item && item.UploadId)
          .map(item => ({
            ...item,
            Status: String(item.Status || 'REVIEW_REQUIRED'),
            Decision: String(item.Decision || 'GPS_REVIEW'),
            NearbySites: Array.isArray(item.NearbySites) ? item.NearbySites : []
          }))
      : [];
  } catch (error) {
    console.error('Staff uploads fetch failed:', error);
    return [];
  }
};

export const uploadStaffPhoto = async (payload) => {
  await postStaffPhoto(payload);
};

export const reviewStaffPhoto = async (uploadId, reviewAction, siteName = '', replacementImage = {}) => {
  await syncToGoogleSheet({
    action: 'reviewStaffUpload',
    uploadId,
    reviewAction,
    siteName,
    ...replacementImage
  });
};

export const detectStaffPhotoOrientation = async (imageUrl) => {
  const result = await submitAdminOperation({
    type: 'analyzeImageOrientation',
    payload: { imageUrl },
    siteId: '',
    baseVersion: null
  }, { attempts: 18 });
  return {
    rotation: [0, 90, 180, 270].includes(Number(result.rotation)) ? Number(result.rotation) : 0,
    confidence: Number(result.confidence) || 0,
    provider: result.provider || 'local'
  };
};

export const fetchSheetGrid = async () => {
  const result = await submitAdminOperation({
    type: 'sheetGrid',
    payload: {},
    siteId: '',
    baseVersion: null
  }, { attempts: 18 });
  return {
    headers: result.headers || [],
    rows: result.rows || [],
    updatedAt: result.updatedAt || new Date().toISOString(),
    hiddenColumns: result.hiddenColumns || []
  };
};

export const saveSheetGrid = async ({ headers, rows }) => {
  await syncToGoogleSheet({
    action: 'saveSheetGrid',
    headers,
    rows
  });
};

const sanitizeFileName = (value) => String(value || 'hoarding-image')
  .replace(/[\\/:*?"<>|]+/g, '-')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 120) || 'hoarding-image';

export const downloadHoardingImage = async (hoarding) => {
  const imageUrl = getImageUrl(hoarding);
  const name = sanitizeFileName(`${hoarding?.City || 'site'}-${hoarding?.["Locality Site Location"] || 'image'}.jpg`);

  try {
    const response = await fetch(imageUrl, { mode: 'cors', cache: 'no-store' });
    if (!response.ok) throw new Error(`Image fetch failed: ${response.status}`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    console.warn('Image download fallback used:', error);
    const link = document.createElement('a');
    link.href = imageUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

export const PROPOSAL_COLUMNS = [
  ['Image Link', site => getImageUrl(site), { type: 'imageLink' }],
  ['S. No.', (_site, index) => index + 1],
  ['State', site => site.State],
  ['City', site => site.City],
  ['Locality', site => site.Locality],
  ['Locality Site Location', site => site["Locality Site Location"]],
  ['Pin Code', site => site["Pin Code"]],
  ['Traffic From', site => site["Traffic From"]],
  ['Traffic To', site => site["Traffic To"]],
  ['Lat.', site => site.Latitude],
  ['Long.', site => site.Longitude],
  ['Lat Long (Concatenated)', site => [site.Latitude, site.Longitude].filter(Boolean).join(', ')],
  ['Size (Large/ Medium/ Small)', site => site["Size (Large/Medium/Small)"]],
  ['Width', site => site.Width],
  ['Height', site => site.Height],
  ['Units', site => site.Units],
  ['Total Sq. Ft', site => site["Total Sq. Ft"]],
  ['Type of Site (Unipole/ Billboard)', site => site["Type of Site (Unipole/Billboard)"]],
  ['Media Format (Front Lit/ Back Lit/Non Lit)', site => site["Media Format (Front Lit / Back Lit / Non Lit)"]],
  ['LHS/ Non LHS', site => site["LHS / Non LHS"]],
  ['Digital/ Non Digital', site => site["Digital / Non Digital"]],
  ['Solus (Y/N)', site => site["Solus (Y/N)"]],
  ['Site Category', site => site["Site Category"]],
  ['Avg. monthly Cost', site => site["Avg Monthly Cost (INR)"]],
  ['STATUS', site => site.STATUS || 'Available'],
  ['BookedBy', site => site.BookedBy],
  ['BookingStart', site => site.BookingStart],
  ['BookingEnd', site => site.BookingEnd]
];

export const exportProposalExcel = (sites, fileName = 'hoarding-proposal.xls', selectedHeaders = null) => {
  if (!sites || sites.length === 0) return false;

  const selectedSet = new Set(selectedHeaders && selectedHeaders.length ? selectedHeaders : PROPOSAL_COLUMNS.map(([label]) => label));
  const columns = PROPOSAL_COLUMNS.filter(([label]) => selectedSet.has(label));

  const rows = sites.map((site, index) => {
    const cells = columns
      .map((column) => {
        const value = column[1](site, index);
        if (column[2]?.type === 'imageLink') {
          return `<td class="image-link"><a href="${escapeHtml(value)}">View Image</a></td>`;
        }
        return `<td>${escapeHtml(value)}</td>`;
      })
      .join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 11px; }
    th { background: #ff9900; color: #000; font-weight: 700; text-align: center; }
    th, td { border: 1px solid #777; padding: 6px; vertical-align: middle; white-space: nowrap; }
    .image-link a { color: #1155cc; text-decoration: underline; font-weight: 700; }
  </style>
</head>
<body>
  <table>
    <thead>
      <tr>${columns.map(([label]) => `<th>${escapeHtml(label)}</th>`).join('')}</tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = sanitizeFileName(fileName).replace(/\.xls$/i, '') + '.xls';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
};
