# Switch Command Design

## Overview

`colyn <N>` is a shortcut for jumping between worktrees. The user types a single number and the shell `cd`s into the matching worktree directory.

This command is the "keystroke-grade" entry point of colyn's Parallel Vibe Coding workflow: instead of `cd`-ing into long paths, a single number takes you to the target worktree.

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

### Relative sub-path preservation

When the current directory is inside a worktree (main directory or `worktrees/task-K`), `colyn <N>` remembers the path relative to that worktree root and tries to land in the same relative location inside the target worktree:

| Current directory | Command | Target |
|-------------------|---------|--------|
| `my-app/my-app/src/components` | `colyn 2` | `my-app/worktrees/task-2/src/components` |
| `my-app/worktrees/task-1/src` | `colyn 0` | `my-app/my-app/src` |
| `my-app/worktrees/task-1` | `colyn 2` | `my-app/worktrees/task-2` |
| `my-app/` (project root) | `colyn 1` | `my-app/worktrees/task-1` |
| `my-app/worktrees/` | `colyn 1` | `my-app/worktrees/task-1` |
| Unrelated directory | `colyn 1` | `my-app/worktrees/task-1` |

The relative sub-path is computed by `computeRelativeSubpath(cwd, paths)`:
- `cwd` is under `mainDir` → relative to `mainDir`
- `cwd` is under `worktreesDir/task-K` → relative to that `task-K`
- Any other location (project root, `worktrees/` itself, unrelated directory) → empty string (land on the worktree root)

### Fallback when the sub-path does not exist

If the same relative sub-path does not exist in the target worktree (e.g. the directory was renamed or has not been created on that branch yet), switch mode walks **up** the path, one level at a time, and lands in the deepest directory that exists. The walk is bounded by the target worktree root, so the result is never outside the target worktree.

```
cwd:     my-app/my-app/src/features/login
colyn 2  → my-app/worktrees/task-2/src/features/login   (missing)
         → my-app/worktrees/task-2/src/features         (missing)
         → my-app/worktrees/task-2/src                  (exists) ✓
```

When a fallback happens, a notice is printed to stderr:

```
Subdirectory ~/my-app/worktrees/task-2/src/features/login not found, switched to ~/my-app/worktrees/task-2/src instead
```

This is implemented by `resolveDeepestExisting(targetRoot, rel)`.

### Not inside a project

If the current directory is not inside a colyn project, `colyn <N>` errors out with "current directory is not inside a colyn project".

## Exec Mode

When `colyn <N>` is followed by additional arguments, it enters exec mode: the specified command is executed in the target worktree directory, and the current directory remains unchanged after execution.

### Design Decision: Node.js Executes Commands Directly

