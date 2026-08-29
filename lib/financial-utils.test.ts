import { describe, it, expect } from "vitest";
import {
  computeWaterfall,
  buildPaymentAuditRows,
  validateLumpSum,
  round2,
  type WaterfallStep,
} from "./financial-utils";
import { type UnifiedRecord } from "@/components/manage-sale-action";

function record(rowIndex: number, balance: number): UnifiedRecord {
  return {
    id: `sale-${rowIndex}`,
    date: "2026-01-01",
    type: "Sale",
    client: "Test Client",
    description: `Job ${rowIndex}`,
    amount: balance,
    status: "Part-payment",
    loggedBy: "Tester",
    isPending: false,
    rowIndex,
    additionalPayment1: 0,
    additionalPayment2: 0,
    balance,
    salesId: `BOM-${rowIndex}`,
    raw: {},
  };
}

const sumAmounts = (rows: Record<string, any>[]) =>
  round2(rows.reduce((s, r) => s + (Number(r["AMOUNT"]) || 0), 0));

function auditRowsFor(steps: WaterfallStep[], batchTotal: number) {
  return buildPaymentAuditRows(
    steps.map((s) => ({
      rowIndex: s.record.rowIndex!,
      salesId: s.record.salesId,
      slot: s.slot,
      mode: s.mode,
      toApply: s.toApply,
      balanceBefore: s.record.balance ?? 0,
      overpayment: s.overpayment,
    })),
    {
      transactionId: "txn-test",
      clientName: "Test Client",
      collectedBy: "Tester",
      notes: undefined,
      today: "2026-01-01",
      timestamp: "2026-01-01T00:00:00.000Z",
      batchTotal,
    }
  );
}

describe("computeWaterfall + buildPaymentAuditRows", () => {
  it("exact payment (no remainder): one row per sale, sum == BATCH TOTAL", () => {
    const records = [record(2, 5000), record(3, 3000)];
    const lumpSum = 8000;

    const steps = computeWaterfall(records, lumpSum);
    expect(steps).toHaveLength(2);
    expect(steps.every((s) => !s.overpayment)).toBe(true);

    const rows = auditRowsFor(steps, lumpSum);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r["PAYMENT TYPE"] === "Settlement")).toBe(true);
    expect(sumAmounts(rows)).toBe(lumpSum);
    rows.forEach((r) => {
      expect(r["BATCH ID"]).toBe("txn-test");
      expect(r["BATCH TOTAL"]).toBe(lumpSum);
    });
  });

  it("overpayment: splits into Settlement + Rounding rows, sum == BATCH TOTAL", () => {
    const records = [record(2, 5000)];
    const lumpSum = 5500; // 500 over the only balance

    const steps = computeWaterfall(records, lumpSum);
    expect(steps).toHaveLength(1);
    expect(steps[0].overpayment).toBe(500);
    expect(steps[0].toApply).toBe(5500);

    const rows = auditRowsFor(steps, lumpSum);
    expect(rows).toHaveLength(2);
    const settlement = rows.find((r) => r["PAYMENT TYPE"] === "Settlement");
    const roundingRow = rows.find((r) => r["PAYMENT TYPE"] === "Rounding");
    expect(settlement?.["AMOUNT"]).toBe(5000);
    expect(roundingRow?.["AMOUNT"]).toBe(500);
    expect(sumAmounts(rows)).toBe(lumpSum);
  });

  it("pure overpayment (all debt already covered by an earlier step) has no Settlement row", () => {
    // A single record whose entire balance is absorbed by Phase 1 exactly,
    // then Phase 2 still finds leftover money because lumpSum > total debt —
    // computeWaterfall folds it into the same (only) step, not a new one,
    // so this exercises the "settlement rounds to zero" skip path directly.
    const records = [record(2, 0)]; // already settled — no balance to pay
    const lumpSum = 750;

    const steps = computeWaterfall(records, lumpSum);
    expect(steps).toHaveLength(1);
    expect(steps[0].overpayment).toBe(750);
    expect(steps[0].toApply).toBe(750);

    const rows = auditRowsFor(steps, lumpSum);
    expect(rows).toHaveLength(1);
    expect(rows[0]["PAYMENT TYPE"]).toBe("Rounding");
    expect(rows[0]["AMOUNT"]).toBe(750);
    expect(sumAmounts(rows)).toBe(lumpSum);
  });

  it("payment smaller than total debt: pays oldest row first, sum == BATCH TOTAL", () => {
    const older = record(2, 5000);
    const newer = record(5, 8000);
    const lumpSum = 3000;

    const steps = computeWaterfall([newer, older], lumpSum); // unsorted input on purpose
    expect(steps).toHaveLength(1);
    expect(steps[0].record.rowIndex).toBe(2); // oldest (lowest rowIndex) paid first
    expect(steps[0].toApply).toBe(3000);

    const rows = auditRowsFor(steps, lumpSum);
    expect(rows).toHaveLength(1);
    expect(sumAmounts(rows)).toBe(lumpSum);
  });
});

describe("validateLumpSum", () => {
  it("legacy payload with no lumpSum succeeds, BATCH TOTAL == stepTotal", () => {
    const result = validateLumpSum(undefined, 4320);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.batchTotal).toBe(4320);
  });

  it("lumpSum mismatched by more than a kobo is rejected", () => {
    const result = validateLumpSum(5000, 4320);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("5,000");
      expect(result.error).toContain("4,320");
    }
  });

  it("lumpSum within a kobo of the step total is accepted", () => {
    const result = validateLumpSum(4320.004, 4320);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.batchTotal).toBe(4320);
  });
});
