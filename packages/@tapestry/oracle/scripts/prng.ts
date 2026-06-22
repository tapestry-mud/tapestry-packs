// splitmix64-derived PRNG. JS numbers are f64, so we mix in BigInt and project to [0,1).
export function splitmix64(seed: number): () => number {
    let state = BigInt(Math.floor(seed)) & 0xffffffffffffffffn;
    const MASK = 0xffffffffffffffffn;
    return function next(): number {
        state = (state + 0x9e3779b97f4a7c15n) & MASK;
        let z = state;
        z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
        z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK;
        z = z ^ (z >> 31n);
        // top 53 bits -> [0,1)
        return Number(z >> 11n) / Number(1n << 53n);
    };
}

// FNV-1a over the room path, folded with the area seed, into a 53-bit-safe integer seed.
export function hashCoord(areaSeed: number, roomPath: string): number {
    let h = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    const MASK = 0xffffffffffffffffn;
    const s = String(areaSeed) + ":" + roomPath;
    for (let i = 0; i < s.length; i++) {
        h = (h ^ BigInt(s.charCodeAt(i))) & MASK;
        h = (h * prime) & MASK;
    }
    return Number(h >> 11n); // 53-bit-safe
}

export function rollDice(notation: string, rng: () => number): number {
    const m = /^(\d+)d(\d+)([+-]\d+)?$/i.exec(String(notation).trim());
    if (!m) {
        const n = parseInt(notation, 10);
        return isNaN(n) ? 0 : n;
    }
    const count = parseInt(m[1], 10);
    const sides = parseInt(m[2], 10);
    const mod = m[3] ? parseInt(m[3], 10) : 0;
    let total = 0;
    for (let i = 0; i < count; i++) {
        total += 1 + Math.floor(rng() * sides);
    }
    return total + mod;
}

export function pick<T>(items: T[], rng: () => number): T {
    return items[Math.floor(rng() * items.length)];
}

export function weightedPick(weighted: { w: number; value: any }[], rng: () => number): any {
    let total = 0;
    for (let i = 0; i < weighted.length; i++) {
        total += weighted[i].w;
    }
    let roll = rng() * total;
    for (let i = 0; i < weighted.length; i++) {
        roll -= weighted[i].w;
        if (roll < 0) {
            return weighted[i].value;
        }
    }
    return weighted[weighted.length - 1].value;
}
