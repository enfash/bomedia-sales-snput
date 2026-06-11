"use client";

import { useEffect, useState } from "react";
import { animate } from "framer-motion";
import Box from "@mui/material/Box";

interface AnimatedNumberProps {
  value: number;
  formatType?: "currency" | "short-currency" | "number";
  sx?: any;
}

export function AnimatedNumber({
  value,
  formatType = "number",
  sx,
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState("");

  useEffect(() => {
    const controls = animate(0, value, {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => {
        if (formatType === "currency") {
          setDisplayValue(
            `₦${Math.round(latest).toLocaleString(undefined, {
              minimumFractionDigits: 0,
            })}`
          );
        } else if (formatType === "short-currency") {
          const n = Math.round(latest);
          if (n >= 1_000_000) {
            setDisplayValue(`₦${(latest / 1_000_000).toFixed(1)}M`);
          } else if (n >= 1_000) {
            setDisplayValue(`₦${(latest / 1_000).toFixed(0)}k`);
          } else {
            setDisplayValue(`₦${n.toLocaleString()}`);
          }
        } else {
          setDisplayValue(Math.round(latest).toLocaleString());
        }
      },
    });

    return () => controls.stop();
  }, [value, formatType]);

  return <Box component="span" sx={sx}>{displayValue}</Box>;
}
