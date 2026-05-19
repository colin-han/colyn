# Switch Command Design

## Overview

`colyn <N>` is a shortcut for jumping between worktrees. The user types a single number and the shell either `cd`s into the matching worktree directory or, when inside a tmux session, selects the corresponding window.

This command is the "keystroke-grade" entry point of colyn's parallel Vibe Coding workflow: instead of `cd`-ing into long paths or pressing `Ctrl-B + N` inside tmux, both actions are unified behind one command.

Relation to other commands:
- `add`: creates a new worktree (usually followed by an automatic cd)
- `list`: lists existing worktrees (provides navigation info)
- `switch`: this command — **switches between already-existing worktrees only**

## Syntax

```bash
# Full command
colyn <number>
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `number` | Yes | Target worktree ID; `0` means the main directory, `N>=1` means `worktrees/task-N` |

### User-facing behavior

| Input | Behavior |
|-------|----------|
| `colyn 0` | Jump to the main directory (main worktree) |
| `colyn 1` | Jump to `worktrees/task-1` |
| `colyn N` | Jump to `worktrees/task-N` |
| `colyn 9` (not existing) | Print error + available worktrees, exit 1 |
| `colyn` | Unchanged (commander's default — shows help) |
| `colyn add` / `colyn list` etc. | Unchanged |

**There is no explicit `colyn switch <N>` form**. `switch` exists only as an internal hidden subcommand and is not shown in `--help`.

## Behavior Details

### Smart tmux switching

The behavior of `colyn <N>` in different tmux contexts:

| Current env | Target session exists | Target window exists | Action |
|-------------|----------------------|---------------------|--------|
| Outside tmux | No | — | `cd` into target |
| Outside tmux | Yes | No | `cd` into target (degraded) |
| Outside tmux | Yes | Yes | `exec tmux attach-session -t <session>:<window>` |
| In tmux (same session) | — | Yes | Node-side `switchWindow()` call (includes iTerm2 title sync) |
| In tmux (same session) | — | No | `cd` into target (degraded) |
| In tmux (other session) | Yes | Yes | `exec tmux attach-session -t <session>:<window>` (fallback) |

The "in tmux (same session) + window exists" case does **not** go through the shell protocol — `switchWindow()` is a synchronous Node-side IPC call that already syncs the iTerm2 title; no need to delegate `tmux select-window` to the shell.

### Window index convention

Based on the existing `src/core/tmux.ts` implementation:

- Session name = Project name
- Each worktree maps to one window
- Window index equals Worktree ID
  - Main worktree (ID = 0) → window 0
  - task-N → window N

If a real-world session has window indexes that no longer match worktree IDs (e.g. the user manually reordered windows), the locate step fails gracefully and the command degrades to plain `cd`, ensuring the command never "does nothing".

### Not inside a project

If the current directory is not inside a colyn project, `colyn <N>` errors out with "current directory is not inside a colyn project".

## Internal Implementation

### Overall dispatch

From the user's perspective the only entry is `colyn <N>`, but internally this is routed through a commander hidden subcommand `switch <number>`:

```
process.argv  --(preprocess)-->  commander  --(dispatch)-->  switch handler  --(emit)-->  shell/colyn.sh
```

#### Step 1: argv preprocessing (`src/cli.ts`)

Add roughly 6 lines before `program.parse()`:

```ts
// Detect: exactly one non-option arg, and it is pure digits
const rest = process.argv.slice(2).filter(a => !a.startsWith('-'));
if (rest.length === 1 && /^\d+$/.test(rest[0])) {
  const idx = process.argv.findIndex(a => a === rest[0]);
  process.argv.splice(idx, 0, 'switch');
}
```

Trigger conditions:
- Exactly one non-option argument (no `-x`, `--xxx`)
- That argument is pure digits (`/^\d+$/`)

Counter-examples that must NOT trigger:
- `colyn add` (not digits)
- `colyn 1 2` (multiple non-option args)
- `colyn 1 --foo` (with options — keep conservative to avoid future conflicts)
- `colyn 12abc` (not pure digits)

#### Step 2: commander registration (`src/commands/switch.ts`)

```ts
program
  .command('switch <number>', { hidden: true })
  .description(t('commands.switch.description'))
  .action(async (numberArg: string) => {
    await handleSwitch(numberArg);
  });
