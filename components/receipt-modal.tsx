"use client";

import { useRef, useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { receiptModalStyles as styles } from "@/app/theme";
import { ReceiptTemplate } from "@/components/receipt-template";
import { Download, Loader2 } from "lucide-react";
import type { UnifiedRecord } from "@/components/manage-sale-action";
import { useBusinessDetails } from "@/lib/business-details";
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
  // Hold the download until the business details have loaded, so the PDF never captures stale payment details.
  const { ready: detailsReady } = useBusinessDetails(isOpen);

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
      slotProps={{ paper: { sx: styles.paper } }}
    >
      <DialogTitle component="div" sx={styles.title}>
        <Stack direction="row" sx={styles.titleRow}>
          <Box>
            <Typography variant="h6" sx={styles.heading}>
              Receipt Preview
            </Typography>
            <Typography variant="caption" sx={styles.caption}>
              Preview your receipt before downloading.
            </Typography>
          </Box>
          <Button
            variant="contained"
            onClick={handleDownload}
            disabled={isGenerating || records.length === 0 || !detailsReady}
            startIcon={isGenerating ? (
              <Box sx={styles.spinner}>
                <Loader2 size={16} />
              </Box>
            ) : <Download size={16} />}
            sx={styles.downloadDesktop}
          >
            {isGenerating ? "Generating PDF..." : "Download PDF"}
          </Button>
        </Stack>
      </DialogTitle>

      <DialogContent sx={styles.body}>
        <Box sx={styles.scroll}>
          <Box sx={styles.sheetWrap}>
            <Box ref={receiptRef} sx={styles.sheet}>
              <ReceiptTemplate records={records} />
            </Box>
          </Box>
        </Box>
      </DialogContent>

      <Box sx={styles.footer}>
        <Button
          variant="contained"
          fullWidth
          onClick={handleDownload}
          disabled={isGenerating || records.length === 0 || !detailsReady}
          startIcon={isGenerating ? (
            <Box sx={styles.spinner}>
              <Loader2 size={20} />
            </Box>
          ) : <Download size={20} />}
          sx={styles.downloadMobile}
        >
          {isGenerating ? "Generating PDF..." : "Download PDF"}
        </Button>
      </Box>
    </Dialog>
  );
}
