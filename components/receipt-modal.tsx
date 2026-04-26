"use client";

import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ReceiptTemplate } from "@/components/receipt-template";
import { Download, Loader2 } from "lucide-react";
import type { UnifiedRecord } from "@/components/manage-sale-action";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: UnifiedRecord[];
  salesId?: string;
}

export function ReceiptModal({ isOpen, onClose, records, salesId }: ReceiptModalProps) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async () => {
    if (!receiptRef.current) return;
    setIsGenerating(true);

    // Clone the receipt node to document.body so it sits OUTSIDE
    // the Dialog's overflow:hidden boundary. This is the safest
    // capture strategy for both desktop and mobile.
    const clone = receiptRef.current.cloneNode(true) as HTMLElement;
    clone.style.cssText = [
      "position:fixed",
      "top:0",
      "left:0",
      "width:800px",
      "background:#ffffff",
      "z-index:-9999",
      "pointer-events:none",
      "opacity:1",
    ].join(";");
    document.body.appendChild(clone);

    try {
      // Ensure all images in the clone are loaded
      const images = clone.getElementsByTagName("img");
      await Promise.all(
        Array.from(images).map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          });
        })
      );

      // Wait for fonts to be ready
      if ("fonts" in document) {
        await document.fonts.ready;
      }

      // Small delay to ensure layout is settled
      await new Promise(resolve => setTimeout(resolve, 200));

      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        windowWidth: 800,
      });

      const imgData = canvas.toDataURL("image/png");

      if (imgData === "data:," || canvas.width === 0 || canvas.height === 0) {
        throw new Error("Canvas is empty. html2canvas failed to capture the receipt.");
      }

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "px",
        format: [canvas.width / 2, canvas.height / 2],
      });

      pdf.addImage(imgData, "PNG", 0, 0, canvas.width / 2, canvas.height / 2);

      const fileNameId = salesId || records[0]?.salesId || records[0]?.client.replace(/\s+/g, '_') || "receipt";
      pdf.save(`Invoice_${fileNameId}.pdf`);

    } catch (error) {
      console.error("Error generating PDF:", error);
    } finally {
      document.body.removeChild(clone);
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[95vw] md:max-w-4xl p-0 overflow-hidden bg-zinc-100 dark:bg-zinc-950 flex flex-col h-[90vh] md:h-[85vh]">
        <DialogHeader className="p-4 md:p-6 bg-white dark:bg-zinc-900 border-b border-gray-100 dark:border-zinc-800 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-black text-gray-900 dark:text-white">Receipt Preview</DialogTitle>
              <DialogDescription className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
                Preview your receipt before downloading.
              </DialogDescription>
            </div>
            <Button 
              onClick={handleDownload} 
              disabled={isGenerating || records.length === 0}
              className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl shadow-sm hidden md:flex"
            >
              {isGenerating ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating PDF...</>
              ) : (
                <><Download className="w-4 h-4 mr-2" /> Download PDF</>
              )}
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center bg-gray-100/50 dark:bg-zinc-950">
          {/* 
            Container scaling to fit mobile screens. 
            The origin is top center so it scales gracefully.
          */}
          <div className="relative origin-top transform scale-[0.4] sm:scale-[0.6] md:scale-75 lg:scale-100 transition-transform w-[800px] pb-10">
            <div 
              ref={receiptRef}
              className="w-[800px] bg-white shadow-xl"
            >
              <ReceiptTemplate records={records} />
            </div>
          </div>
        </div>

        {/* Mobile fixed bottom button */}
        <div className="p-4 bg-white dark:bg-zinc-900 border-t border-gray-100 dark:border-zinc-800 shrink-0 md:hidden">
           <Button 
              onClick={handleDownload} 
              disabled={isGenerating || records.length === 0}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white rounded-xl shadow-sm h-12 text-base font-bold"
            >
              {isGenerating ? (
                <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Generating PDF...</>
              ) : (
                <><Download className="w-5 h-5 mr-2" /> Download PDF</>
              )}
            </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