```

#### Step 3: handler main flow

Pseudocode:

```
function handleSwitch(numberArg) {
  // 1. Parse number → worktreeId
  const id = parseInt(numberArg, 10);

  // 2. Validate project state
  const paths = await getProjectPaths();
  if (!paths) → error "current directory is not inside a colyn project", exit 1

  // 3. Resolve target worktree path
  const target = id === 0 ? paths.mainDir : path.join(paths.worktreesDir, `task-${id}`);
  if (!exists(target)) → error + list available worktrees, exit 1

  // 4. Compute display path
  const displayPath = relativeTo(home, target);

  // 5. Inspect tmux state (reuse utilities from src/core/tmux.ts)
  const sessionName = projectName;
  const inTmux = isInTmux();
  const currentSession = inTmux ? getCurrentSession() : null;
  const hasSession = sessionExists(sessionName);
  const hasWindow = hasSession && windowExists(sessionName, id);

  // 6. Decide
  if (!hasWindow) {
    // Degrade to cd: session or window missing
    outputResult({ success: true, targetDir: target, displayPath });
    return;
  }

  if (inTmux && currentSession === sessionName) {
    // Same session — switch directly in Node, no shell protocol
    switchWindow(sessionName, id, projectName, branchName);
    return;
  }

  // Outside tmux, or inside a different session — let shell attach
  outputResult({ success: true, attachSession: sessionName, attachWindow: id });
}
```

### Shell control-message protocol (`shell/colyn.sh`)

#### Existing fields

| Field | Type | Meaning |
|-------|------|---------|
| `success` | boolean | Marks the line as a valid control message |
| `targetDir` | string | Absolute path to cd into |
| `displayPath` | string | Human-friendly path |
| `attachSession` | string | tmux session name |

#### New fields

| Field | Type | Meaning |
|-------|------|---------|
| `attachWindow` | number | Used with `attachSession`; window index to select after attach |

Only one new field. "Switch window inside the same session" is handled by a Node-side `switchWindow()` call rather than the shell protocol.

#### Processing priority

```bash
if [[ -n "$attach_session" ]]; then
  if [[ -n "$attach_window" ]]; then
    exec tmux attach-session -t "${attach_session}:${attach_window}"
  else
    exec tmux attach-session -t "$attach_session"
  fi
elif [[ -n "$target_dir" && -d "$target_dir" ]]; then
  cd "$target_dir"
  echo "📂 Switched to: $display_path"
fi
```

### Control-message examples

**Case A: outside tmux, no session**

```json
{
  "success": true,
  "targetDir": "/Users/x/proj/worktrees/task-1",
  "displayPath": "~/proj/worktrees/task-1"
}
```

**Case B: inside tmux, same session — switch window**

No control message — `switchWindow()` is invoked directly in Node.

**Case C: outside tmux, session + window both exist**

```json
{
  "success": true,
  "attachSession": "colyn",
  "attachWindow": 1
}
```

## Error Handling

All error messages go to stderr. On error, **no** JSON control message is emitted (shell sees no valid JSON control line at end of stdout and therefore performs no cd/attach).

| Scenario | Exit code | stderr output |
|----------|-----------|---------------|
| Not in a colyn project | 1 | `current directory is not inside a colyn project, cannot switch worktree` |
| `colyn 0` but main dir cannot be located | 1 | `cannot locate main directory` |
| `colyn N` but task-N does not exist | 1 | error + list of available worktrees |

### Available-worktree list format

```
Worktree task-9 does not exist
Available worktrees:
  0  main         (main directory)
  1  task-1       feature/foo
  2  task-2       feature/quick-switch
