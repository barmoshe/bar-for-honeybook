import type { Metadata } from "next";
import ScrollRestorer from "@/components/ScrollRestorer";
import "@fontsource-variable/figtree";
import "@fontsource-variable/source-serif-4/opsz.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./globals.css";

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
    <html lang="en" dir="ltr">
      <body>
        <ScrollRestorer />
        {children}
      </body>
    </html>
  );
}
