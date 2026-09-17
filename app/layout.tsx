import type { Metadata, Viewport } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: {
    default: "Build Demo | Premium Home Builder Sydney",
    template: "%s | Build Demo",
  },
  description:
    "Sydney's residential construction specialists for new homes, duplexes, knockdown rebuilds, granny flats and multi-dwelling developments.",
  keywords: [
    "home builder Sydney",
    "new homes Sydney",
    "duplex builder",
    "knockdown rebuild",
    "granny flat builder",
    "residential construction",
    "custom home builder Western Sydney",
  ],
  openGraph: {
    type: "website",
    locale: "en_AU",
    siteName: "Build Demo",
  },
  // iOS ignores the web manifest for home screen icons and full-screen mode,
  // so both have to be declared here as well as there.
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "Site Diary",
    // Matches the app's own background, so the status bar does not sit in a
    // white strip above a near-black screen.
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#1C1C1E",
  // The admin is a dark app; telling the browser stops form controls and
  // scrollbars rendering light against it.
  colorScheme: "dark light",
  // Lets the app draw under the notch when installed to the home screen.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <head>
        {/* Applied before the first paint, so a staff user who has chosen the
            light background never gets a black flash on the way in. Scoped to
            .admin-shell in globals.css, so the marketing site is unaffected
            whatever this says. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{document.documentElement.dataset.adminTheme=localStorage.getItem('sd_admin_theme')==='light'?'light':'dark'}catch(e){}",
          }}
        />
      </head>
      <body>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#1C1B19",
              color: "#F7F4ED",
              border: "1px solid #B5694A",
            },
          }}
        />
      </body>
    </html>
  );
}
