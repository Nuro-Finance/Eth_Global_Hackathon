import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';
import ProgressLink from './ProgressLink';

// Lightweight wrappers around Next.js' navigation
// APIs that consider the routing configuration
const { redirect, usePathname, useRouter, getPathname } = createNavigation(routing);

// Export enhanced Link component with progress bar support
export const Link = ProgressLink;
export { redirect, usePathname, useRouter, getPathname };
