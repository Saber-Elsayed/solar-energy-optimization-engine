import {

  createUserWithEmailAndPassword,

  onAuthStateChanged,

  signInWithEmailAndPassword,

  signOut,

  type User,

} from 'firebase/auth';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';



import { isAllowlistedAdminEmail } from '@/lib/admin-email-allowlist';
import { auth } from '@/lib/firebase';
import { sendUserVerificationEmail } from '@/lib/firebase-email-verification';

import {

  fetchRegistrationStatus,

  readApprovalFromToken,

  readIsAdminFromToken,

  submitRegistrationRequest,

  type RegistrationStatus,

} from '@/lib/firebase-registration-api';



type AuthContextValue = {

  user: User | null;

  loading: boolean;

  isEmailVerified: boolean;

  isAdmin: boolean;

  isApproved: boolean | null;

  registrationStatus: RegistrationStatus | null;

  signIn: (email: string, password: string) => Promise<void>;

  signUp: (email: string, password: string) => Promise<void>;

  logout: () => Promise<void>;

  resendVerificationEmail: () => Promise<void>;

  refreshUser: () => Promise<boolean>;

  refreshApprovalStatus: () => Promise<boolean>;

  completeEmailVerification: () => Promise<boolean>;

};



const AuthContext = createContext<AuthContextValue | undefined>(undefined);



export function AuthProvider({ children }: { children: ReactNode }) {

  const [user, setUser] = useState<User | null>(null);

  const [loading, setLoading] = useState(true);

  const [isAdmin, setIsAdmin] = useState(false);

  const [isApproved, setIsApproved] = useState<boolean | null>(null);

  const [registrationStatus, setRegistrationStatus] = useState<RegistrationStatus | null>(null);



  const loadApprovalState = useCallback(async (firebaseUser: User) => {

    if (!firebaseUser.emailVerified) {

      setIsAdmin(false);

      setIsApproved(false);

      setRegistrationStatus(null);

      return;

    }

    if (isAllowlistedAdminEmail(firebaseUser.email)) {
      setIsAdmin(true);
      setIsApproved(true);
      setRegistrationStatus('approved');
      return;
    }

    try {

      const status = await fetchRegistrationStatus(false);

      if (status.is_admin) {
        setIsAdmin(true);
        setIsApproved(true);
        setRegistrationStatus('approved');
        return;
      }

      const adminFromToken = await readIsAdminFromToken(false);
      setIsAdmin(adminFromToken);

      const approvedFromToken = await readApprovalFromToken(false);
      if (approvedFromToken) {
        setIsApproved(true);
        setRegistrationStatus('approved');
        return;
      }

      setRegistrationStatus(status.status);
      setIsApproved(status.status === 'approved' || status.approved);

    } catch {
      if (isAllowlistedAdminEmail(firebaseUser.email)) {
        setIsAdmin(true);
        setIsApproved(true);
        setRegistrationStatus('approved');
        return;
      }

      setIsAdmin(false);

      setRegistrationStatus('pending');

      setIsApproved(false);

    }

  }, []);



  useEffect(() => {

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {

      setLoading(true);

      setUser(firebaseUser);

      if (!firebaseUser) {

        setIsAdmin(false);

        setIsApproved(null);

        setRegistrationStatus(null);

        setLoading(false);

        return;

      }

      await loadApprovalState(firebaseUser);

      setLoading(false);

    });

    return unsubscribe;

  }, [loadApprovalState]);



  const signIn = async (email: string, password: string) => {

    const credential = await signInWithEmailAndPassword(auth, email.trim(), password);

    await credential.user.reload();

    const currentUser = auth.currentUser;

    setUser(currentUser);

    if (currentUser) {
      await loadApprovalState(currentUser);
    }

  };



  const signUp = async (email: string, password: string) => {

    const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);

    await sendUserVerificationEmail(credential.user);

    try {
      await submitRegistrationRequest();
    } catch {
      // Registration record can be created later; verification email is the priority.
    }

    setUser(credential.user);

    setIsAdmin(false);

    setRegistrationStatus('pending');

    setIsApproved(false);

  };



  const logout = async () => {

    await signOut(auth);

    setIsAdmin(false);

    setIsApproved(null);

    setRegistrationStatus(null);

  };



  const resendVerificationEmail = useCallback(async () => {

    const currentUser = auth.currentUser;

    if (!currentUser) {

      throw new Error('No signed-in user. Please log in again.');

    }

    await currentUser.reload();
    const refreshed = auth.currentUser;
    if (!refreshed) {
      throw new Error('No signed-in user. Please log in again.');
    }
    await sendUserVerificationEmail(refreshed);
  }, []);



  const refreshUser = useCallback(async (): Promise<boolean> => {

    const currentUser = auth.currentUser;

    if (!currentUser) {

      return false;

    }

    await currentUser.reload();

    const updatedUser = auth.currentUser;

    setUser(updatedUser);

    if (updatedUser?.emailVerified) {

      await loadApprovalState(updatedUser);

    }

    return updatedUser?.emailVerified ?? false;

  }, [loadApprovalState]);



  const refreshApprovalStatus = useCallback(async (): Promise<boolean> => {

    const currentUser = auth.currentUser;

    if (!currentUser) {

      return false;

    }

    const status = await fetchRegistrationStatus(true);

    if (status.is_admin) {
      setIsAdmin(true);
      setIsApproved(true);
      setRegistrationStatus('approved');
      return true;
    }

    const adminFromToken = await readIsAdminFromToken(true);
    setIsAdmin(adminFromToken);

    const approvedFromToken = await readApprovalFromToken(true);
    if (approvedFromToken) {
      setIsApproved(true);
      setRegistrationStatus('approved');
      return true;
    }

    setRegistrationStatus(status.status);
    setIsApproved(status.status === 'approved' || status.approved);
    return status.status === 'approved' || status.approved;
  }, []);

  const completeEmailVerification = useCallback(async (): Promise<boolean> => {
    const verified = await refreshUser();
    if (!verified) {
      return false;
    }

    const currentUser = auth.currentUser;
    if (!currentUser || isAllowlistedAdminEmail(currentUser.email)) {
      return verified;
    }

    try {
      const status = await submitRegistrationRequest();
      setRegistrationStatus(status.status);
      setIsApproved(status.approved);
      setIsAdmin(false);
    } catch {
      setRegistrationStatus('pending');
      setIsApproved(false);
      setIsAdmin(false);
    }

    await logout();
    return true;
  }, [refreshUser, logout]);

  const isEmailVerified = user?.emailVerified ?? false;



  const value = useMemo(

    () => ({

      user,

      loading,

      isEmailVerified,

      isAdmin,

      isApproved,

      registrationStatus,

      signIn,

      signUp,

      logout,

      resendVerificationEmail,

      refreshUser,

      refreshApprovalStatus,

      completeEmailVerification,

    }),

    [

      user,

      loading,

      isEmailVerified,

      isAdmin,

      isApproved,

      registrationStatus,

      resendVerificationEmail,

      refreshUser,

      refreshApprovalStatus,

      completeEmailVerification,

    ],

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


