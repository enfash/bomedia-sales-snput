"use client";

import { Suspense } from "react";
import { CustomersPage } from "@/components/customers/customers-page";

export default function Page() {
  return <Suspense><CustomersPage role="cashier" /></Suspense>;
}
