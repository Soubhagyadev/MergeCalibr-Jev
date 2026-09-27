import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MergeCallibr",
  description:
    "Probabilistic pull-request triage for public GitHub repositories.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
