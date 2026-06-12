'use client';

import { useEffect } from 'react';

interface LocaleHandlerProps {
  locale: string;
}

/**
 * Client component to handle locale-specific DOM updates
 * Sets the language and direction attributes on the document element
 */
export default function LocaleHandler({ locale }: LocaleHandlerProps) {
  useEffect(() => {
    // Set language and direction attributes
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  }, [locale]);

  return null;
}
