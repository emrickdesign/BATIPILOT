import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdfkit', 'mammoth', 'xlsx'],
};

export default nextConfig;
