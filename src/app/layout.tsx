import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], display: "swap", weight: ["500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "TonPilote — Assistant administratif artisan",
  description: "L'app des artisans pour piloter leurs chantiers et leur entreprise, simplement.",
  manifest: "/manifest.json",
  // Installable sur l'écran d'accueil (iOS + Android/desktop).
  appleWebApp: { capable: true, title: "TonPilote", statusBarStyle: "default" },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#E0674C",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" data-pole="commercial" className={`${inter.variable} ${jakarta.variable} h-full`}>
      <body className="min-h-full bg-app-bg antialiased">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
