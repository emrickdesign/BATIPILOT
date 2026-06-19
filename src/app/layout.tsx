import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "BatiPilot — Assistant administratif artisan",
  description: "Gérez vos mails, devis et factures en quelques clics",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${geist.variable} h-full`}>
      <body className="min-h-full bg-gray-50 antialiased">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
