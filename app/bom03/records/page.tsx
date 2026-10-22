"use client";

import { Suspense } from "react";
import { RecordsPage } from "@/components/records/records-page";

export default function AdminRecordsPage() {
  return <Suspense><RecordsPage role="owner" /></Suspense>;
}
