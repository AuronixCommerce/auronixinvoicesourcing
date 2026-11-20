import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./auth-provider";
export const metadata: Metadata = { title: "Auronix Inventory Sourcing", description: "Your sourcing, inventory and fulfillment. One connected workspace.", icons: { icon: "/favicon.svg" } };
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) { return <html lang="en"><body><AuthProvider>{children}</AuthProvider></body></html>; }
