import { NextResponse } from 'next/server';
import { getDoc, ensureHeaders } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

const parseAmt = (v: any) =>
  parseFloat(String(v ?? '0').replace(/[₦,\s]/g, '')) || 0;

function fmtMoney(n: number) {
  return `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;
}

function isToday(dateStr: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

// ─── GET /api/digest ─────────────────────────────────────────────────────────

export async function GET() {
  try {
    const doc = await getDoc();

    // ── 1. Sales today ───────────────────────────────────────────────────────
    const salesSheet = doc.sheetsByTitle['Sales'];
    const expensesSheet = doc.sheetsByTitle['Expenses'];
    const paymentsSheet = doc.sheetsByTitle['Payments'];
    const inventorySheet = doc.sheetsByTitle['Inventory'];

    const [salesRows, expenseRows, paymentRows, inventoryRows] = await Promise.all([
      salesSheet ? salesSheet.getRows() : Promise.resolve([]),
      expensesSheet ? expensesSheet.getRows() : Promise.resolve([]),
      paymentsSheet ? paymentsSheet.getRows() : Promise.resolve([]),
      inventorySheet ? inventorySheet.getRows() : Promise.resolve([]),
    ]);

    // ── Sales today ──────────────────────────────────────────────────────────
    const todaySales = salesRows.filter((r: any) => isToday(r.get('DATE') || r.get('Date') || ''));

    const totalRevenue = todaySales.reduce(
      (s: number, r: any) => s + parseAmt(r.get('AMOUNT (₦)') || r.get('Amount (₦)')),
      0
    );
    const totalCollected = todaySales.reduce(
      (s: number, r: any) =>
        s + parseAmt(r.get('INITIAL PAYMENT (₦)') || r.get('INITIAL PAYMENT') || r.get('Initial Payment')),
      0
    );
    const totalDebt = todaySales.reduce(
      (s: number, r: any) =>
        s + Math.max(0, parseAmt(r.get('AMOUNT DIFFERENCES') || r.get('Amount Differences'))),
      0
    );

    // Count per status
    const statusCounts: Record<string, number> = {};
    todaySales.forEach((r: any) => {
      const st = r.get('PAYMENT STATUS') || r.get('Payment Status') || 'Unpaid';
      statusCounts[st] = (statusCounts[st] || 0) + 1;
    });

    // ── Expenses today ───────────────────────────────────────────────────────
    const todayExpenses = expenseRows.filter((r: any) => isToday(r.get('DATE') || r.get('Date') || ''));
    const totalExpenses = todayExpenses.reduce(
      (s: number, r: any) => s + parseAmt(r.get('Amount (₦)') || r.get('AMOUNT') || r.get('Amount')),
      0
    );

    // ── Payments today ───────────────────────────────────────────────────────
    const todayPayments = paymentRows.filter((r: any) => isToday(r.get('Date') || r.get('DATE') || ''));
    const newPaymentsTotal = todayPayments.reduce(
      (s: number, r: any) => s + parseAmt(r.get('Amount') || r.get('Amount (₦)')),
      0
    );

    // ── Outstanding debts (all-time) ─────────────────────────────────────────
    const debtorMap: Record<string, number> = {};
    salesRows.forEach((r: any) => {
      const debt = parseAmt(r.get('AMOUNT DIFFERENCES') || r.get('Amount Differences'));
      const status = r.get('PAYMENT STATUS') || r.get('Payment Status') || '';
      if (debt > 0 && status !== 'Paid') {
        const client = (r.get('CLIENT NAME') || r.get('Client Name') || 'Unknown').trim();
        debtorMap[client] = (debtorMap[client] || 0) + debt;
      }
    });
    const topDebtors = Object.entries(debtorMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const totalOutstandingDebt = Object.values(debtorMap).reduce((s, v) => s + v, 0);

    // ── Low stock alerts ─────────────────────────────────────────────────────
    const lowStockRolls = inventoryRows
      .map((r: any) => ({
        rollId: r.get('Roll ID') || '',
        itemName: r.get('Item Name') || '',
        remaining: parseAmt(r.get('Remaining Length (ft)')),
        status: r.get('Status') || '',
        threshold: parseAmt(r.get('Low Stock Threshold (ft)') || '20'),
      }))
      .filter((r) => r.status === 'Low Stock' || r.status === 'Out of Stock')
      .sort((a, b) => a.remaining - b.remaining);

    // ── Net cash ─────────────────────────────────────────────────────────────
    const netCash = totalCollected + newPaymentsTotal - totalExpenses;

    // ── Build WhatsApp-ready message ──────────────────────────────────────────
    const today = new Date().toLocaleDateString('en-NG', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const lines: string[] = [
      `📊 *BOMedia Daily Digest*`,
      `📅 ${today}`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `🧾 *TODAY'S SALES*`,
      `• Jobs logged: ${todaySales.length}`,
      `• Total billed: ${fmtMoney(totalRevenue)}`,
      `• Cash collected: ${fmtMoney(totalCollected)}`,
      `• New debt created: ${fmtMoney(totalDebt)}`,
      ...(Object.entries(statusCounts).map(([st, n]) => `  ↳ ${st}: ${n}`)),
      ``,
      `💸 *EXPENSES TODAY*`,
      `• Total spent: ${fmtMoney(totalExpenses)}`,
      ...(todayExpenses.slice(0, 4).map((r: any) => {
        const desc = r.get('Description') || r.get('DESCRIPTION') || r.get('Category') || '—';
        const amt = parseAmt(r.get('Amount (₦)') || r.get('AMOUNT') || r.get('Amount'));
        return `  ↳ ${desc}: ${fmtMoney(amt)}`;
      })),
      ``,
      `💰 *NET CASH*`,
      `• Net cash flow: ${fmtMoney(netCash)}`,
      ...(newPaymentsTotal > 0 ? [`• Debt payments received: ${fmtMoney(newPaymentsTotal)}`] : []),
    ];

    if (topDebtors.length > 0) {
      lines.push(``, `⚠️ *TOP OUTSTANDING DEBTS*`);
      lines.push(`• Total outstanding: ${fmtMoney(totalOutstandingDebt)}`);
      topDebtors.forEach(([client, amount]) => {
        lines.push(`  ↳ ${client}: ${fmtMoney(amount)}`);
      });
    }

    if (lowStockRolls.length > 0) {
      lines.push(``, `📦 *STOCK ALERTS*`);
      lowStockRolls.slice(0, 5).forEach((r) => {
        const emoji = r.status === 'Out of Stock' ? '🔴' : '🟡';
        lines.push(`  ${emoji} ${r.rollId} — ${r.remaining.toFixed(1)}ft left`);
      });
    }

    lines.push(``, `_Generated by BOMedia System_`);

    const message = lines.join('\n');
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

    return NextResponse.json({
      ok: true,
      date: today,
      summary: {
        jobsToday: todaySales.length,
        totalRevenue,
        totalCollected,
        totalDebt,
        totalExpenses,
        newPaymentsTotal,
        netCash,
        totalOutstandingDebt,
        topDebtors,
        lowStockRolls,
        statusCounts,
      },
      message,
      whatsappUrl,
    });
  } catch (error: any) {
    console.error('GET /api/digest error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
