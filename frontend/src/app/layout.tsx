import type { Metadata } from "next";
import "../index.css";

export const metadata: Metadata = {
  title: "XAUUSD Smart Trade Assistant",
  description: "AI-Powered SMC Trade Analysis Platform for Gold",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
