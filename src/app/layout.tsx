import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], display: "swap", weight: ["500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "BatiPilot — Assistant administratif artisan",
  description: "L'app des artisans pour piloter leurs chantiers et leur entreprise, simplement.",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${jakarta.variable} h-full`}>
      <body className="min-h-full bg-[#FAFAF8] antialiased">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
