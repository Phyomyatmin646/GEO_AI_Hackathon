import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { LanguageProvider } from "./lib/i18n";
import { ChatbotWidget } from "./components/ChatbotWidget";



export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host?.includes("localhost") ? "http" : "https");
  const baseUrl = new URL(`${protocol}://${host ?? "localhost:3000"}`);
  const title = "စိုက်ပျိုးမိတ်ဆွေ | Myanmar Agriculture Intelligence";
  const description =
    "မြန်မာနိုင်ငံအတွက် official-source စိုက်ပျိုးရေး၊ ရာသီဥတုနှင့် စီးပွားရေး အထောက်အထား။";

  return {
    metadataBase: baseUrl,
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="my">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400..900&amp;family=Geist+Mono:wght@400..900&amp;display=swap" rel="stylesheet" />
        <style dangerouslySetInnerHTML={{ __html: `:root { --font-geist-sans: 'Geist', sans-serif; --font-geist-mono: 'Geist Mono', monospace; }` }} />
      </head>
      <body suppressHydrationWarning>
        <LanguageProvider>
          {children}
          <ChatbotWidget />
        </LanguageProvider>
      </body>
    </html>
  );
}
