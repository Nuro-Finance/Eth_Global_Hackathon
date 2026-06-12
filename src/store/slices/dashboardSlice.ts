import { createSlice, PayloadAction } from '@reduxjs/toolkit';

// Types
export interface DashboardStats {
  totalBalance: number;
  monthlyChange: number;
  totalTransactions: number;
  pendingTransactions: number;
}

export interface DashboardState {
  stats: DashboardStats;
  isLoading: boolean;
  lastUpdated: string | null;
  currency: 'USD' | 'GBP' | 'JPY';
  theme: 'dark' | 'light';
  sidebarCollapsed: boolean;
}

// Initial state
const initialState: DashboardState = {
  stats: {
    totalBalance: 0,
    monthlyChange: 0,
    totalTransactions: 0,
    pendingTransactions: 0,
  },
  isLoading: false,
  lastUpdated: null,
  currency: 'USD',
  theme: 'dark',
  sidebarCollapsed: false,
};

// Slice
const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    updateStats: (state, action: PayloadAction<Partial<DashboardStats>>) => {
      state.stats = { ...state.stats, ...action.payload };
      state.lastUpdated = new Date().toISOString();
    },
    setCurrency: (state, action: PayloadAction<'USD' | 'GBP' | 'JPY'>) => {
      state.currency = action.payload;
    },
    setTheme: (state, action: PayloadAction<'dark' | 'light'>) => {
      state.theme = action.payload;
    },
    toggleSidebar: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    refreshData: (state) => {
      state.isLoading = true;
      state.lastUpdated = new Date().toISOString();
    },
  },
});

export const {
  updateStats,
  setCurrency,
  setTheme,
  toggleSidebar,
  setLoading,
  refreshData,
} = dashboardSlice.actions;

export default dashboardSlice.reducer;
