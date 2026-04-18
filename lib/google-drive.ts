import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { Readable } from 'stream';

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file'
];

const auth = new JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  scopes: SCOPES,
});

const drive = google.drive({ version: 'v3', auth });

/**
 * Uploads a file to Google Drive
 * @param buffer The file buffer
 * @param fileName Name of the file
 * @param folderId Target folder ID (optional)
 * @returns The webViewLink of the uploaded file
 */
export async function uploadToDrive(buffer: Buffer, fileName: string, mimeType: string, folderId?: string) {
  try {
    const fileMetadata = {
      name: fileName,
      parents: folderId ? [folderId] : undefined,
    };

    const media = {
      mimeType: mimeType,
      body: Readable.from(buffer),
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webViewLink',
    });

    // Make the file readable by anyone with the link (optional but usually needed for previews)
    // Permission: 'reader' for 'anyone'
    if (response.data.id) {
      await drive.permissions.create({
        fileId: response.data.id,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      });
    }

    return response.data.webViewLink;
  } catch (error) {
    console.error('Drive Upload Error:', error);
    throw error;
  }
}
