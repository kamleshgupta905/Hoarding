/**
 * 📊 MASTER PPTX GENERATOR SERVICE
 * Replicates the exact 4:3 Master Presentation layout (87MB Master PPT):
 * - Slide Size: 10" x 7.5" (4:3)
 * - Full-bleed background site photograph
 * - Top-left GPS coordinate badge
 * - Bottom 2x4 Data Grid: City, Location, Facing, Size, Medium, Area
 * - Official Heera Advertising logo embedded at bottom-right
 */
import pptxgen from 'pptxgenjs';
import { HIRA_LOGO } from '../assets/hiraLogoData.js';

/**
 * Resolves direct image URL from site properties
 */
export const getSiteImageUrl = (site) => {
  if (!site) return '';
  const raw = site.ImageURL || site.imageurl || site['Image URL'] || site.Photo || (Array.isArray(site.History) && site.History[0]?.url) || '';
  if (!raw) return '';
  const cleanUrl = String(raw).trim();
  if (cleanUrl.includes('lh3.googleusercontent.com')) return cleanUrl;
  const idMatch = cleanUrl.match(/\/file\/d\/([^/?#]+)/) || cleanUrl.match(/[?&]id=([^&]+)/) || cleanUrl.match(/\/d\/([^/?#]+)/);
  if (idMatch && idMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${idMatch[1]}`;
  }
  return cleanUrl;
};

/**
 * Converts an image URL (including Google Drive lh3 links) to Base64 data URL
 * with auto-rescaling and fallback handling.
 */
export const fetchImageAsBase64 = async (imageUrl, timeoutMs = 8000) => {
  if (!imageUrl || typeof imageUrl !== 'string') return null;
  if (imageUrl.startsWith('data:image/')) return imageUrl;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(imageUrl, {
      mode: 'cors',
      cache: 'force-cache',
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();

    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn(`[PPTX Image Fetch] Failed for ${imageUrl}:`, err.message);
    return null;
  }
};

/**
 * Creates a clean SVG fallback banner if the site photo fails to fetch
 */
const createFallbackImageBase64 = (siteName, city) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="750" viewBox="0 0 1000 750">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1e293b" />
        <stop offset="100%" stop-color="#0f172a" />
      </linearGradient>
    </defs>
    <rect width="1000" height="750" fill="url(#g)" />
    <rect x="40" y="40" width="920" height="670" rx="16" fill="none" stroke="#334155" stroke-width="3" stroke-dasharray="8 8" />
    <text x="500" y="340" fill="#94a3b8" font-size="26" font-family="Arial, sans-serif" font-weight="bold" text-anchor="middle">HEERA ADVERTISING</text>
    <text x="500" y="390" fill="#f8fafc" font-size="32" font-family="Arial, sans-serif" font-weight="bold" text-anchor="middle">${escapeXml(siteName || 'Hoarding Asset')}</text>
    <text x="500" y="435" fill="#38bdf8" font-size="22" font-family="Arial, sans-serif" text-anchor="middle">${escapeXml(city || 'Meerut')}</text>
    <text x="500" y="490" fill="#64748b" font-size="18" font-family="Arial, sans-serif" text-anchor="middle">Photo Preview in High-Res Master Archive</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
};

const escapeXml = (unsafe) => {
  return String(unsafe || '')
    .replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
        default: return c;
      }
    });
};

/**
 * 🚀 Generates an exact 4:3 PowerPoint Presentation for shortlisted sites.
 *
 * @param {Array} sites - Array of hoarding site objects.
 * @param {Object} options - Options including fileName and onProgress callback.
 */
export const generateMasterMediaPlanPptx = async (sites = [], options = {}) => {
  if (!Array.isArray(sites) || sites.length === 0) {
    throw new Error('No sites selected for PPT generation.');
  }

  const {
    fileName = `Heera_Media_Plan_Selected_${new Date().toISOString().slice(0, 10)}.pptx`,
    onProgress = null
  } = options;

  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_4x3'; // 10.0 x 7.5 inches (exact master match: 9144000 x 6858000 EMUs)
  pptx.title = 'Heera Advertising - Media Plan';
  pptx.company = 'Heera Advertising';
  pptx.subject = 'Outdoor Media Proposal';

  const total = sites.length;

  for (let i = 0; i < total; i++) {
    const site = sites[i];
    if (onProgress) {
      onProgress(i + 1, total, `Building slide ${i + 1} of ${total}: ${site["Location "] || site.Location || ''}`);
    }

    const slide = pptx.addSlide();

    // 1. Resolve and Load Image
    const rawUrl = getSiteImageUrl(site);
    let base64Image = null;
    if (rawUrl) {
      base64Image = await fetchImageAsBase64(rawUrl);
    }
    if (!base64Image) {
      base64Image = createFallbackImageBase64(
        site["Location "] || site.Location || site["Locality Site Location"],
        site.City
      );
    }

    // Full-bleed Background Hoarding Photo (10" x 7.5")
    slide.addImage({
      data: base64Image,
      x: 0,
      y: 0,
      w: 10.0,
      h: 7.5,
      sizing: { type: 'cover', w: 10.0, h: 7.5 }
    });

    // 2. Top-Left Floating GPS Coordinates Badge
    const lat = site.Latitude || site.Lat || site['Lat.'] || '';
    const lng = site.Longitude || site.Long || site['Long.'] || '';
    const latLongStr = site['Lat-Long'] || (lat && lng ? `${lat}, ${lng}` : '') || '';

    if (latLongStr) {
      slide.addText(latLongStr, {
        x: 0,
        y: 0.02,
        w: 2.72,
        h: 0.40,
        fontSize: 10.5,
        fontFace: 'Arial',
        color: '000000',
        bold: true,
        fill: { color: 'FFFFFF' },
        line: { color: '888888', width: 0.75 },
        align: 'center',
        valign: 'middle'
      });
    }

    // 3. Bottom Information Table (2 Rows x 4 Columns)
    // Column widths in inches matching master PPT: [1.77, 4.49, 2.52, 1.22] = 10.00 inches
    const city = site.City || 'Meerut';
    const location = site['Location '] || site.Location || site['Locality Site Location'] || 'Site Location';
    const facing = site.Facing || site['Traffic View'] || 'Bidirectional';
    const size = site['Size (Large/ Medium/ Small)'] || site.Size || (site.Width && site.Height ? `${site.Width}x${site.Height}` : '40x10');
    const medium = site['Media Format (Front Lit / Back Lit / Non Lit)'] || site.Media || 'Unipole';
    const area = site.Area || site.Locality || city;

    const tableRows = [
      [
        { text: `City: ${city}`, options: { fontSize: 10, fontFace: 'Calibri', bold: true, color: '000000', fill: { color: 'FFFFFF' } } },
        { text: `Location: ${location}`, options: { fontSize: 10, fontFace: 'Calibri', bold: true, color: '000000', fill: { color: 'FFFFFF' } } },
        { text: `Facing: ${facing}`, options: { fontSize: 10, fontFace: 'Calibri', bold: true, color: '000000', fill: { color: 'FFFFFF' } } },
        { text: '', options: { fill: { color: 'FFFFFF' } } } // Column 4 reserved for Heera Logo
      ],
      [
        { text: `Size: ${size}`, options: { fontSize: 9.5, fontFace: 'Calibri', color: '222222', fill: { color: 'FFFFFF' } } },
        { text: `Medium - ${medium}`, options: { fontSize: 9.5, fontFace: 'Calibri', color: '222222', fill: { color: 'FFFFFF' } } },
        { text: `Area: ${area}`, options: { fontSize: 9.5, fontFace: 'Calibri', color: '222222', fill: { color: 'FFFFFF' } } },
        { text: '', options: { fill: { color: 'FFFFFF' } } } // Column 4 reserved for Heera Logo
      ]
    ];

    slide.addTable(tableRows, {
      x: 0,
      y: 6.69,
      w: 10.0,
      h: 0.81,
      colW: [1.77, 4.49, 2.52, 1.22],
      border: { type: 'solid', color: '888888', pt: 0.75 },
      valign: 'middle'
    });

    // 4. Embedded Heera Advertising Logo inside Column 4 (Bottom-Right)
    slide.addImage({
      data: HIRA_LOGO,
      x: 8.82,
      y: 6.74,
      w: 1.10,
      h: 0.65,
      sizing: { type: 'contain', w: 1.10, h: 0.65 }
    });
  }

  // 5. Download the PPTX File
  if (onProgress) {
    onProgress(total, total, 'Packaging PowerPoint deck...');
  }

  const cleanFileName = fileName.endsWith('.pptx') ? fileName : `${fileName}.pptx`;
  await pptx.writeFile({ fileName: cleanFileName });

  return { success: true, count: total, fileName: cleanFileName };
};
