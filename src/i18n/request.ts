import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';

// Helper function to deep merge objects
function deepMerge<T extends Record<string, unknown>>(target: T, ...sources: T[]): T {
  if (!sources.length) return target;
  const source = sources.shift();

  if (source === undefined) return target;

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} });
        deepMerge(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    }
  }

  return deepMerge(target, ...sources);
}

function isObject(item: unknown): item is Record<string, unknown> {
  return item !== null && typeof item === 'object' && !Array.isArray(item);
}

export default getRequestConfig(async ({ requestLocale }) => {
  // Typically corresponds to the `[locale]` segment
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  // Import all message files and merge them
  const [
    common,
    auth,
    dashboardOverview,
    dashboardTransactions,
    dashboardCards,
    dashboardSettings,
  ] = await Promise.all([
    import(`../../messages/common/${locale}.json`),
    import(`../../messages/auth/${locale}.json`),
    import(`../../messages/dashboard/overview/${locale}.json`),
    import(`../../messages/dashboard/transactions/${locale}.json`),
    import(`../../messages/dashboard/cards/${locale}.json`),
    import(`../../messages/dashboard/settings/${locale}.json`),
  ]);

  // Merge all messages into a single object
  const messages = deepMerge(
    {},
    common.default,
    auth.default,
    dashboardOverview.default,
    dashboardTransactions.default,
    dashboardCards.default,
    dashboardSettings.default,
  );

  return {
    locale,
    messages
  };
});
