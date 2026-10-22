import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

// Each simulation step is a 5-minute gateway interval; 288 intervals fill one simulated day.
export function clockFromStep(step: number | string) {
  const minutes = (Number(step) % 288) * 5;
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
