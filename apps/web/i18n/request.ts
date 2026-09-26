import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LINGUE, LINGUA_PREDEFINITA, type Lingua } from "./lingue";
import { linguaDellUtente } from "@/lib/server/preferenze";

/** Lingua: preferenza salvata, poi cookie, poi inglese. Accept-Language non viene usato (§13.2). */
export default getRequestConfig(async () => {
  const salvata = await linguaDellUtente();
  const cookie = (await cookies()).get("ec_lingua")?.value;
  const scelta = [salvata, cookie].find((l): l is Lingua => Boolean(l) && (LINGUE as readonly string[]).includes(l as string));
  const locale = scelta ?? LINGUA_PREDEFINITA;
  return { locale, messages: (await import(`../messages/${locale}.json`)).default };
});
