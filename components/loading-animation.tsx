"use client";

import React, { useMemo } from "react";
import Lottie from "lottie-react";
import { usePathname } from "next/navigation";
import animationData from "../public/loading.json";

// Helper to recolor all fills and strokes in a Lottie JSON
function recolorLottie(json: any, targetHex: string) {
  const r = parseInt(targetHex.slice(1, 3), 16) / 255;
  const g = parseInt(targetHex.slice(3, 5), 16) / 255;
  const b = parseInt(targetHex.slice(5, 7), 16) / 255;

  const cloned = JSON.parse(JSON.stringify(json));

  function traverse(obj: any) {
    if (!obj || typeof obj !== "object") return;
    if (obj.ty === "fl" || obj.ty === "st") {
      if (obj.c && obj.c.k) {
        if (typeof obj.c.k[0] === "number" && obj.c.k.length >= 3) {
          obj.c.k[0] = r;
          obj.c.k[1] = g;
          obj.c.k[2] = b;
          if (obj.c.k.length === 4) obj.c.k[3] = 1;
        }
      }
    }
    for (const key in obj) {
      traverse(obj[key]);
    }
  }

  traverse(cloned);
  return cloned;
}

interface LoadingAnimationProps {
  width?: number | string;
  height?: number | string;
  text?: string;
}

export function LoadingAnimation({ width = 120, height = 120, text }: LoadingAnimationProps) {
  const pathname = usePathname() || "";

  // Determine color based on route
  const targetColor = pathname.startsWith("/bom03")
    ? "#2E388E"
    : pathname.startsWith("/cashier")
    ? "#f76808"
    : "#64748B"; // fallback

  const coloredAnimation = useMemo(() => {
    return recolorLottie(animationData, targetColor);
  }, [targetColor]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width, height }}>
        <Lottie animationData={coloredAnimation} loop={true} />
      </div>
      {text && (
        <span style={{ marginTop: 8, fontSize: "0.875rem", color: targetColor, fontWeight: 600 }}>
          {text}
        </span>
      )}
    </div>
  );
}
