import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import { ThemeBootstrap } from "../components/theme-bootstrap";
import "@xyflow/react/dist/style.css";
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
        <ThemeBootstrap />
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
