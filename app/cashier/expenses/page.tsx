"use client";

import { useRouter } from "next/navigation";
import { ExpenseEntry } from "@/components/expense-entry";
import { Receipt, ArrowLeft } from "lucide-react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { expenseStyles as styles } from "@/app/theme";

export default function ExpensesPage() {
  const router = useRouter();

  return (
    <Box sx={styles.page}>
      <Box sx={styles.header}>
        <Box sx={styles.headerSolo}>
          <IconButton size="small" onClick={() => router.back()} sx={styles.backButton}>
            <ArrowLeft size={16} />
          </IconButton>
          <Box sx={styles.titleBox}>
            <Box component="span" sx={styles.headerIcon}><Receipt size={20} /></Box>
            <Typography variant="h4" sx={styles.title}>Expenses</Typography>
          </Box>
        </Box>
        <Typography variant="body2" sx={styles.subtitle}>
          Record business expenses directly to the Expenses sheet.
        </Typography>
      </Box>
      <ExpenseEntry />
    </Box>
  );
}
