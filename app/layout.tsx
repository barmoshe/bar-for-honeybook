import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
import "./globals.css";

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-hb",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://bar-for-honeybook.vercel.app"),
  title: "Bar Moshe — for HoneyBook",
  description:
    "I'm Bar, an AI-native builder, and I want to build the next thing at HoneyBook. This page is me showing you, not telling you.",
  // Private, shareable link. Keep it out of search indexes.
  robots: { index: false, follow: false },
  openGraph: {
    title: "I want to build the next thing at HoneyBook.",
    description:
      "Bar Moshe, an AI-native builder who ships real software in hours, not quarters.",
    type: "website",
    siteName: "Bar Moshe × HoneyBook",
  },
  twitter: {
    card: "summary_large_image",
    title: "I want to build the next thing at HoneyBook.",
    description: "Bar Moshe, an AI-native builder who ships in hours, not quarters.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr" className={hanken.variable}>
      <body>{children}</body>
    </html>
  );
}
