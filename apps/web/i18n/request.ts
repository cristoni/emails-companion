import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LINGUE, LINGUA_PREDEFINITA, type Lingua } from "./lingue";
import { fusoValido, preferenzeDellUtente } from "@/lib/server/preferenze";
import { messaggi } from "./messaggi";

/**
 * Lingua: preferenza salvata, poi cookie, poi inglese. Accept-Language non viene usato (§13.2).
 * Fuso: quello delle preferenze, così server e client formattano gli istanti allo stesso modo.
 */
export default getRequestConfig(async () => {
  const preferenze = await preferenzeDellUtente();
  const cookie = (await cookies()).get("ec_lingua")?.value;
  const scelta = [preferenze?.lingua, cookie].find((l): l is Lingua => Boolean(l) && (LINGUE as readonly string[]).includes(l as string));
  const locale = scelta ?? LINGUA_PREDEFINITA;
  return { locale, messages: messaggi(locale), timeZone: fusoValido(preferenze?.fusoOrario), now: new Date() };
});
