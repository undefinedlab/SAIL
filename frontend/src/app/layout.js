import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Web3Providers } from "@/components/providers/Web3Providers";
import { CustomCursor } from "@/components/landing/CustomCursor";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: {
    default: "SAIL",
    template: "%s | SAIL",
  },
  description: "Secure Agentic Intelligence Layer",
  applicationName: "SAIL",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <Web3Providers>
          <CustomCursor />
          {children}
        </Web3Providers>
      </body>
    </html>
  );
}
