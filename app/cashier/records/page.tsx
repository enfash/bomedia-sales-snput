"use client";

import { Suspense } from "react";
import { RecordsPage } from "@/components/records/records-page";

export default function CashierRecordsPage() {
  return <Suspense><RecordsPage role="cashier" /></Suspense>;
}
