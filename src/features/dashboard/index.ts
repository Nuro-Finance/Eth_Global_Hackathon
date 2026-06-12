// Dashboard feature exports

// Overview components
export { default as StatisticsChart } from './overview/components/StatisticsChart';
export { default as BarChartWidget } from './overview/components/BarChartWidget';
export { default as SmartInvestPanel } from './overview/components/SmartInvestPanel';
export { default as TransactionsPanel } from './overview/components/TransactionsPanel';
export { WorldMapWidget } from './overview/components/WorldMapWidget';

// Card section
export * from './overview/components/CardSection';

// Analytics layouts and components
export { AnalyticsGrid, CategoryChart, RevenueChart } from './analytics';

// Cards components
export { CardDetails, CardListItem, CardsHeader } from './cards';
export type { Card } from './cards';

// Settings components
export {
    SettingsNavigation,
    ProfileContent,
    SecurityContent,
    NotificationsContent,
    PreferencesContent,
    SettingRow,
} from './settings';

// Transactions components (from restructured module)
export {
    TransactionsGrid,
    TransactionActions,
    TransactionsTable,
} from './transactions';

// Transactions types
export type {
    Transaction,
    TransactionFormData,
    FilterData,
    TransactionStatus,
    TransactionType,
    TransactionCategory,
} from './transactions';

// Quick Transfer
export { default as QuickTransferSheet } from './overview/layouts/DashboardGrid/components/DashboardHeader/components/QuickTransferSheet';
