"use client";

import { forwardRef } from "react";
import { UnifiedRecord } from "./manage-sale-action";
import { format } from "date-fns";

interface ReceiptTemplateProps {
  records: UnifiedRecord[];
}

export const ReceiptTemplate = forwardRef<HTMLDivElement, ReceiptTemplateProps>(
  ({ records }, ref) => {
    if (!records || records.length === 0) return null;

    const primary = records[0];

    // Receipt / order reference
    const salesId = primary.salesId && primary.salesId.trim() !== ""
      ? primary.salesId
      : `INV-${String(primary.rowIndex || Math.floor(Math.random() * 10000)).padStart(5, "0")}`;

    // Date from primary record
    let recordDate = new Date();
    try {
      if (primary.date) {
        const d = new Date(primary.date);
        if (!isNaN(d.getTime())) recordDate = d;
      }
    } catch {}

    // Aggregated financials
    const grandTotal = records.reduce((s, r) => s + (r.amount ?? 0), 0);
    const totalBalance = records.reduce((s, r) => s + (r.balance ?? 0), 0);
    const totalPaid = grandTotal - totalBalance;

    // Determine if any material present
    const hasMaterial = records.some((r) => r.material && r.material.trim() !== "");

    return (
      <div
        ref={ref}
        className="bg-white p-12 text-gray-900"
        style={{ 
          fontFamily: "Inter, sans-serif",
          width: "800px",
          minHeight: "1131px", // A4 Ratio
          boxSizing: "border-box"
        }}
      >
        {/* Header */}
        <div className="flex justify-between items-start border-b-2 border-gray-100 pb-6 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center font-bold text-white text-lg shrink-0">
                B
              </div>
              <span className="font-black text-2xl tracking-tighter text-gray-900">
                BOMedia.
              </span>
            </div>
            <p className="text-xs text-gray-500 max-w-[200px]">
              Large Format Printing, Branding &amp; Digital Services
            </p>
          </div>
          <div className="text-right">
            <h1 className="text-3xl font-black text-gray-200 tracking-widest uppercase mb-2">Invoice</h1>
            <p className="text-sm font-bold text-gray-800">#{salesId}</p>
            <p className="text-xs text-gray-500 mt-1">{format(recordDate, "MMM dd, yyyy")}</p>
          </div>
        </div>

        {/* Customer Details */}
        <div className="mb-8">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Billed To</p>
          <h2 className="text-lg font-black text-gray-800">{primary.client}</h2>
          {primary.contact && (
            <p className="text-sm text-gray-600 mt-0.5">{primary.contact}</p>
          )}
        </div>

        {/* Line Items Table */}
        <div className="mb-8 border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500 font-bold text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 w-6 text-center">#</th>
                <th className="px-4 py-3">Description</th>
                {hasMaterial && <th className="px-4 py-3">Material</th>}
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {records.map((r, idx) => (
                <tr key={r.id ?? idx}>
                  <td className="px-4 py-3 text-center text-gray-400 text-xs font-bold">{idx + 1}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{r.description}</td>
                  {hasMaterial && (
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {r.material || "—"}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right font-bold text-gray-900">
                    ₦{(r.amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className={`px-4 py-3 text-right font-bold ${(r.balance ?? 0) > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    ₦{(r.balance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Financial Summary */}
        <div className="flex justify-end mb-12">
          <div className="w-80 space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 font-medium">Grand Total</span>
              <span className="font-bold text-gray-900">
                ₦{grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 font-medium">Amount Paid</span>
              <span className="font-bold text-emerald-600">
                ₦{totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-base pt-3 border-t-2 border-gray-900">
              <span className="font-black text-gray-900">Balance Due</span>
              <span className={`font-black ${totalBalance > 0 ? "text-rose-600" : "text-gray-900"}`}>
                ₦{totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 pt-6 text-center">
          <p className="text-sm font-bold text-gray-800 mb-1">Thank you for your business!</p>
          <p className="text-xs text-gray-500">For inquiries, please contact us.</p>
        </div>
      </div>
    );
  }
);
