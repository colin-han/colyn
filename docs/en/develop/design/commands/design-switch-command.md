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
# Switch mode: jump to the target worktree directory
colyn <number>

# Exec mode: execute a command in the target worktree directory, stay in current directory afterwards
colyn <number> <command...>
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `number` | Yes | Target worktree ID; `0` means the main directory, `N>=1` means `worktrees/task-N` |
| `command...` | Optional | Command and its arguments to execute in the target directory; when omitted, enters switch mode |

### User-facing behavior

| Input | Behavior |
|-------|----------|
| `colyn 0` | Jump to the main directory (main worktree) |
| `colyn 1` | Jump to `worktrees/task-1` |
| `colyn N` | Jump to `worktrees/task-N` |
| `colyn 0 git push` | Execute `git push` in the main directory, stay in current directory |
| `colyn 1 git rebase` | Execute `git rebase` in `task-1` directory, stay in current directory |
| `colyn 1 npm run build` | Execute `npm run build` in `task-1` directory, stay in current directory |
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

## Exec Mode

When `colyn <N>` is followed by additional arguments, it enters exec mode: the specified command is executed in the target worktree directory, and the current directory remains unchanged after execution.

### Design Decision: Node.js Executes Commands Directly

The shell wrapper is only responsible for operations that require the current process (`cd` to change directory, `exec tmux attach-session`). Command execution does not need to modify the current shell state, so it is handled directly by Node.js via `child_process.spawn`. Command output is forwarded to stderr (following the project's dual-layer architecture: stdout is reserved for the JSON control protocol, stderr is for user-visible output).

Advantages:
- Commands execute correctly regardless of whether called through the shell wrapper or directly
- Running `./bin/colyn 0 echo hello` directly shows output without requiring the shell wrapper
- stdin passthrough, signal forwarding (Ctrl+C), and exit code passthrough are natively supported by spawn

### Behavior Rules

- The command executes in the target worktree directory (`cwd: targetDir`); the current shell's working directory does not change
- The command's stdin is passed through directly (`stdio: 'inherit'`), supporting interactive commands
- The command's stdout and stderr are forwarded to the Node.js process's stderr, ensuring user visibility without polluting stdout
- The command's exit code is passed through directly (`process.exit(code)`)
- Even inside tmux, the command runs in the current pane, without switching tmux windows
- If the target directory does not exist, an error is reported and no command is executed

### Implementation

```typescript
const child = spawn(commandArgs.join(' '), {
  cwd: target,
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: true,
});

child.stdout.pipe(process.stderr);
child.stderr.pipe(process.stderr);

child.on('close', (code) => {
  process.exit(code ?? 1);
});
```

Note: `shell: true` is used to support shell features like pipes and redirections.

## Internal Implementation

### Overall dispatch

From the user's perspective the only entry is `colyn <N>`, but internally this is routed through a commander hidden subcommand `switch <number>`:

```
process.argv  --(preprocess)-->  commander  --(dispatch)-->  switch handler  --(emit)-->  shell/colyn.sh
```

#### Step 1: argv preprocessing (`src/cli-preprocess.ts`)

`preprocessArgv(argv)` takes the full argv (including `argv[0]`/`argv[1]`), detects the case of "exactly one non-option argument that is pure digits", and inserts `'switch'` **after** the digit argument:

```ts
export function preprocessArgv(argv: string[]): string[] {
  const args = argv.slice(2);
  const nonOptionArgs = args.filter((a) => !a.startsWith('-'));

  if (nonOptionArgs.length !== 1) return [...argv];
  if (!/^\d+$/.test(nonOptionArgs[0])) return [...argv];

  const digitArg = nonOptionArgs[0];
  const digitIdx = args.indexOf(digitArg);

  // Prevent mixed usage like `colyn 1 --foo` from being treated as quick switch
  const hasOptionAfterDigit = args.slice(digitIdx + 1).some((a) => a.startsWith('-'));
  if (hasOptionAfterDigit) return [...argv];

  // Note: digitIdx is relative to args (argv.slice(2)); compensate with +2 for the full argv
  const result = [...argv];
  result.splice(digitIdx + 2, 0, 'switch');
  return result;
}
```

Trigger conditions:
- Exactly one non-option argument (no `-x`, `--xxx`)
- That argument is pure digits (`/^\d+$/`)

Counter-examples that must NOT trigger:
- `colyn add` (not digits)
- `colyn 1 --foo` (with options — keep conservative to avoid future conflicts)
- `colyn 12abc` (not pure digits)

#### Step 1 (extended): argv preprocessing for exec mode

When there are 2+ non-option args and the first is pure digits, enter exec mode:

```ts
const nonOptionArgs = args.filter(a => !a.startsWith('-'));

// Exec mode: colyn <N> <cmd...>
if (nonOptionArgs.length >= 2 && /^\d+$/.test(nonOptionArgs[0])) {
  const idx = args.indexOf(nonOptionArgs[0]);
  result.splice(idx + 2, 0, 'switch');
  return result;
}

// Switch mode: colyn <N> (original logic)
if (nonOptionArgs.length === 1 && /^\d+$/.test(nonOptionArgs[0])) {
  // ... keep existing hasOptionAfterDigit guard ...
}
```

New trigger examples:
- `colyn 0 git push` → `colyn switch 0 git push`
- `colyn 1 npm run build` → `colyn switch 1 npm run build`
- `colyn 1 git push -f` → `colyn switch 1 git push -f` (`-f` is a command arg)

#### Step 2: commander registration (`src/commands/switch.ts`)

```ts
program
  .command('switch <number> [commandArgs...]', { hidden: true })
  .description(t('commands.switch.description'))
  .action(async (numberArg: string, commandArgs: string[] | undefined) => {
    await handleSwitch(numberArg, commandArgs);
  });
```

#### Step 3: handler main flow

Pseudocode:

```
function handleSwitch(numberArg, commandArgs) {
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

  // 5. Exec mode: Node.js executes the command directly
  if (commandArgs && commandArgs.length > 0) {
    spawn(commandArgs.join(' '), { cwd: target, stdio: ['inherit', 'pipe', 'pipe'], shell: true });
    child.stdout.pipe(process.stderr);
    child.stderr.pipe(process.stderr);
    child.on('close', (code) => process.exit(code ?? 1));
    return;
  }

  // 6. Switch mode: original tmux switching logic
  const sessionName = projectName;
  const inTmux = isInTmux();
  const currentSession = inTmux ? getCurrentSession() : null;
  const hasSession = sessionExists(sessionName);
  const hasWindow = hasSession && windowExists(sessionName, id);

  if (!hasWindow) {
    outputResult({ success: true, targetDir: target, displayPath });
    return;
  }

  if (inTmux && currentSession === sessionName) {
    switchWindow(sessionName, id, projectName, branchName);
    return;
  }

  outputResult({ success: true, attachSession: sessionName, attachWindow: id });
}
```

### Shell control-message protocol (`shell/colyn.sh`)

The shell wrapper is only responsible for operations that require the current process: `cd` to change directory and `exec tmux attach-session`. Exec mode is handled directly by Node.js and does not involve the shell wrapper.

#### Fields

| Field | Type | Meaning |
|-------|------|---------|
| `success` | boolean | Marks the line as a valid control message |
| `targetDir` | string | Absolute path to cd into |
| `displayPath` | string | Human-friendly path |
| `attachSession` | string | tmux session name |
| `attachWindow` | number | Used with `attachSession`; window index to select after attach |

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

**Case A: exec mode (`colyn 1 git push`)**

No control message is output. Node.js executes the command directly, forwarding command output to stderr.

**Case B: outside tmux, no session**

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
  0  main         main  (main directory)
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
  mainDirLabel: 'main directory',
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
- `src/cli-preprocess.ts`: the `preprocessArgv()` argv preprocessing logic (standalone module for easy unit testing)
- `docs/zh-CN/develop/design/commands/design-switch-command.md`: Chinese design doc
- `docs/en/develop/design/commands/design-switch-command.md`: this document

### Modified

- `src/cli.ts`: call `process.argv = preprocessArgv(process.argv)` before `program.parse()`
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
| 8 | `colyn 1 git push`, task-1 exists | control message with `targetDir` + `command: "git push"` |
| 9 | `colyn 0 npm run build`, main dir exists | control message with `command: "npm run build"` |
| 10 | `colyn 9 git push`, task-9 missing | stderr error, exit 1 (no command executed) |

argv preprocessing logic tested separately. Input is the full argv (including `argv[0]`/`argv[1]`, e.g. `["node", "colyn", ...]`):

| # | Input argv | Expected |
|---|-----------|----------|
| 1 | `["node", "colyn", "1"]` | rewritten to `["node", "colyn", "switch", "1"]` |
| 2 | `["node", "colyn", "add"]` | not rewritten |
| 3 | `["node", "colyn", "1", "git", "push"]` | rewritten to `["node", "colyn", "switch", "1", "git", "push"]` (exec mode) |
| 4 | `["node", "colyn", "1", "--foo"]` | not rewritten (option guard) |
| 5 | `["node", "colyn", "--help"]` | not rewritten |
| 6 | `["node", "colyn", "12abc"]` | not rewritten |
| 7 | `["node", "colyn", "1", "git", "push", "-f"]` | rewritten to `["node", "colyn", "switch", "1", "git", "push", "-f"]` (`-f` as command arg) |
| 8 | `["node", "colyn", "0", "npm", "run", "build"]` | rewritten to `["node", "colyn", "switch", "0", "npm", "run", "build"]` (exec mode) |

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
