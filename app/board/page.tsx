"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RootBoardRedirect() {
  const router = useRouter();

  useEffect(() => {
    const userName = localStorage.getItem("userName");
    if (userName?.toLowerCase() === "admin") {
      router.replace("/bom03/board");
    } else {
      router.replace("/cashier/board");
    }
  }, [router]);

  return null;
}