```

The worktree discovery logic in `src/core/discovery.ts` or `src/commands/list.ts` is reused — no duplication.

### Invalid input

argv preprocessing guarantees that only "pure-digit, single-argument" inputs reach the switch handler, so the handler itself does not need to handle `-1`, `abc`, etc. — those go through commander's normal flow and become "unknown command" errors.

The only remaining edge case is `colyn 99999` (huge number). Treated identically to "worktree does not exist"; no hard upper bound is enforced.

## i18n

Add the following keys to `src/i18n/locales/zh-CN.ts` and `src/i18n/locales/en.ts` under `commands`:

```ts
switch: {
  description: 'Quickly switch to a worktree (internal hidden subcommand)',
  notInProject: 'current directory is not inside a colyn project, cannot switch worktree',
  mainDirNotFound: 'cannot locate main directory',
  worktreeNotExists: 'Worktree task-{{n}} does not exist',
  availableWorktrees: 'Available worktrees:',
}
```

Keep both languages in sync, following existing translation-file style.

## Output Stream Discipline

Per the project's "dual-layer architecture" rule:

- All prompts and errors → **stderr** (via `output*` helpers)
- JSON control messages → **stdout**, only when `COLYN_OUTPUT_JSON=1` (via `outputResult()`)
- Error scenarios emit no JSON control message

## File Changes

### New

- `src/commands/switch.ts`: command module — registers the hidden subcommand, performs target resolution, tmux detection, and emits the control message
- `docs/zh-CN/develop/design/commands/design-switch-command.md`: Chinese design doc
- `docs/en/develop/design/commands/design-switch-command.md`: this document

### Modified

- `src/cli.ts`: add argv preprocessing (~6 lines)
- `src/commands/index.ts`: add `registerSwitch(program)` (existing pattern)
- `shell/colyn.sh`: parse `attachWindow`; extend the existing `attachSession` branch
- `src/i18n/locales/zh-CN.ts`: add `commands.switch.*`
- `src/i18n/locales/en.ts`: same (English)
- `docs/zh-CN/manual/*.md`, `docs/en/manual/*.md`: user manual — add `colyn <N>` usage

### Not Modified

- `shell/completion.bash`, `shell/completion.zsh`: number completion is low value; keep default shell fallback
- Config-file structure: unchanged, no migration required

## Test Strategy

Add `src/commands/switch.test.ts` (matching the project's existing test layout), mocking tmux and the filesystem, covering:

| # | Scenario | Expected output |
|---|----------|-----------------|
| 1 | `colyn 0`, main dir exists | control message with `targetDir` = main dir |
| 2 | `colyn N`, task-N exists, no session | control message with `targetDir` only |
| 3 | `colyn N`, session+window exist, current is same session | Node calls `switchWindow()`; stdout has no control message |
| 4 | `colyn N`, session+window exist, current is outside tmux | control message `attachSession + attachWindow: N` |
| 5 | `colyn 9`, task-9 missing | stderr contains error+list, stdout has no control message, exit 1 |
| 6 | `colyn 99999` | same as #5 |
| 7 | Not inside a colyn project | stderr error, exit 1 |

argv preprocessing logic tested separately:

| # | Input argv | Expected |
|---|-----------|----------|
| 1 | `["1"]` | rewritten to `["switch", "1"]` |
| 2 | `["add"]` | not rewritten |
| 3 | `["1", "2"]` | not rewritten |
| 4 | `["1", "--foo"]` | not rewritten |
| 5 | `["--help"]` | not rewritten |
| 6 | `["12abc"]` | not rewritten |

## Compatibility

- Pure addition; no existing command is affected
- Config-file structure unchanged; no migration needed (see "Config Migration Spec")

## Risks & Degradation

- **Window index drift from worktree ID**: degrades to `cd`
- **Cross-session switch**: handled via `attach-session -t s:w` to avoid `switch-client` platform differences
- **Old `shell/colyn.sh`**: if the user upgrades the binary but does not re-`source` the shell script:
  - "Outside tmux + session/window exists" case: the old shell only knows `attachSession` and will attach to the session's default window (not the requested task-N window). The user lands on the previously active window. **Implementation must call out re-`source`-ing `shell/colyn.sh` in upgrade notes.**
  - Other cases: existing fields are sufficient and behavior is correct.

## Relation to Other Commands

| Command | Purpose | Relation to switch |
|---------|---------|--------------------|
| `colyn add` | Create new worktree | Usually cd into it; "creation path" of switch |
| `colyn list` | List worktrees | Provides IDs so users know which number to type |
| `colyn info` | Show current worktree info | No overlap |
| `colyn checkout` | Reuse worktree for a different branch | Operates on the "branch" axis; switch operates on the "location" axis |
| `colyn remove` | Delete a worktree | After removal, no switch to that ID |
