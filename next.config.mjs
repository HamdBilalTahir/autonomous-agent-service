/** @type {import('next').NextConfig} */
const nextConfig = {
  // TurboPack is standard in 2026
  reactStrictMode: true,
  poweredByHeader: false,
  
  // Advanced optimization for modern deployments
  compress: true,
  
  // Logging configuration for better debugging
  logging: {
    fetches: {
      fullUrl: true,
    },
  },

  // Image optimization with stricter security
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },

  // Experimental features that are stable or recommended in 2026 context
  experimental: {
    // Typed routes are standard practice
    typedRoutes: true,
    // Optimized package imports
    optimizePackageImports: ['lucide-react', 'date-fns', 'lodash'],
    // Server Actions are fully stable, no flag needed usually but explicit config helps
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
