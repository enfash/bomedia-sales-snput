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
      console.error(`Google Sheets getDoc Error (Attempt ${attempt}/${maxRetries}):`, {
        message: error.message,
        stack: error.stack,
        cause: error.cause
      });
      
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
 * Validates that a sheet has the expected header row.
 *
 * SAFE MODE — this function will NEVER mutate an existing sheet's headers.
 * Adding or reordering columns on a live sheet shifts formula references and
 * corrupts data. Instead:
 *   • If the sheet is completely empty → initialise it with the canonical headers.
 *   • If headers are already present but some are missing → log a warning and
 *     continue so callers can still use the columns that do exist.
 */
export async function ensureHeaders(sheet: any, requiredHeaders: string[]) {
  try {
    await sheet.loadHeaderRow();
    const existingHeaders: string[] = sheet.headerValues ?? [];

    const missingHeaders = requiredHeaders.filter(h => !existingHeaders.includes(h));
    if (missingHeaders.length > 0) {
      // Do NOT mutate — simply warn. Appending headers shifts formula columns.
      console.warn(
        `[GoogleSheets] Sheet "${sheet.title}" is missing expected headers: [${missingHeaders.join(', ')}]. ` +
        `Skipping mutation to prevent formula corruption. Verify the sheet structure manually.`
      );
    }
    return true;
  } catch (error: any) {
    const msg = (error.message ?? '').toLowerCase();

    // Only initialise headers when the sheet is completely empty — safe to write here
    // because there are no existing rows or formula references to shift.
    if (msg.includes("no values in the header row") || msg.includes("duplicate header")) {
      console.log(`[GoogleSheets] Sheet "${sheet.title}" is empty — initialising headers.`);
      await sheet.setHeaderRow(requiredHeaders);
      return true;
    }
    throw error;
  }
}
