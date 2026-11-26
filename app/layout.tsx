import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

// A variable font, so one file covers every weight. The page uses 500 to 700.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ask",
  description: "A command bar assistant.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${figtree.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
