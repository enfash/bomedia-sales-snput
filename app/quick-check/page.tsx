"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RootQuickCheckRedirect() {
  const router = useRouter();

  useEffect(() => {
    const userName = localStorage.getItem("userName");
    if (userName?.toLowerCase() === "admin") {
      router.replace("/bom03/quick-check");
    } else {
      router.replace("/cashier/quick-check");
    }
  }, [router]);

  return null;
}
