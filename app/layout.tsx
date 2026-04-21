import type { Metadata } from "next";
import "./globals.css";
import { NamePrompt } from "@/components/name-prompt";
import { Toaster } from "@/components/ui/sonner";
import { cookies } from "next/headers";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { SyncManager } from "@/components/sync-manager";
import { PWAManager } from "@/components/pwa-manager";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeWrapper } from "@/components/theme-wrapper";
import { BottomNav } from "@/components/bottom-nav";

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
  const cookieStore = cookies();
  const isAdmin = cookieStore.has("admin_session");

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#4f46e5" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body className="antialiased min-h-screen" suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <PWAManager />
          <NamePrompt isAdmin={isAdmin} />
          <SyncManager />
          <ThemeWrapper>
            {/* Desktop Sidebar */}
            <Sidebar isAdmin={isAdmin} />
            
            <div className="flex-1 flex flex-col min-w-0">
              {/* Mobile Header & Nav */}
              <MobileNav isAdmin={isAdmin} />
              
              <main className="flex-1 md:ml-60 min-h-screen overflow-x-hidden">
                <div className="w-full max-w-[2000px] mx-auto p-0">
                  {children}
                </div>
              </main>
              
              <BottomNav />
            </div>
          </ThemeWrapper>
          <Toaster richColors position="top-right" closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
