/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Inclut le binaire Chromium (@sparticuz/chromium) dans les fonctions PDF —
  // les .br sont lus à l'exécution, donc pas tracés automatiquement par Next.
  experimental: {
    outputFileTracingIncludes: {
      '/api/customer-invoices/[id]/pdf': ['./node_modules/@sparticuz/chromium/bin/**'],
      '/api/projects/[id]/devis-pdf': ['./node_modules/@sparticuz/chromium/bin/**'],
    },
  },
}

module.exports = nextConfig
