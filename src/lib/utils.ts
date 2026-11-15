import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] || "they";
