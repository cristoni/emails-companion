"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { eliminaAccountAzione } from "@/app/(app)/settings/azioni";
import { Pulsante } from "@/components/ui/pulsante";
import { authClient } from "@/lib/auth-client";

/**
 * "Elimina account" in due passaggi espliciti: il primo pulsante mostra le conseguenze, il secondo resta
 * disabilitato finché l'utente non dichiara di aver capito. Dopo la richiesta al server (che ferma subito
 * l'analisi e affida al worker scollegamento e cancellazione) la sessione viene chiusa e si torna all'accesso.
 */
export function EliminaAccount({ punti }: { punti: string[] }) {
  const t = useTranslations("impostazioni");
  const router = useRouter();
  const [aperto, setAperto] = useState(false);
  const [capito, setCapito] = useState(false);
  const [errore, setErrore] = useState(false);
  const [inCorso, avvia] = useTransition();
  const id = useId();
  const pannello = useRef<HTMLDivElement>(null);
  const eraAperto = useRef(false);

  // All'apertura il focus va al pannello; se l'utente annulla torna al pulsante iniziale.
  useEffect(() => {
    if (aperto) pannello.current?.focus();
    else if (eraAperto.current) document.getElementById(`${id}-apri`)?.focus();
    eraAperto.current = aperto;
  }, [aperto, id]);

  const elimina = () => {
    setErrore(false);
    avvia(async () => {
      const dati = new FormData();
      dati.set("conferma", "elimina");
      const stato = await eliminaAccountAzione(undefined, dati);
      if (stato?.esito !== "ok") {
        setErrore(true);
        return;
      }
      try {
        await authClient.signOut();
      } finally {
        router.replace("/sign-in");
        router.refresh();
      }
    });
  };

  if (!aperto) {
    return (
      <Pulsante id={`${id}-apri`} variante="pericolo" onClick={() => setAperto(true)}>
        {t("account.etichetta")}
      </Pulsante>
    );
  }

  return (
    <div
      ref={pannello}
      tabIndex={-1}
      role="group"
      aria-labelledby={`${id}-titolo`}
      className="space-y-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-4 text-sm"
    >
      <p id={`${id}-titolo`} className="font-semibold text-text">
        {t("account.titoloConferma")}
      </p>
      <ul className="list-disc space-y-1 pl-5 text-text-muted">
        {punti.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={capito}
          onChange={(e) => setCapito(e.target.checked)}
          disabled={inCorso}
          className="mt-0.5 size-4 accent-danger"
        />
        <span>{t("account.capisco")}</span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Pulsante variante="pericolo" onClick={elimina} disabled={!capito || inCorso}>
          {inCorso ? t("account.inCorso") : t("account.conferma")}
        </Pulsante>
        <Pulsante
          variante="fantasma"
          disabled={inCorso}
          onClick={() => {
            setAperto(false);
            setCapito(false);
          }}
        >
          {t("annulla")}
        </Pulsante>
      </div>
      {errore ? (
        <p role="alert" className="text-danger">
          {t("account.errore")}
        </p>
      ) : null}
    </div>
  );
}
