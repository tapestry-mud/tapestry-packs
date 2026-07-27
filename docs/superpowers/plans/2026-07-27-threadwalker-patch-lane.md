# Threadwalker Patch Lane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the threadwalker v1 patch cycle triaged in `content/notes/threadwalker-patch-brief-2026-07-24.md`: make the boss winnable via gear-carries-HP, retune and playtest week one, sweep the cheap-and-certain Lane 2/3 UX fixes, fold spec change records, and stop at the two human gates (playtest, publish/deploy) without crossing them.

**Architecture:** Three repos are in scope, in this order of appearance: `D:\Skunkworks\tapestry` (engine, C#/.NET — two narrow, explicitly-approved changes only), `D:\Skunkworks\tapestry-packs` (`@tapestry/core`, `@tapestry/oracle` — TypeScript/YAML pack content, this plan's primary workspace), and `D:\Skunkworks\threadwalker` (the game world pack — YAML/JS content). Work proceeds in dependency order: engine changes first (they unblock pack work), then the Lane 1 combat/progression fork, then the human playtest gate, then the Lane 2/3 UX sweep (independent of the gate — only the week-one flip and deploy wait on Travis), then spec-lint folding, then the publish/deploy gate.

**Tech Stack:** .NET 10 / C# (engine, xUnit), TypeScript compiled to JS via the pack's own build (oracle), plain JS (core, threadwalker), YAML content and manifests, `@tapestry-mud/spec-lint` for the specs contract, `telnet-runner.js` / `strict-boot-gate.js` for engine-level verification, Markdown scenario smoke tests for pack-level verification (no Jest/isolated unit tests — see `tapestry-packs/TESTING.md`).

## Global Constraints

- No em dashes anywhere in anything you write (code, comments, commit messages, specs, chat). Player-facing output must be strict 7-bit ASCII.
- Braces on all control flow, even single-line bodies — in all three repos, this is an explicit convention, not a suggestion.
- Exact pinned versions everywhere; never introduce `^` or `~` into any `package.json` or pack `dependencies` block.
- Any deliverable longer than a short paragraph goes to a file via Write; chat/commit messages get a short summary, not the content itself.
- Read the CLAUDE.md at the root of a repo before your first edit in it this session (already done for all three repos as part of this plan's research; re-read it yourself if you are a fresh agent picking this up).
- A pack version bump must be the LAST commit before any publish — do not bump `pack.yaml` versions during implementation tasks. Version bumps happen only in the final pre-deploy task, immediately before Gate 2, with Travis present.
- Work is commit-local throughout; stage explicit paths per commit, never `git add -A`.
- **Human Gate 1 (playtest):** after the week-one retune/re-bake (Task 12), STOP. Travis plays the organic path himself. Do not flip the template open and do not declare it winnable on your own authority.
- **Human Gate 2 (publish/deploy):** no pack publish, no version-bump tip commit, no droplet deploy, in any of the three repos, without Travis present and approving in-session.
- Two brief findings are explicitly OUT of scope for this patch (Travis's calls, recorded 2026-07-27): **A3** (instant/illegible boss-room aggro — no pack-side lever exists at all; requires an engine change to aggro dispatch timing) and the **opener-gates-first-room-render** item (B1/S2-2 — confirmed engine-only; `FlowEngine.FinalizeCreating` hardcodes the fallback spawn room and unconditionally enqueues `motd`/`look` before any pack hook can run, with no config surface to change it). Both are documented as roadmap rows in Task 22, not implemented here.
- Lane 4 (engine rows: sleep perception, inventory stacking, look/read) is explicitly out of scope per the spawn brief — do not touch it.

---

## Part A — Engine changes (`D:\Skunkworks\tapestry`)

Both changes below were explicitly approved by Travis after the pack-only alternatives were shown to be either impossible (no `modifiers` binding exists for procedurally-minted items) or fragile (reimplementing engine modifier bookkeeping in JS). Read `D:\Skunkworks\tapestry\CLAUDE.md` and `CONTEXT.md` before editing.

### Task 1: Forward stat modifiers through the procedural item-authoring binding

Oracle mints armor/weapons at runtime via `tapestry.authoring.writeItemTemplate(...)`. That JS binding only reads `areaId/id/base/name/desc/type/properties` — it has no way to attach a stat modifier (like `maxHp`) to a minted item, unlike hand-authored items (e.g. `tapestry-example-pack:leather-cap`, which carries a top-level `modifiers: [{stat: maxHp, value: 10}]` block read by `ItemTemplate.CreateEntity()`). This task adds that missing pass-through end to end: JS binding -> in-memory registration -> on-disk side-car YAML -> reload round-trip.

**Files:**
- Modify: `D:\Skunkworks\tapestry\src\Tapestry.Scripting\Modules\WorldAuthoringModule.cs:328-341` (the `writeItemTemplate` binding) and `:894-926` (`WriteItemTemplateSideCar`)
- Modify: `D:\Skunkworks\tapestry\src\Tapestry.Scripting\YamlContentLoader.cs:673-686` (`SerializeItemDefinition`)
- Test: `D:\Skunkworks\tapestry\tests\Tapestry.Engine.Tests\OracleTableSideCarTests.cs` (extend `TempAuthoringRoot` and add a new test)
- Spec: `D:\Skunkworks\tapestry\specs\area-authoring.md`, change record in `D:\Skunkworks\tapestry\specs\changes\`

**Interfaces:**
- Consumes: `ItemTemplate.ModifierEntry { Stat: string, Value: int }` and `ItemTemplate.Modifiers: List<ModifierEntry>` (already exist, `Tapestry.Engine/Items/ItemTemplate.cs:15,71-75`, untouched by this task).
- Produces: `WorldAuthoringModule.WriteItemTemplateSideCar(string areaId, string id, string baseId, string name, string desc, string? type, Dictionary<string,object?> properties, List<ItemTemplate.ModifierEntry> modifiers)` — a new overload signature (7 args -> 8 args) that every future caller (only this one JS binding today) must pass. `YamlContentLoader.SerializeItemDefinition(string id, string name, string type, List<string> keywords, List<string> tags, Dictionary<string,object?> properties, List<ItemTemplate.ModifierEntry> modifiers)` — same pattern, 6 args -> 7 args.

- [ ] **Step 1: Add a JS-array-to-CLR-list helper and read `modifiers` off the options object**

In `WorldAuthoringModule.cs`, near the existing `ToClrProperties` helper (around line 931), add:

```csharp
private static List<ItemTemplate.ModifierEntry> ToClrModifiers(JsValue value)
{
    var result = new List<ItemTemplate.ModifierEntry>();
    if (value is not JsArray arr) { return result; }
    foreach (var entry in arr)
    {
        if (entry is not ObjectInstance obj) { continue; }
        var stat = obj.Get("stat").ToString();
        var valueProp = obj.Get("value");
        if (string.IsNullOrEmpty(stat) || valueProp.Type != Types.Number) { continue; }
        result.Add(new ItemTemplate.ModifierEntry { Stat = stat, Value = (int)(double)valueProp.ToObject()! });
    }
    return result;
}
```

This mirrors the existing `ToClrProperties` unpacking style and follows the repo's own convention (CLAUDE.md: "accept a single `JsValue` and unpack it manually. Do not bind a CLR array type directly.").

- [ ] **Step 2: Wire the binding to read `modifiers` and pass it through**

In the `writeItemTemplate` binding (`WorldAuthoringModule.cs:328-341`), change:

```csharp
writeItemTemplate = new Func<JsValue, object?>(options =>
{
    if (options is not ObjectInstance obj) { return null; }
    var areaId = obj.Get("areaId").ToString();
    var id = obj.Get("id").ToString();
    var baseId = obj.Get("base").ToString();
    var name = obj.Get("name").ToString();
    var descVal = obj.Get("desc");
    var desc = descVal.Type == Types.String ? descVal.ToString() : "";
    var typeVal = obj.Get("type");
    var type = typeVal.Type == Types.String ? typeVal.ToString() : null;
    var props = ToClrProperties(obj.Get("properties"));
    var modifiers = ToClrModifiers(obj.Get("modifiers"));
    return WriteItemTemplateSideCar(areaId, id, baseId, name, desc, type, props, modifiers);
})
```

- [ ] **Step 3: Update `WriteItemTemplateSideCar` to accept, apply, and serialize modifiers**

```csharp
public string? WriteItemTemplateSideCar(
    string areaId, string id, string baseId, string name, string desc,
    string? type, Dictionary<string, object?> properties, List<ItemTemplate.ModifierEntry> modifiers)
{
    if (_itemRegistry == null) { return null; }
    var baseTemplate = _itemRegistry.GetTemplate(baseId);
    if (baseTemplate == null) { return null; }

    var mergedRaw = new Dictionary<string, object?>(baseTemplate.Properties);
    foreach (var kv in properties) { mergedRaw[kv.Key] = kv.Value; }
    mergedRaw["description"] = desc;
    var merged = NormalizeClrProperties(mergedRaw);

    var template = new ItemTemplate
    {
        Id = id,
        Name = name,
        Type = string.IsNullOrEmpty(type) ? baseTemplate.Type : type!,
        Tags = new List<string>(baseTemplate.Tags),
        Keywords = new List<string>(baseTemplate.Keywords),
        Properties = merged,
        Modifiers = modifiers,
    };
    _itemRegistry.Register(template);

    var path = ItemTemplateSideCarPath(areaId, id);
    var dir = Path.GetDirectoryName(path);
    if (!string.IsNullOrEmpty(dir)) { Directory.CreateDirectory(dir); }
    File.WriteAllText(path, YamlContentLoader.SerializeItemDefinition(
        id, name, template.Type, template.Keywords, template.Tags, merged, modifiers));
    return id;
}
```

- [ ] **Step 4: Serialize the modifiers block so a reboot round-trips it**

In `YamlContentLoader.cs`, change `SerializeItemDefinition`:

```csharp
public static string SerializeItemDefinition(string id, string name, string type,
    List<string> keywords, List<string> tags, Dictionary<string, object?> properties,
    List<ItemTemplate.ModifierEntry> modifiers)
{
    var doc = new Dictionary<string, object?>
    {
        ["id"] = id,
        ["name"] = name,
        ["type"] = type,
        ["keywords"] = keywords,
        ["tags"] = tags,
        ["properties"] = properties,
    };
    if (modifiers.Count > 0)
    {
        doc["modifiers"] = modifiers.Select(m => new Dictionary<string, object?>
        {
            ["stat"] = m.Stat,
            ["value"] = m.Value,
        }).ToList();
    }
    return AreaSerializer.Serialize(doc);
}
```

Add `using System.Linq;` at the top of the file if not already present. This YAML shape (`modifiers: [{stat, value}]`) is exactly what `YamlContentLoader.LoadItem`'s existing `ItemDefinition.Modifiers: List<ModifierDef>` (already reads this exact key today for hand-authored items, `YamlContentLoader.cs:731,748-752`) and `PackLoader.cs:368-372` already deserialize on the next boot — no changes needed on the read side, this is a genuine round-trip through existing code.

- [ ] **Step 5: Unit test the round-trip**

In `OracleTableSideCarTests.cs`, update the `TempAuthoringRoot.WriteItemTemplate` helper to accept modifiers and add a new test class:

```csharp
public string? WriteItemTemplate(string areaId, string id, string baseId, string name,
    string desc, Dictionary<string, object?> properties, List<ItemTemplate.ModifierEntry>? modifiers = null)
{
    return _module.WriteItemTemplateSideCar(areaId, id, baseId, name, desc, null, properties, modifiers ?? new List<ItemTemplate.ModifierEntry>());
}
```

```csharp
public class WriteItemTemplateModifierTests
{
    [Fact]
    public void WriteItemTemplateSideCar_round_trips_modifiers_through_the_loader()
    {
        using var root = new TempAuthoringRoot();
        root.RegisterBaseItem("tapestry-oracle:armor-body", "a piece of armor", "item");

        var path = root.WriteItemTemplate(
            "castle-kitchen", "castle-kitchen:loot-armor-body-0-0-trash-0",
            "tapestry-oracle:armor-body", "a banded cuirass", "Sturdy plate.",
            new Dictionary<string, object?> { ["rarity"] = "common" },
            new List<ItemTemplate.ModifierEntry> { new() { Stat = "maxHp", Value = 8 } });

        Assert.NotNull(path);
        var reloaded = YamlContentLoader.LoadItem(File.ReadAllText(root.ItemSideCarPath("castle-kitchen", path!)), new PropertyRegistry());
        Assert.Single(reloaded.Modifiers);
        Assert.Equal("maxHp", reloaded.Modifiers[0].Stat);
        Assert.Equal(8, reloaded.Modifiers[0].Value);
    }

    [Fact]
    public void WriteItemTemplateSideCar_registers_modifiers_into_live_registry_same_session()
    {
        using var root = new TempAuthoringRoot();
        root.RegisterBaseItem("tapestry-oracle:weapon-melee", "a weapon", "item");

        root.WriteItemTemplate(
            "castle-kitchen", "castle-kitchen:loot-weapon-melee-0-0-trash-0",
            "tapestry-oracle:weapon-melee", "a chef's cleaver", "Heavy and sharp.",
            new Dictionary<string, object?> { ["rarity"] = "common" },
            new List<ItemTemplate.ModifierEntry> { new() { Stat = "maxHp", Value = 5 } });

        var registered = root.Items.GetTemplate("castle-kitchen:loot-weapon-melee-0-0-trash-0");
        Assert.NotNull(registered);
        Assert.Single(registered!.Modifiers);
        Assert.Equal(5, registered.Modifiers[0].Value);
    }
}
```

Check `YamlContentLoader.LoadItem`'s exact signature before writing this test (grep `public static.*LoadItem` in `YamlContentLoader.cs`) and adjust the call to match — the test above assumes a `(string yaml, PropertyRegistry registry)` signature matching the `LoadOracleTable` sibling read earlier in this file; confirm against the actual method before running.

- [ ] **Step 6: Run the engine test suite**

Run: `dotnet test tests/Tapestry.Engine.Tests --filter "FullyQualifiedName~WriteItemTemplateModifierTests|FullyQualifiedName~OracleTableSideCarTests"`
Expected: all PASS, including the three pre-existing `OracleTableSideCarTests`.

Run: `dotnet build` (full solution) to confirm no other caller of `WriteItemTemplateSideCar` or `SerializeItemDefinition` broke (there should be exactly the one call site each, both edited above; `WarningsAsErrors` is on, so any unused-var or signature-mismatch warning fails the build).

- [ ] **Step 7: Fold the spec change record**

Read `D:\Skunkworks\tapestry\specs\area-authoring.md`'s current Behavior section for `writeItemTemplate`/`WriteItemTemplateSideCar` and add a Behavior line describing the new `modifiers` field, anchored to `WorldAuthoringModule.cs:328-341` and `:894-926\`. Check `D:\Skunkworks\tapestry\specs\lint.config.json` for the current mode (strict/lenient) and `specs/README.md` for the exact change-record frontmatter this repo expects (mirror the newest existing file under `specs/changes/`, e.g. `2026-07-24-world-reset-area-binding.md`, for format). Create `specs/changes/2026-07-27-item-modifier-authoring.md` with `release:` left as `unreleased` (or the repo's own convention for an unpublished engine change, confirmed by checking one of the recent change-record files' frontmatter) and `specs: [area-authoring]`. Update `specs/README.md`'s index date for `area-authoring.md` to today.

- [ ] **Step 8: Commit**

```bash
git -C D:\Skunkworks\tapestry add src/Tapestry.Scripting/Modules/WorldAuthoringModule.cs src/Tapestry.Scripting/YamlContentLoader.cs tests/Tapestry.Engine.Tests/OracleTableSideCarTests.cs specs/area-authoring.md specs/README.md specs/changes/2026-07-27-item-modifier-authoring.md
git -C D:\Skunkworks\tapestry commit -m "feat(authoring): forward stat modifiers through writeItemTemplate

Procedurally-minted items (oracle's runtime armor/weapon rolls) had no way
to carry a stat modifier like maxHp - only hand-authored items did. This
was the blocker for gear-carries-HP in tapestry-packs."
```

### Task 2: `AttemptFlee` respects `no_wander` on the destination room

Promotes the existing pack-declared `no_wander` room tag (`@tapestry/core/tags.yml:32-34`, "Mobs will not wander into this room", currently read only by the wander behavior, `core/scripts/mobs/behaviors.ts:39`) to a first-class engine tag, and makes the combat flee path respect it too — a fleeing mob will never pick an exit into a `no_wander` room, closing the S2-13 "trash mob flees into the boss room" class. Also adds the one missing binding oracle needs to tag a room at runtime (today only a room-tag *reader* exists, `getRoomTags`; there is no writer).

**Files:**
- Modify: `D:\Skunkworks\tapestry\src\Tapestry.Engine\Tags\EngineTags.cs`
- Modify: `D:\Skunkworks\tapestry\src\Tapestry.Engine\Combat\CombatManager.cs:227-244` (`AttemptFlee`)
- Modify: `D:\Skunkworks\tapestry\src\Tapestry.Scripting\Services\ApiWorld.cs` (near `GetRoomTags`, line 262)
- Modify: `D:\Skunkworks\tapestry\src\Tapestry.Scripting\Modules\WorldModule.cs` (near `addTag`, line 138)
- Test: `D:\Skunkworks\tapestry\tests\Tapestry.Engine.Tests\Combat\CombatManagerTests.cs`
- Spec: `D:\Skunkworks\tapestry\specs\mob-ai.md`, `D:\Skunkworks\tapestry\specs\combat-resolution.md`, change record

**Interfaces:**
- Produces: `EngineTags.NoWander = "no_wander"` (const, was previously only a pack-declared string with no engine-side registration). `ApiWorld.AddRoomTag(string roomId, string tag): void`. JS binding `tapestry.world.addRoomTag(roomId: string, tag: string): void`.
- Consumes (Task 8, oracle): calls the new `tapestry.world.addRoomTag` binding.

- [ ] **Step 1: Register `no_wander` as an engine tag**

In `EngineTags.cs`, add the const and registration line:

```csharp
public const string NoWander = "no_wander";
```

```csharp
registry.RegisterEngineTag(NoWander, "Mobs will not wander or flee into this room", new[] { EntityTypes.Room });
```

- [ ] **Step 2: Remove the now-redundant pack-level declaration**

In `D:\Skunkworks\tapestry-packs\packages\@tapestry\core\tags.yml`, delete the `no_wander` block (lines 32-34):

```yaml
  no_wander:
    description: "Mobs will not wander into this room"
    applies_to: [room]
```

`recall.yaml` and `donation-pit.yaml`'s `tags: [safe, no_wander]` need no change — an engine-registered tag is usable by any pack without a pack-side declaration, exactly like `persistent`/`no_kill`/`safe` already are (confirmed: `hub-wanderer.yaml` uses `tags: [persistent]` with no declaration anywhere in threadwalker or oracle's tags.yml).

- [ ] **Step 3: Add the room-tag write binding**

In `ApiWorld.cs`, next to `GetRoomTags` (line 262):

```csharp
public void AddRoomTag(string roomId, string tag)
{
    var room = _world.GetRoom(roomId);
    if (room == null) { return; }
    room.AddTag(tag);
}
```

In `WorldModule.cs`, next to the `addTag` binding (line 138):

```csharp
addRoomTag = new Action<string, string>(_worldOps.AddRoomTag),
```

- [ ] **Step 4: Filter flee destinations**

In `CombatManager.cs`, change the exit selection in `AttemptFlee` (lines 227-244):

```csharp
var exits = room.AvailableExits().ToList();
var safeExits = exits.Where(d =>
{
    var exit = room.GetExit(d);
    if (exit == null) { return true; }
    var target = _world.GetRoom(exit.TargetRoomId);
    return target == null || !target.HasTag(Tapestry.Engine.Tags.EngineTags.NoWander);
}).ToList();
var candidates = safeExits.Count > 0 ? safeExits : exits;
if (candidates.Count == 0)
{
    context.EventBus.Publish(new GameEvent
    {
        Type = "combat.flee.failed",
        SourceEntityId = entity.Id,
        RoomId = entity.LocationRoomId,
        SourceEntityName = entity.Name,
        Data = new Dictionary<string, object?> { ["entityName"] = entity.Name }
    });
    return false;
}

var direction = candidates[context.Random.Next(candidates.Count)];
```

Falling back to the unfiltered `exits` list when every exit leads to a `no_wander` room keeps a genuinely cornered mob able to flee somewhere rather than getting permanently stuck — the intent is "prefer not to enter a no_wander room," not "never flee if every path leads to one." Add `using System.Linq;` at the top of the file if not already present.

- [ ] **Step 5: Unit test**

In `CombatManagerTests.cs`, add:

```csharp
[Fact]
public void AttemptFlee_AvoidsNoWanderDestination()
{
    Setup();
    var badRoom = new Room("core:boss-room", "Boss Room", "Something vast waits here.");
    badRoom.AddTag("no_wander");
    _world.AddRoom(badRoom);
    var goodRoom = new Room("core:hallway", "Hallway", "A hallway.");
    _world.AddRoom(goodRoom);
    _room.SetExit(Direction.North, new Exit("core:boss-room"));
    _room.SetExit(Direction.South, new Exit("core:hallway"));
    var player = CreatePlayer();
    var mob = CreateMob();
    _combat.Engage(player, mob);
    var context = new PulseContext
    {
        CurrentTick = 100,
        CurrentPulse = 100,
        World = _world,
        EventBus = _eventBus,
        CombatManager = _combat,
        EffectManager = new EffectManager(_world, _eventBus),
        Random = new Random(1)
    };
    var result = _combat.AttemptFlee(player, context);
    Assert.True(result);
    Assert.Equal("core:hallway", player.LocationRoomId);
}

[Fact]
public void AttemptFlee_FallsBackToNoWanderRoomWhenNoOtherExit()
{
    Setup();
    var badRoom = new Room("core:boss-room", "Boss Room", "Something vast waits here.");
    badRoom.AddTag("no_wander");
    _world.AddRoom(badRoom);
    _room.SetExit(Direction.North, new Exit("core:boss-room"));
    var player = CreatePlayer();
    var mob = CreateMob();
    _combat.Engage(player, mob);
    var context = new PulseContext
    {
        CurrentTick = 100,
        CurrentPulse = 100,
        World = _world,
        EventBus = _eventBus,
        CombatManager = _combat,
        EffectManager = new EffectManager(_world, _eventBus),
        Random = new Random(1)
    };
    var result = _combat.AttemptFlee(player, context);
    Assert.True(result);
    Assert.Equal("core:boss-room", player.LocationRoomId);
}
```

Run: `dotnet test tests/Tapestry.Engine.Tests --filter "FullyQualifiedName~CombatManagerTests"`
Expected: all PASS, including every pre-existing `AttemptFlee_*` test (they must still pass unchanged — the fallback-to-unfiltered-exits behavior is what keeps `AttemptFlee_MovesToRandomExit`, `AttemptFlee_NoExits_Fails`, `AttemptFlee_SetsFleeCooldown`, and `AttemptFlee_DeductsMovement` green with no changes to those tests).

- [ ] **Step 6: Run the full engine suite and strict-boot gate**

Run: `dotnet build` then `dotnet test`
Expected: 0 failures.

Run: `node tests/tools/strict-boot-gate.js`
Expected: boots clean against the stable published pack corpus (this exercises the removed `no_wander` pack-tag declaration against the live tag registry — the strict-boot gate is exactly what will catch it if removing that declaration somehow broke tag resolution, since `recall.yaml`/`donation-pit.yaml` still reference `no_wander` in `tags:`).

- [ ] **Step 7: Fold the spec change record**

Add a Behavior line to `mob-ai.md` (near its existing `no_wander` mention, lines 91-95) noting `no_wander` is now an engine tag, not pack-declared, anchored to `EngineTags.cs`. Add a Behavior line to `combat-resolution.md` describing `AttemptFlee`'s new destination filter, anchored to `CombatManager.cs:227-244`. Create `specs/changes/2026-07-27-flee-avoids-no-wander.md` per the repo's change-record format (mirror the newest file in `specs/changes/`), naming both `mob-ai` and `combat-resolution` in its `specs:` frontmatter. Update both files' index dates in `specs/README.md`.

- [ ] **Step 8: Commit**

```bash
git -C D:\Skunkworks\tapestry add src/Tapestry.Engine/Tags/EngineTags.cs src/Tapestry.Engine/Combat/CombatManager.cs src/Tapestry.Scripting/Services/ApiWorld.cs src/Tapestry.Scripting/Modules/WorldModule.cs tests/Tapestry.Engine.Tests/Combat/CombatManagerTests.cs specs/mob-ai.md specs/combat-resolution.md specs/README.md specs/changes/2026-07-27-flee-avoids-no-wander.md
git -C D:\Skunkworks\tapestry commit -m "fix(combat): fleeing mobs never pick a no_wander destination room

Promotes no_wander from a core-pack-declared tag to an engine tag so
AttemptFlee can share it. Closes the class of bug where a low-HP trash
mob flees into an adjacent boss room, turning first contact into a 2v1."
```

```bash
git -C D:\Skunkworks\tapestry-packs add packages/@tapestry/core/tags.yml
git -C D:\Skunkworks\tapestry-packs commit -m "chore(core): drop no_wander tag declaration, now engine-provided

Companion to the tapestry engine change promoting no_wander to
EngineTags. recall.yaml/donation-pit.yaml usage is unchanged."
```

---

## Part B — Lane 1: gear-carries-HP (`D:\Skunkworks\tapestry-packs`, `@tapestry/oracle`)

Read `D:\Skunkworks\tapestry-packs\CLAUDE.md` before editing (already done this session).

### Task 3: Add `max_hp` rolls to the armor and weapon balance rows

**Files:**
- Modify: `D:\Skunkworks\tapestry-packs\packages\@tapestry\oracle\data\master-balance.yml`
- Modify: `D:\Skunkworks\tapestry-packs\packages\@tapestry\oracle\scripts\balance-table.ts:71-79` (`statsFor`)

**Interfaces:**
- Produces: `statsFor("armor", level, rng)` now returns `{ ac: number, slots: string, max_hp: number }`. `statsFor("weapon", level, rng)` now returns `{ damage: string, max_hp: number }`.
- Consumes (Task 4): the new `max_hp` field on the returned stats object.

- [ ] **Step 1: Add first-pass `max_hp` anchor rows to the balance table**

In `master-balance.yml`, add a comment and two new keys. These are first-pass tuning values, not final — Task 12's playtest gate is exactly where Travis adjusts them before flip. Armor rolls a smaller, per-piece amount (a geared character stacks up to 7 worn pieces at the top band); the weapon rolls a larger single amount (only one `wield` slot exists):

```yaml
# 2026-07-27 gear-carries-HP (design decision, Travis): FIRST-PASS values.
# Tune during the week-one retune (playtest gate) before flip - these are
# not balanced against real playtest data yet. Armor rolls a smaller
# PER-PIECE amount (up to 7 worn pieces stack at the top band); weapon
# rolls more since only one wield slot exists.
```

In the `weapon:` block (after `damage:`, currently ending at line 33), add:

```yaml
  max_hp: [5, 12, 25, 55, 100]
```

In the `armor:` block (after `ac:`, currently ending at line 36), add:

```yaml
  max_hp: [3, 8, 18, 40, 75]
```

Both arrays align 1:1 with the shared `anchors: [1, 10, 20, 40, 60]` already on each block.

- [ ] **Step 2: Read the new fields in `statsFor`**

In `balance-table.ts`, change the `"weapon"` branch (lines 71-74):

```typescript
if (kind === "weapon") {
    const band = data.weapon.damage[nearestAnchor(data.weapon.anchors, L)];
    const maxHp = interpolateNumeric(data.weapon.anchors, data.weapon.max_hp, L);
    return { damage: weightedPick(band, rng), max_hp: maxHp };
}
```

Change the `"armor"` branch (lines 75-79):

```typescript
if (kind === "armor") {
    const ac = interpolateNumeric(data.armor.anchors, data.armor.ac, L);
    const slots = data.armor.slots[nearestAnchor(data.armor.anchors, L)];
    const maxHp = interpolateNumeric(data.armor.anchors, data.armor.max_hp, L);
    return { ac, slots: slots.join(","), max_hp: maxHp };
}
```

`interpolateNumeric` already coerces via `num()` internally, matching the file's own documented gotcha (Jint loads every YAML scalar as a string).

- [ ] **Step 3: Verify the pure computation with the existing golden-test convention**

This file has no isolated unit test today (confirmed: no test references `balance-table.ts` under any `tests/` directory in the repo) — its correctness is verified by the strict-boot + smoke-test path in Task 5, not a Node test. Do not add a Jest/Node test for it; that would test the wrong runtime per `TESTING.md`'s explicit rationale (Jint CLR-value marshalling, not V8).

- [ ] **Step 4: Commit**

```bash
git -C D:\Skunkworks\tapestry-packs add packages/@tapestry/oracle/data/master-balance.yml packages/@tapestry/oracle/scripts/balance-table.ts
git -C D:\Skunkworks\tapestry-packs commit -m "feat(oracle): add first-pass max_hp rolls to armor and weapon bands

Design decision 2026-07-27 (Travis): gear carries HP. First-pass values,
tuned during the week-one playtest gate before flip."
```

### Task 4: Apply the rolled `max_hp` as a real stat modifier on minted and kit gear

**Files:**
- Modify: `D:\Skunkworks\tapestry-packs\packages\@tapestry\oracle\scripts\resolver.ts:251-267` (`mintItemInstance`)
- Modify: `D:\Skunkworks\tapestry-packs\packages\@tapestry\oracle\scripts\starter-kit.ts:104-142` (`grantStarterKit`)

**Interfaces:**
- Consumes: Task 1's new `modifiers` parameter on `tapestry.authoring.writeItemTemplate(...)`; Task 3's `max_hp` field on `statsFor("armor"|"weapon", ...)`.

- [ ] **Step 1: Pass modifiers when minting procedural armor/weapon loot**

In `resolver.ts`'s `mintItemInstance`, after the `properties` object is built for both branches (lines 255-267), add a `modifiers` array and pass it to `writeItemTemplate`:

```typescript
const modifiers: Array<{ stat: string; value: number }> = [];
const maxHpVal = Number((stats as any).max_hp) || 0;
if (maxHpVal > 0) {
    modifiers.push({ stat: "maxHp", value: maxHpVal });
}
```

Insert this right after the `if (isArmor) { ... } else { ... }` block (after line 267), then change the `writeItemTemplate` call (line 291-299) to include it:

```typescript
const written = (tapestry as any).authoring.writeItemTemplate({
    areaId,
    id: frozenId,
    base: baseId,
    name,
    desc: type.desc,
    type: "item",
    properties,
    modifiers,
});
```

- [ ] **Step 2: Apply the same modifier to the starter kit**

In `starter-kit.ts`'s `grantStarterKit`, the weapon write (lines 106-114) gets:

```typescript
const weaponMaxHp = Number((weaponStats as any).max_hp) || 0;
const wroteWeapon = (tapestry as any).authoring.writeItemTemplate({
    areaId,
    id: weaponId,
    base: "tapestry-oracle:weapon-melee",
    name: KIT_NAMES.wield,
    desc: KIT_DESCS.wield,
    type: "item",
    properties: { rarity: "common", slot: "wield", damage_dice: String(weaponStats.damage) },
    modifiers: weaponMaxHp > 0 ? [{ stat: "maxHp", value: weaponMaxHp }] : [],
});
```

And the armor loop (lines 121-142) gets, after `const acVal = ...` (line 122):

```typescript
const armorMaxHp = Number((armorStats as any).max_hp) || 0;
```

then the `writeItemTemplate` call inside the loop (lines 126-138) gets `modifiers: armorMaxHp > 0 ? [{ stat: "maxHp", value: armorMaxHp }] : []` added as a sibling of `properties`.

- [ ] **Step 3: Build and boot-verify**

Run whatever this pack's TS build script is (check `packages/@tapestry/oracle/package.json` `scripts.build` — confirmed to exist from the version-fields lookup) to compile `resolver.ts`/`starter-kit.ts` to their `dist/` JS, since the engine loads compiled JS, not TS source directly.

Run `tapestry validate` in `packages/@tapestry/oracle`.
Expected: no manifest errors.

Boot the engine in strict mode against a composed set including the rebuilt oracle (per `tapestry-packs/TESTING.md`'s verification sequence): `node tests/tools/telnet-runner.js --all-packs --managed` from the `tapestry` engine repo, pointed at this pack corpus.
Expected: `Pack validation complete: 0 issue(s) found`. If it fails on an unknown property, check `properties.yml` in `@tapestry/core` — `modifiers` is an engine-BUILT-IN transient property (`InventoryProperties.Modifiers`, registered engine-side, not pack-declared), so no pack-side property declaration is needed; if validation complains, re-check Task 1's Step 3 registered the property on the `ItemTemplate` correctly rather than assuming a pack-side fix is needed here.

- [ ] **Step 4: Commit**

```bash
git -C D:\Skunkworks\tapestry-packs add packages/@tapestry/oracle/scripts/resolver.ts packages/@tapestry/oracle/scripts/starter-kit.ts packages/@tapestry/oracle/dist
git -C D:\Skunkworks\tapestry-packs commit -m "feat(oracle): mint armor and weapons with a real maxHp modifier

Wires the rolled max_hp stat (Task 3) through as an engine stat modifier
(Task 1's authoring change), so wearing gear actually raises max HP -
the design's stated survivability axis."
```

### Task 5: Fold the gear-carries-HP spec change record and prove it live

**Files:**
- Modify: `D:\Skunkworks\tapestry-packs\specs\oracle.md`, `D:\Skunkworks\tapestry-packs\specs\core-progression.md`
- Create: `D:\Skunkworks\tapestry-packs\specs\changes\2026-07-27-gear-carries-hp.md`
- Create: `D:\Skunkworks\tapestry-packs\packages\@tapestry\oracle\tests\smoke\gear-carries-hp.md`

- [ ] **Step 1: Use the spec-lint skill to scaffold the change record**

Invoke the `spec-lint:spec-lint-new-change` skill: `spec-lint new change gear-carries-hp --release <oracle's next version, e.g. 0.9.0> --specs oracle.md,core-progression.md`. Fill in Overview/Behavior/Rejected and Reverted/Change Log per the scaffold, with Behavior anchors pointing at `master-balance.yml`, `balance-table.ts:71-79`, `resolver.ts:251-302`, `starter-kit.ts:104-148`, and the engine's `Tapestry.Engine/Items/ItemTemplate.cs:44-52` / `Tapestry.Engine/Inventory/EquipmentManager.cs:80-89` (cross-repo anchors are fine per the anchor regex, which matches any `.cs/.ts/.yml` path). In "Rejected and Reverted," record that Option 2 from the brief's design fork (flat HP, AC-only survivability) was considered and rejected 2026-07-27 in favor of gear-carries-HP.

- [ ] **Step 2: Update `oracle.md` and `core-progression.md`'s Change Log**

Add the new change record as the top entry in both files' Change Log sections (newest-first), and update their index dates in `specs/README.md`.

- [ ] **Step 3: Write the smoke test scenario**

Mirror the format and admin-command idioms of `packages/@tapestry/core/tests/smoke/pure-gear-hp.md` (loaditem/drop/get/wear, `inspect` for a stable flat-text HP readout) and `packages/@tapestry/oracle/tests/smoke/oracle-mint-bench.md` (mint-bench admin flow), combined: bake a tiny draft thread via the mint bench, start a run at level 1, loot or kit-grant a piece of armor, wear it, and assert the wearer's max HP increased by exactly the rolled amount.

```markdown
# Gear Carries HP

Task (2026-07-27): proves oracle-minted armor carries a real maxHp modifier
that raises the wearer's HP on wear, closing A1's root cause (gear
contributed zero HP). Mirrors pure-gear-hp.md's `inspect` idiom (flat-text
`/<max_hp>  Resource` line, immune to score's wrapping) and
oracle-mint-bench.md's admin mint flow.

## Setup
- Players: Gamemaster, Wanderer

## Steps
1. Gamemaster: `inspect Wanderer`
2. Assert Gamemaster sees: `/100  Resource`
3. Gamemaster: `mint`
4. Assert Gamemaster sees: `Starting the mint bench.`
5. Gamemaster: `1`
6. Gamemaster: `gear-hp-test`
7. Gamemaster: `1`
8. Gamemaster: `10`
9. Gamemaster: `1`
10. Gamemaster: `grind`
11. Gamemaster: `818181818`
12. Assert Gamemaster sees: `baked as draft`
13. Gamemaster: `mint flip oracle-week-30c9c8ea`
14. Assert Gamemaster sees: `is now open.`
15. Wanderer: `set player tapestry_unlocked Wanderer true`
16. Wanderer: `tapestry start oracle-week-30c9c8ea 1`
17. Wait for Wanderer sees: `The thread pulls taut and draws you in.`
18. Wanderer: `eq`
19. Wanderer: `get all`
20. Wanderer: `wear cap`
21. Assert Wanderer sees: `You wear`
22. Gamemaster: `inspect Wanderer`
23. Assert Gamemaster does not see: `/100  Resource`
```

The exact seed-to-templateId hex (`818181818` -> `oracle-week-30c9c8ea`) must be computed and corrected before this scenario can run — `area-gen.ts:407` derives it as `"oracle-week-" + (areaSeed >>> 0).toString(16)`; compute the real hex for whatever seed you pick (or follow `oracle-mint-bench.md`'s exact seed `305419896` -> `oracle-week-12345678` if you reuse that seed) and use the free-text starter kit's actual first armor slot name in place of `cap` if it differs once you run it once locally.

- [ ] **Step 4: Run the scenario**

Run: `node tests/tools/telnet-runner.js <path-to-this-scenario>.md --managed` from the `tapestry` engine repo, pointed at a packs corpus including the rebuilt `@tapestry/oracle` and `@tapestry/core`.
Expected: PASS. If step 23's negative assertion fails (still shows `/100`), re-check that the starter kit's rolled `max_hp` at level 1 is actually greater than 0 (Task 3's `armor.max_hp` anchor at L1 is `3` — confirm `interpolateNumeric` returns a non-zero rounded value at the low end, not truncated to 0).

- [ ] **Step 5: Commit**

```bash
git -C D:\Skunkworks\tapestry-packs add specs/oracle.md specs/core-progression.md specs/README.md specs/changes/2026-07-27-gear-carries-hp.md packages/@tapestry/oracle/tests/smoke/gear-carries-hp.md
git -C D:\Skunkworks\tapestry-packs commit -m "docs(specs): fold gear-carries-HP change record; add smoke coverage"
```

---

## Part C — Lane 1: level dial default, explain line, over-dial warning

### Task 6: Default `<level>`, explain the dial, warn on over-dial

**Files:**
- Modify: `D:\Skunkworks\tapestry-packs\packages\@tapestry\oracle\scripts\commands\tapestry.ts`
- Modify: `D:\Skunkworks\tapestry-packs\packages\@tapestry\oracle\scripts\area-gen.ts:608-621` (`startRun`)

**Interfaces:**
- Produces: `startRun(actor, templateId, level, explicitLevel: boolean)` — signature gains a fourth boolean param used only to decide whether to print the over-dial warning (an explicitly-chosen level that outpaces the player still starts the run; a defaulted level, by construction, never outpaces the player). Task 8 (short handles) further edits this same file's handler and must read this signature.

- [ ] **Step 1: Default the level and explain the dial in `boardList`**

In `tapestry.ts`, change `boardList` (lines 81-97) to append an explain line:

```typescript
actor.send("Pull a thread: tapestry start <id> <level>\r\n");
actor.send("<level> sets the difficulty dial - it does not scale to your gear. Higher is harder.\r\n");
```

- [ ] **Step 2: Default a missing level to the player's own combat level**

Change the `"start"` branch (lines 59-71):

```typescript
if (sub === "start") {
    if (tokens.length < 2) {
        actor.send("Usage: tapestry start <id> [level]\r\n");
        return;
    }
    let level: number;
    let explicitLevel: boolean;
    if (tokens.length >= 3) {
        level = parseInt(tokens[2], 10);
        if (isNaN(level)) {
            actor.send("Level must be a number.\r\n");
            return;
        }
        explicitLevel = true;
    } else {
        level = tapestry.progression.getLevel(actor.entityId, "combat") || 1;
        explicitLevel = false;
        actor.send("No level given - defaulting to your own level (" + level + ").\r\n");
    }
    startRun(actor, tokens[1], level, explicitLevel);
    return;
}
```

- [ ] **Step 3: Add the over-dial warning in `startRun`**

In `area-gen.ts`, change the `startRun` signature and add the warning right after the band-window check (after line 621, before the "never pull a thread from inside a thread" check):

```typescript
export function startRun(actor: any, templateId: string, level: number, explicitLevel: boolean): void {
    const tpl = getTemplate(templateId);
    if (!tpl) {
        actor.send("No such thread.\r\n");
        return;
    }
    if (tpl.state !== "open" && !isAdmin(actor)) {
        actor.send("That thread is not open yet.\r\n");
        return;
    }
    if (level < tpl.bandFloor || level > tpl.bandCap) {
        actor.send("Pick a level between " + tpl.bandFloor + " and " + tpl.bandCap + ".\r\n");
        return;
    }
    if (explicitLevel) {
        const playerLevel = tapestry.progression.getLevel(actor.entityId, "combat") || 1;
        if (level > playerLevel) {
            actor.send("Dialing " + level + " against your own level " + playerLevel + " - this will be hard. Gear up first if you are not sure.\r\n");
        }
    }
```

- [ ] **Step 4: Update the other `startRun` caller**

`oracle-admin.ts`'s admin scaffolding also calls `startRun` (confirmed by the explore report referencing `oracle-admin.ts` as the temporary admin path `tapestry.ts` replaced) — grep `startRun(` across `packages/@tapestry/oracle/scripts` and update every call site to pass `true` for `explicitLevel` (admin-dialed levels are always explicit).

- [ ] **Step 5: Build and boot-verify**

Rebuild oracle's TS, run `tapestry validate`, then `node tests/tools/telnet-runner.js --all-packs --managed`.
Expected: `Pack validation complete: 0 issue(s) found`.

- [ ] **Step 6: Fold the spec change and add a smoke test**

Update `specs/oracle.md`'s Behavior section for the `tapestry`/`startRun` commands with the default/explain/warning behavior, anchored to `tapestry.ts` and `area-gen.ts:608-624`. Use `spec-lint new change level-dial-default-and-warning --release <next oracle version> --specs oracle.md`. Add a smoke-test scenario to `packages/@tapestry/oracle/tests/smoke/` (new file `level-dial-default.md`) proving: (a) `tapestry start <id>` with no level starts at the player's own level, (b) `tapestry start <id> <high-level>` prints the over-dial warning and still starts.

- [ ] **Step 7: Commit**

```bash
git -C D:\Skunkworks\tapestry-packs add packages/@tapestry/oracle/scripts/commands/tapestry.ts packages/@tapestry/oracle/scripts/area-gen.ts packages/@tapestry/oracle/scripts/commands/oracle-admin.ts packages/@tapestry/oracle/dist specs/oracle.md specs/README.md specs/changes/2026-07-27-level-dial-default-and-warning.md packages/@tapestry/oracle/tests/smoke/level-dial-default.md
git -C D:\Skunkworks\tapestry-packs commit -m "feat(oracle): default the level dial to the player's own level, explain it, warn on over-dial"
```

---

## Part D — Lane 1: boss-room flee fix and death-tax decision

### Task 7: Tag the boss's room `no_wander` at spawn time

Wires Task 2's engine change into oracle content: the moment the boss spawns during room population, tag its room so `AttemptFlee` (and the existing `wander` behavior) will never route another mob into it.

**Files:**
- Modify: `D:\Skunkworks\tapestry-packs\packages\@tapestry\oracle\scripts\population.ts:298-325`

**Interfaces:**
- Consumes: Task 2's `tapestry.world.addRoomTag(roomId, tag)` binding.

- [ ] **Step 1: Tag the room on boss spawn**

Right after the `tapestry.mobs.spawnMob({ template: TIER_TEMPLATES.boss, roomId, override: bossOverride })` call (line 314-318), add:

```typescript
(tapestry as any).world.addRoomTag(roomId, "no_wander");
```

- [ ] **Step 2: Build and boot-verify**

Rebuild, `tapestry validate`, `node tests/tools/telnet-runner.js --all-packs --managed`.
Expected: clean boot. This depends on Part A Task 2 having already landed in the engine build the runner boots against — confirm the engine binary under test includes the `addRoomTag` binding before running (a missing binding fails loudly as "unknown function" in the Jint sandbox, not silently).

- [ ] **Step 3: Fold spec and smoke test**

Add a Behavior line to `specs/oracle.md` noting the boss room is tagged `no_wander` on spawn, anchored to `population.ts:314-319`. This is small enough to fold into Task 5's or Task 9's change record rather than its own — add it as an additional Behavior line + anchor in the `2026-07-27-gear-carries-hp.md` record's sibling for combat feel (see Task 9), naming `oracle.md` again in that record's `specs:` frontmatter if not already listed. Add a scenario to `packages/@tapestry/oracle/tests/smoke/` proving a low-HP mob adjacent to a spawned boss never flees into the boss's room across several forced-flee attempts (or, if forcing a flee outcome deterministically through the telnet runner proves impractical, at minimum assert the boss's room carries the `no_wander` tag via an admin `inspect`/room-tag-read command after the boss spawns).

- [ ] **Step 4: Commit**

```bash
git -C D:\Skunkworks\tapestry-packs add packages/@tapestry/oracle/scripts/population.ts packages/@tapestry/oracle/dist
git -C D:\Skunkworks\tapestry-packs commit -m "fix(oracle): tag the boss room no_wander on spawn

Closes S2-13 (trash mob flees into the boss room, turning first contact
into a 2v1) using the engine's new no_wander flee-avoidance (Part A Task 2)."
```

### Task 8: Death-tax feel-check decision

Resolves the brief's "death-tax feel check vs the tier-scaled death spec" item. Grounded finding: the two mechanisms are genuinely different and both already correct — `progression.ts`'s death handler (lines 156-182) applies a flat 10% of within-level XP progress on every death regardless of tier, while "tier-scaled death" (`core-combat.md`'s section of that name) refers entirely to the respawn/gear-strand consequence branch (grind repop vs Unraveling eject), not to XP loss. The playtest's "feels rough" reaction was compounded by A1 (unwinnable boss, repeated deaths) rather than a bug in the tax itself. This task is a documentation clarification, not a code change, with the actual feel re-checked live at Task 12's playtest gate.

**Files:**
- Modify: `D:\Skunkworks\tapestry-packs\specs\core-progression.md`, `D:\Skunkworks\tapestry-packs\specs\core-combat.md`

- [ ] **Step 1: Clarify the two mechanisms are distinct in both specs**

In `core-progression.md`'s "Death Penalty" section, add a line clarifying the 10% rate is flat across every death regardless of run tier, anchored to `progression.ts:156-182` (`death_penalty: 0.1` at lines 16 and 45).

In `core-combat.md`'s "tier-scaled death (never strand gear)" section, add a line clarifying that "tier-scaled" describes only the respawn/gear-strand branch (grind repop vs Unraveling eject), not XP loss, to prevent the same conflation the playtest triage made.

- [ ] **Step 2: No code change; re-check feel at Gate 1**

Do not modify `progression.ts`. Note in Task 12's playtest-gate handoff to Travis that if the death tax still feels rough on a winnable boss (post gear-carries-HP), the concrete lever is `death_penalty` in `progression.ts:16,45` (currently `0.1` on both combat and magic tracks) — but do not tune it preemptively; that is Travis's call at the gate, informed by an actually-winnable playthrough rather than the current unwinnable one.

- [ ] **Step 3: Commit**

```bash
git -C D:\Skunkworks\tapestry-packs add specs/core-progression.md specs/core-combat.md
git -C D:\Skunkworks\tapestry-packs commit -m "docs(specs): clarify death XP tax is flat, not tier-scaled

Tier-scaled death (core-combat.md) governs respawn/gear-strand behavior
only. The playtest triage conflated the two; XP loss was already correct."
```

---

## Part E — Human Gate 1: retune, bake, playtest (STOP HERE)

### Task 9: Bake week one with Parts A-D live, self-check, then hand off to Travis

**This task ends in a stop, not a commit.** Do not proceed to Part F until Travis has explicitly played the organic path and told you it is winnable.

- [ ] **Step 1: Ensure all of Tasks 1-8 are built and boot-clean together**

Rebuild every touched package, run `tapestry validate` in each of `@tapestry/core` and `@tapestry/oracle`, then `node tests/tools/telnet-runner.js --all-packs --managed` from the engine repo against the full corpus (core + oracle + threadwalker, unchanged so far).
Expected: `Pack validation complete: 0 issue(s) found`.

- [ ] **Step 2: Bake a fresh week-one draft via the mint bench**

Using an admin session (per `oracle-mint-bench.md`'s pattern), roll a new draft thread at week one's intended band (check `content/notes/week-one-mint.md` in `rocky` for week one's actual authored band/seed if it needs to match the live template rather than a throwaway test bake — if this is meant to retune the SAME live week-one template rather than mint a new one, use `mint` against the existing template id instead of baking fresh). Do not flip it open yet.

- [ ] **Step 3: Self-playtest the organic path as a sanity check only**

Play through as a regular player once yourself: grind trash on found/starter gear from level 1, confirm gear pickups visibly raise max HP on wear (Task 4), reach the boss, confirm the ward/dispel teaching moment survives long enough to be seen (A2, already shipped per the brief), and attempt the boss fight. This is a sanity check, not certification — do not declare it winnable yourself, and do not flip the thread open based on this pass alone, per the hard constraint against self-certifying winnability.

- [ ] **Step 4: STOP and hand off to Travis**

Report to Travis: what changed (gear now grants max HP on wear, per-piece amounts X/Y/Z at level 1 from Task 3's first-pass numbers, the level dial defaults to his own level and warns on over-dial, the boss room no longer receives a fled-in trash mob), and that the draft is baked but NOT flipped open. Ask him to play the organic path himself. Do not touch `mint flip`, do not proceed to Part F's spec-lint folding for this specific balance content, and do not begin Part G (publish/deploy) until he confirms winnability and tells you to flip it. If he asks for numeric adjustments to the Task 3 anchors, make them directly in `master-balance.yml` and repeat Steps 1-3 of this task before handing back.

---

## Part F — Lane 2/3 sweep (independent of Gate 1 — proceed now)

These are the cheap-and-certain UX/polish items. None of them touch week-one balance data, so they do not need to wait for Travis's playtest gate to be implemented — only the final flip-open and deploy (Gate 2) wait on him. Read each repo's CLAUDE.md before its first edit if you have not already this session.

### Task 10: `dispel` command aliases

**Files:**
- Modify: `D:\Skunkworks\tapestry-packs\packages\@tapestry\core\scripts\commands\dispel.ts:9-13`
- Modify: `D:\Skunkworks\tapestry-packs\packages\@tapestry\core\help\dispel.yaml`

- [ ] **Step 1: Add aliases**

In `dispel.ts`, add an `aliases` array to the registration (matching the pattern used by `kill`/`consider`/`equipment` elsewhere in this pack):

```typescript
tapestry.commands.register({
    name: 'dispel',
    aliases: ['dispell', 'disp'],
    roles: ['player'],
    args: {},
```

- [ ] **Step 2: Update help content**

In `dispel.yaml`, extend `syntax:` and add `keywords:` entries, mirroring `consider.yaml`'s pattern of listing every callable form:

```yaml
syntax:
  - "dispel"
  - "dispell"
  - "disp"
```

Add `dispell` and `disp` to the existing `keywords:` list.

- [ ] **Step 3: Verify**

`tapestry validate` in `@tapestry/core`, then `node tests/tools/telnet-runner.js --all-packs --managed`.
Expected: clean. Add a one-line assertion to whichever smoke test already exercises `dispel` (`packages/@tapestry/core/tests/smoke/ward-capability.md` per the earlier file listing) proving `dispell` (two Ls) also fires the same ward-clear message.

- [ ] **Step 4: Commit**

```bash
git -C D:\Skunkworks\tapestry-packs add packages/@tapestry/core/scripts/commands/dispel.ts packages/@tapestry/core/help/dispel.yaml packages/@tapestry/core/tests/smoke/ward-capability.md
git -C D:\Skunkworks\tapestry-packs commit -m "fix(core): add dispell/disp aliases for the dispel verb

S2-14: real-world evidence a player typos the second L. Cheap, high value."
```

### Task 11: Short board handles (ordinal + prefix, `start` keyword optional)

**Files:**
- Modify: `D:\Skunkworks\tapestry-packs\packages\@tapestry\oracle\scripts\commands\tapestry.ts` (further edits on top of Task 6's version)

**Interfaces:**
- Consumes: Task 6's `startRun(actor, templateId, level, explicitLevel)` signature.

- [ ] **Step 1: Extract a shared open-templates helper and resolve by ordinal or prefix**

Add a helper near the top of the file (after imports):

```typescript
function openTemplates(): ReturnType<typeof listTemplates> {
    return listTemplates().filter((t) => t.state === "open");
}

function resolveTemplateRef(ref: string): string | null {
    const open = openTemplates();
    const ordinal = parseInt(ref, 10);
    if (!isNaN(ordinal) && String(ordinal) === ref && ordinal >= 1 && ordinal <= open.length) {
        return open[ordinal - 1].templateId;
    }
    const exact = open.find((t) => t.templateId === ref);
    if (exact) { return exact.templateId; }
    const prefixMatches = open.filter((t) => t.templateId.indexOf(ref) === 0);
    if (prefixMatches.length === 1) { return prefixMatches[0].templateId; }
    return null;
}
```

- [ ] **Step 2: Number the board and accept id-or-ordinal in `start`**

Change `boardList` (lines 81-97) to show a 1-based ordinal per row:

```typescript
function boardList(actor: any): void {
    const open = openTemplates();
    if (open.length === 0) {
        actor.send("No threads are open yet.\r\n");
        return;
    }
    actor.send("The Tapestry - open threads:\r\n");
    for (let i = 0; i < open.length; i++) {
        const t = open[i];
        actor.send(
            "  " + (i + 1) + ") " + t.templateId + "  " + t.name +
            "  [levels " + t.bandFloor + "-" + t.bandCap + "]" +
            "  gear: ~" + t.bandFloor + "+\r\n"
        );
    }
    actor.send("Pull a thread: tapestry start <number or id> [level]\r\n");
    actor.send("<level> sets the difficulty dial - it does not scale to your gear. Higher is harder.\r\n");
}
```

Change the `"start"` branch to resolve through `resolveTemplateRef` before calling `startRun`:

```typescript
if (sub === "start") {
    if (tokens.length < 2) {
        actor.send("Usage: tapestry start <number or id> [level]\r\n");
        return;
    }
    const resolvedId = resolveTemplateRef(tokens[1]);
    if (!resolvedId) {
        actor.send("No such thread. Use its board number or full id.\r\n");
        return;
    }
    let level: number;
    let explicitLevel: boolean;
    if (tokens.length >= 3) {
        level = parseInt(tokens[2], 10);
        if (isNaN(level)) {
            actor.send("Level must be a number.\r\n");
            return;
        }
        explicitLevel = true;
    } else {
        level = tapestry.progression.getLevel(actor.entityId, "combat") || 1;
        explicitLevel = false;
        actor.send("No level given - defaulting to your own level (" + level + ").\r\n");
    }
    startRun(actor, resolvedId, level, explicitLevel);
    return;
}
```

- [ ] **Step 3: Accept `tapestry <id-or-ordinal> [level]` without the `start` keyword**

Change the fallback at the end of the handler (currently `actor.send("Usage: tapestry | tapestry start <id> <level>\r\n"); `) to attempt resolution before giving up:

```typescript
const bareResolved = resolveTemplateRef(sub);
if (bareResolved) {
    let level: number;
    let explicitLevel: boolean;
    if (tokens.length >= 2) {
        level = parseInt(tokens[1], 10);
        if (isNaN(level)) {
            actor.send("Level must be a number.\r\n");
            return;
        }
        explicitLevel = true;
    } else {
        level = tapestry.progression.getLevel(actor.entityId, "combat") || 1;
        explicitLevel = false;
        actor.send("No level given - defaulting to your own level (" + level + ").\r\n");
    }
    startRun(actor, bareResolved, level, explicitLevel);
    return;
}

actor.send("Usage: tapestry | tapestry start <number or id> [level] | tapestry <number or id> [level]\r\n");
```

- [ ] **Step 4: Verify**

Rebuild, `tapestry validate`, `node tests/tools/telnet-runner.js --all-packs --managed`.
Expected: clean.

- [ ] **Step 5: Fold spec and smoke test**

Update `specs/oracle.md`'s Behavior for the board/`tapestry` command. Add a smoke-test scenario (`packages/@tapestry/oracle/tests/smoke/short-handles.md`) proving `tapestry start 1`, `tapestry <id>` with no `start`, and a prefix match all resolve to the same run.

- [ ] **Step 6: Commit**

```bash
git -C D:\Skunkworks\tapestry-packs add packages/@tapestry/oracle/scripts/commands/tapestry.ts packages/@tapestry/oracle/dist specs/oracle.md specs/README.md packages/@tapestry/oracle/tests/smoke/short-handles.md
git -C D:\Skunkworks\tapestry-packs commit -m "feat(oracle): board ordinals, prefix match, and start-keyword-optional handles

B6/S2-10/S2-18: 8-digit seeds were bad UX. Board rows are now numbered;
tapestry start 1, tapestry <id>, and tapestry <id> <level> all work."
```

### Task 12: `hint` as a bare command

The guide's own say-trigger matching is already case-insensitive (confirmed: `guide.ts:105` lowercases before matching) — no fix needed there. The remaining gap is that `hint` typed as a bare command (not `say hint`) falls through to "Huh?" because no `hint` command is registered at all.

**Files:**
- Create: `D:\Skunkworks\tapestry-packs\packages\@tapestry\oracle\scripts\commands\hint.ts`
- Create: `D:\Skunkworks\tapestry-packs\packages\@tapestry\oracle\help\hint.yaml`

- [ ] **Step 1: Register the command as a thin forward to the existing say-trigger**

```typescript
import * as tapestry from "@tapestry/engine";

// hint.ts - bare `hint` command (S2-4). The guide already answers "hint" said
// aloud (guide.ts's onSay, case-insensitive) - this just gives the natural
// bare-command form the same answer, by re-dispatching through say the same
// way area-gen.ts already re-dispatches `look` via admin.executeAs.
// ASCII; braces on all control flow.

tapestry.commands.register({
    name: "hint",
    aliases: [],
    roles: ["player"],
    args: {},
    handler: function (actor, resolved) {
        (tapestry as any).admin.executeAs(actor.entityId, "say hint");
    },
});
```

- [ ] **Step 2: Help content**

```yaml
id: "hint"
title: "Hint"
category: "character"
role: "player"
keywords: [guide, help, stuck]
brief: "Ask for a hint, the same as saying HINT aloud."
syntax:
  - "hint"
body: |
  Hint asks aloud for a hint, exactly as if you had said HINT to whoever
  is listening. If no one nearby answers, nothing happens.
see_also: [consider, character]
```

- [ ] **Step 3: Verify**

Rebuild, `tapestry validate`, `node tests/tools/telnet-runner.js --all-packs --managed`.
Expected: clean. Extend whatever smoke test already exercises the guide's hint response with a step asserting the bare `hint` command produces the same output as `say hint`.

- [ ] **Step 4: Commit**

```bash
git -C D:\Skunkworks\tapestry-packs add packages/@tapestry/oracle/scripts/commands/hint.ts packages/@tapestry/oracle/help/hint.yaml packages/@tapestry/oracle/dist
git -C D:\Skunkworks\tapestry-packs commit -m "feat(oracle): add bare hint command, forwards to the existing say-trigger

S2-4: guide triggers were already case-insensitive; bare HINT (not said
aloud) was the actual discoverability gap."
```

### Task 13: Cleared-thread exit hint

**Files:**
- Modify: `D:\Skunkworks\tapestry-packs\packages\@tapestry\oracle\scripts\consequence-hooks.ts:72-79`

- [ ] **Step 1: Print the exit hint when a room clears**

Change the non-boss branch of the `mob.death` handler:

```typescript
const remaining = (tapestry as any).world.getEntitiesInRoom(roomId, "npc");
if (!remaining || remaining.length === 0) {
    stampForRoom(roomId, "looted");
    (tapestry as any).world.sendToRoom(roomId, "Nothing more stirs here. If the thread feels done, LEAVE returns you to the hub.\r\n");
}
```

- [ ] **Step 2: Verify**

Rebuild, `tapestry validate`, `node tests/tools/telnet-runner.js --all-packs --managed`.
Expected: clean.

- [ ] **Step 3: Fold spec and smoke test**

Update `specs/oracle.md`'s consequence-hooks Behavior section, anchored to `consequence-hooks.ts:72-80`. Add a scenario proving the last-mob-death in a room prints the exit hint.

- [ ] **Step 4: Commit**

```bash
git -C D:\Skunkworks\tapestry-packs add packages/@tapestry/oracle/scripts/consequence-hooks.ts packages/@tapestry/oracle/dist specs/oracle.md specs/README.md
git -C D:\Skunkworks\tapestry-packs commit -m "fix(oracle): print an exit hint when a room clears

A4: a cleared no-boss thread was a dead end with no surfaced way out."
```

### Task 14: School-gate message names the actual action

**Files:**
- Modify: `D:\Skunkworks\tapestry-packs\packages\@tapestry\oracle\scripts\commands\tapestry.ts:44-48`

Confirmed against threadwalker's actual room content (`areas/hub/rooms/hub-entry.yaml`, named "The Waystone Hall", with a `south` exit to `school-entry`): the brief's illustrative fix text is accurate to real content, not just an example.

- [ ] **Step 1: Update the gate message**

```typescript
const unlocked = tapestry.world.getProperty(actor.entityId, "tapestry_unlocked");
if (!unlocked) {
    actor.send("The Tapestry hangs dark. Walk south from the Waystone Hall to find the school first.\r\n");
    return;
}
```

- [ ] **Step 2: Verify**

Rebuild, `tapestry validate`, `node tests/tools/telnet-runner.js --all-packs --managed`.
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git -C D:\Skunkworks\tapestry-packs add packages/@tapestry/oracle/scripts/commands/tapestry.ts packages/@tapestry/oracle/dist
git -C D:\Skunkworks\tapestry-packs commit -m "fix(oracle): school gate names the actual action, not just 'the school'

S2-7: 'school' and 'help school' resolve to nothing; the gate message now
names the real room and exit direction."
```

### Task 15: QTE mob-name substitution and countered-swell payoff legibility

**Files:**
- Modify: `D:\Skunkworks\threadwalker\scripts\oracle\week-one-ward.js:94-112` (`wardBossIfPresent`)
- Modify: `D:\Skunkworks\tapestry-packs\packages\@tapestry\core\scripts\combat\output.ts`

**Interfaces:**
- Produces (output.ts): a generic condition-transition broadcast on any `entity.vital.changed` with `reason === "combat.swell"`, reusing the existing `sendConditionTransition`/`conditionIndex`/`conditionText` machinery already shared with `look`.

- [ ] **Step 1: Substitute the boss's real name into the swell tell-lines**

In `week-one-ward.js`'s `wardBossIfPresent`, after the existing description override (line 109), add overrides for the tell-lines and narration, using the same `name` variable already in scope:

```javascript
function wardBossIfPresent(roomId) {
    var npcs = tapestry.world.getEntitiesInRoom(roomId, "npc") || [];
    for (var i = 0; i < npcs.length; i++) {
        var mobId = npcs[i].id;
        var keywords = tapestry.world.getEntityKeywords(mobId) || [];
        var isGuardian = false;
        for (var k = 0; k < keywords.length; k++) {
            if (String(keywords[k]).toLowerCase() === "guardian") {
                isGuardian = true;
                break;
            }
        }
        if (!isGuardian) { continue; }
        if (tapestry.world.hasTag(mobId, "req_ward_dispel")) { continue; }
        tapestry.world.addTag(mobId, "req_ward_dispel");
        tapestry.world.setProperty(mobId, "description", WARD_BOSS_DESC);
        var name = npcs[i].name && npcs[i].name.trim() !== "" ? npcs[i].name : "something here";
        tapestry.world.setProperty(mobId, "swell_line1_tell_full", name + " winds up a heavy STRIKE - sidestep it!\r\n");
        tapestry.world.setProperty(mobId, "swell_line1_tell_shape", name + " winds up for something heavy.\r\n");
        tapestry.world.setProperty(mobId, "swell_line2_tell_full", name + " rears back for a crushing SLAM - brace for it!\r\n");
        tapestry.world.setProperty(mobId, "swell_line2_tell_shape", name + " rears back for something crushing.\r\n");
        tapestry.world.setProperty(mobId, "swell_tell_hidden", name + " gathers some dark energy.\r\n");
        tapestry.world.setProperty(mobId, "swell_narration_countered", "Clean read. Your counter lands and " + name + " staggers.");
        tapestry.world.setProperty(mobId, "swell_narration_whiffed", "Wrong move. The blow crashes through your guard.");
        tapestry.world.setProperty(mobId, "swell_narration_weathered", "Too slow. The blow lands full force.");
        tapestry.world.sendToRoom(roomId, telegraphLineFor(npcs[i].name));
    }
}
```

- [ ] **Step 2: Make the countered swell's real damage visible**

The engine already deals real damage on a countered swell (`SwellClockManager.ApplyDamage`, `"combat.swell"` reason, funneled through `VitalsService.Apply` -> `entity.vital.changed` with `{vital, old, new, delta, reason}`) — it just never triggers a visible condition-band line the way melee hits do (`combat.hit`-only trigger in `output.ts`'s `sendConditionTransition` caller). Add a new listener in `output.ts`, after the existing `combat.hit` handler:

```typescript
// --- Swell counter damage visibility (S2-20b) ---
// SwellClockManager.ApplyDamage funnels through VitalsService.Apply with
// reason "combat.swell", which fires entity.vital.changed but never
// combat.hit (that only fires for melee auto-attacks) - so a countered
// swell's real HP loss never triggered the shared condition-band line.
// Same band ladder as look/combat.hit (condition.js), so a countered
// swell and a melee hit read consistently.
tapestry.events.on("entity.vital.changed", function(event) {
    var data = event.data || {};
    if (data.vital !== "hp" || data.reason !== "combat.swell") { return; }
    var newValue = typeof data.new === "number" ? data.new : 0;
    var oldValue = typeof data.old === "number" ? data.old : 0;
    if (newValue >= oldValue) { return; }
    var targetId = event.sourceEntityId;
    var entity = tapestry.world.getEntity(targetId);
    var targetName = entity && entity.name ? entity.name : "it";
    if (event.roomId) {
        var stats = tapestry.stats.get(targetId);
        if (!stats) { return; }
        var band = conditionIndex(stats.hp, stats.maxHp);
        var line = "<combat_status>" + targetName + " " + conditionText(band) + ".</combat_status>\r\n";
        tapestry.world.sendToRoom(event.roomId, line);
    }
});
```

Note this deliberately does NOT reuse `lastConditionBand`/`sendConditionTransition`'s per-attacker dedup bookkeeping (there is no attacker id on this event) — it broadcasts to the room on every swell-damage band transition unconditionally, which is fine given swell counters are already a rare, telegraphed, once-per-cycle event, not a per-tick spam risk.

- [ ] **Step 3: Verify**

Rebuild oracle/core/threadwalker as needed, `tapestry validate` in each touched pack, `node tests/tools/telnet-runner.js --all-packs --managed`.
Expected: clean.

- [ ] **Step 4: Fold spec and smoke test**

Update `specs/core-combat.md` (tapestry-packs) with the new swell-damage condition-transition Behavior, anchored to `output.ts`. Update threadwalker's `specs/threadwalker-world.md` with the name-substitution Behavior, anchored to `scripts/oracle/week-one-ward.js:94-118`. Extend or add a smoke test scenario proving a countered swell against week one's boss shows the boss's real name in the tell line and a condition-transition line after a counter.

- [ ] **Step 5: Commit**

```bash
git -C D:\Skunkworks\threadwalker add scripts/oracle/week-one-ward.js specs/threadwalker-world.md
git -C D:\Skunkworks\threadwalker commit -m "fix: substitute the boss's real name into swell telegraph/narration text

S2-20a: text said 'the guardian' regardless of the mob's rolled name."
```

```bash
git -C D:\Skunkworks\tapestry-packs add packages/@tapestry/core/scripts/combat/output.ts packages/@tapestry/core/dist specs/core-combat.md specs/README.md
git -C D:\Skunkworks\tapestry-packs commit -m "fix(core): make a countered swell's real damage visible

S2-20b: SwellClockManager already deals real chunk damage on a countered
swell; nothing surfaced it. Reuses the existing look/combat.hit condition
band ladder via entity.vital.changed."
```

### Task 16: Guide idempotency across a death/respawn cycle — verify, then fix only if it still reproduces

Grounded finding: the unconditional "Say HELLO to be outfitted" message lives only in `area-gen.ts:311`, inside `buildArea` — the OLD `solo`-command creation path. The live per-player run path players actually use (`tapestry start` -> `startRun` -> `instantiateRunArea`, lines 696-768) never sends that message at all; it just says "The thread pulls taut and draws you in." and auto-looks. A grind-tier death repop (`output.ts`'s `entity.vital.depleted` handler, grind branch) teleports back to `entryRoomId` and publishes `run.grind_repop` — it does not call `instantiateRunArea`/`populateEntry`/`buildArea` again, so nothing re-prompts. Guide's own `onSay` handler already correctly no-ops on an already-outfitted player (`guide.ts:94-98`). This task verifies that chain end to end before assuming a fix is still needed.

**Files:**
- Create: `D:\Skunkworks\tapestry-packs\packages\@tapestry\oracle\tests\smoke\guide-idempotency.md`
- Modify only if Step 2 fails: `D:\Skunkworks\tapestry-packs\packages\@tapestry\oracle\scripts\starter-kit.ts`, `D:\Skunkworks\tapestry-packs\packages\@tapestry\oracle\scripts\guide.ts`

- [ ] **Step 1: Write the verification scenario**

```markdown
# Guide Outfitting Idempotency Across Death

S2-17 verification: confirms the guide never re-prompts an already-outfitted
player after a grind-tier death repop. area-gen.ts's unconditional "Say
HELLO" message lives only in the disused solo/buildArea path
(area-gen.ts:311) - the live tapestry-start path (instantiateRunArea,
area-gen.ts:696-768) never sends it, and guide.ts's onSay already gates on
already-granted state (guide.ts:94-98).

## Setup
- Players: Gamemaster, Wanderer

## Steps
1. Wanderer: `set player tapestry_unlocked Wanderer true`
2. Wanderer: `tapestry start oracle-week-12345678 1`
3. Wait for Wanderer sees: `The thread pulls taut and draws you in.`
4. Wanderer: `say hello`
5. Assert Wanderer sees: `Take these`
6. Wanderer: `kill trash mob until dead, or admin-damage self to 0 hp`
7. Wait for Wanderer sees: `You wake at the threshold.`
8. Assert Wanderer does not see: `Say HELLO when you are ready to be outfitted`
9. Wanderer: `say hello`
10. Assert Wanderer sees: `You carry all I can give`
```

Step 6 is illustrative — replace it with the repo's actual convention for forcing a player death in a scenario (check other smoke tests under `packages/@tapestry/core/tests/smoke/death-grind.md` for the exact admin command used to zero a player's HP for a deterministic test, e.g. an admin `damage`/`set player hp` command, and use that same idiom here instead of a real combat grind).

- [ ] **Step 2: Run it**

Run: `node tests/tools/telnet-runner.js <path>.md --managed`
Expected: PASS, confirming the finding above. If step 8 or 10 FAILS (the guide does re-prompt, or does not correctly recognize the already-outfitted state), the bug is real and reachable through a path this investigation didn't trace — in that case, add a read-only export to `starter-kit.ts`:

```typescript
export function hasStarterKit(areaId: string, playerId: string): boolean {
    return grantedSet(areaId).has(playerId);
}
```

and gate whatever unconditional prompt is actually firing (re-trace the failing scenario's transcript to find the exact send site) behind `!hasStarterKit(areaId, playerId)` before re-running Step 2.

- [ ] **Step 3: Fold the result into the spec regardless of outcome**

If Step 2 passes as expected, add a Behavior line to `specs/oracle.md` stating explicitly that guide outfitting is idempotent across death (a currently-undocumented but real property), anchored to `guide.ts:94-98` and `area-gen.ts:696-768`, with a `Tombstone`-style note in "Rejected and Reverted" that S2-17 was investigated and found already resolved by the run-path refactor, not by new code in this patch. If Step 2 failed and you added the fix, document the fix normally as a Behavior change instead.

- [ ] **Step 4: Commit**

```bash
git -C D:\Skunkworks\tapestry-packs add packages/@tapestry/oracle/tests/smoke/guide-idempotency.md specs/oracle.md specs/README.md
git -C D:\Skunkworks\tapestry-packs commit -m "test(oracle): verify guide outfitting idempotency across death (S2-17)

Confirmed already resolved by the tapestry-start run path (instantiateRunArea
never re-prompts); the old unconditional message only lives in the disused
solo/buildArea path."
```

### Task 17: Ambient chatter variety

Root cause confirmed: `idle.ts`'s cooldown/probability gate (`idle_interval`/`idle_chance`) already works correctly — each hub NPC simply has exactly one `idle_commands` line, so the engine's random-pick-from-array always resolves to the same line. The fix is content variety, not a cooldown bug.

**Files:**
- Modify: `D:\Skunkworks\threadwalker\areas\hub\mobs\hub-keeper.yaml`
- Modify: `D:\Skunkworks\threadwalker\areas\hub\mobs\hub-wanderer.yaml`

- [ ] **Step 1: Add variety lines**

In `hub-keeper.yaml`, change `idle_commands` to a list of several distinct in-fiction lines and lengthen the interval:

```yaml
idle_interval: 40
idle_commands:
  - 'emote traces a finger along a loose thread, careful not to pull it.'
  - 'emote studies the Tapestry without touching it.'
  - 'say The threads always find their way back to the loom, one way or another.'
```

In `hub-wanderer.yaml`:

```yaml
idle_interval: 40
idle_commands:
  - 'say Word is the Weaver has been gone a long while now.'
  - 'say I keep meaning to pull a thread. Keep putting it off.'
  - 'emote shifts against the wall, resting between threads.'
```

- [ ] **Step 2: Verify**

`tapestry validate` in threadwalker, `node tests/tools/telnet-runner.js --all-packs --managed`.
Expected: clean.

- [ ] **Step 3: Fold spec**

Update `specs/threadwalker-world.md` if it documents hub NPC ambient behavior; otherwise no spec change is owed (content-data-only tuning, no behavior change to the mechanism itself).

- [ ] **Step 4: Commit**

```bash
git -C D:\Skunkworks\threadwalker add areas/hub/mobs/hub-keeper.yaml areas/hub/mobs/hub-wanderer.yaml
git -C D:\Skunkworks\threadwalker commit -m "fix: give hub ambient NPCs multiple idle lines, lengthen the interval

S2-9: idle.ts's cooldown/chance gate was already correct - each NPC just
had exactly one line, so repetition was guaranteed, not probabilistic."
```

### Task 18: Active-run refusal names the run and the way out

**Files:**
- Modify: `D:\Skunkworks\tapestry-packs\packages\@tapestry\oracle\scripts\area-gen.ts:626-638`

- [ ] **Step 1: Read the active run before refusing, and name it**

```typescript
if (String(hubRoomId || "").indexOf(RUN_NAMESPACE + ":") === 0) {
    const activeRaw = (tapestry as any).world.getProperty(playerId, "oracle_active_run");
    const activeTemplateName = (function (): string {
        if (!activeRaw) { return "a thread"; }
        const activeAreaId = String(activeRaw).split("|")[0];
        const activeTpl = getTemplate(activeAreaId);
        return activeTpl ? activeTpl.name : "a thread";
    })();
    actor.send("You are still walking " + activeTemplateName + ". Leave it or recall to end it, then pull another.\r\n");
    return;
}
```

Note `getTemplate` is keyed by `templateId`, not the per-player `runSlug` (`activeAreaId` here) — check whether `getTemplate` can resolve a run slug back to its template, or whether the run area itself carries a readable `template_id`-style area attribute (check `tapestry.authoring.setAreaAttribute` calls in `instantiateRunArea`, lines 718-720, for whether the originating `tpl.templateId` is stored anywhere retrievable on the run area) before assuming this lookup resolves — if it does not, fall back to a generic "You are still walking a thread." rather than a broken template-name lookup, but still keep the "Leave it or recall to end it" addition, which does not depend on the name resolving.

- [ ] **Step 2: Verify**

Rebuild, `tapestry validate`, `node tests/tools/telnet-runner.js --all-packs --managed`.
Expected: clean.

- [ ] **Step 3: Fold spec**

Update `specs/oracle.md`'s Behavior for the nested-run refusal (already documented as shipped in the prior release's change record — add a follow-up note, not a new mechanism).

- [ ] **Step 4: Commit**

```bash
git -C D:\Skunkworks\tapestry-packs add packages/@tapestry/oracle/scripts/area-gen.ts packages/@tapestry/oracle/dist specs/oracle.md specs/README.md
git -C D:\Skunkworks\tapestry-packs commit -m "fix(oracle): nested-run refusal names the active run and the way out

B2/B3: the refusal fired but never said which run was active or that
leave/recall ends it."
```

### Task 19: Dangling landmark pronoun in generated prose

**Files:**
- Modify: `D:\Skunkworks\tapestry-packs\packages\@tapestry\oracle\scripts\sector-compose.ts:509-517`

Root cause confirmed: the four direction "tails" appended after an `afar` flavor sentence all use the bare pronoun "It", which only resolves when the preceding `afar` sentence happens to have a physical-object subject. LLM-authored `afar` dressing for a themed landmark (e.g. atmospheric lines like "A breath of cold cuts through the kitchen heat.") does not reliably supply one. The vertical-direction branch two lines above (`"The " + landmark.name + " lies somewhere " + dir + "."`) already avoids this by naming the landmark explicitly — apply the same pattern to the horizontal tails.

- [ ] **Step 1: Name the landmark instead of using a pronoun**

```typescript
if (variant < 0.5 && afars.length > 0) {
    const afar = afars[Math.floor(afarPick * afars.length)];
    const tails = [
        " The " + landmark.name + " lies to the " + dir + " of here.",
        " The " + landmark.name + " stands " + dir + " of here.",
        " From here, the " + landmark.name + " is " + dir + ".",
        " The way " + dir + " leads toward the " + landmark.name + ".",
    ];
    return afar + tails[Math.floor(lineRoll * tails.length)];
}
```

- [ ] **Step 2: Verify**

Rebuild, `tapestry validate`, `node tests/tools/telnet-runner.js --all-packs --managed`.
Expected: clean. Since this is pure string generation with no engine-side dependency, also worth a direct check: read a few generated room descriptions via a mint-bench bake and confirm no "It" dangles.

- [ ] **Step 3: Fold spec**

Update `specs/oracle.md`'s room-prose Behavior section, anchored to `sector-compose.ts:509-518`.

- [ ] **Step 4: Commit**

```bash
git -C D:\Skunkworks\tapestry-packs add packages/@tapestry/oracle/scripts/sector-compose.ts packages/@tapestry/oracle/dist specs/oracle.md specs/README.md
git -C D:\Skunkworks\tapestry-packs commit -m "fix(oracle): name the landmark in direction-reference tails, not 'it'

S2-26: 'It stands west of here' dangled when the preceding afar line's
subject wasn't the landmark itself. Matches the vertical-direction branch's
existing pattern of naming the landmark explicitly."
```

### Task 20: `consider` discoverability

**Files:**
- Modify: `D:\Skunkworks\tapestry-packs\packages\@tapestry\oracle\scripts\guide.ts:110-113`

`consider`/`con` already exists and works (`core/scripts/combat/commands.ts:72-100`) — the gap is purely that the guide's hint text never names the verb.

- [ ] **Step 1: Name the verb in the hint line**

```typescript
if (/\b(hint|hints|where|lost|way|road|landmark|boss)\b/.test(lower)) {
    (tapestry as any).mobs.command(mob.entityId, "say Follow the roads - they run straight to the landmarks, and something worth fighting holds each one.");
    (tapestry as any).mobs.command(mob.entityId, "say CONSIDER what you meet before you swing, and it will size things up for you. The deep chambers are not kind.", 1.5);
    return;
}
```

- [ ] **Step 2: Verify**

Rebuild, `tapestry validate`, `node tests/tools/telnet-runner.js --all-packs --managed`.
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git -C D:\Skunkworks\tapestry-packs add packages/@tapestry/oracle/scripts/guide.ts packages/@tapestry/oracle/dist
git -C D:\Skunkworks\tapestry-packs commit -m "fix(oracle): guide names the CONSIDER verb explicitly

S2-23: consider already existed and worked; the hint text never said the
word, so it was undiscoverable."
```

### Task 21: Lesson death-sequence ordering (S2-8) — investigate before committing to a fix

This item is in the brief's Lane 3 list under the general "output cadence" cluster but was not fully scoped during this plan's research. Before implementing, re-read `D:\Skunkworks\threadwalker\scripts\mobs\the-lesson.js`'s `onAttack` (lines 18-37) and `D:\Skunkworks\tapestry-packs\packages\@tapestry\core\scripts\combat\commands.ts:17-27` together: `onAttack` runs synchronously inside `tapestry.combat.engage(...)` (dispatched via `combat.engage` -> `onattack-dispatch.ts`), so the "You attack the lesson!" line at `commands.ts:27` (which only sends after `engage()` returns) unavoidably prints after the loss narration and aftermath-room teleport that `onAttack` already triggered synchronously.

**Files:**
- Modify: `D:\Skunkworks\tapestry-packs\packages\@tapestry\core\scripts\combat\commands.ts:17-27`

- [ ] **Step 1: Send the attack-confirmation line before engaging, not after**

The ordering bug is that the attacker's own "You attack X!" confirmation is sent AFTER `engage()` returns, but for a scripted designed-loss mob, `engage()` itself synchronously triggers a room transition. Move the confirmation send to fire before `engage()` is called, so the player always sees their own action acknowledged before any synchronous consequence of it:

```typescript
handler: function (player, resolved) {
    var target = resolved.target;
    player.send("You attack " + target.name + "!\r\n");
    var result = tapestry.combat.engage(player.entityId, target.id);
    if (result === "cooldown") {
        // existing cooldown-message branch stays as-is, but the confirmation
        // line above now prints unconditionally, even on a rejected engage -
        // check the existing branch structure at commands.ts:17-27 before
        // finalizing this change, since a cooldown/failure result should NOT
        // print "You attack" first. Guard the send behind a pre-check of
        // whatever condition currently gates the "ok" branch, rather than
        // moving the send unconditionally above the call.
    }
},
```

The snippet above is deliberately incomplete — read the full existing branch structure of `commands.ts:17-27` (not just the `"ok"` case excerpted in this plan's research) before writing the real fix, since a naive move of the send line above `engage()` would incorrectly print "You attack" even when `engage()` rejects the attack (e.g., cooldown, invalid target). The correct fix reorders only the success path: validate engageability first (whatever synchronous precondition currently makes `engage()` return non-"ok"), send confirmation, then call `engage()`, OR (simpler, if `engage()` has no separately-checkable precondition) special-case designed-loss mobs by having `the-lesson.js`'s `onAttack` NOT rely on synchronous ordering at all — e.g., defer its room transition by one tick via `tapestry.schedule.every(1, ...)` the same way `weaver-opener.js` already defers to let a preceding command's output settle first. Prefer the schedule-defer approach in `the-lesson.js` over reordering the shared `commands.ts` attack handler, since the shared handler is used by every mob in the game and a designed-loss mob is a one-off special case — do not risk the general attack path for a single school encounter.

- [ ] **Step 2: Implement the schedule-defer approach in `the-lesson.js`**

Read `the-lesson.js`'s full `onAttack` (lines 18-37) and wrap its room-transition side effects (the loss narration, teleport, room description) in a one-tick `tapestry.schedule.every(1, function() { ...; tapestry.schedule.cancel(handle); })`, mirroring `weaver-opener.js:93-101`'s exact pattern, so the shared `commands.ts` attack handler's "You attack the lesson!" line (sent synchronously right after `engage()` returns, which will now return before the deferred transition fires) prints first, in natural order.

- [ ] **Step 3: Verify**

`tapestry validate` in threadwalker, `node tests/tools/telnet-runner.js --all-packs --managed`. Manually play through the school's designed-loss encounter once and confirm the line order reads: "You attack the lesson!" -> loss narration -> aftermath room -> item-grant message (also check the S2-8 sub-finding that "hand closes on something real" has no follow-up item-grant message — if `school.js`'s `onCompleted` reward dispatch, per `QuestService.CompleteQuest`, line 300 vs 303, still prints the mechanical reward line before the narrative line, that is a separate engine-ordering question; re-verify live rather than assuming this task's scope covers it, and if it does not resolve cleanly, document it as a follow-up rather than forcing an engine change here).

- [ ] **Step 4: Fold spec and commit**

Update threadwalker's `specs/threadwalker-world.md` with the corrected ordering, anchored to `scripts/mobs/the-lesson.js`.

```bash
git -C D:\Skunkworks\threadwalker add scripts/mobs/the-lesson.js specs/threadwalker-world.md
git -C D:\Skunkworks\threadwalker commit -m "fix: defer the lesson's designed-loss transition by one tick

S2-8: the loss narration ran synchronously inside engage(), so the
attacker's own 'You attack the lesson!' confirmation printed last."
```

### Task 22: Document the deferred items

**Files:**
- Modify: `D:\Skunkworks\tapestry-packs\specs\core-combat.md` or a routing note wherever this repo tracks roadmap rows (check for an existing roadmap/backlog doc referenced by CLAUDE.md or specs/README.md before creating a new one)

- [ ] **Step 1: Record A3 and the opener-ordering item as confirmed engine-scope, deferred**

Add a "Rejected and Reverted"-style note (or the repo's equivalent roadmap-tracking location) stating: A3 (instant boss-room aggro) requires an engine change to `MobAIManager.OnPlayerEnteredRoom`'s synchronous aggro dispatch (`Tapestry.Engine/Mobs/MobAIManager.cs:320-326`), deferred 2026-07-27 per Travis. The opener-gates-first-room-render item (B1/S2-2) requires an engine change to `FlowEngine.FinalizeCreating`'s hardcoded fallback-room-then-motd/look ordering (`Tapestry.Engine/Flow/FlowEngine.cs:200-247`), with no pack-side config surface — not explicitly re-confirmed with Travis this session (treated consistently with the A3 deferral given the identical "no pack lever exists at all" shape) and worth flagging to him directly rather than assuming.

- [ ] **Step 2: Commit**

```bash
git -C D:\Skunkworks\tapestry-packs add specs/core-combat.md
git -C D:\Skunkworks\tapestry-packs commit -m "docs: record A3 and opener-ordering as deferred, engine-scope roadmap rows"
```

---

## Part G — Human Gate 2: publish and deploy (STOP HERE)

### Task 23: Version bumps and deploy — do not execute without Travis present

**This task must not be started autonomously.** Per the hard constraints, no version bump, no publish, no deploy happens without Travis in session approving each step.

- [ ] **Step 1: When Travis is present, bump versions as the tip commit in each touched repo**

`@tapestry/core` (`packages/@tapestry/core/pack.yaml`), `@tapestry/oracle` (`packages/@tapestry/oracle/pack.yaml`), and `threadwalker` (`pack.yaml`) each need a version bump reflecting everything in this plan, as the LAST commit before push in each repo (per the tip-commit publish rule in both CLAUDE.md files). Confirm with Travis the exact version numbers (this plan does not pre-select them).

- [ ] **Step 2: Confirm the engine changes (Part A) are on whatever branch/tag the droplet's `tapestry.yaml` `engine:` floor and deploy process expect**

This plan does not script the engine's own release/build/tag process — that is out of scope for an unattended pass and must be walked through with Travis directly at deploy time, since Part A's two engine changes need to reach the droplet before threadwalker's `engine: ">=0.1.53"` floor (or a bumped floor, if the deploy also updates that) is satisfied.

- [ ] **Step 3: Publish and deploy, with Travis approving each step in-session**

`tapestry login && tapestry publish` per each repo's CLAUDE.md, in `load_order` sequence (core before oracle) for tapestry-packs. Deploy per threadwalker's own process (`tapestry update` on the droplet, per its CLAUDE.md's gotchas about droplet file ownership and never hand-editing the droplet).

- [ ] **Step 4: Verify live**

Telnet to `165.22.230.43:4010`, confirm the banner shows the new core/oracle/threadwalker versions, and play one full happy-path run (school -> Tapestry board -> a thread -> the boss) to confirm gear-carries-HP and the Lane 2/3 fixes are live as expected.

---

## Self-review notes (for whoever executes this plan)

- Task 1's Step 5 test assumes a specific `YamlContentLoader.LoadItem` signature — confirm it against the real method before running; this is the one spot in this plan where the exact call shape could not be verified without running the code, flagged explicitly rather than guessed silently.
- Task 5's smoke-test seed/templateId-hex pairing needs a real computed value before it can run; the plan gives the formula and one known-good pair (`305419896` -> `oracle-week-12345678`) to reuse if in doubt.
- Task 21 is deliberately left as an investigate-then-fix task rather than a fully pre-scripted diff, because the exact branch structure of `commands.ts`'s attack handler beyond the excerpted "ok" case was not fully read during this plan's research — said so explicitly in the task rather than guessing at unread code.
- Every task that touches oracle TypeScript source also stages the corresponding `dist/` output — confirm this pack's build step is part of your normal edit-verify loop (check `package.json`'s `scripts.build`) before committing source without the compiled output, or the engine will boot stale JS.
