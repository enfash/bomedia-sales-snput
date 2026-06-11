"use client";

import { useRouter } from "next/navigation";
import { ExpenseEntry } from "@/components/expense-entry";
import { Receipt, ArrowLeft } from "lucide-react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";

export default function ExpensesPage() {
  const router = useRouter();

  return (
    <Box sx={{p: { xs: 3, md: 4 }, pb: { xs: 14, md: 4 }, maxWidth: 768, minHeight: "100vh"}}>
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5 }}>
          <IconButton
            size="small"
            onClick={() => router.back()}
            sx={{ display: { md: "none" }, bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "10px"}}
          >
            <ArrowLeft size={16} />
          </IconButton>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Receipt size={20} color="#f76808" />
            <Typography variant="h4" sx={{ fontWeight: 800 }}>Expenses</Typography>
          </Box>
        </Box>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Record business expenses directly to the Expenses sheet.
        </Typography>
      </Box>
      <ExpenseEntry />
    </Box>
  );
}
