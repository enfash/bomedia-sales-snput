"use client";

import { Chip } from "@mui/material";
import { materialBadgeStyles as styles } from "@/app/theme";

interface MaterialBadgeProps {
  material: string;
  sx?: any;
}

function kindOf(name: string): keyof typeof styles | "neutral" {
  if (name.includes("flex")) return "flex";
  if (name.includes("sav") || name.includes("mesh")) return "sav";
  if (name.includes("blockout")) return "neutral";
  if (name.includes("vinyl")) return "vinyl";
  if (name.includes("window") || name.includes("owv")) return "window";
  if (name.includes("sticker") || name.includes("label") || name.includes("clear")) return "sticker";
  if (name.includes("reflective")) return "reflective";
  return "neutral";
}

export function MaterialBadge({ material, sx }: MaterialBadgeProps) {
  const kind = kindOf(material.toLowerCase().trim());
  return <Chip label={material} variant="outlined" size="small" sx={[styles.chip, styles[kind], ...(Array.isArray(sx) ? sx : [sx])]} />;
}
