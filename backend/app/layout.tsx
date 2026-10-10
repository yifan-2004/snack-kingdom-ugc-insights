import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { InterfaceLanguageProvider } from "./interface-language";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteOrigin = new URL("https://workbench.example");

export const metadata: Metadata = {
  metadataBase: siteOrigin,
  title: "Snack Kingdom | UGC Insights",
  description: "Consumer feedback, topic analysis and evidence-linked insights.",
  openGraph: {
    title: "Snack Kingdom | UGC Insights",
    description: "Social listening and evidence-linked consumer insights.",
    
  },
  twitter: {
    card: "summary_large_image",
    title: "Snack Kingdom | UGC Insights",
    description: "Social listening and evidence-linked consumer insights.",
    
  },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <InterfaceLanguageProvider>{children}</InterfaceLanguageProvider>
      </body>
    </html>
  );
}
