import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig = {
  env: {
    NURO_DESIGN_MODE: process.env.NURO_DESIGN_MODE ?? "",
  },
  serverExternalPackages: ["pino", "thread-stream"],
  turbopack: {
    root: '.',
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },
  webpack(config) {
    const fileLoaderRule = config.module.rules.find((rule) =>
      rule.test?.test?.('.svg'),
    )

    config.module.rules.push(
      // Reapply the existing rule, but only for svg imports ending in ?url
      {
        ...fileLoaderRule,
        test: /\.svg$/i,
        resourceQuery: /url/, // *.svg?url
      },
      // Convert all other *.svg imports to React components
      {
        test: /\.svg$/i,
        issuer: fileLoaderRule.issuer,
        resourceQuery: { not: [...fileLoaderRule.resourceQuery.not, /url/] }, // exclude if *.svg?url
        use: ['@svgr/webpack'],
      },
    )

    // Modify the file loader rule to ignore *.svg, since we have it handled now.
    fileLoaderRule.exclude = /\.svg$/i

    return config
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3845',
        pathname: '/assets/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
    ],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Static-public landing routes removed — hackathon repo is dashboard-only.
  // Permanent (308) redirects for deprecated routes. Picks up at request
  // time before any locale middleware. /dashboard/my-card-1 is the canonical
  // card surface (sidebar nav). The other two were dev/QA variants.
  async redirects() {
    return [
      { source: '/dashboard/my-card', destination: '/dashboard/my-card-1', permanent: true },
      { source: '/dashboard/my-card-v2', destination: '/dashboard/my-card-1', permanent: true },
      { source: '/:locale/dashboard/my-card', destination: '/:locale/dashboard/my-card-1', permanent: true },
      { source: '/:locale/dashboard/my-card-v2', destination: '/:locale/dashboard/my-card-1', permanent: true },
    ];
  },
  async rewrites() {
    return [];
  },
};

export default withNextIntl(nextConfig);
