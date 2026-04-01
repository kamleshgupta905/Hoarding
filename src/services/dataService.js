import Papa from 'papaparse';

// 📡 LIVE GOOGLE SHEET CONFIGURATION
const SHEET_ID = '1DBGLmkjT_7v-xqdomp8x9SogVFEa5iHhrx5Qrhl-ih0';
const SHEET_NAME = 'Hoardings_Master';
const GOOGLE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${SHEET_NAME}`;

/**
 * 🛠 ADVANCED IMAGE TRANSFORMER
 * Expertly handles Google Drive links to ensure they load in browsers.
 * Uses the THUMBNAIL format which is the most reliable for public/shared Drive files.
 */
const getDirectDriveLink = (url) => {
  if (!url || typeof url !== 'string') return '';
  const cleanUrl = url.trim();

  // If it's already a thumbnail link correctly formatted, return it
  if (cleanUrl.includes('drive.google.com/thumbnail')) return cleanUrl;

  // Skip if it is not a Google Drive link
  if (!cleanUrl.includes('drive.google.com') && !cleanUrl.includes('docs.google.com')) {
    return cleanUrl;
  }

  try {
    // Extract the unique File ID from any Google Drive URL format
    const idMatch = cleanUrl.match(/\/file\/d\/([^/?#]+)/) || cleanUrl.match(/[?&]id=([^&]+)/);

    if (idMatch && idMatch[1]) {
      const fileId = idMatch[1];
      // ⚡ Using the THUMBNAIL endpoint which avoids 403 errors common with 'uc' and 'lh3'
      return `https://drive.google.com/thumbnail?sz=w1200&id=${fileId}`;
    }
  } catch (err) {
    console.error("Drive URL Transform Error:", err);
  }

  return cleanUrl;
};

/**
 * 🚀 FETCH LIVE DATA
 * Syncs with the spreadsheet and maps columns precisely.
 */
export const fetchHoardings = async () => {
  try {
    // Cache busting using timestamp to ensure Real-Time sync
    const cacheBuster = `&t=${new Date().getTime()}`;
    const finalUrl = GOOGLE_SHEET_URL + cacheBuster;

    const response = await fetch(finalUrl);
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

    const csvText = await response.text();

    return new Promise((resolve) => {
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const cleanData = results.data.map(row => {
            // Extract RAW image link from possible column names
            // Mapping precisely to the headers seen in the spreadsheet CSV
            const rawImg = row["ImageURL"] || row["imageurl"] || row["Image URL"] || row["Photo"] || '';

            return {
              "State": row["State"],
              "City": row["City"]?.toString().trim(),
              "Locality": row["Locality"]?.toString().trim(),
              "Locality Site Location": (row["locality site location"] || row["Locality Site Location"])?.toString().trim(),
              "Pin Code": row["Pin Code"],
              "Traffic From": row["Traffic From"],
              "Traffic To": row["Traffic To"],
              "Latitude": row["Lat."] || row["Latitude"],
              "Longitude": row["Long."] || row["Longitude"],
              "Size (Large/Medium/Small)": row["Size (Large/ Medium/ Small)"] || row["Size"],
              "Width": row["Width"],
              "Height": row["Height"],
              "Units": row["Units"],
              "Total Sq. Ft": row["Total Sq. Ft"],
              "Type of Site (Unipole/Billboard)": row["Type of Site (Unipole/ Billboard)"] || row["Type of Site"],
              "Media Format (Front Lit / Back Lit / Non Lit)": row["Media Format (Front Lit/ Back Lit/Non Lit)"] || row["Media Format"],
              "LHS / Non LHS": row["LHS/ Non LHS"] || row["LHS / Non LHS"],
              "Digital / Non Digital": row["Digital/ Non Digital"] || row["Digital / Non Digital"],
              "Solus (Y/N)": row["Solus (Y/N)"],
              "Site Category": row["Site Category"],
              "Avg Monthly Cost (INR)": row["Avg. monthly Cost"] || row["Avg Monthly Cost (INR)"] || 0,
              "STATUS": row["STATUS"] || row["Status"] || 'Available',
              "ImageURL": getDirectDriveLink(rawImg),
              "History": (row["ExecutionHistory"] || row["executionhistory"] || "").split(',').filter(Boolean).map(url => getDirectDriveLink(url))
            };
          });


          // 🧹 CLEANUP & VALIDATION
          // We only remove rows that are completely invalid (no City).
          // 'Disabled' sites ARE returned so the Admin Panel can see/manage them.
          const filteredRecords = cleanData.filter(item =>
            item.City &&
            item.City.toLowerCase() !== 'total'
          );

          resolve(filteredRecords);
        },
        error: (error) => {
          console.error("CSV Parse Failure:", error);
          resolve([]);
        }
      });
    });
  } catch (error) {
    console.error("Google Sheet Sync Failed:", error);
    return [];
  }
};

/**
 * 🖼️ IMAGE HANDLER
 */
export const getImageUrl = (hoarding) => {
  if (hoarding && hoarding.ImageURL && hoarding.ImageURL.trim() !== '') {
    return hoarding.ImageURL;
  }
  // High-quality premium fallback
  return 'https://images.unsplash.com/photo-1541535650810-10d26f592a7d?auto=format&fit=crop&q=80&w=800';
};
