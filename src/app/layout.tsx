import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Analytics from "@/components/Analytics";
import { SITE, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "WildNetwork: live map of bird and wildlife migration", template: "%s · WildNetwork" },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: "Arun Rajiah", url: "https://www.arunrajiah.com" }],
  creator: "Arun Rajiah",
  keywords: ["bird migration map", "live bird migration", "wildlife movement", "bat activity", "bird arrival dates", "phenology", "BirdNET", "camera trap", "bioacoustics", "open data"],
  openGraph: { type: "website", siteName: SITE_NAME, locale: "en_GB", url: "/", title: "WildNetwork: live map of bird and wildlife migration", description: SITE_DESCRIPTION },
  twitter: { card: "summary_large_image", title: "WildNetwork: live map of bird and wildlife migration", description: SITE_DESCRIPTION },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  ...(process.env.GOOGLE_SITE_VERIFICATION ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } } : {}),
};

export const viewport: Viewport = { themeColor: "#020617" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
