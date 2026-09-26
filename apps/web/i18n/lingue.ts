export const LINGUE = ["en", "it"] as const;
export type Lingua = (typeof LINGUE)[number];
export const LINGUA_PREDEFINITA: Lingua = "en";
