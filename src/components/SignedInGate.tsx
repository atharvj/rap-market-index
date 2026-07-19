"use client";

import { useAuth } from "@/components/AuthProvider";
import { RmiButton } from "@/components/RmiPrimitives";
import { LockKeyhole } from "lucide-react";

export function SignedInGate({ title, description }: { title: string; description: string }) {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="mx-auto max-w-xl" role="status" aria-label="Checking account status">
        <div className="rmi-card p-8">
          <div className="rmi-skeleton mx-auto h-12 w-12 rounded-full" />
          <div className="rmi-skeleton mx-auto mt-4 h-7 w-48" />
          <div className="rmi-skeleton mx-auto mt-3 h-4 w-full max-w-sm" />
          <div className="rmi-skeleton mx-auto mt-2 h-4 w-4/5 max-w-xs" />
          <span className="sr-only">Checking account status</span>
        </div>
      </div>
    );
  }

  return (
    <section className="mx-auto grid min-h-[360px] max-w-xl place-items-center text-center">
      <div className="rmi-card w-full p-8">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-panelSoft text-cyan">
          <LockKeyhole className="h-5 w-5" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-2xl font-bold">{title}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-paper/60">{description}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <RmiButton href="/account?mode=signin">Log In</RmiButton>
          <RmiButton href="/account?mode=signup" variant="secondary">Create Account</RmiButton>
        </div>
      </div>
    </section>
  );
}
