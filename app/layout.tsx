import type { Metadata } from "next";
import "./globals.css";
import { NamePrompt } from "@/components/name-prompt";
import { Toaster } from "@/components/ui/sonner";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { SyncManager } from "@/components/sync-manager";
import { PWAManager } from "@/components/pwa-manager";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#4f46e5" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body className="antialiased bg-gray-50">
        <PWAManager />
        <NamePrompt />
        <SyncManager />
        <div className="flex min-h-screen">
          {/* Desktop Sidebar */}
          <Sidebar />
          
          <div className="flex-1 flex flex-col min-w-0">
            {/* Mobile Header & Nav */}
            <MobileNav />
            
            <main className="flex-1 md:ml-60 min-h-screen overflow-x-hidden">
              <div className="w-full max-w-[2000px] mx-auto p-0 transition-all duration-300">
                {children}
              </div>
            </main>
          </div>
        </div>
        <Toaster richColors position="top-right" closeButton />
      </body>
    </html>
  );
}
