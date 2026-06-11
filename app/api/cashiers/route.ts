import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDoc, ensureHeaders } from '@/lib/google-sheets';
import { verifyToken } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

const SHEET_TITLE = 'Cashiers';
const CASHIER_HEADERS = ['Name', 'Status', 'Last Login', 'Last Active', 'Passcode'];

/**
 * Checks if the current request is authenticated as Admin.
 */
async function isAdminUser(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_session')?.value;
  if (!token) return false;
  const decoded = await verifyToken(token);
  return decoded && decoded.role === 'admin';
}

export async function GET() {
  try {
    const doc = await getDoc();
    let sheet = doc.sheetsByTitle[SHEET_TITLE];
    if (!sheet) {
      sheet = await doc.addSheet({ headerValues: CASHIER_HEADERS, title: SHEET_TITLE });
    }
    
    await ensureHeaders(sheet, CASHIER_HEADERS);

    // Auto-migrate column headers in case sheets already exist without the Passcode column
    await sheet.loadHeaderRow();
    const existingHeaders = sheet.headerValues ?? [];
    if (!existingHeaders.includes('Passcode')) {
      await sheet.setHeaderRow([...existingHeaders, 'Passcode']);
    }

    const rows = await sheet.getRows();
    const isAdmin = await isAdminUser();

    const data = rows.map((row: any) => {
      const obj = row.toObject();
      const rawPasscode = (row.get('Passcode') || '').toString().trim();
      const cleanPasscode = rawPasscode.startsWith("'") ? rawPasscode.slice(1) : rawPasscode;
      const hasPasscode = !!cleanPasscode;
      
      // Crucial Security Step: Do not expose cashier PINs to the public dropdown API
      if (!isAdmin) {
        delete obj.Passcode;
      }

      return {
        ...obj,
        HasPasscode: hasPasscode,
        _rowIndex: row.rowNumber,
        Status: row.get('Status') || 'Offline',
        'Last Login': row.get('Last Login') || 'Never',
        'Last Active': row.get('Last Active') || '',
      };
    });

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("GET Cashiers Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const isAdmin = await isAdminUser();
    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized. Admin access required." }, { status: 401 });
    }

    const { name, passcode } = await request.json();
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const doc = await getDoc();
    let sheet = doc.sheetsByTitle[SHEET_TITLE];
    if (!sheet) {
      sheet = await doc.addSheet({ headerValues: CASHIER_HEADERS, title: SHEET_TITLE });
    }
    await ensureHeaders(sheet, CASHIER_HEADERS);

    // Auto-migrate column headers
    await sheet.loadHeaderRow();
    const existingHeaders = sheet.headerValues ?? [];
    if (!existingHeaders.includes('Passcode')) {
      await sheet.setHeaderRow([...existingHeaders, 'Passcode']);
    }

    const rows = await sheet.getRows();

    if (rows.some((r: any) => r.get('Name')?.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: "Cashier name already exists" }, { status: 400 });
    }

    await sheet.addRow({ 
      Name: name, 
      Status: 'Offline', 
      'Last Login': 'Never', 
      'Last Active': '',
      Passcode: passcode ? passcode.toString().trim() : '' 
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("POST Cashiers Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { name, status, heartbeat, passcode } = await request.json();
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const doc = await getDoc();
    const sheet = doc.sheetsByTitle[SHEET_TITLE];
    if (!sheet) return NextResponse.json({ error: "Cashiers sheet not found" }, { status: 404 });

    await ensureHeaders(sheet, CASHIER_HEADERS);

    // Auto-migrate column headers
    await sheet.loadHeaderRow();
    const existingHeaders = sheet.headerValues ?? [];
    if (!existingHeaders.includes('Passcode')) {
      await sheet.setHeaderRow([...existingHeaders, 'Passcode']);
    }

    const rows = await sheet.getRows();
    const row = rows.find((r: any) => r.get('Name') === name);
    if (!row) return NextResponse.json({ error: "Cashier not found" }, { status: 404 });

    // If modifying the passcode, strictly enforce Admin privileges
    if (passcode !== undefined) {
      const isAdmin = await isAdminUser();
      if (!isAdmin) {
        return NextResponse.json({ error: "Unauthorized. Admin credentials required to modify passcode." }, { status: 401 });
      }
      row.set('Passcode', passcode);
    }

    if (status !== undefined) {
      row.set('Status', status);

      if (status === 'Online') {
        // Only update Last Login on explicit login, not heartbeats
        if (!heartbeat) {
          row.set('Last Login', new Date().toLocaleString('en-NG'));
        }
        row.set('Last Active', new Date().toISOString());
      } else {
        // Going offline — clear Last Active so stale timestamps don't linger
        row.set('Last Active', '');
      }
    }

    await row.save();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("PATCH Cashiers Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const isAdmin = await isAdminUser();
    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized. Admin access required." }, { status: 401 });
    }

    const { name } = await request.json();
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const doc = await getDoc();
    const sheet = doc.sheetsByTitle[SHEET_TITLE];
    if (!sheet) return NextResponse.json({ error: "Cashiers sheet not found" }, { status: 404 });

    await ensureHeaders(sheet, CASHIER_HEADERS);
    const rows = await sheet.getRows();
    const row = rows.find((r: any) => r.get('Name') === name);
    if (!row) return NextResponse.json({ error: "Cashier not found" }, { status: 404 });

    await row.delete();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE Cashiers Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
