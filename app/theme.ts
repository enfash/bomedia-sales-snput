"use client";

import { createTheme } from "@mui/material/styles";

export function getAppTheme(mode: "light" | "dark", role: "admin" | "cashier") {
  const primaryColor = role === "admin" ? "#2e388d" : "#f76808";
  const primaryDark  = role === "admin" ? "#1e2460" : "#cc5506";
  const primaryLight = role === "admin" ? "#4a56b0" : "#fa8b3e";
  const primary50    = role === "admin" ? "#eef0fb" : "#fef0e6"; // Light primary tint background

  return createTheme({
    palette: {
      mode,
      primary: {
        main: primaryColor,
        dark: primaryDark,
        light: primaryLight,
        contrastText: "#ffffff",
        "50": primary50,
      },
      secondary: {
        main: mode === "light" ? "#1F2933" : "#f1f5f9",
      },
      warning: {
        main: "#E8A13A",
        light: "#f0bd6e",
        dark: "#b57d2d",
        contrastText: "#1a1410",
      },
      success: { main: "#2E7D5B", light: "#4caf85", dark: "#1f5a40" },
      error:   { main: "#C0392B", light: "#d9534f", dark: "#8b2a1f" },
      info:    { main: "#0369a1" },
      background: {
        default: mode === "light" ? "#F8F9FA" : "#020817",
        paper:   mode === "light" ? "#FFFFFF"  : "#0f172a",
      },
      text: {
        primary:   mode === "light" ? "#0F172A" : "#F8FAFC",
        secondary: mode === "light" ? "#64748B" : "#94A3B8",
        disabled:  mode === "light" ? "#94A3B8" : "#475569",
      },
      divider: mode === "light" ? "rgba(15,23,42,0.1)" : "rgba(255,255,255,0.1)",
      ...(mode === "dark" && {
        grey: {
          50:  "#0f172a",
          100: "#1e293b",
          200: "#334155",
          300: "#475569",
          400: "#64748b",
          500: "#94a3b8",
          600: "#cbd5e1",
          700: "#e2e8f0",
          800: "#f1f5f9",
          900: "#f8fafc",
        },
      }),
    },
    typography: {
      fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
      h1: { fontWeight: 700, fontSize: "2.25rem", letterSpacing: "-0.02em" },
      h2: { fontWeight: 700, fontSize: "1.75rem", letterSpacing: "-0.01em" },
      h3: { fontWeight: 600, fontSize: "1.375rem" },
      h4: { fontWeight: 600, fontSize: "1.125rem" },
      h5: { fontWeight: 600, fontSize: "1rem" },
      h6: { fontWeight: 600, fontSize: "0.875rem" },
      subtitle1: { fontWeight: 500, fontSize: "0.95rem", letterSpacing: "0.01em" },
      subtitle2: { fontWeight: 500, fontSize: "0.875rem", color: mode === "light" ? "#64748B" : "#94A3B8" },
      body1:  { fontSize: "0.95rem" },
      body2:  { fontSize: "0.875rem" },
      caption: { fontSize: "0.75rem", letterSpacing: "0.02em" },
      overline: { fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" },
      button: { fontWeight: 600, textTransform: "none" },
    },
    shape: { borderRadius: 10 },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: "12px",
            padding: "10px 22px",
            fontSize: "0.95rem",
            transition: "transform .2s ease, box-shadow .2s ease",
            "&:active": {
              transform: "scale(0.97) translateY(1px)",
            },
            "&.MuiButton-sizeSmall":  { borderRadius: "12px", padding: "5px 14px" },
            "&.MuiButton-sizeMedium": { borderRadius: "12px" },
            "&.MuiButton-sizeLarge":  { borderRadius: "12px" },
            "&.MuiButton-containedPrimary": {
              boxShadow: mode === "light"
                ? `0 4px 14px ${primaryColor}40`
                : `0 4px 14px ${primaryColor}80`,
              "&:hover": {
                transform: "translateY(-2px)",
                boxShadow: mode === "light"
                  ? `0 10px 24px ${primaryColor}52`
                  : `0 10px 24px ${primaryColor}99`,
              },
            },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: "16px",
            border: "1px solid",
            minWidth: 0,
            borderColor: mode === "light" ? "rgba(15,23,42,0.06)" : "rgba(255,255,255,0.06)",
            boxShadow: mode === "light"
              ? "0 2px 4px rgba(15,23,42,.02), 0 8px 24px rgba(15,23,42,.02)"
              : "0 1px 2px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,0.02)",
          },
        },
      },
      MuiCardContent: {
        styleOverrides: {
          root: {
            // Remove MUI's extra bottom padding on last-child
            "&:last-child": { paddingBottom: 16 },
          },
        },
      },
      MuiTextField: {
        defaultProps: { variant: "outlined", size: "small" },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: "10px",
          },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: "8px",
            fontWeight: 600,
            fontSize: "0.75rem",
          },
          sizeSmall: {
            height: 22,
            fontSize: "0.6875rem",
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: "10px",
            transition: "transform 0.15s ease",
            "&:active": {
              transform: "scale(0.98)",
            },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            // Minimum 44×44 touch target per Material Design guidelines
            minWidth: 44,
            minHeight: 44,
            transition: "transform 0.15s ease",
            "&:active": {
              transform: "scale(0.95)",
            },
          },
          sizeSmall: {
            minWidth: 36,
            minHeight: 36,
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
          },
        },
      },
      MuiTooltip: {
        defaultProps: {
          enterDelay: 400,
          enterNextDelay: 200,
          arrow: true,
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: "#111827",
            color: "#ffffff",
            border: "none",
          },
        },
      },
      MuiDivider: {
        styleOverrides: {
          root: {
            borderColor: mode === "light" ? "rgba(15,23,42,0.1)" : "rgba(255,255,255,0.1)",
          },
        },
      },
    },
  });
}
