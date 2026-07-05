// condition.ts - the shared target-condition bands (stage B.2).
//
// ONE implementation of the percent-HP band ladder so the look command and
// combat output can never disagree. Design split (Travis 2026-07-04): the
// damage VERB keys on absolute damage - the progression channel; the
// CONDITION line is the relative tactical state of the target. Two channels,
// two vocabularies.
//
// Bands mirror the engine's HealthTier (the GMCP Char.Combat.Target channel)
// exactly: perfect (100), few scratches (75-99), small wounds (50-74),
// wounded (35-49), badly wounded (20-34), bleeding profusely (10-19),
// near death (<10 or maxHp <= 0).

export interface ConditionBand { min: number; text: string; }

/** Descending thresholds over pct = floor(hp / maxHp * 100). */
export const CONDITION_BANDS: ConditionBand[] = [
    { min: 100, text: "is in perfect health" },
    { min: 75, text: "has a few scratches" },
    { min: 50, text: "has some small wounds" },
    { min: 35, text: "is wounded" },
    { min: 20, text: "is badly wounded" },
    { min: 10, text: "is bleeding profusely" },
    { min: 0, text: "is near death" },
];

/** Band index for an hp/maxHp pair: 0 = perfect health ... 6 = near death.
 *  maxHp <= 0 pins to near death, matching the engine HealthTier. */
export function conditionIndex(hp: number, maxHp: number): number {
    if (maxHp <= 0) { return CONDITION_BANDS.length - 1; }
    const pct = Math.floor((hp / maxHp) * 100);
    for (let i = 0; i < CONDITION_BANDS.length; i++) {
        if (pct >= CONDITION_BANDS[i].min) { return i; }
    }
    return CONDITION_BANDS.length - 1;
}

/** The band's display text ("is bleeding profusely"). Index is clamped. */
export function conditionText(index: number): string {
    const i = Math.max(0, Math.min(CONDITION_BANDS.length - 1, index));
    return CONDITION_BANDS[i].text;
}
