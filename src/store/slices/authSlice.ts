import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';

// Types
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: 'admin' | 'user';
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

// Demo credentials
export const DEMO_CREDENTIALS = {
  email: 'admin@dashboard.com',
  password: 'Admin@123',
  user: {
    id: '1',
    email: 'admin@dashboard.com',
    name: 'John Carter',
    avatar: '/assets/images/avatar/person/person.png',
    role: 'admin' as const,
  }
};

// Async thunks
export const loginUser = createAsyncThunk(
  'auth/loginUser',
  async (credentials: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid credentials');
      }
      // Store token and user for persistence
      localStorage.setItem('auth_token', data.accessToken);
      const user: User = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        role: 'admin',
      };
      localStorage.setItem('user', JSON.stringify(user));
      return user;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Login failed');
    }
  }
);

export const logoutUser = createAsyncThunk('auth/logoutUser', async () => {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('user');
  return null;
});

export const checkAuthStatus = createAsyncThunk('auth/checkAuthStatus', async () => {
  const token = localStorage.getItem('auth_token');
  const userStr = localStorage.getItem('user');

  if (token && userStr) {
    return JSON.parse(userStr) as User;
  }

  return null;
});

// Initial state
const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
};

// Slice
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    updateUser: (state, action: PayloadAction<Partial<User>>) => {
      // 2026-05-25 fix: previously this was a NO-OP when state.user was null,
      // which meant BackendUserSync's /api/users/me response never landed in
      // Redux on hard-refresh in flows where Privy wasn't authenticated
      // (Google OAuth path with Privy disabled). Sidebar would forever show
      // "Guest Account" even though the NextAuth session cookie was valid
      // and the backend was returning real user data.
      //
      // Now: hydrate state.user from the patch when null. Mark authenticated
      // if the patch carries identifying fields. The patch shape is
      // Partial<User> so we cast through unknown and only flip
      // isAuthenticated when we have enough to render a real user.
      if (state.user) {
        state.user = { ...state.user, ...action.payload };
      } else if (action.payload.name || action.payload.email || action.payload.id) {
        // Build a minimal User from the patch — fields not provided default
        // to safe placeholders. role defaults to 'user' since BackendUserSync
        // doesn't currently return role.
        state.user = {
          id: action.payload.id ?? "",
          email: action.payload.email ?? "",
          name: action.payload.name ?? "",
          avatar: action.payload.avatar,
          role: action.payload.role ?? "user",
        };
        state.isAuthenticated = true;
        state.isLoading = false;
      }
    },
    hydrateFromPrivyUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
      state.isAuthenticated = true;
      state.isLoading = false;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Login
      .addCase(loginUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload;
        state.isAuthenticated = true;
        state.error = null;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        state.isAuthenticated = false;
        state.user = null;
      })
      // Logout
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.isAuthenticated = false;
        state.error = null;
      })
      // Check auth status
      .addCase(checkAuthStatus.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(checkAuthStatus.fulfilled, (state, action) => {
        if (action.payload) {
          state.user = action.payload;
          state.isAuthenticated = true;
        } else {
          state.user = null;
          state.isAuthenticated = false;
        }
        state.isLoading = false;
      })
      .addCase(checkAuthStatus.rejected, (state) => {
        state.user = null;
        state.isAuthenticated = false;
        state.isLoading = false;
      });
  },
});

export const { clearError, updateUser, hydrateFromPrivyUser } = authSlice.actions;
export default authSlice.reducer;
