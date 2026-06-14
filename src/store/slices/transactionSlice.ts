import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';

// Types
export interface Transaction {
  id: string;
  type: 'incoming' | 'outgoing';
  amount: number;
  currency: string;
  description: string;
  from?: string;
  to?: string;
  date: string;
  status: 'completed' | 'pending' | 'failed';
  category: 'transfer' | 'payment' | 'investment' | 'other';
}

export interface TransactionState {
  transactions: Transaction[];
  isLoading: boolean;
  error: string | null;
  filters: {
    type: 'all' | 'incoming' | 'outgoing';
    status: 'all' | 'completed' | 'pending' | 'failed';
    dateRange: '7d' | '30d' | '90d' | 'all';
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

// Legacy - real transactions now come from useTransactionsState hook via /api/transactions
const demoTransactions: Transaction[] = [];

// Async thunks
export const fetchTransactions = createAsyncThunk(
  'transactions/fetchTransactions',
  async (params: { page?: number; limit?: number } = {}) => {
 // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const { page = 1, limit = 10 } = params;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    
    return {
      transactions: demoTransactions.slice(startIndex, endIndex),
      total: demoTransactions.length,
      page,
      limit,
    };
  }
);

export const createTransaction = createAsyncThunk(
  'transactions/createTransaction',
  async (transactionData: Omit<Transaction, 'id' | 'date' | 'status'>) => {
 // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const newTransaction: Transaction = {
      ...transactionData,
      id: Date.now().toString(),
      date: new Date().toISOString(),
      status: 'pending',
    };
    
    return newTransaction;
  }
);

// Initial state
const initialState: TransactionState = {
  transactions: [],
  isLoading: false,
  error: null,
  filters: {
    type: 'all',
    status: 'all',
    dateRange: '30d',
  },
  pagination: {
    page: 1,
    limit: 10,
    total: 0,
  },
};

// Slice
const transactionSlice = createSlice({
  name: 'transactions',
  initialState,
  reducers: {
    setFilters: (state, action: PayloadAction<Partial<TransactionState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    setPagination: (state, action: PayloadAction<Partial<TransactionState['pagination']>>) => {
      state.pagination = { ...state.pagination, ...action.payload };
    },
    clearError: (state) => {
      state.error = null;
    },
    updateTransactionStatus: (state, action: PayloadAction<{ id: string; status: Transaction['status'] }>) => {
      const transaction = state.transactions.find(t => t.id === action.payload.id);
      if (transaction) {
        transaction.status = action.payload.status;
      }
    },
  },
  extraReducers: (builder) => {
    builder
 // Fetch transactions
      .addCase(fetchTransactions.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchTransactions.fulfilled, (state, action) => {
        state.isLoading = false;
        state.transactions = action.payload.transactions;
        state.pagination = {
          page: action.payload.page,
          limit: action.payload.limit,
          total: action.payload.total,
        };
      })
      .addCase(fetchTransactions.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to fetch transactions';
      })
 // Create transaction
      .addCase(createTransaction.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(createTransaction.fulfilled, (state, action) => {
        state.isLoading = false;
        state.transactions.unshift(action.payload);
      })
      .addCase(createTransaction.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to create transaction';
      });
  },
});

export const {
  setFilters,
  setPagination,
  clearError,
  updateTransactionStatus,
} = transactionSlice.actions;

export default transactionSlice.reducer;
