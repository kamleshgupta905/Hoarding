import Papa from 'papaparse';

// Direct CSV export URL which is more reliable than opensheet public API for some permissions
const GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1DBGLmkjT_7v-xqdomp8x9SogVFEa5iHhrx5Qrhl-ih0/gviz/tq?tqx=out:csv&sheet=Hoardings_Master';

export const fetchHoardings = async () => {
  try {
    const response = await fetch(GOOGLE_SHEET_CSV_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const csvText = await response.text();

    return new Promise((resolve) => {
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const mappedData = results.data.map(row => {
            // Map keys from CSV to expected App keys
            // Note: CSV keys come from the actual sheet headers
            const mapped = {
              "State": row["State"],
              "City": row["City"],
              "Locality": row["Locality"],
              "Locality Site Location": row["locality site location"] || row["Locality Site Location"],
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
              "Avg Monthly Cost (INR)": row["Avg. monthly Cost (in INR, without agency commission)"] || row["Avg Monthly Cost (INR)"],
              // Default missing columns
              "STATUS": row["STATUS"] || 'Available',
              "ImageURL": row["ImageURL"] || ''
            };
            return mapped;
          });

          // Filter out disabled
          const filtered = mappedData.filter(item => item.STATUS !== 'Disabled');
          resolve(filtered);
        },
        error: (error) => {
          console.error('CSV Parsing Error:', error);
          resolve([]);
        }
      });
    });

  } catch (error) {
    console.error('Error fetching hoardings:', error);
    return [];
  }
};

export const getImageUrl = (hoarding) => {
  if (hoarding && hoarding.ImageURL && hoarding.ImageURL.trim() !== '') {
    return hoarding.ImageURL;
  }
  // Fallback to generating URL if ImageURL is missing (backward compatibility with original logic)
  if (hoarding && hoarding["Locality Site Location"]) {
    const siteLocation = hoarding["Locality Site Location"];
    const baseUrl = 'https://storage.googleapis.com/hoarding_listing_images/';
    const fileName = siteLocation.split(' ').join('%20') + '.jpg';
    return `${baseUrl}${fileName}`;
  }
  return 'https://placehold.co/600x400?text=No+Image';
};
