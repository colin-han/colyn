/**
 * English translations (default)
 */
export const en = {
  // Common
  common: {
    error: 'Error',
    success: 'Success',
    hint: 'Hint',
    canceled: 'Canceled',
    unknown: 'Unknown',
    unknownError: 'Unknown error',
    yes: 'Yes',
    no: 'No',
    and: 'and',
    files: '{{count}} file',
    files_other: '{{count}} files',
    commits: '{{count}} commit',
    commits_other: '{{count}} commits',
  },

  // CLI
  cli: {
    description: 'Git worktree management tool',
    noColorOption: 'Disable color output',
    // Commander.js built-in texts
    usage: 'Usage:',
    options: 'Options:',
    commands: 'Commands:',
    arguments: 'Arguments:',
    versionDescription: 'output the version number',
    helpDescription: 'display help for command',
    helpCommand: 'help [command]',
    helpCommandDescription: 'display help for command',
  },

  // Logger
  logger: {
    hintPrefix: 'Hint:',
    errorPrefix: 'Error:',
  },

  // Commands
  commands: {
    // add command
    add: {
      description: 'Create a new worktree',
      branchNameEmpty: 'Branch name cannot be empty',
      branchNameEmptyHint: 'Please provide a branch name parameter',
      invalidBranchName: 'Invalid branch name',
      invalidBranchNameHint: 'Branch name can only contain letters, numbers, underscores, hyphens, and slashes',
      notInitialized: 'Current directory not initialized',
      notInitializedHint: 'Please run colyn init first to initialize the project',
      notGitRepo: 'Current directory is not a git repository',
      notGitRepoHint: 'Please run this command in a git repository',
      missingEnvFile: 'Main branch directory is missing .env.local file',
      missingEnvFileHint: 'Please configure environment variables in the main branch directory first',
      branchExists: 'Branch "{{branch}}" already has a worktree',
      branchExistsHint: 'ID: {{id}}, Path: {{path}}',
      usingLocalBranch: 'Using local branch: {{branch}}',
      checkingRemote: 'Checking remote branches...',
      creatingFromRemote: 'Creating branch from remote: {{branch}}',
      createdFromRemote: 'Created branch from remote: {{branch}}',
      creatingNewBranch: 'Creating new branch based on main: {{branch}}',
      createdNewBranch: 'Created new branch: {{branch}}',
      branchHandleFailed: 'Branch handling failed',
      creatingWorktree: 'Creating worktree...',
      worktreeCreated: 'Worktree created: task-{{id}}',
      worktreeCreateFailed: 'Failed to create worktree',
      branchAlreadyUsed: 'Branch "{{branch}}" is already associated with an existing worktree',
      branchAlreadyUsedHint: `Worktree info:
  ID: {{id}}
  Path: {{path}}
  Port: {{port}}

Hints:
  - To switch to this worktree: cd {{path}}
  - To delete this worktree: colyn remove {{id}}
  - Or use a different branch name`,
      branchUsedByOther: 'Branch "{{branch}}" is used by another worktree',
      branchUsedByOtherHint: `This branch is currently used by:
  {{path}}

Hints:
  - This might be from another colyn project or manually created worktree
  - To remove it manually: git worktree remove "{{path}}"
  - Or use a different branch name`,
      branchUsedUnknown: 'Branch "{{branch}}" is used by another worktree',
      branchUsedUnknownHint: `Hints:
  - Run "git worktree list" to see all worktrees
  - Remove unwanted worktree: git worktree remove <path>
  - Or use a different branch name`,
      worktreeError: 'Error occurred while creating worktree',
      worktreeErrorHint: `Error: {{error}}

Hints:
  - Check if the branch exists
  - Check if the worktree directory is writable
  - Run "git worktree list" to see existing worktrees`,
      configuringEnv: 'Configuring environment variables...',
      envConfigured: 'Environment variables configured',
      envConfigFailed: 'Failed to configure environment variables',
      successTitle: 'Worktree created successfully!',
      worktreeInfo: 'Worktree info:',
      infoId: 'ID: {{id}}',
      infoBranch: 'Branch: {{branch}}',
      infoPath: 'Path: {{path}}',
      infoPort: 'Port: {{port}}',
      nextSteps: 'Next steps:',
      step1: '1. Enter worktree directory:',
      step2: '2. Start dev server (port auto-configured):',
      step3: '3. View all worktrees:',
      tmuxWindowCreated: 'Created Window {{windowIndex}}: {{windowName}}',
      tmuxWindowSwitched: 'Automatically switched to Window {{windowIndex}}',
      tmuxWindowCreatedInSession: 'Created Window {{windowIndex}}: {{windowName}} in background session "{{sessionName}}"',
      tmuxPaneClaude: '  |- Claude Code  (left 60%)',
      tmuxPaneDevServer: '  |- Dev Server   (top-right 12%)',
      tmuxPaneBash: '  `- Bash         (bottom-right 28%)',
      tmuxHintTitle: 'Hint: Colyn supports tmux integration for a better multi-worktree experience',
      tmuxHintAttach: `  Run 'tmux attach -t {{session}}' to enter tmux environment`,
    },

    // list command
    list: {
      description: 'List all worktrees',
      jsonOption: 'Output in JSON format',
      pathsOption: 'Output paths only (one per line)',
      noMainOption: 'Do not show main branch',
      refreshOption: 'Auto-refresh on file changes',
      optionConflict: 'Option conflict: --json and --paths cannot be used together',
      optionConflictHint: 'Please choose one output format',
      refreshConflict: 'Option conflict: --refresh cannot be used with --json or --paths',
      refreshConflictHint: 'Refresh mode only supports table output',
      refreshingData: 'Refreshing data...',
      watchMode: 'Watching for file changes (press Ctrl+C to exit)',
      watchError: 'File watch error: {{error}}',
      refreshStopped: 'Refresh stopped',
      noWorktrees: 'No worktrees',
      noWorktreesHint: 'Hint: Use colyn add <branch> to create a new worktree',
      tableId: 'ID',
      tableBranch: 'Branch',
      tablePort: 'Port',
      tableStatus: 'Status',
      tableDiff: 'Diff',
      tablePath: 'Path',
    },

    // release command
    release: {
      description: 'Run release process in main branch directory (default: patch)',
      versionArgument: 'version type (patch/minor/major) or version (e.g. 1.2.3)',
      versionMissing: 'Please specify a version type or version number',
      versionMissingHint: 'Examples: colyn release patch / colyn release 1.2.3',
      execFailed: 'Failed to execute release script',
      runInMain: 'Running release script in main branch directory: {{path}}',
      noUpdateOption: 'Skip automatic update of all worktrees',
      updatingWorktrees: 'Updating all worktrees...',
      updateFailed: '⚠ Failed to update worktrees, but release completed successfully',
      currentDirNotClean: 'Current directory has uncommitted changes',
      currentDirNotCleanHint: 'Please commit or stash changes before releasing:\ncd "{{path}}"\ngit add .\ngit commit -m "..."\n\nDetected {{count}} changed file(s):\n{{files}}',
      branchNotMerged: 'Branch "{{branch}}" has not been merged to "{{main}}"',
      branchNotMergedHint: 'Please merge the branch to main branch before releasing:\ncolyn merge {{branch}}\n\nOr run release from main branch directory',
    },

    // init command
    init: {
      description: 'Initialize worktree management structure',
      portOption: 'Main branch dev server port',
      yesOption: 'Skip confirmation prompt when initializing existing project',
      alreadyInProject: 'Current directory is already in a colyn project',
      alreadyInProjectHint: 'Project root: {{root}}\nPlease do not run init in a project subdirectory',
      invalidPort: 'Invalid port number',
      invalidPortHint: 'Port must be between 1-65535',
      nonInteractivePort: 'Cannot prompt for port in non-interactive mode',
      nonInteractivePortHint: 'Please provide port with --port <port>',
      enterPort: 'Enter main branch dev server port',
      portValidation: 'Port must be between 1-65535',
      directoryConflict: 'Main branch directory name "{{name}}" conflicts with existing file',
      directoryConflictHint: 'Please rename the file before running init',
      creatingStructure: 'Creating directory structure...',
      structureCreated: 'Directory structure created',
      movingFiles: 'Moving project files...',
      moving: 'Moving: {{file}}',
      filesMoved: 'Project files moved',
      moveFilesFailed: 'Failed to move files',
      moveFilesError: 'Error occurred while moving files',
      moveFilesErrorHint: 'Please check file permissions or manually restore directory structure',
      configuringEnv: 'Configuring environment file...',
      envConfigured: 'Environment variables configured',
      envConfigFailed: 'Failed to configure environment variables',
      configuringGitignore: 'Configuring .gitignore...',
      gitignoreConfigured: '.gitignore configured (added .env.local)',
      gitignoreSkipped: '.gitignore already has ignore rules, skipped',
      gitignoreFailed: 'Failed to configure .gitignore',
      successTitle: 'Initialization successful!',
      directoryStructure: 'Directory structure:',
      mainDirComment: '# Main branch directory',
      mainDirCommentEmpty: '# Main branch directory (initialize your project here)',
      worktreesDirComment: '# Worktrees directory',
      configDirComment: '# Config directory',
      configInfo: 'Configuration:',
      mainBranch: 'Main branch: {{branch}}',
      port: 'Port: {{port}}',
      nextSteps: 'Next steps:',
      step1CreateWorktree: '1. Create worktree:',
      step2ListWorktrees: '2. View worktree list:',
      step1EnterDir: '1. Enter main branch directory:',
      step2InitGit: '2. Initialize git repository (if not already):',
      step3InitProject: '3. Initialize your project (e.g., npm/yarn init)',
      step4CreateWorktree: '4. Create worktree:',
      detectedInitialized: 'Detected initialized, entering completion mode...',
      createMainDir: 'Create main branch directory: {{name}}',
      createWorktreesDir: 'Create worktrees directory',
      createConfigDir: 'Create .colyn config directory',
      checkEnvLocal: 'Check and configure .env.local',
      checkGitignore: 'Check and configure .gitignore',
      completionDone: 'Completion done!',
      noCompletionNeeded: 'All configurations are complete, no completion needed.',
      detectedExistingFiles: 'Detected existing files, will perform the following:',
      existingStep1: '1. Create main branch directory and worktrees directory',
      existingStep2: '2. Move all files in current directory to {{name}}/ directory',
      currentFileList: 'Current directory file list:',
      moreFiles: '... and {{count}} more files',
      confirmContinue: 'Confirm to continue initialization?',
      nonInteractiveConfirm: 'Cannot prompt for confirmation in non-interactive mode',
      nonInteractiveConfirmHint: 'Use --yes to continue initialization without prompt',
      initCanceled: 'Initialization canceled',
      tmuxDetectedInSession: 'Detected inside a tmux session',
      tmuxUseCurrentSession: 'Using current session: {{session}}',
      tmuxWindow0Set: 'Window 0 (main) configured',
      tmuxDetectedNotInSession: 'Detected outside tmux',
      tmuxSessionCreated: 'Created tmux session: {{session}}',
      tmuxPaneClaude: '  |- Claude Code  (left 60%)',
      tmuxPaneDevServer: '  |- Dev Server   (top-right 12%)',
      tmuxPaneBash: '  `- Bash         (bottom-right 28%)',
      tmuxAttachHint: `Hint: Run 'tmux attach -t {{session}}' to enter workspace`,
    },

    // merge command
    merge: {
      description: 'Merge worktree branch back to main branch',
      pushOption: 'Auto push to remote after merge',
      noPushOption: 'Do not push after merge (skip prompt)',
      noRebaseOption: 'Use merge instead of rebase to update worktree',
      noUpdateOption: 'Do not auto-update after merge',
      updateAllOption: 'Update all worktrees after merge',
      cannotAutoDetect: 'Cannot auto-detect worktree',
      cannotAutoDetectHint: `Please run this command in a worktree directory, or specify ID/branch name:
  colyn merge <id>
  colyn merge <branch-name>

View all worktrees:
  colyn list`,
      worktreeNotFound: 'Cannot find worktree with ID {{id}}',
      worktreeNotFoundHint: `The WORKTREE value in current directory's .env.local may be outdated

View all worktrees:
  colyn list`,
      branchNotFound: 'Cannot find worktree for branch "{{branch}}"',
      branchNotFoundHint: `View all worktrees:
  colyn list`,
      detectedWorktree: 'Detected worktree:',
      detectedBranchLabel: 'Branch',
      detectedPathLabel: 'Path',
      preCheck: 'Running pre-checks...',
      preCheckPassed: 'Pre-checks passed',
      preCheckFailed: 'Pre-checks failed',
      mainDirClean: '✓ Main branch working directory clean',
      worktreeDirClean: '✓ Worktree working directory clean',
      dirHasUncommitted: '{{name}} directory has uncommitted changes',
      dirHasUncommittedHint: `{{name}} directory: {{path}}

Changed files ({{count}}):
{{files}}

Hints:
  - View status: cd "{{path}}" && git status
  - Commit changes: git add . && git commit -m "..."
  - Or stash: git stash`,
      step1Title: 'Step 1/2: Update main branch code in worktree',
      step1Dir: '  Directory: {{path}}',
      step1Cmd: '  Execute: git merge {{branch}}',
      step1CmdRebase: '  Execute: git rebase {{branch}}',
      mergingMain: 'Merging main branch into worktree...',
      rebasingMain: 'Rebasing main branch onto worktree...',
      mainMergeFailed: 'Failed to merge main branch',
      mainRebaseFailed: 'Failed to rebase main branch',
      mainMerged: 'Main branch merged into worktree',
      mainRebased: 'Main branch rebased onto worktree',
      step2Title: 'Step 2/2: Merge worktree branch into main',
      step2Dir: '  Directory: {{path}}',
      step2Cmd: '  Execute: git merge --no-ff {{branch}}',
      mergingWorktree: 'Merging worktree into main branch...',
      worktreeMergeFailed: 'Failed to merge into main branch',
      worktreeMerged: 'Worktree merged into main branch',
      mergeComplete: 'Merge complete!',
      unexpectedConflict: 'Unexpected conflict while merging into main branch',
      unexpectedConflictHint: `This should not happen. Please check git status and resolve manually.
Main branch directory: {{path}}`,
      mergeFailed: 'Failed to merge into main branch',
      pushToRemote: 'Pushing to remote repository...',
      pushed: 'Pushed to remote repository',
      pushFailed: 'Push failed',
      shouldPush: 'Push to remote repository?',
      mergeSuccess: 'Merge successful!',
      mergeInfo: 'Merge info:',
      mainBranchLabel: 'Main branch: {{branch}}',
      mergeBranchLabel: 'Merged branch: {{branch}}',
      commitLabel: 'Commit: {{hash}} Merge branch \'{{branch}}\'',
      mergeAndPushed: 'Merge complete and pushed to remote!',
      mergeCompleteNoPush: 'Merge complete!',
      pushLaterHint: 'Hint: You can push later manually:',
      nextSteps: 'Next steps:',
      step1ViewCode: '1. View merged code:',
      step2ContinueWorktree: '2. To continue using worktree:',
      step3RemoveWorktree: '3. To delete worktree:',
      conflictTitle: 'Conflict while merging {{main}} into {{branch}}',
      conflictFiles: 'Conflict files:',
      resolveSteps: 'Resolution steps:',
      resolveStep1: '1. Enter worktree directory to resolve conflicts:',
      resolveStep2: '2. Edit conflict files, resolve conflict markers',
      resolveStep3: '3. Add resolved files:',
      resolveStep4: '4. Complete merge:',
      resolveStep4Rebase: '4. Continue rebase:',
      resolveStep4RebaseAbort: '5. To abort rebase:',
      resolveStep5: '5. Re-run merge command:',
      pushFailedTitle: 'Failed to push to remote repository',
      pushFailedError: 'Error: {{error}}',
      pushFailedHint: 'Local merge complete, you can push later manually:',
      updatingCurrentWorktree: 'Updating current worktree...',
      updatingAllWorktrees: 'Updating all worktrees...',
      updatePartialSuccess: '⚠ Some worktrees failed to update, see details above',
    },

    // update command
    update: {
      description: 'Update worktree with main branch code',
      noRebaseOption: 'Use merge instead of rebase',
      allOption: 'Update all worktrees',
      cannotAutoDetect: 'Cannot auto-detect worktree',
      cannotAutoDetectHint: `Please run this command in a worktree directory, or specify ID/branch name:
  colyn update <id>
  colyn update <branch-name>

View all worktrees:
  colyn list`,
      worktreeNotFound: 'Cannot find worktree with ID {{id}}',
      worktreeNotFoundHint: `The WORKTREE value in current directory's .env.local may be outdated

View all worktrees:
  colyn list`,
      branchNotFound: 'Cannot find worktree for branch "{{branch}}"',
      branchNotFoundHint: `View all worktrees:
  colyn list`,
      detectedWorktree: 'Detected worktree:',
      branchLabel: 'Branch',
      pathLabel: 'Path',
      pullingMain: 'Pulling main branch latest code...',
      pullSuccess: 'Main branch updated',
      pullFailed: 'Failed to pull main branch',
      pullFailedHint: 'Please check network connection or remote repository configuration\nError: {{error}}',
      checkingStatus: 'Checking working directory status...',
      statusClean: 'Working directory clean',
      statusDirty: 'Working directory has uncommitted changes',
      dirHasUncommitted: '{{name}} has uncommitted changes',
      dirHasUncommittedHint: `{{name}} directory: {{path}}

Changed files ({{count}}):
{{files}}

Hints:
  - View status: cd "{{path}}" && git status
  - Commit changes: git add . && git commit -m "..."
  - Or stash: git stash`,
      updating: 'Updating with {{strategy}}...',
      updateDir: '  Directory: {{path}}',
      updateCmd: '  Execute: {{cmd}}',
      updateSuccess: 'Update successful',
      updateFailed: 'Update failed',
      updateComplete: 'Update complete!',
      mainBranchLabel: 'Main branch ({{branch}})',
      strategyLabel: 'Strategy',
      rebaseConflictTitle: 'Rebase failed, conflicts exist',
      mergeConflictTitle: 'Merge failed, conflicts exist',
      conflictFiles: 'Conflict files:',
      resolveSteps: 'Resolution steps:',
      rebaseStep1: '1. Edit conflict files, resolve conflict markers',
      rebaseStep2: '2. Add resolved files:',
      rebaseStep3: '3. Continue rebase:',
      rebaseStep4: '4. To abort rebase:',
      mergeStep1: '1. Edit conflict files, resolve conflict markers',
      mergeStep2: '2. Add resolved files:',
      mergeStep3: '3. Complete merge:',
      mergeStep4: '4. To abort merge:',
      noWorktrees: 'No worktrees found',
      noWorktreesHint: 'Please use colyn add to create a worktree first',
      foundWorktrees: 'Found {{count}} worktrees:',
      batchUpdating: 'Batch updating (strategy: {{strategy}})...',
      batchResult: 'Update results:',
      batchSucceeded: '✓ {{count}} worktrees updated successfully',
      batchFailed: '✗ {{count}} worktrees failed to update',
      batchSkipped: '○ {{count}} worktrees skipped',
      failedDetails: 'Failed details:',
      dirtySkipped: 'Working directory not clean, skipped',
      hasConflict: 'Conflicts exist, please resolve manually',
    },

    // remove command
    remove: {
      description: 'Delete worktree',
      forceOption: 'Force delete (ignore uncommitted changes)',
      yesOption: 'Skip confirmation prompt',
      cannotAutoDetect: 'Cannot auto-detect worktree',
      cannotAutoDetectHint: `Please run this command in a worktree directory, or specify ID/branch name:
  colyn remove <id>
  colyn remove <branch-name>

View all worktrees:
  colyn list`,
      worktreeNotFound: 'Cannot find worktree with ID {{id}}',
      worktreeNotFoundHint: `The WORKTREE value in current directory's .env.local may be outdated

View all worktrees:
  colyn list`,
      branchNotFound: 'Cannot find worktree for branch "{{branch}}"',
      branchNotFoundHint: `View all worktrees:
  colyn list`,
      toBeDeleted: 'Worktree to be deleted:',
      uncommittedChanges: 'Detected uncommitted changes',
      changedFiles: 'Changed files:',
      moreFiles: '... and {{count}} more files',
      cannotDelete: 'Cannot delete: uncommitted changes exist',
      cannotDeleteHint: `Please commit or stash changes first, or use --force to force delete:
  cd "{{path}}"
  git add . && git commit -m "..."

Or force delete:
  colyn remove {{id}} --force`,
      unmergedWarning: 'Branch "{{branch}}" has not been merged into {{main}}',
      unmergedWarningHint: 'Deleting may lose unmerged changes',
      confirmDelete: 'Are you sure you want to delete this worktree?',
      deleteCanceled: 'Delete canceled',
      deleting: 'Deleting worktree...',
      deleteFailed: 'Failed to delete worktree',
      deleted: 'Worktree deleted',
      deleteBranch: 'Also delete local branch "{{branch}}"?',
      skipDeleteBranchPrompt: 'Skipped branch deletion prompt (--yes). Local branch is kept by default.',
      deletingBranch: 'Deleting branch...',
      branchDeleted: 'Branch "{{branch}}" deleted',
      branchDeleteFailed: 'Failed to delete branch: {{error}}',
      successTitle: 'Worktree deleted',
      deleteInfo: 'Delete info:',
      branchStatus: 'Branch: {{branch}}{{status}}',
      branchStatusDeleted: ' (deleted)',
      branchStatusKept: ' (kept)',
      switchedToMain: 'Auto-switched to main branch directory:',
    },

    // checkout command
    checkout: {
      description: 'Switch branch in worktree',
      coDescription: 'Alias for checkout',
      noFetchOption: 'Skip fetching remote branch info',
      inMainBranch: 'Currently in main branch directory',
      inMainBranchHint: `Please specify worktree ID, or switch to worktree directory:
  colyn checkout <worktree-id> <branch>
  colyn list  # View all worktrees`,
      cannotDetermineWorktree: 'Cannot determine target worktree',
      cannotDetermineWorktreeHint: `Please specify worktree ID:
  colyn checkout <worktree-id> <branch>
  colyn list  # View all worktrees`,
      alreadyOnBranch: 'Already on branch {{branch}}',
      checkingStatus: 'Checking working directory status...',
      dirClean: 'Working directory clean',
      dirHasChanges: 'Working directory has uncommitted changes',
      cannotSwitchToMain: 'Cannot switch to main branch in worktree',
      cannotSwitchToMainHint: 'Please use main branch directory directly:\n  cd "{{path}}"',
      branchUsedByOther: 'Branch {{branch}} is already used in task-{{id}}',
      branchUsedByOtherHint: 'Please switch to that worktree directory:\n  cd "{{path}}"',
      branchNotMerged: '⚠ Current branch {{branch}} has not been merged into main branch',
      branchNotMergedInfo: 'If you switch branches, these changes will remain on the original branch.',
      confirmSwitch: 'Continue switching?',
      switchCanceled: 'Switch canceled',
      fetchingRemote: 'Fetching latest branch info from remote...',
      fetchedRemote: 'Fetched remote branch info',
      fetchFailed: 'Failed to fetch remote branch info',
      mainBranchUpdated: '✓ {{message}}',
      mainBranchUpdateMsg: 'Main branch updated (merged {{count}} commits)',
      switchingTo: 'Switching to branch {{branch}}...',
      switchedTo: 'Switched to branch {{branch}}',
      switchedToTrack: 'Switched to branch {{branch}} (tracking {{remote}})',
      switchedToNew: 'Created and switched to new branch {{branch}}',
      switchFailed: 'Failed to switch branch',
      gitCheckoutFailed: 'Git checkout failed',
      branchMerged: '✓ Branch {{branch}} has been merged into main branch',
      deleteOldBranch: 'Delete old branch {{branch}}?',
      deletingBranch: 'Deleting branch {{branch}}...',
      branchDeleted: 'Deleted branch {{branch}}',
      branchDeleteFailed: 'Failed to delete branch',
      branchDeleteHint: 'Hint: {{error}}',
      branchDeleteManual: 'You can delete later manually: git branch -d {{branch}}',
      successTitle: 'Switched to branch {{branch}}',
      logsArchived: 'Logs archived to: .claude/logs/archived/{{branch}}/ ({{count}} items)',
      oldBranchDeleted: 'Old branch {{branch}} deleted',
      currentStatus: 'Current status:',
      statusWorktree: 'Worktree: task-{{id}}',
      statusBranch: 'Branch: {{branch}}',
      statusPath: 'Path: {{path}}',
      argError: 'Argument error',
      argErrorHint: 'Usage: colyn checkout [worktree-id] <branch>',
    },

    // info command
    info: {
      description: 'Show current directory colyn project info',
      shortOption: 'Output short identifier (with branch info)',
      fieldOption: 'Output specified field (can be used multiple times)',
      formatOption: 'Format output using template string',
      separatorOption: 'Separator for multiple fields (default: tab)',
      invalidField: 'Invalid field name: {{field}}',
      invalidFieldHint: 'Valid fields: {{fields}}',
      notInWorktree: 'Current directory is not in worktree or main branch',
      notInWorktreeHint: 'Please switch to main branch directory or a worktree directory',
      labelProject: 'Project:',
      labelProjectPath: 'Project Path:',
      labelWorktreeId: 'Worktree ID:',
      labelWorktreeDir: 'Worktree Dir:',
      labelBranch: 'Branch:',
      mainIndicator: '0 (main)',
    },

    // repair command
    repair: {
      description: 'Check and repair project configuration (use after moving directory)',
      notGitRepo: 'Main branch directory is not a git repository',
      notGitRepoHint: 'Please make sure to run repair command in a git project',
      checkingMainEnv: 'Checking main branch .env.local...',
      mainEnvCorrect: 'Main branch .env.local configuration correct',
      mainEnvFixed: 'Fixed main branch .env.local',
      mainEnvFailed: 'Failed to fix main branch .env.local',
      checkingWorktreeEnv: 'Checking worktree task-{{id}} .env.local...',
      worktreeEnvCorrect: 'Worktree task-{{id}} .env.local configuration correct',
      worktreeEnvFixed: 'Fixed worktree task-{{id}} .env.local',
      worktreeEnvFailed: 'Failed to fix worktree task-{{id}} .env.local',
      repairingGit: 'Repairing git worktree connections...',
      gitRepaired: 'Git worktree connections repaired',
      gitRepairFailed: 'Git worktree repair failed',
      detectingOrphans: 'Detecting and repairing orphan worktree directories...',
      noOrphans: 'No orphan worktree directories found',
      orphansRepaired: 'Repaired {{count}} path-invalid worktrees',
      orphansFound: 'Found {{count}} orphan worktree directories',
      repairComplete: 'Repair complete!',
      repairSummary: 'Repair summary:',
      fixedItems: '✓ Fixed {{count}} configuration items',
      allCorrect: '✓ All configurations correct, no repair needed',
      failedItems: '⚠ {{count}} items failed to repair (see details below)',
      repairedOrphans: '✓ Repaired {{count}} path-invalid worktrees',
      trueOrphans: '⚠ Found {{count}} orphan worktree directories',
      noOrphansFound: '✓ No orphan worktree directories found',
      detailsTitle: 'Details:',
      configCorrect: '✓ Configuration correct',
      repairFailed: '✗ Repair failed: {{error}}',
      repairedOrphansTitle: 'Repaired path-invalid worktrees:',
      orphanRepaired: '✓ {{dir}} (git path updated)',
      repairFailedTitle: 'Failed to repair worktrees:',
      orphanFailed: '✗ {{dir}}: {{error}}',
      trueOrphansTitle: 'Orphan worktree directories:',
      orphanDir: '- {{dir}} (directory exists but git does not recognize)',
      orphanSuggestion: 'Suggested action:',
      orphanSuggestionHint: 'Run colyn remove to clean up, or manually delete the directory',
      addPort: 'Add PORT={{port}}',
      addWorktree: 'Add WORKTREE={{value}}',
      updateWorktree: 'WORKTREE: {{old}} → {{new}}',
      updatePort: 'PORT: {{old}} → {{new}}',
      gitRepairDetail: 'Git worktree connections repaired',
    },

    // config command
    config: {
      description: 'Show tmux configuration info',
      jsonOption: 'Output in JSON format',
      title: 'Tmux Configuration Info',
      userConfig: 'User Config',
      projectConfig: 'Project Config',
      effectiveConfig: 'Effective Configuration',
      availableBuiltinCommands: 'Available Builtin Commands',
      path: 'Path',
      status: 'Status',
      exists: 'exists',
      notExists: 'not exists',
      content: 'Content',
      default: '(default)',
      noCommand: '(no command)',
      builtin: '(builtin)',
      autoClaudeDesc: 'Auto continue Claude session (detect existing session)',
      autoClaudeDangerouslyDesc: 'Same as above, but add --dangerously-skip-permissions flag',
      autoDevServerDesc: 'Auto start dev server (detect package.json)',
    },

    // completion command
    completion: {
      description: 'Generate shell auto-completion script',
      installOption: 'Show installation instructions',
      usage: 'Usage: colyn completion <shell>',
      supportedShells: 'Supported shells:',
      bashDesc: 'Generate Bash completion script',
      zshDesc: 'Generate Zsh completion script',
      options: 'Options:',
      installDesc: 'Show installation instructions',
      examples: 'Examples:',
      unsupportedShell: 'Unsupported shell: {{shell}}',
      unsupportedShellHint: 'Supported shells: {{shells}}',
      cannotReadScript: 'Cannot read {{shell}} completion script',
      cannotReadScriptHint: 'Please ensure the project is fully installed, script path: shell/completion.{{shell}}',
      installTitle: '📝 Manual installation instructions:',
      installStep1: '1. Add the following to {{config}}:',
      installStep2: '2. Reload configuration:',
      installAuto: 'Or run the following command to auto-install:',
    },

    // system-integration command
    systemIntegration: {
      description: 'Configure shell integration (supports auto directory switching and command completion)',
      windowsNotSupported: '⚠ Windows platform does not support auto configuration',
      windowsManualHint: 'Please refer to documentation for manual shell integration configuration:',
      detectingEnv: 'Detecting system environment...',
      shellType: '✓ Shell type: {{type}}',
      configFile: '✓ Config file: {{path}}',
      installPath: '✓ Colyn install path: {{path}}',
      shellScriptNotFound: 'Shell integration script not found',
      shellScriptNotFoundHint: `Path: {{path}}

Possible reasons:
  - colyn installation incomplete

Solution:
  Reinstall: npm install -g colyn`,
      completionNotFound: '⚠ Completion script not found: {{path}}',
      completionNotFoundHint: 'Will only configure shell integration',
      configuringShell: 'Configuring shell integration...',
      configCreated: '✓ Created {{file}}',
      configAdded: '✓ Added shell integration to {{file}}',
      completionAdded: '✓ Added completion script to {{file}}',
      configUpdated: '✓ Updated shell integration in {{file}}',
      completionUpdated: '✓ Updated completion script',
      installComplete: 'Installation complete!',
      updateComplete: 'Update complete!',
      activateConfig: 'Activate configuration:',
      activateMethod1: 'Method 1 (recommended): Reopen terminal',
      activateMethod2: 'Method 2: Run command:',
      features: 'Features:',
      featureAutoSwitch: '✓ colyn command supports auto directory switching',
      featureCompletion: '✓ Use Tab key for auto-completion',
    },

    // tmux command
    tmux: {
      description: 'Manage tmux session and windows for the project',
      startDescription: 'Start and repair tmux session and windows',
      stopDescription: 'Stop the current project tmux session',
      forceOption: 'Skip confirmation and stop directly',
      confirmStop: 'Confirm to stop current session "{{sessionName}}"? This will disconnect you.',
      stopCanceled: 'Canceled',
      sessionNotExists: 'Session "{{sessionName}}" does not exist',
      stoppingSession: 'Stopping tmux session "{{sessionName}}"...',
      detachingAndStopping: 'Detaching and stopping session "{{sessionName}}"...',
      sessionStopped: 'Stopped tmux session "{{sessionName}}"',
      stopFailed: 'Failed to stop tmux session "{{sessionName}}"',
      notInstalled: 'tmux is not installed',
      installHint: 'Please install tmux first (e.g. brew install tmux)',
      repairing: 'Checking and repairing tmux session and windows...',
      sessionCreateFailed: 'Failed to create tmux session',
      sessionCreateFailedHint: 'Please verify tmux is running and you can create session manually: tmux new -s {{sessionName}}',
      failedWindowsTitle: 'Failed windows:',
      renameWindowFailed: 'Rename failed: {{currentName}} -> {{expectedName}}',
      createWindowFailed: 'Failed to create window',
      repairComplete: 'Tmux repair complete',
      repairSummary: 'Summary',
      repairCreatedSession: '  ✓ Created tmux session: {{sessionName}}',
      repairCreatedWindows: '  ✓ Created {{count}} tmux window(s)',
      repairRenamedWindows: '  ✓ Renamed {{count}} tmux window(s)',
      repairExistingWindows: '  ✓ {{count}} tmux window(s) already exist (layout preserved)',
      repairFailedWindows: '  ⚠ {{count}} tmux window(s) failed to repair',
      repairDetails: 'Details',
      createdWindowsTitle: 'Created tmux windows:',
      createdWindowItem: '  ✓ Window {{id}}: {{name}}',
      renamedWindowsTitle: 'Renamed tmux windows:',
      renamedWindowItem: '  ✓ Window {{id}}: {{oldName}} -> {{newName}}',
      failedWindowItem: '  ✗ Window {{id}}: {{error}}',
      failedWindowItemCompact: '  - Window {{id}}: {{error}}',
      createdSessionAndWindows: 'Created session "{{sessionName}}" and {{count}} window(s)',
      createdSession: 'Created session "{{sessionName}}"',
      createdWindows: 'Created {{count}} tmux window(s)',
      windowsCreateFailed: '{{count}} tmux window(s) failed to create',
      allWindowsExist: 'All tmux windows already exist',
      switchingSession: 'Switching to session "{{sessionName}}"...',
      switchedSession: 'Switched to session "{{sessionName}}"',
      switchSessionFailed: 'Failed to switch session',
      attachingSession: 'Attaching to session "{{sessionName}}"...',
    },
  },

  // Errors
  errors: {
    notGitRepo: 'Not a git repository',
    projectNotInitialized: 'Project not initialized',
    projectNotInitializedHint: 'Please run colyn init first to initialize the project',
    projectRootNotFound: 'Project root not found',
    projectRootNotFoundHint: 'Current directory is not in a colyn project, please run colyn init first',
    mainDirNotFound: 'Main branch directory not found',
    worktreesDirNotFound: 'Worktrees directory not found',
    pathExistsNotDir: 'Path exists but is not a directory: {{path}}',
    pathNotFound: 'Directory not found: {{path}}',
    workingDirNotClean: 'Working directory not clean, uncommitted changes exist',
    workingDirNotCleanHint: 'Please commit or stash changes before running init',
    cannotGetMainPort: 'Cannot get main branch port',
    cannotGetMainPortHint: 'Please ensure PORT is configured in {{path}}',
    worktreeConfigIncomplete: 'Worktree configuration incomplete',
    worktreeConfigIncompleteHint: 'Missing WORKTREE variable in .env.local\nFile path: {{path}}\n\nPlease ensure .env.local contains WORKTREE configuration',
    worktreeConfigInvalid: 'Worktree configuration invalid',
    worktreeConfigInvalidHint: 'WORKTREE value in .env.local is not a valid number: "{{value}}"\nFile path: {{path}}',
    worktreeConfigMismatch: 'Worktree configuration mismatch',
    worktreeConfigMismatchHint: `Directory name does not match WORKTREE value in .env.local

  Directory: {{dirName}} (ID: {{dirId}})
  WORKTREE: {{envId}}

Possible causes:
  - .env.local was manually modified
  - Directory was renamed

Please correct WORKTREE value in .env.local to {{dirId}}, or check if directory is correct`,
  },

  // Output labels
  output: {
    projectRoot: 'Project root',
    mainBranchDir: 'Main branch directory',
    worktreeDir: 'Worktree directory',
    configDir: 'Config directory',
    subDir: 'Subdirectory ({{path}})',
  },
} as const;

export type TranslationKeys = typeof en;
