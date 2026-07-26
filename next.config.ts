import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdfkit', 'mammoth', 'xlsx'],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  async rewrites() {
    return {
      // La page d'accueil `/` sert la landing statique de vente (public/landing/index.html)
      // sans changer l'URL. beforeFiles permet de surcharger l'éventuelle route /.
      beforeFiles: [
        { source: '/', destination: '/landing/index.html' },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
