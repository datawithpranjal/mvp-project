import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SiteHeader } from "../components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Data Foundry",
  description:
    "Practice-first Data Engineering interview scenarios, production simulations, and job readiness."
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
