"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function PulsanteAccessoGoogle({ etichetta }: { etichetta: string }) {
  const [attesa, setAttesa] = useState(false);
  return (
    <button
      type="button"
      disabled={attesa}
      onClick={async () => {
        setAttesa(true);
        await authClient.signIn.social({ provider: "google", callbackURL: "/onboarding" });
      }}
      className="flex w-full items-center justify-center gap-3 rounded-lg bg-accent-strong px-4 py-3 font-medium text-accent-contrast transition hover:bg-accent disabled:opacity-60"
    >
      <svg aria-hidden viewBox="0 0 24 24" className="size-5">
        <path fill="currentColor" d="M21.35 11.1H12v2.9h5.35c-.23 1.4-1.64 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.95S8.78 6.2 12 6.2c1.83 0 3.06.78 3.76 1.45l2.57-2.47C16.68 3.64 14.54 2.7 12 2.7 6.87 2.7 2.7 6.87 2.7 12s4.17 9.3 9.3 9.3c5.37 0 8.93-3.77 8.93-9.08 0-.61-.07-1.08-.16-1.52Z" />
      </svg>
      {etichetta}
    </button>
  );
}
