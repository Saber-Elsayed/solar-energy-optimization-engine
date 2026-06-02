import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { auth } from '@/lib/firebase';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  isEmailVerified: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshUser: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
    await credential.user.reload();
    setUser(auth.currentUser);
  };

  const signUp = async (email: string, password: string) => {
    const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await sendEmailVerification(credential.user);
    setUser(credential.user);
  };

  const logout = async () => {
    await signOut(auth);
  };

  const resendVerificationEmail = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('No signed-in user. Please log in again.');
    }
    await sendEmailVerification(currentUser);
  }, []);

  const refreshUser = useCallback(async (): Promise<boolean> => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return false;
    }
    await currentUser.reload();
    const updatedUser = auth.currentUser;
    setUser(updatedUser);
    return updatedUser?.emailVerified ?? false;
  }, []);

  const isEmailVerified = user?.emailVerified ?? false;

  const value = useMemo(
    () => ({
      user,
      loading,
      isEmailVerified,
      signIn,
      signUp,
      logout,
      resendVerificationEmail,
      refreshUser,
    }),
    [user, loading, isEmailVerified, resendVerificationEmail, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
