import { NextResponse } from 'next/server';
import { getDoc, ensureHeaders } from '@/lib/google-sheets';
import { invalidateSheet } from '@/lib/sheet-cache';

export const dynamic = 'force-dynamic';

// One lump sum can span dozens of rows. The batched writes keep this well
// inside the limit, but a slow Sheets API shouldn't truncate a partial write.
export const maxDuration = 300;

const SALES_SHEET = 'Sales';
const PAYMENTS_SHEET = 'Payments';

const PAYMENTS_HEADERS = [
  'PAYMENT ID', 'SALES ID', 'CLIENT NAME', 'DATE', 'AMOUNT', 'PAYMENT TYPE',
  'BALANCE BEFORE', 'BALANCE AFTER', 'COLLECTED BY', 'NOTES', 'TIMESTAMP',
];

/** Column letters on the Sales sheet. */
const COL = {
  date: 'A',
  initialPayment: 'O',
  amount: 'P',
  addl1: 'Q',
  addl2: 'R',
  balance: 'S',
  paymentStatus: 'T',
} as const;

interface BatchStep {
  rowIndex: number;
  salesId?: string;
  slot: 1 | 2;
  mode: 'set' | 'append';
  toApply: number;
  balanceBefore?: number;
  description?: string;
}

/**
 * Applies a whole lump-sum distribution in one pass.
 *
 * The per-item flow this replaces cost 5 reads + 2 writes *per item* — 23 items
 * blew the 60-reads-per-minute quota around item 12, and a failure part-way
 * through left some sales paid and others not. This handler costs 3 reads and
 * 2 writes for the entire lump sum regardless of size, and the sales-side
 * update lands as a single saveUpdatedCells() so it is all-or-nothing.
 *
 * Idempotency: the caller sends one transactionId for the whole submission and
 * reuses it on every retry. Payment rows are keyed `<transactionId>-<n>`, so a
 * retry that arrives after a successful write finds them and no-ops instead of
 * paying twice. This matters because "append" mode adds to the existing cell
 * rather than replacing it — a blind retry would double-count.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { transactionId, clientName, collectedBy, steps, notes } = body as {
      transactionId?: string;
      clientName?: string;
      collectedBy?: string;
      notes?: string;
      steps?: BatchStep[];
    };

    if (!transactionId) {
      return NextResponse.json({ error: 'transactionId is required' }, { status: 400 });
    }
    if (!Array.isArray(steps) || steps.length === 0) {
      return NextResponse.json({ error: 'steps must be a non-empty array' }, { status: 400 });
    }

    for (const s of steps) {
      if (!Number.isInteger(s.rowIndex) || s.rowIndex < 2) {
        return NextResponse.json({ error: `Invalid rowIndex: ${s.rowIndex}` }, { status: 400 });
      }
      if (!(s.toApply > 0)) {
        return NextResponse.json({ error: `Payment amount must be greater than zero (row ${s.rowIndex})` }, { status: 400 });
      }
      if (s.slot !== 1 && s.slot !== 2) {
        return NextResponse.json({ error: `Invalid slot: ${s.slot}` }, { status: 400 });
      }
      if (s.mode === 'append' && s.slot !== 2) {
        return NextResponse.json({ error: 'append mode is only valid on slot 2' }, { status: 400 });
      }
    }

    const doc = await getDoc();
    const salesSheet = doc.sheetsByTitle[SALES_SHEET] || doc.sheetsByIndex[0];
    const paymentsSheet = doc.sheetsByTitle[PAYMENTS_SHEET];

    if (!paymentsSheet) {
      return NextResponse.json({ error: `Sheet "${PAYMENTS_SHEET}" not found.` }, { status: 404 });
    }

    // READ 1 — header row for the Payments sheet (needed by addRows below).
    await ensureHeaders(paymentsSheet, PAYMENTS_HEADERS);

    // READ 2 — idempotency guard. Must be a live read, not a cached one: a
    // retry has to see rows written by the attempt it is retrying.
    const paymentRows = await paymentsSheet.getRows();
    const alreadyApplied = paymentRows.some((r: any) =>
      (r.get('PAYMENT ID') || '').toString().startsWith(`${transactionId}-`)
    );
    if (alreadyApplied) {
      return NextResponse.json({
        success: true,
        alreadyApplied: true,
        message: 'This payment was already recorded.',
      });
    }

    // READ 3 — only the rows being paid, batched into a single request rather
    // than one loadCells per row (or one huge span between the first and last).
    const ranges = steps.map(s => `${COL.date}${s.rowIndex}:${COL.paymentStatus}${s.rowIndex}`);
    await salesSheet.loadCells(ranges);

    // No 24-hour age gate here, unlike the job-status path in PATCH /api/sales.
    // Debt recovery targets old invoices by definition, so gating it would have
    // meant an admin had to apply every counter collection on anything older
    // than a day. This endpoint cannot change what a customer was charged — it
    // only adds to the payment columns — and every row it writes lands in the
    // Payments sheet naming who collected it. Payments applied to aged debt are
    // tagged below so they can be reviewed at a glance.
    const AGED_MS = 24 * 60 * 60 * 1000;
    const isAged = (rowIndex: number) => {
      const raw = salesSheet.getCellByA1(`${COL.date}${rowIndex}`).value;
      if (!raw) return false;
      const t = new Date(raw.toString()).getTime();
      return !isNaN(t) && Date.now() - t > AGED_MS;
    };

    // ── Stage every cell change in memory ────────────────────────────────────
    const timestamp = new Date().toISOString();
    const today = timestamp.split('T')[0];
    const newPaymentRows: Record<string, any>[] = [];

    steps.forEach((s, i) => {
      const slotCol = s.slot === 1 ? COL.addl1 : COL.addl2;
      const cell = salesSheet.getCellByA1(`${slotCol}${s.rowIndex}`);

      if (s.mode === 'append') {
        // Chain onto whatever is already there so no earlier payment is lost.
        // An existing formula is extended (=5000+3000 → =5000+3000+2000); a
        // plain number seeds a new chain (8000 → =8000+2000).
        const existingFormula = cell.formula;
        cell.formula = existingFormula
          ? `${existingFormula}+${s.toApply}`
          : `=${Number(cell.value) || 0}+${s.toApply}`;
      } else {
        cell.value = s.toApply;
      }

      // Re-stamp the balance and status formulas. Older rows may still carry
      // the pre-fix `=P-O` form, which ignores the additional payment columns.
      const r = s.rowIndex;
      salesSheet.getCellByA1(`${COL.balance}${r}`).formula =
        `=(${COL.amount}${r}-SUM(${COL.initialPayment}${r},${COL.addl1}${r},${COL.addl2}${r}))`;
      salesSheet.getCellByA1(`${COL.paymentStatus}${r}`).formula =
        `=IF(${COL.amount}${r}=0,"Unpaid",IF(${COL.balance}${r}<=0,"Paid",` +
        `IF(${COL.balance}${r}<${COL.amount}${r},"Part-payment","Unpaid")))`;

      const balanceBefore = s.balanceBefore ?? 0;
      newPaymentRows.push({
        'PAYMENT ID': `${transactionId}-${i}`,
        'SALES ID': s.salesId || '',
        'CLIENT NAME': clientName || '',
        'DATE': today,
        'AMOUNT': s.toApply,
        'PAYMENT TYPE': s.slot === 1 ? 'Additional Payment 1' : 'Additional Payment 2',
        'BALANCE BEFORE': balanceBefore,
        'BALANCE AFTER': balanceBefore - s.toApply,
        'COLLECTED BY': collectedBy || 'System',
        'NOTES': `${notes || 'Auto-distributed lump sum'}${isAged(s.rowIndex) ? ' [aged debt]' : ''}`,
        'TIMESTAMP': timestamp,
      });
    });

    // ── WRITE 1 — the audit rows, which double as the idempotency claim ──────
    // These go FIRST, and the ordering is load-bearing. "append" mode adds to
    // whatever is already in the cell, so replaying it charges the customer
    // twice. Writing the claim before touching any balance means a retry always
    // finds it and refuses, whatever happened afterwards.
    await paymentsSheet.addRows(newPaymentRows);

    // ── WRITE 2 — every sales row in one request, all-or-nothing ─────────────
    try {
      await salesSheet.saveUpdatedCells();
    } catch (salesErr: any) {
      // The claim is already down, so the retry will (correctly) refuse to run.
      // That leaves the payment recorded but the balance untouched: the client
      // still shows as owing, with a Payments row proving they paid. That is
      // under-applied and visible, which is recoverable by hand — the opposite
      // ordering would silently take the money twice.
      invalidateSheet(PAYMENTS_SHEET);
      console.error('Payments Batch: audit rows written but sales update failed', salesErr?.message ?? salesErr);
      return NextResponse.json({
        error:
          `Payment was recorded but the balances were not updated. ` +
          `Nothing has been charged twice. Please check ${clientName || 'this client'}'s ` +
          `outstanding balance in the sheet and adjust it by hand.`,
        needsReconciliation: true,
        transactionId,
      }, { status: 500 });
    }

    invalidateSheet(SALES_SHEET, PAYMENTS_SHEET);

    const totalApplied = steps.reduce((sum, s) => sum + s.toApply, 0);
    return NextResponse.json({ success: true, applied: steps.length, totalApplied });
  } catch (error: any) {
    console.error('POST Payments Batch Error:', error?.message ?? error);
    const status = error.status || (error.response?.status === 429 ? 429 : 500);
    return NextResponse.json({ error: error.message }, { status });
  }
}
