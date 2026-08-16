// How a sale's outstanding balance should read in the records list.
//
// The balance is "amount minus everything paid", so it has three meaningful
// states, not one: the customer still owes (positive), the job is square
// (zero), or they paid above the invoice and we owe them (negative). Every
// balance cell used to render in red regardless of sign, so a settled job
// showed a red ₦0.00 and an overpayment showed a red negative — both read as
// debt to staff scanning the list.

export type BalanceTone = "debt" | "settled" | "credit";

export interface BalanceDisplay {
  tone: BalanceTone;
  /** Formatted value for the balance cell. */
  label: string;
  /** MUI palette path for the value's colour. */
  color: string;
}

const formatNaira = (n: number) =>
  `₦${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

// Sheet-side currency arithmetic can leave a settled row a few kobo off zero.
// Anything inside half a naira counts as square rather than as a debt.
const EPSILON = 0.5;

/**
 * Classifies a balance and returns the label and colour to render.
 *
 * @param subtle Use the lighter error shade, for nested/expanded batch rows.
 */
export function describeBalance(
  balance: number | null | undefined,
  subtle = false
): BalanceDisplay {
  const value = balance ?? 0;

  if (value > EPSILON) {
    return {
      tone: "debt",
      label: formatNaira(value),
      color: subtle ? "error.light" : "error.main",
    };
  }

  if (value < -EPSILON) {
    // Overpayment. Deliberately NOT labelled as credit: invoices are rounded so
    // customers settle on a figure they will not shave, and the difference is
    // margin rather than money owed back. "CR" would read as a liability and
    // invite staff to hand it back on the next job.
    return {
      tone: "credit",
      label: `${formatNaira(Math.abs(value))} over`,
      color: "success.main",
    };
  }

  return { tone: "settled", label: formatNaira(0), color: "text.disabled" };
}

/**
 * True only when money is still owed to us. Settled rows and overpaid rows
 * (a credit) both return false, so the debt view lists debtors and nothing
 * else.
 */
export function hasOutstandingDebt(balance: number | null | undefined): boolean {
  return (balance ?? 0) > EPSILON;
}

/**
 * What a row contributes to an amount still collectable.
 *
 * Overpaid rows contribute nothing rather than a negative. Rounding a customer
 * up is margin, not a credit held against future work, so letting it offset a
 * later debt would quietly refund it — and it would also net a permanent
 * shortfall against an unrelated gain, hiding both.
 */
export function collectableAmount(balance: number | null | undefined): number {
  const value = balance ?? 0;
  return value > EPSILON ? value : 0;
}
