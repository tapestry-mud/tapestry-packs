// lair.ts - which landmark holds the boss (spec 5.2).
//
// placeLandmarks (structure.ts) puts K landmarks one per angular wedge at
// 0.45R..0.70R with seeded jitter, and roadEdges already forces a Bresenham road
// from entry to each. So exactly one of them is deterministically furthest from
// entry, the road to it already exists, and its room already draws landmark-band
// prose. Promoting it to the boss lair is net-negative code: no new geometry, no
// new node past the rim, no descent.
//
// The remaining K-1 landmarks keep their minibosses, and those minibosses are
// what the lair's seal counts (seal-state.ts).
//
// Pure f(landmarks), zero engine imports, golden-testable under plain node.
// ASCII; braces on all control flow.

/** Structural shape of structure.ts's LandmarkCell. Duplicated rather than
 *  imported so this module keeps zero coupling and stays node-loadable. */
export interface LairCandidate {
    index: number;
    x: number;
    y: number;
    z: number;
}

/**
 * The index into the landmark array whose cell is furthest from entry (0,0,0).
 * Ties break to the LOWEST index so two runs of the same seed can never disagree.
 * Returns -1 for an empty list.
 *
 * Distance is squared 2D plus the z term: landmarks are placed at z = 0 today, so
 * the z term is inert, but including it means a future vertical placement does not
 * silently collapse to a 2D tie. No sqrt - it is monotonic, so it cannot change the
 * ordering, and skipping it keeps the comparison exact in integers.
 */
export function furthestLandmarkIndex(landmarks: LairCandidate[]): number {
    if (!landmarks || landmarks.length === 0) {
        return -1;
    }
    let best = 0;
    let bestDist = -1;
    for (let i = 0; i < landmarks.length; i++) {
        const l = landmarks[i];
        const d = (l.x * l.x) + (l.y * l.y) + (l.z * l.z);
        if (d > bestDist) {
            bestDist = d;
            best = i;
        }
    }
    return best;
}
