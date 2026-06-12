import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig = {
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
  // Static-public landing routes — rewrite "/skills" and "/skills/" to the
  // index.html in the public/skills/ directory so the URL doesn't need
  // an explicit .html. Other architecture pages already have .html in
  // their URLs so they don't need rewrites here. (S35 Marathon 11.)
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
    return [
      { source: '/skills', destination: '/skills/index.html' },
      { source: '/skills/', destination: '/skills/index.html' },
      { source: '/agents', destination: '/agents/index.html' },
      { source: '/agents/', destination: '/agents/index.html' },
      // Skill detail subpages — each /skills/<slug>/ has its own index.html
      // in public/skills/<slug>/. Without these rewrites Next.js 404s on
      // bare-trailing-slash URLs because it doesn't auto-serve subdir
      // index.html in production. Pattern matches anything that's NOT
      // a file (no dot in segment) so /skills/manifest.json passes through.
      { source: '/skills/helm-threat-intel', destination: '/skills/helm-threat-intel/index.html' },
      { source: '/skills/helm-threat-intel/', destination: '/skills/helm-threat-intel/index.html' },
      { source: '/skills/huginn-counsel', destination: '/skills/huginn-counsel/index.html' },
      { source: '/skills/huginn-counsel/', destination: '/skills/huginn-counsel/index.html' },
      { source: '/skills/markets-resolved', destination: '/skills/markets-resolved/index.html' },
      { source: '/skills/markets-resolved/', destination: '/skills/markets-resolved/index.html' },
      { source: '/skills/sandbox-spawn', destination: '/skills/sandbox-spawn/index.html' },
      { source: '/skills/sandbox-spawn/', destination: '/skills/sandbox-spawn/index.html' },
      // /contracts (no .html) was linked from /agents + /skills nav/footer
      // but never had a rewrite — middleware was matching it and trying to
      // route to /en/contracts. Map both bare + trailing-slash to the
      // existing public/contracts.html.
      { source: '/contracts', destination: '/contracts.html' },
      { source: '/contracts/', destination: '/contracts.html' },
    ];
  },
};

export default withNextIntl(nextConfig);
