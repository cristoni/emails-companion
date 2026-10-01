"use client";

import { startTransition, useActionState, useId, useState } from "react";
import { useTranslations } from "next-intl";
import type { Categoria } from "@ec/core/dominio";
import { testoCodice } from "@/components/comuni/codici";
import type { AzioneModulo, StatoAzione } from "@/components/comuni/modulo-azione";
import { Aiuto, Etichetta, Input, Selezione } from "@/components/ui/campi";
import { cn } from "@/components/ui/cn";
import { Pulsante } from "@/components/ui/pulsante";

/**
 * Invio senza `<form action>`: dopo un'azione React 19 reimposta il modulo, e un select controllato
 * tornerebbe alla prima opzione mentre lo stato indica il valore scelto.
 */
function inviaSenzaReset(esegui: (dati: FormData) => void) {
  return (evento: React.FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const dati = new FormData(evento.currentTarget);
    startTransition(() => esegui(dati));
  };
}

/**
 * Esito di una correzione come testo tradotto: mai il codice grezzo. Il successo resta solo per i lettori di
 * schermo: la pagina mostra già il nuovo valore con "Corretta da te".
 */
function Esito({ stato, messaggi = {} }: { stato: StatoAzione; messaggi?: Record<string, string> }) {
  const t = useTranslations("comuni");
  const esito = stato?.esito;
  if (!esito) return null;
  return (
    <p role="status" className={cn("text-xs", esito === "ok" ? "sr-only" : "text-danger")}>
      {messaggi[esito] ?? testoCodice(t, "esiti", esito, "esiti.errore")}
    </p>
  );
}

/**
 * Correzione della categoria di un'email in entrata: il campo mostra il valore effettivo e la categoria
 * scelta prevale sulle analisi successive. L'etichetta è nella riga che lo contiene (`id`); "Salva" si
 * attiva solo dopo una modifica.
 */
export function ModuloCategoria({
  id,
  azione,
  emailId,
  attuale,
  opzioni,
}: {
  id: string;
  azione: AzioneModulo;
  emailId: string;
  attuale: Categoria;
  opzioni: { valore: Categoria; etichetta: string }[];
}) {
  const t = useTranslations("posta.classificazione");
  const [valore, setValore] = useState<string>(attuale);
  // Dopo un salvataggio o un annullamento la pagina porta un nuovo valore effettivo: il campo lo segue.
  const [precedente, setPrecedente] = useState(attuale);
  if (precedente !== attuale) {
    setPrecedente(attuale);
    setValore(attuale);
  }
  const [stato, esegui, inCorso] = useActionState(azione, undefined);
  return (
    <form onSubmit={inviaSenzaReset(esegui)} className="space-y-1.5">
      <input type="hidden" name="email" value={emailId} />
      <div className="flex gap-2">
        <Selezione id={id} name="categoria" value={valore} onChange={(e) => setValore(e.target.value)} className="min-w-0 flex-1">
          {opzioni.map((o) => (
            <option key={o.valore} value={o.valore}>
              {o.etichetta}
            </option>
          ))}
        </Selezione>
        <Pulsante type="submit" variante={valore === attuale ? "secondario" : "primario"} dimensione="md" disabled={inCorso || valore === attuale}>
          {t("salva")}
        </Pulsante>
      </div>
      <Esito stato={stato} />
    </form>
  );
}

/**
 * Correzione della lingua: le lingue più comuni (codici ISO 639-1) e un campo libero per le altre,
 * validato qui per aiutare l'utente e di nuovo sul server.
 */
export function ModuloLingua({
  azione,
  emailId,
  attuale,
  opzioni,
}: {
  azione: AzioneModulo;
  emailId: string;
  attuale: string;
  opzioni: { codice: string; nome: string }[];
}) {
  const t = useTranslations("posta.lingua");
  const idScelta = useId();
  const idAltra = useId();
  const idAiuto = useId();
  const nota = opzioni.some((o) => o.codice === attuale);
  const [scelta, setScelta] = useState(nota ? attuale : "altra");
  const [altra, setAltra] = useState(nota ? "" : attuale);
  // Dopo un salvataggio o un annullamento la pagina porta la lingua effettiva nuova: i campi la seguono.
  const [precedente, setPrecedente] = useState(attuale);
  if (precedente !== attuale) {
    setPrecedente(attuale);
    setScelta(nota ? attuale : "altra");
    setAltra(nota ? "" : attuale);
  }
  const [stato, esegui, inCorso] = useActionState(azione, undefined);
  return (
    <form onSubmit={inviaSenzaReset(esegui)} className="space-y-2">
      <input type="hidden" name="email" value={emailId} />
      <div>
        <Etichetta htmlFor={idScelta} className="sr-only">
          {t("scegli")}
        </Etichetta>
        <Selezione id={idScelta} name="lingua" value={scelta} onChange={(e) => setScelta(e.target.value)}>
          {opzioni.map((o) => (
            <option key={o.codice} value={o.codice}>
              {o.nome} ({o.codice})
            </option>
          ))}
          <option value="altra">{t("altra")}</option>
        </Selezione>
      </div>
      {scelta === "altra" ? (
        <div className="space-y-1.5">
          <Etichetta htmlFor={idAltra}>
            {t("codice")}
          </Etichetta>
          <Input
            id={idAltra}
            name="linguaAltra"
            value={altra}
            onChange={(e) => setAltra(e.target.value)}
            required
            maxLength={35}
            pattern="[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*"
            title={t("codiceNonValido")}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={idAiuto}
            className="font-mono"
          />
          <Aiuto id={idAiuto}>{t("codiceAiuto")}</Aiuto>
        </div>
      ) : null}
      <Pulsante type="submit" variante="secondario" dimensione="sm" disabled={inCorso}>
        {t("salva")}
      </Pulsante>
      <Esito stato={stato} messaggi={{ non_valido: t("codiceNonValido") }} />
    </form>
  );
}
