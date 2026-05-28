import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SiteHeader } from "../components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Data Engineering Scenario Playground",
  description: "Debug production-style data engineering scenarios in the browser."
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
