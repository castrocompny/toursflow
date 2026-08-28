/**
 * Cálculo do hold de reserva — a autoridade é sempre `holdExpiresAt`, o
 * timestamp devolvido pelo NauticFlow, nunca uma contagem fixa de 15:00
 * assumida no cliente (relógio do navegador pode estar errado, atraso de
 * rede etc.). Toda função aqui é pura, testável com `Date.now()` mockado.
 */

/** Nunca negativo — hold já expirado vira 0, não um número negativo. */
export function msUntilExpiry(holdExpiresAtIso: string, now: number = Date.now()): number {
  return Math.max(0, new Date(holdExpiresAtIso).getTime() - now);
}

export function isHoldExpired(holdExpiresAtIso: string, now: number = Date.now()): boolean {
  return msUntilExpiry(holdExpiresAtIso, now) <= 0;
}

/** "mm:ss", sempre 2 dígitos nos segundos (ex.: "14:59", "0:07"). */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
