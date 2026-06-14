'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '@/store/store';
import { checkAuthStatus, hydrateFromPrivyUser } from '@/store/slices/authSlice';
import { DESIGN_MODE } from '@/config/design-mode';
import {
  DEMO_USER_EMAIL,
  DEMO_USER_FULL_NAME,
  DEMO_USER_ID,
  isDemoDevSession,
} from '@/config/demo-user';
import { persistAppUser, userFromSession } from '@/lib/persistAppUser';

export default function AuthInitializer({ children }: { children: React.ReactNode }) {
  const dispatch = useDispatch<AppDispatch>();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === 'loading') return;

    if (status === 'authenticated') {
      const sessionUser = session?.user as
        | { id?: string; email?: string | null; name?: string | null }
        | undefined;

      if (sessionUser && isDemoDevSession(sessionUser)) {
        const demoUser = {
          id: DEMO_USER_ID,
          email: DEMO_USER_EMAIL,
          name: DEMO_USER_FULL_NAME,
          role: 'admin' as const,
        };
        dispatch(hydrateFromPrivyUser(demoUser));
        persistAppUser(demoUser, 'demo');
        return;
      }

      const fromSession = sessionUser ? userFromSession(sessionUser) : null;
      if (fromSession) {
        dispatch(hydrateFromPrivyUser(fromSession));
        persistAppUser(fromSession);
        return;
      }

      dispatch(checkAuthStatus());
      return;
    }

    if (DESIGN_MODE) {
      dispatch(hydrateFromPrivyUser({
        id: DEMO_USER_ID,
        email: DEMO_USER_EMAIL,
        name: DEMO_USER_FULL_NAME,
        role: "admin"
      }));
      return;
    }

    dispatch(checkAuthStatus());
  }, [dispatch, status, session?.user]);

  return <>{children}</>;
}
