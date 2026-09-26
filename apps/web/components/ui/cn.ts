import { clsx, type ClassValue } from "clsx";

export function cn(...classi: ClassValue[]): string {
  return clsx(classi);
}
