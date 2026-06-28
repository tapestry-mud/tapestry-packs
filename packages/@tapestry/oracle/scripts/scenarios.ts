// scenarios.ts - LLM-off scenario list builder. Pure, NO engine import (so it loads under
// plain node for golden tests; solo-flow.ts, which registers a flow at module load, imports
// from here). A six-axis theme uses its own baked set when one exists (else the first set);
// a baked set that is also a theme is not offered as a duplicate "(flat)" scenario.

export interface Scenario { id: string; label: string; idea: string; bakedSet: string; }

export function buildScenarios(themes: string[], bakedIds: string[]): Scenario[] {
    const banded: Scenario[] = themes.map(function (t: string): Scenario {
        const own = bakedIds.indexOf(t) >= 0 ? t : bakedIds[0];
        return { id: t, label: t + " (depth-banded)", idea: t, bakedSet: own };
    });
    const flat: Scenario[] = bakedIds
        .filter(function (s: string): boolean { return themes.indexOf(s) < 0; })
        .map(function (s: string): Scenario {
            return { id: "flat:" + s, label: s + " (flat)", idea: "", bakedSet: s };
        });
    return banded.concat(flat);
}
