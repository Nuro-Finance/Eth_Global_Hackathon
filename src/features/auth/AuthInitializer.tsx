'use client';

import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '@/store/store';
import { checkAuthStatus, hydrateFromPrivyUser } from '@/store/slices/authSlice';
import { DESIGN_MODE } from '@/config/design-mode';
import {
  DEMO_USER_EMAIL,
  DEMO_USER_FULL_NAME,
  DEMO_USER_ID,
} from '@/config/demo-user';

export default function AuthInitializer({ children }: { children: React.ReactNode }) {
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    if (DESIGN_MODE) {
      dispatch(hydrateFromPrivyUser({
        id: DEMO_USER_ID,
        email: DEMO_USER_EMAIL,
        name: DEMO_USER_FULL_NAME,
        role: "admin"
      }));
    } else {
      dispatch(checkAuthStatus());
    }
  }, [dispatch]);

  return <>{children}</>;
}
