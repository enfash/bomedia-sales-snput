"use client";

import { Chip } from "@mui/material";

interface MaterialBadgeProps {
  material: string;
  sx?: any;
}

export function MaterialBadge({ material, sx }: MaterialBadgeProps) {
  const normalized = material.toLowerCase().trim();

  const getColors = (): { bgcolor: string; color: string; borderColor: string } => {
    if (normalized.includes("flex")) {
      return {
        bgcolor: "rgba(219,234,254,0.8)",
        color: "#1d4ed8",
        borderColor: "rgba(191,219,254,1)",
      };
    }
    if (normalized.includes("sav") || normalized.includes("mesh")) {
      return {
        bgcolor: "rgba(254,226,226,0.8)",
        color: "#b91c1c",
        borderColor: "rgba(254,202,202,1)",
      };
    }
    if (normalized.includes("blockout")) {
      return {
        bgcolor: "rgba(243,244,246,0.8)",
        color: "#4b5563",
        borderColor: "rgba(229,231,235,1)",
      };
    }
    if (normalized.includes("vinyl")) {
      return {
        bgcolor: "rgba(255,228,230,0.8)",
        color: "#be123c",
        borderColor: "rgba(254,205,211,1)",
      };
    }
    if (normalized.includes("window") || normalized.includes("owv")) {
      return {
        bgcolor: "rgba(207,250,254,0.8)",
        color: "#0e7490",
        borderColor: "rgba(165,243,252,1)",
      };
    }
    if (
      normalized.includes("sticker") ||
      normalized.includes("label") ||
      normalized.includes("clear")
    ) {
      return {
        bgcolor: "rgba(237,233,254,0.8)",
        color: "#6d28d9",
        borderColor: "rgba(221,214,254,1)",
      };
    }
    if (normalized.includes("reflective")) {
      return {
        bgcolor: "rgba(254,249,195,0.8)",
        color: "#92400e",
        borderColor: "rgba(253,230,138,1)",
      };
    }
    return {
      bgcolor: "rgba(243,244,246,0.8)",
      color: "#4b5563",
      borderColor: "rgba(229,231,235,1)",
    };
  };

  const colors = getColors();

  return (
    <Chip
      label={material}
      variant="outlined"
      size="small"
      sx={{
        ...sx,
        fontSize: "9px",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        borderRadius: "6px",
        height: "18px",
        minWidth: "32px",
        bgcolor: colors.bgcolor,
        color: colors.color,
        borderColor: colors.borderColor,
        "& .MuiChip-label": {
          px: "6px",
          py: 0,
        },
      }}
    />
  );
}
