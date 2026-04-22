"use client";

import { forwardRef } from "react";
import { UnifiedRecord } from "./manage-sale-action";
import { format } from "date-fns";
import { Logo } from "./logo";

interface ReceiptTemplateProps {
  record: UnifiedRecord;
}

export const ReceiptTemplate = forwardRef<HTMLDivElement, ReceiptTemplateProps>(
  ({ record }, ref) => {
    // Generate a receipt number from rowIndex or fallback
    const receiptNo = `INV-${String(record.rowIndex || Math.floor(Math.random() * 10000)).padStart(5, '0')}`;
    const today = new Date();
    
    // Attempt to parse record date, fallback to today
    let recordDate = today;
    try {
      if (record.date) {
        recordDate = new Date(record.date);
      }
    } catch (e) {}

    const balance = record.balance || 0;
    const amountPaid = record.amountPaid || 0;
    const totalAmount = amountPaid + balance;

    return (
      <div 
        ref={ref} 
        className="bg-white p-8 absolute top-[-9999px] left-[-9999px] w-[500px] text-gray-900 border border-gray-200"
        style={{ fontFamily: "Inter, sans-serif" }}
      >
        {/* Header */}
        <div className="flex justify-between items-start border-b-2 border-gray-100 pb-6 mb-6">
          <div>
            {/* Logo placeholder - using text to avoid external image loading issues in canvas */}
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center font-bold text-white text-lg shrink-0">
                B
              </div>
              <span className="font-black text-2xl tracking-tighter text-gray-900">
                BOMedia.
              </span>
            </div>
            <p className="text-xs text-gray-500 max-w-[200px]">
              Large Format Printing, Branding & Digital Services
            </p>
          </div>
          <div className="text-right">
            <h1 className="text-3xl font-black text-gray-200 tracking-widest uppercase mb-2">Receipt</h1>
            <p className="text-sm font-bold text-gray-800">#{receiptNo}</p>
            <p className="text-xs text-gray-500 mt-1">{format(recordDate, 'MMM dd, yyyy')}</p>
          </div>
        </div>

        {/* Customer Details */}
        <div className="mb-8">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Billed To</p>
          <h2 className="text-lg font-black text-gray-800">{record.customerName}</h2>
          {record.phoneNumber && (
            <p className="text-sm text-gray-600 mt-0.5">{record.phoneNumber}</p>
          )}
        </div>

        {/* Job Details */}
        <div className="mb-8 border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500 font-bold text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Description</th>
                {record.material && <th className="px-4 py-3">Material</th>}
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="px-4 py-4 font-medium text-gray-900">{record.jobDescription}</td>
                {record.material && <td className="px-4 py-4 text-gray-600">{record.material}</td>}
                <td className="px-4 py-4 text-right font-bold text-gray-900">
                  ₦{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Financial Summary */}
        <div className="flex justify-end mb-8">
          <div className="w-64 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 font-medium">Subtotal</span>
              <span className="font-bold text-gray-900">₦{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 font-medium">Amount Paid</span>
              <span className="font-bold text-emerald-600">₦{amountPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-base pt-3 border-t-2 border-gray-900">
              <span className="font-black text-gray-900">Balance Due</span>
              <span className={`font-black ${balance > 0 ? 'text-rose-600' : 'text-gray-900'}`}>
                ₦{balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
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

ReceiptTemplate.displayName = "ReceiptTemplate";
