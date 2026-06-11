"use client";

import { useRef, useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
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

      if ("fonts" in document) {
        await document.fonts.ready;
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        windowWidth: 800,
      });

      const imgData = canvas.toDataURL("image/jpeg", 0.75);

      if (imgData === "data:," || canvas.width === 0 || canvas.height === 0) {
        throw new Error("Canvas is empty. html2canvas failed to capture the receipt.");
      }

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "px",
        format: [canvas.width / 2, canvas.height / 2],
      });

      pdf.addImage(imgData, "JPEG", 0, 0, canvas.width / 2, canvas.height / 2);

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
    <Dialog
      open={isOpen}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: 4, maxHeight: "90vh", display: "flex", flexDirection: "column", bgcolor: "grey.100" } } }}
    >
      <DialogTitle
        component="div"
        sx={{ p: { xs: 2, md: 3 }, bgcolor: "background.paper", borderBottom: "1px solid", borderColor: "grey.100", flexShrink: 0 }}
      >
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 900, color: "text.primary" }}>
              Receipt Preview
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.5 }}>
              Preview your receipt before downloading.
            </Typography>
          </Box>
          <Button
            variant="contained"
            onClick={handleDownload}
            disabled={isGenerating || records.length === 0}
            startIcon={isGenerating ? (
              <Box sx={{ animation: "spin 1s linear infinite", display: "flex", "@keyframes spin": { "100%": { transform: "rotate(360deg)" } } }}>
                <Loader2 size={16} />
              </Box>
            ) : <Download size={16} />}
            sx={{ display: { xs: "none", md: "flex" }, borderRadius: 3 }}
          >
            {isGenerating ? "Generating PDF..." : "Download PDF"}
          </Button>
        </Stack>
      </DialogTitle>

      <DialogContent
        sx={{ p: 0, flexGrow: 1, overflowY: "auto", bgcolor: "grey.100" }}
      >
        <Box sx={{ p: { xs: 2, md: 4 }, minWidth: 0, overflowX: "auto" }}>
          <Box sx={{ minWidth: 800 }}>
            <Box
              ref={receiptRef}
              sx={{ width: 800, bgcolor: "background.paper", boxShadow: 6 }}
            >
              <ReceiptTemplate records={records} />
            </Box>
          </Box>
        </Box>
      </DialogContent>

      <Box
        sx={{ p: 2, bgcolor: "background.paper", borderTop: "1px solid", borderColor: "grey.100", flexShrink: 0, display: { xs: "block", md: "none" } }}
      >
        <Button
          variant="contained"
          fullWidth
          onClick={handleDownload}
          disabled={isGenerating || records.length === 0}
          startIcon={isGenerating ? (
            <Box sx={{ animation: "spin 1s linear infinite", display: "flex", "@keyframes spin": { "100%": { transform: "rotate(360deg)" } } }}>
              <Loader2 size={20} />
            </Box>
          ) : <Download size={20} />}
          sx={{ borderRadius: 3, height: 48, fontSize: "1rem", fontWeight: 700 }}
        >
          {isGenerating ? "Generating PDF..." : "Download PDF"}
        </Button>
      </Box>
    </Dialog>
  );
}
