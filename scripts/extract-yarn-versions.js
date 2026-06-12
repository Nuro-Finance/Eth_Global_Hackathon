const fs = require('fs');
const lock = fs.readFileSync(0, 'utf8'); // read from stdin

const packages = [
  '@anthropic-ai/sdk', '@bprogress/next', '@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities',
  '@hookform/resolvers', '@privy-io/react-auth',
  '@radix-ui/react-checkbox', '@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu',
  '@radix-ui/react-label', '@radix-ui/react-popover', '@radix-ui/react-select',
  '@radix-ui/react-separator', '@radix-ui/react-slot', '@radix-ui/react-tabs', '@radix-ui/react-tooltip',
  '@reduxjs/toolkit', '@tabler/icons-react', '@tanstack/react-table',
  'class-variance-authority', 'clsx', 'date-fns', 'dom-to-image', 'framer-motion', 'lucide-react',
  'next', 'next-auth', 'next-intl', 'ogl', 'qrcode', 'react', 'react-day-picker', 'react-dom',
  'react-hook-form', 'react-phone-number-input', 'react-redux', 'react-simple-maps', 'recharts',
  'tailwind-merge', 'wagmi', 'zod',
  'tailwindcss', 'postcss', 'autoprefixer', 'eslint-config-next',
  '@types/react', '@types/react-dom', '@types/qrcode',
  '@svgr/webpack', '@tailwindcss/postcss',
];

// Walk yarn.lock block by block. Each block starts with an unindented line,
// has blank separators, and contains a "  version: X" line.
const blocks = lock.split(/\n(?=\S)/);
const versions = {};
for (const blk of blocks) {
  const firstLine = blk.split('\n', 1)[0];
  const verMatch = blk.match(/\n  version: ([^\n]+)/);
  if (!verMatch) continue;
  const version = verMatch[1].trim().replace(/^"|"$/g, '');
  // firstLine looks like: "pkg@npm:range":  or  "pkg@npm:range, pkg2@npm:range2":
  // Extract every package name in the key
  const keyStr = firstLine.replace(/^"|":\s*$/g, '');
  const keys = keyStr.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
  for (const key of keys) {
    // key is like "pkg@npm:range" or "@scope/pkg@npm:range"
    const m = key.match(/^(@?[^@]+)@npm:/);
    if (m) {
      const name = m[1];
      if (!versions[name]) versions[name] = version; // first wins (matches install-time choice)
    }
  }
}

const out = [];
for (const pkg of packages) {
  out.push(pkg + ' → ' + (versions[pkg] || 'NOT_IN_LOCK'));
}
console.log(out.join('\n'));
