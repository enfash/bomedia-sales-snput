"use client";

import { HomeBackLink } from "@/components/back-link";
import { useState } from "react";
import { ExpenseEntry } from "@/components/expense-entry";
import { MyExpenses } from "@/components/expenses/my-expenses";
import { HeldOldExpenses } from "@/components/expenses/held-old-expenses";
import { Receipt } from "lucide-react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { expenseStyles as styles } from "@/app/theme";

export default function ExpensesPage() {
  const [saved, setSaved] = useState(0);
  return (
    <Box sx={styles.page}>
      <HomeBackLink />
      <Box sx={styles.header}>
        <Box sx={styles.headerSolo}>
          <Box sx={styles.titleBox}>
            <Box component="span" sx={styles.headerIcon}><Receipt size={20} /></Box>
            <Typography variant="h4" sx={styles.title}>Expenses</Typography>
          </Box>
        </Box>
        <Typography variant="body2" sx={styles.subtitle}>
          Record business expenses directly to the Expenses sheet.
        </Typography>
      </Box>
      <HeldOldExpenses onSaved={() => setSaved((n) => n + 1)} />
      <ExpenseEntry onSaved={() => setSaved((n) => n + 1)} />
      <MyExpenses refreshKey={saved} />
    </Box>
  );
}
