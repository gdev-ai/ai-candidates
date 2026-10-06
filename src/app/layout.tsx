import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

import { ToastProvider } from "@/components/ui/toast";

const SITE_NAME = "Candidate Sourcing";

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} | G Developments`,
    template: `%s | ${SITE_NAME}`,
  },
  description: "AI-assisted candidate sourcing and recruitment research",
  applicationName: `G Developments ${SITE_NAME}`,
  // Internal HR tool behind sign-in: keep it out of search results.
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
