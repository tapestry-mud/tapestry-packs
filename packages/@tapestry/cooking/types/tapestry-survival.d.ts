declare module "@tapestry/survival" {
  export function applyWellFedBuff(entityId: string, durationTicks: number): void;
  export function getHungerTier(entityId: string): string;
  export const tiers: { FULL_MIN: number; HUNGRY_MIN: number };
}
