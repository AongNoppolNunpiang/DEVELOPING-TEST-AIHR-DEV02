import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIHR-DEV02 | Asset Integrity",
  description: "Piping inspection and thickness data management",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
