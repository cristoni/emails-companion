import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Unisce le classi Tailwind: in caso di conflitto (per esempio `w-full` del componente e `w-auto` passato
 * da chi lo usa) vince l'ultima, così le personalizzazioni con `className` funzionano davvero.
 */
export function cn(...classi: ClassValue[]): string {
  return twMerge(clsx(classi));
}
