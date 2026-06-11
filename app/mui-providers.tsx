"use client";

import { createContext, useMemo, useState, useEffect, useContext, type ReactNode } from "react";
import { ThemeProvider as MuiThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { GlobalStyles } from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { getAppTheme } from "./theme";
import { usePathname } from "next/navigation";

interface ColorModeContextType {
  toggleColorMode: () => void;
  mode: "light" | "dark";
}

export const ColorModeContext = createContext<ColorModeContextType>({
  toggleColorMode: () => {},
  mode: "light",
});

export const useColorMode = () => useContext(ColorModeContext);

export function MuiProviders({
  children,
  initialMode = "light",
}: {
  children: ReactNode;
  initialMode?: "light" | "dark";
}) {
  const pathname = usePathname();
  const [mode, setMode] = useState<"light" | "dark">(initialMode);

  useEffect(() => {
    // Only sync from localStorage/OS on first visit (no cookie set yet)
    const savedMode = localStorage.getItem("themeMode") as "light" | "dark";
    if (savedMode === "light" || savedMode === "dark") {
      setMode(savedMode);
    } else if (initialMode === "light") {
      // No cookie and no localStorage — fall back to OS preference
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark) setMode("dark");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const colorMode = useMemo(
    () => ({
      toggleColorMode: () => {
        setMode((prevMode) => {
          const nextMode = prevMode === "light" ? "dark" : "light";
          localStorage.setItem("themeMode", nextMode);
          document.cookie = `themeMode=${nextMode}; path=/; max-age=31536000; SameSite=Lax`;
          return nextMode;
        });
      },
      mode,
    }),
    [mode]
  );

  const role = pathname?.startsWith("/cashier") ? "cashier" : "admin";
  const theme = useMemo(() => getAppTheme(mode, role), [mode, role]);

  return (
    <ColorModeContext.Provider value={colorMode}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        <GlobalStyles
          styles={{
            ":root": {
              "--background": theme.palette.background.default,
              "--foreground": theme.palette.text.primary,
              "--card": theme.palette.background.paper,
              "--border": theme.palette.divider,
              "--primary": theme.palette.primary.main,
              "--destructive": theme.palette.error.main,
              "--muted-foreground": theme.palette.text.secondary,
            }
          }}
        />
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          {children}
        </LocalizationProvider>
      </MuiThemeProvider>
    </ColorModeContext.Provider>
  );
}
