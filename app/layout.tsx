import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { SharedStateBootstrap } from "@/components/shared-state-bootstrap";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";
import "./minimalist.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SplitMoni",
  description: "A Splitwise-style expense and settlement tracker for shared groups.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-white text-black">
        <ThemeProvider>
          <Suspense fallback={null}>
            <SharedStateBootstrap />
          </Suspense>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
