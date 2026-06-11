/* eslint-disable @next/next/no-page-custom-font */
import type { Metadata } from "next";
import "./globals.css";
import { Plus_Jakarta_Sans } from "next/font/google";
const plusJakarta = Plus_Jakarta_Sans({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});
import { Toaster } from "sonner";
import { cookies } from "next/headers";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { SyncManager } from "@/components/sync-manager";
import { PWAManager } from "@/components/pwa-manager";
import { ThemeWrapper } from "@/components/theme-wrapper";
import { BottomNav } from "@/components/bottom-nav";
import { NotificationManager } from "@/components/notification-manager";
import { PresenceManager } from "@/components/presence-manager";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { MuiProviders } from "./mui-providers";

export const metadata: Metadata = {
  title: "BOMedia Sales & Expenses",
  description: "AI-Powered Sales and Expense Management for BOMedia",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "BOMedia Sales",
  },
  formatDetection: {
    telephone: false,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const isAdmin = cookieStore.has("admin_session");
  const rawTheme = cookieStore.get("themeMode")?.value;
  const initialMode: "light" | "dark" = rawTheme === "dark" ? "dark" : "light";

  return (
    <html lang="en" className={plusJakarta.className} suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#2e388d" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body
        suppressHydrationWarning
        style={{
          margin: 0,
          padding: 0,
          minHeight: "100vh",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        }}
      >
        <AppRouterCacheProvider>
          <MuiProviders initialMode={initialMode}>
            <PWAManager />
            <NotificationManager />
            <PresenceManager isAdmin={isAdmin} />
            <SyncManager />
            <ThemeWrapper>
              {/* Desktop Sidebar */}
              <Sidebar isAdmin={isAdmin} />

              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  minWidth: 0,
                }}
              >
                {/* Mobile Header & Nav */}
                <MobileNav isAdmin={isAdmin} />

                <main
                  style={{ flex: 1, minHeight: "100vh", overflowX: "hidden" }}
                >
                  <div
                    style={{
                      width: "100%",
                      maxWidth: "2000px",
                      margin: "0 auto",
                      padding: 0,
                    }}
                  >
                    {children}
                  </div>
                </main>

                <BottomNav />
              </div>
            </ThemeWrapper>
            <Toaster richColors position="top-right" closeButton />
          </MuiProviders>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
