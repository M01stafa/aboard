"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/core/supabase";
import { openDb, closeDb } from "@/core/db";
import type { User } from "@supabase/supabase-js";

export async function checkAuthAndRedirect(
  getUser: () => Promise<{ data: { user: User | null } }>,
  redirect: (path: string) => void
): Promise<User | null> {
  const { data } = await getUser();
  if (!data.user) {
    redirect("/login");
    return null;
  }
  return data.user;
}

interface AuthGuardProps {
  children: ReactNode | ((props: { user: User }) => ReactNode);
  fallback?: ReactNode;
}

export function AuthGuard({ children, fallback = null }: AuthGuardProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    checkAuthAndRedirect(
      () => supabase.auth.getUser(),
      (path) => router.replace(path)
    ).then(async (authenticatedUser) => {
      if (!mounted) return;
      if (authenticatedUser) {
        await openDb(authenticatedUser.id);
        setUser(authenticatedUser);
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        if (!session?.user) {
          setUser(null);
          await closeDb();
          router.replace("/login");
          return;
        }

        await openDb(session.user.id);
        setUser(session.user);
        setLoading(false);

        // Path A (Task 34 / §10.1): outside synchronous callback to prevent deadlock
        const refresh = session.provider_refresh_token ?? null;
        if (event === "SIGNED_IN" && refresh) {
          setTimeout(async () => {
            try {
              await supabase.functions.invoke("drive-link-token", {
                body: { refresh_token: refresh },
              });
              await supabase.auth.refreshSession();
            } catch {
              // Non-blocking
            }
          }, 0);
        }
      }
    );

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [router]);

  if (loading || !user) {
    return <>{fallback}</>;
  }

  return (
    <>
      {typeof children === "function"
        ? (children as (props: { user: User }) => ReactNode)({ user })
        : children}
    </>
  );
}
