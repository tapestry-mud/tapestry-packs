# Core Pack Journey

A multi-player journey showing how to write a pack-level scenario test.

## Setup
- Players: Alice, Wanderer
- Skip: say dispatch broken by mob-command shadowing -- tapestry-mud/tapestry#98; un-skip to verify the fix

## Steps
1. Alice: `look`
2. Assert Alice sees: `The Nexus`
3. Alice: `who`
4. Assert Alice sees: `Alice`
5. Assert Alice sees: `Wanderer`
6. Alice: `say Hey Wanderer, follow me!`
7. Assert Wanderer sees: `Alice says`
8. Alice: `quit`
9. Wanderer: `quit`
