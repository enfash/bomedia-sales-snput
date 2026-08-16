"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RootEstimatorRedirect() {
  const router = useRouter();

  useEffect(() => {
    const userName = localStorage.getItem("userName");
    if (userName?.toLowerCase() === "admin") {
      router.replace("/bom03/estimator");
    } else {
      router.replace("/cashier/estimator");
    }
  }, [router]);

  return null;
}
