/** Backoff esponenziale con jitter deterministico, rispettando un eventuale Retry-After. */
export function prossimoTentativo(ora: Date, erroriConsecutivi: number, riprovaDopoMs: number | null, seme: string): Date {
  const base = Math.min(60 * 60 * 1000, 30_000 * 2 ** Math.min(erroriConsecutivi, 7));
  let h = 0;
  for (const c of seme) h = (h * 31 + c.charCodeAt(0)) | 0;
  const jitter = Math.abs(h % 1000) / 1000;
  const attesa = Math.max(riprovaDopoMs ?? 0, Math.round(base * (0.75 + jitter * 0.5)));
  return new Date(ora.getTime() + attesa);
}
