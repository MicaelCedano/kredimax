import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEMO_PORTAL_SNAPSHOT } from "../demo/demo-data";
import {
  loginWithCedulaAndPassword,
  updateCustomerPassword,
} from "../services/api-client";
import {
  clearPortalSession,
  loadPortalSession,
  savePortalSession,
  type StoredPortalSession,
} from "../services/session-storage";
import type { AssignedExecutiveDto } from "../types/portal";
import {
  maskCedulaForDisplay,
  normalizeWhatsappPhone,
  validatePasswordAgainstCedula,
} from "../utils/formatters";

interface AuthContextValue {
  session: StoredPortalSession | null;
  isHydrating: boolean;
  selectedLoanId: string | null;
  setSelectedLoanId: (loanId: string) => void;
  executiveOverride: AssignedExecutiveDto | null;
  setExecutiveOverride: (exec: AssignedExecutiveDto | null) => void;
  enterDemoMode: (options?: { simulateFirstLoginPasswordChange?: boolean }) => Promise<void>;
  signInWithCedula: (
    cedula: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
  completeFirstTimePasswordChange: (
    newPassword: string,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<StoredPortalSession | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(
    DEMO_PORTAL_SNAPSHOT.loans[0]?.id ?? null,
  );
  const [executiveOverride, setExecutiveOverride] =
    useState<AssignedExecutiveDto | null>(null);

  useEffect(() => {
    let mounted = true;
    loadPortalSession()
      .then((stored) => {
        if (mounted && stored) {
          setSession(stored);
        }
      })
      .finally(() => {
        if (mounted) {
          setIsHydrating(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const enterDemoMode = useCallback(
    async (options?: { simulateFirstLoginPasswordChange?: boolean }) => {
      const demoSession: StoredPortalSession = {
        mode: "DEMO",
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
        maskedCedula: DEMO_PORTAL_SNAPSHOT.customer.maskedCedula,
        customerName: DEMO_PORTAL_SNAPSHOT.customer.fullName,
        mustChangePassword: Boolean(options?.simulateFirstLoginPasswordChange),
      };
      setSelectedLoanId(DEMO_PORTAL_SNAPSHOT.loans[0]?.id ?? null);
      setSession(demoSession);
      await savePortalSession(demoSession);
    },
    [],
  );

  const signInWithCedula = useCallback(async (cedula: string, password: string) => {
    const result = await loginWithCedulaAndPassword({
      cedula,
      password,
      allowDemoFallback: true,
    });
    if (!result.ok) {
      return { ok: false as const, message: result.message };
    }
    setSession(result.session);
    await savePortalSession(result.session);
    return { ok: true as const };
  }, []);

  const completeFirstTimePasswordChange = useCallback(
    async (newPassword: string) => {
      if (!session) {
        return { ok: false as const, message: "No hay una sesión activa." };
      }
      const policy = validatePasswordAgainstCedula(
        newPassword,
        maskCedulaForDisplay(session.maskedCedula),
      );
      if (!policy.valid) {
        return { ok: false as const, message: policy.reason };
      }

      const apiResult = await updateCustomerPassword(session, { newPassword });
      if (!apiResult.ok) {
        return { ok: false as const, message: apiResult.message };
      }

      const updated: StoredPortalSession = {
        ...session,
        mustChangePassword: false,
      };
      setSession(updated);
      await savePortalSession(updated);
      return { ok: true as const };
    },
    [session],
  );

  const signOut = useCallback(async () => {
    setSession(null);
    await clearPortalSession();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isHydrating,
      selectedLoanId,
      setSelectedLoanId,
      executiveOverride,
      setExecutiveOverride,
      enterDemoMode,
      signInWithCedula,
      completeFirstTimePasswordChange,
      signOut,
    }),
    [
      session,
      isHydrating,
      selectedLoanId,
      executiveOverride,
      enterDemoMode,
      signInWithCedula,
      completeFirstTimePasswordChange,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }
  return ctx;
}
