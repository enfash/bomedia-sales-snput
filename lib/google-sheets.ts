import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY || !process.env.GOOGLE_SHEET_ID) {
  console.warn("Google Sheets environment variables are missing.");
}

const serviceAccountAuth = new JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'), // handle newlines in private key
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID || '', serviceAccountAuth);

export async function getDoc() {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      await doc.loadInfo();
      return doc;
    } catch (error: any) {
      attempt++;
      console.error(`Google Sheets getDoc Error (Attempt ${attempt}/${maxRetries}):`, error.message || error);
      
      if (attempt >= maxRetries) {
        throw error;
      }
      
      // Wait before retrying (exponential backoff: 1s, 2s)
      await new Promise(resolve => setTimeout(resolve, attempt * 1000));
    }
  }
  
  throw new Error("Failed to load Google Sheets document after maximum retries.");
}

/**
 * Ensures that a sheet has a header row.
 * If the sheet is empty, it will be initialized with the provided defaultHeaders.
 */
export async function ensureHeaders(sheet: any, requiredHeaders: string[]) {
  try {
    await sheet.loadHeaderRow();
    const existingHeaders = sheet.headerValues;
    const missingHeaders = requiredHeaders.filter(h => !existingHeaders.includes(h));
    
    if (missingHeaders.length > 0) {
      // If some headers are missing, we append them to the existing sheet
      await sheet.setHeaderRow([...existingHeaders, ...missingHeaders]);
    }
    return true;
  } catch (error: any) {
    const msg = error.message.toLowerCase();
    
    // This specific error happens when the sheet is completely empty or has corrupt headers
    if (msg.includes("no values in the header row") || msg.includes("duplicate header")) {
      console.log(`[GoogleSheets] Resetting headers for ${sheet.title} due to: ${error.message}`);
      await sheet.setHeaderRow(requiredHeaders);
      return true;
    }
    throw error;
  }
}