The shell wrapper is only responsible for the one operation that requires the current process: `cd` to change directory. Command execution does not need to modify the current shell state, so it is handled directly by Node.js via `child_process.spawn`. Command output is forwarded to stderr (following the project's dual-layer architecture: stdout is reserved for the JSON control protocol, stderr is for user-visible output).

Advantages:
- Commands execute correctly regardless of whether called through the shell wrapper or directly
- Running `./bin/colyn 0 echo hello` directly shows output without requiring the shell wrapper
- stdin passthrough, signal forwarding (Ctrl+C), and exit code passthrough are natively supported by spawn

### Behavior Rules

- The command executes in the target worktree directory plus the current relative sub-path (`cwd: join(target, rel)`); the current shell's working directory does not change
- Exec mode is **strict** about the sub-path: if `join(target, rel)` does not exist, an error is reported and the command is **not** executed (no upward fallback — running a command in an unexpected directory would be surprising)
- The command's stdin is passed through directly (`stdio: 'inherit'`), supporting interactive commands
- The command's stdout and stderr are forwarded to the Node.js process's stderr, ensuring user visibility without polluting stdout
- The command's exit code is passed through directly (`process.exit(code)`)
- If the target worktree does not exist, an error is reported and no command is executed

### Implementation

```typescript
const execTarget = path.join(target, rel);
if (!(await dirExists(execTarget))) {
  outputError(t('commands.switch.subdirNotFound', { sub: rel || '.' }));
  process.exit(1);
}

const child = spawn(commandArgs.join(' '), {
  cwd: execTarget,
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
  // 1. Validate project state
  const paths = await getProjectPaths();
  if (!paths) → error "current directory is not inside a colyn project", exit 1

  // 2. Parse number → worktreeId, resolve target worktree root
  const id = parseInt(numberArg, 10);
  const target = id === 0 ? paths.mainDir : path.join(paths.worktreesDir, `task-${id}`);
  if (!exists(target)) → error + list available worktrees, exit 1

  // 3. Compute the relative sub-path of cwd inside its own worktree ('' if none)
  const rel = computeRelativeSubpath(process.cwd(), paths);

  // 4. Exec mode: Node.js executes the command directly (strict sub-path)
  if (commandArgs && commandArgs.length > 0) {
    const execTarget = path.join(target, rel);
    if (!exists(execTarget)) → error "subdirectory not found", exit 1
    spawn(commandArgs.join(' '), { cwd: execTarget, stdio: ['inherit', 'pipe', 'pipe'], shell: true });
    child.stdout.pipe(process.stderr);
    child.stderr.pipe(process.stderr);
    child.on('close', (code) => process.exit(code ?? 1));
    return;
  }

  // 5. Switch mode: keep the sub-path, fall back upward if it does not exist
  const resolved = await resolveDeepestExisting(target, rel);
  if (rel && resolved !== path.join(target, rel)) → stderr notice "subdirectory not found, switched to ... instead"
  outputResult({ success: true, targetDir: resolved, displayPath: toDisplayPath(resolved) });
}
```

`toDisplayPath()` replaces the home directory prefix with `~` for the human-friendly path.

### Shell control-message protocol (`shell/colyn.sh`)

The shell wrapper captures stdout, treats the last non-empty line as the JSON control message (if it parses as JSON), prints any preceding stdout lines verbatim, and then performs the `cd`. Exec mode is handled entirely by Node.js and emits no control message.

#### Fields

| Field | Type | Meaning |
|-------|------|---------|
| `success` | boolean | Marks the line as a valid control message; must be `true` for the shell to act |
| `targetDir` | string | Absolute path to cd into |
| `displayPath` | string | Human-friendly path (falls back to `targetDir` when absent) |

#### Processing

```bash
if [[ "$result_success" == "1" && -n "$target_dir" && -d "$target_dir" ]]; then
  cd "$target_dir" || return
  echo "📂 Switched to: $display_path"
fi
```

The shell only `cd`s when `targetDir` is a directory that exists; otherwise it does nothing and returns the Node process's exit code.

### Control-message examples

**Case A: exec mode (`colyn 1 git push`)**

No control message is output. Node.js executes the command directly, forwarding command output to stderr.

**Case B: switch mode (`colyn 1` from `my-app/my-app/src`)**

```json
{
  "success": true,
  "targetDir": "/Users/x/proj/worktrees/task-1/src",
  "displayPath": "~/proj/worktrees/task-1/src"
}
```

**Case C: switch mode with fallback (`colyn 1` from `my-app/my-app/src/new-dir`, `task-1` has no `src/new-dir`)**

stderr:

```
Subdirectory ~/proj/worktrees/task-1/src/new-dir not found, switched to ~/proj/worktrees/task-1/src instead
```

stdout control message:

```json
{
  "success": true,
  "targetDir": "/Users/x/proj/worktrees/task-1/src",
  "displayPath": "~/proj/worktrees/task-1/src"
}
```

## Error Handling

All error messages go to stderr. On error, **no** JSON control message is emitted (shell sees no valid JSON control line at end of stdout and therefore performs no cd).

| Scenario | Exit code | stderr output |
|----------|-----------|---------------|
| Not in a colyn project | 1 | `current directory is not inside a colyn project, cannot switch worktree` |
| `colyn 0` but main dir cannot be located | 1 | `cannot locate main directory` |
| `colyn N` but task-N does not exist | 1 | error + list of available worktrees |
| `colyn N <cmd>` but the current sub-path does not exist in task-N | 1 | `Subdirectory <sub> does not exist in the target worktree` (command not executed) |

### Available-worktree list format

```
Worktree task-9 does not exist
Available worktrees:
  0  main         main  (main directory)
  1  task-1       feature/foo
  2  task-2       feature/quick-switch
```

The worktree discovery logic in `src/core/discovery.ts` is reused — no duplication.

### Invalid input

argv preprocessing guarantees that only "pure-digit, single-argument" inputs reach the switch handler, so the handler itself does not need to handle `-1`, `abc`, etc. — those go through commander's normal flow and become "unknown command" errors.

The only remaining edge case is `colyn 99999` (huge number). Treated identically to "worktree does not exist"; no hard upper bound is enforced.

## i18n

The following keys exist in `src/i18n/locales/zh-CN.ts` and `src/i18n/locales/en.ts` under `commands`:

```ts
switch: {
  description: 'Quickly switch to a worktree (internal hidden subcommand)',
  notInProject: 'Current directory is not inside a colyn project, cannot switch worktree',
  mainDirNotFound: 'Cannot locate main directory',
  worktreeNotExists: 'Worktree task-{{n}} does not exist',
  availableWorktrees: 'Available worktrees:',
  mainDirLabel: 'main directory',
  subdirNotFound: 'Subdirectory {{sub}} does not exist in the target worktree',
  subdirFallback: 'Subdirectory {{expected}} not found, switched to {{actual}} instead',
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

- `src/commands/switch.ts`: command module — registers the hidden subcommand, resolves the target directory (including sub-path preservation and fallback), runs exec mode, and emits the control message
- `src/cli-preprocess.ts`: the `preprocessArgv()` argv preprocessing logic (standalone module for easy unit testing)
- `docs/zh-CN/develop/design/commands/design-switch-command.md`: Chinese design doc
- `docs/en/develop/design/commands/design-switch-command.md`: this document

### Modified

- `src/cli.ts`: call `process.argv = preprocessArgv(process.argv)` before `program.parse()`
- `src/commands/index.ts`: add `registerSwitch(program)` (existing pattern)
- `shell/colyn.sh`: parse `targetDir` / `displayPath` from the control message and `cd`
- `src/i18n/locales/zh-CN.ts`: add `commands.switch.*`
- `src/i18n/locales/en.ts`: same (English)
- `docs/zh-CN/manual/*.md`, `docs/en/manual/*.md`: user manual — add `colyn <N>` usage

### Not Modified

- `shell/completion.bash`, `shell/completion.zsh`: number completion is low value; keep default shell fallback
- Config-file structure: unchanged, no migration required

## Test Strategy

`src/commands/switch.test.ts` (matching the project's existing test layout) mocks the filesystem and covers:

| # | Scenario | Expected output |
|---|----------|-----------------|
| 1 | `colyn 0`, main dir exists | control message with `targetDir` = main dir |
| 2 | `colyn N`, task-N exists | control message with `targetDir` = task-N |
| 3 | `colyn N` from `mainDir/src`, `task-N/src` exists | `targetDir` = `task-N/src` |
| 4 | `colyn N` from `mainDir/src/x`, only `task-N/src` exists | `targetDir` = `task-N/src`, fallback notice on stderr |
| 5 | `colyn N` from the project root or an unrelated directory | `targetDir` = task-N root |
| 6 | `colyn 9`, task-9 missing | stderr contains error+list, stdout has no control message, exit 1 |
| 7 | `colyn 99999` | same as #6 |
| 8 | Not inside a colyn project | stderr error, exit 1 |
| 9 | `colyn 1 git push`, task-1 exists | command spawned with `cwd` = task-1 (+ sub-path); no control message |
| 10 | `colyn 1 git push` from `mainDir/src/x`, `task-1/src/x` missing | stderr error, exit 1 (no command executed) |
| 11 | `colyn 9 git push`, task-9 missing | stderr error, exit 1 (no command executed) |

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

- **Sub-path missing in target**: switch mode degrades to the nearest existing parent directory (never outside the target worktree) and prints a notice; exec mode refuses to run rather than guessing a directory
- **Old `shell/colyn.sh`**: the control-message fields (`success`, `targetDir`, `displayPath`) are stable; upgrading the binary without re-`source`-ing the shell script keeps `cd` working

## Relation to Other Commands

| Command | Purpose | Relation to switch |
|---------|---------|--------------------|
| `colyn add` | Create new worktree | Usually cd into it; "creation path" of switch |
| `colyn list` | List worktrees | Provides IDs so users know which number to type |
| `colyn info` | Show current worktree info | No overlap |
| `colyn checkout` | Reuse worktree for a different branch | Operates on the "branch" axis; switch operates on the "location" axis |
| `colyn remove` | Delete a worktree | After removal, no switch to that ID |
