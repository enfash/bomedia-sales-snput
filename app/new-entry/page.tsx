"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RootNewEntryRedirect() {
  const router = useRouter();

  useEffect(() => {
    const userName = localStorage.getItem("userName");
    if (userName?.toLowerCase() === "admin") {
      router.replace("/bom03/new-entry");
    } else {
      router.replace("/cashier/new-entry");
    }
  }, [router]);

  return null;
}
