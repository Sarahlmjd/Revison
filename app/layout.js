import "./globals.css";
import RegisterSW from "./register-sw";

export const metadata = {
  title: "Mon plan de révision",
  description: "Planning de révision adaptatif : matières, chapitres, répétition espacée.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Révisions", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#141012",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Unbounded:wght@600;800;900&family=Space+Grotesk:wght@400;500;700&display=swap"
        />
      </head>
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
