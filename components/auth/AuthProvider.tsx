"use client";

import { SessionProvider, useSession } from "next-auth/react";
import { createContext, useContext, useMemo, type ReactNode } from "react";

/**
 * One small auth context the rest of the app reads via `useAuth()`. It wraps
 * NextAuth's SessionProvider, but only when auth is actually configured.
 *
 * In open mode (no AUTH_SECRET) we never mount SessionProvider — otherwise it
 * would poll `/api/auth/session`, which has no secret to decode — and report a
 * stable unauthenticated state, so the client stores quietly fall back to
 * localStorage exactly as before. `authEnabled` is computed on the server and
 * is constant for the app's lifetime, so the tree shape never changes.
 */
export type AuthState = {
  enabled: boolean;
  status: "loading" | "authenticated" | "unauthenticated";
  userId: string | null;
  name: string | null;
};

const Ctx = createContext<AuthState>({
  enabled: false,
  status: "unauthenticated",
  userId: null,
  name: null,
});

export function AuthProvider({
  authEnabled,
  children,
}: {
  authEnabled: boolean;
  children: ReactNode;
}) {
  if (!authEnabled) {
    return (
      <Ctx.Provider
        value={{ enabled: false, status: "unauthenticated", userId: null, name: null }}
      >
        {children}
      </Ctx.Provider>
    );
  }
  return (
    <SessionProvider>
      <Bridge>{children}</Bridge>
    </SessionProvider>
  );
}

function Bridge({ children }: { children: ReactNode }) {
  const { data, status } = useSession();
  const value = useMemo<AuthState>(
    () => ({
      enabled: true,
      status,
      userId: data?.user?.id ?? null,
      name: data?.user?.name ?? null,
    }),
    [status, data?.user?.id, data?.user?.name]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  return useContext(Ctx);
}
