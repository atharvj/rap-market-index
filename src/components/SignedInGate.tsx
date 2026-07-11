"use client";

import { useAuth } from "@/components/AuthProvider";
import { RmiButton } from "@/components/RmiPrimitives";
import { LockKeyhole } from "lucide-react";

export function SignedInGate({ title, description }: { title: string; description: string }) {
  const { loading } = useAuth();

  if (loading) {
    return <div className="mx-auto h-64 max-w-xl rounded-xl bg-panelSoft motion-safe:animate-pulse" />;
  }

  return (
    <section className="mx-auto grid min-h-[360px] max-w-xl place-items-center text-center">
      <div className="rmi-card w-full p-8">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-panelSoft text-cyan">
          <LockKeyhole className="h-5 w-5" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-2xl font-black">{title}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-paper/60">{description}</p>
        <div className="mt-5 flex justify-center gap-2">
          <RmiButton href="/account?mode=signin">Log In</RmiButton>
          <RmiButton href="/account?mode=signup" variant="secondary">Create Account</RmiButton>
        </div>
      </div>
    </section>
  );
}
