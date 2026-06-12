'use client';
import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';
import { useProgress } from '@bprogress/next';
import { forwardRef } from 'react';

// Get the original Link component from next-intl
const { Link: NextIntlLink } = createNavigation(routing);

// Enhanced Link component with progress bar support
const ProgressLink = forwardRef<
  React.ElementRef<typeof NextIntlLink>,
  React.ComponentPropsWithoutRef<typeof NextIntlLink>
>(({ onClick, ...props }, ref) => {
  const { start } = useProgress();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Only start progress for actual navigation (not hash links or external)
    if (props.href && !props.href.toString().startsWith('#') && !props.href.toString().startsWith('http')) {
      start();
    }
    
    // Call original onClick if provided
    onClick?.(e);
  };

  return <NextIntlLink ref={ref} onClick={handleClick} {...props} />;
});

ProgressLink.displayName = 'ProgressLink';

export default ProgressLink;
