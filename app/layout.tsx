import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "My家計簿",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "My家計簿",
    statusBarStyle: "default",
  },
  icons: { apple: "/pwa-icon/180" },
};

export const viewport: Viewport = {
  themeColor: "#059669",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="text-slate-800 antialiased">{children}</body>
    </html>
  );
}
