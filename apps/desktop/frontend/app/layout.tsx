import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from '@/store/provider';
import ThemeProvider from "@/providers/ThemeProvider";
import { Suspense } from "react";
import Snackbar from "./components/snackbar";
import ToastListener from "./components/ToastListener";


const inter = Inter({ subsets: ["latin"] });

/**
 * META CONFIG
 */
const title       = process.env.NEXT_PUBLIC_TITLE || "Delice POS";
const description = process.env.NEXT_PUBLIC_DESCRIPTION || "Sistema de impresión POS";
const image       = "https://jorgedev.pro/img/profile.jpg";
const url         = "https://jorgedev.pro";
const fbAppId     = process.env.NEXT_PUBLIC_FB_APP_ID || "";

/**
 * METADATA
 */
export const metadata: Metadata = {
  title: process.env.REACT_APP_NAME + " " + process.env.REACT_APP_NAME2 || title,
  description,
  applicationName: process.env.REACT_APP_NAME || "Delice POS",
  keywords: ["pos", "printer", "electron", "nextjs", "dashboard"],
  icons: [
    { rel: "apple-touch-icon", type: "image/png", url: "/img/horizon.png" }
  ],
  generator: process.env.NEXT_PUBLIC_GENERATOR,
  authors: [{ name: "Jorge Méndez", url: "https://programandoweb.net" }],
  creator: process.env.NEXT_PUBLIC_AUTHOR,
  manifest: "/manifest.json",

  openGraph: {
    title,
    description,
    url,
    type: "website",
    images: [
      {
        url: image,
        width: 1200,
        height: 630,
        alt: "Imagen Open Graph",
      },
    ],  
  },

  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [image],
  },

  other: {
    ["fb:app_id"]: fbAppId,
  },
};

/**
 * VIEWPORT
 */
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

/**
 * LAYOUT
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className="h-full w-full overflow-x-hidden touch-manipulation bg-[#f4f6fb]"
    >
      <body
        id="__next"
        className={`${inter.className} h-full w-full overflow-x-hidden overscroll-none`}
      >
        <Providers>
          <ThemeProvider>
            <Suspense fallback={<div>Loading...</div>}>
              <ToastListener/>
              <Snackbar />
              {children}        
            </Suspense>
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  );
}