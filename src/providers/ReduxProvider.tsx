"use client";

import { Provider } from "react-redux";
import { store } from "@/store/store";
import AuthInitializer from "@/features/auth/AuthInitializer";

interface ReduxProviderProps {
  children: React.ReactNode;
}

export default function ReduxProvider({ children }: ReduxProviderProps) {
  return (
    <Provider store={store}>
      <AuthInitializer>{children}</AuthInitializer>
    </Provider>
  );
}
