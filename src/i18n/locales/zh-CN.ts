/**
 * Chinese (Simplified) translations
 */
export const zhCN = {
  // Common
  common: {
    error: '错误',
    success: '成功',
    hint: '提示',
    canceled: '已取消',
    unknown: '未知',
    unknownError: '未知错误',
    yes: '是',
    no: '否',
    and: '和',
    files: '{{count}} 个文件',
    files_other: '{{count}} 个文件',
    commits: '{{count}} 个提交',
    commits_other: '{{count}} 个提交',
  },

  // CLI
  cli: {
    description: 'Git worktree 管理工具',
    noColorOption: '禁用颜色输出',
    // Commander.js built-in texts
    usage: '用法:',
    options: '选项:',
    commands: '命令:',
    arguments: '参数:',
    versionDescription: '输出版本号',
    helpDescription: '显示命令帮助',
    helpCommand: 'help [命令]',
    helpCommandDescription: '显示命令帮助',
  },

  // Logger
  logger: {
    hintPrefix: '提示:',
    errorPrefix: '错误:',
  },

  // Commands
  commands: {
    // add command
    add: {
      description: '创建新的 worktree',
      branchNameEmpty: '分支名称不能为空',
      branchNameEmptyHint: '请提供分支名称参数',
      invalidBranchName: '无效的分支名称',
      invalidBranchNameHint: '分支名称只能包含字母、数字、下划线、连字符和斜杠',
      notInitialized: '当前目录未初始化',
      notInitializedHint: '请先运行 colyn init 命令初始化项目',
      notGitRepo: '当前目录不是 git 仓库',
      notGitRepoHint: '请在 git 仓库中运行此命令',
      missingEnvFile: '主分支目录缺少 .env.local 文件',
      missingEnvFileHint: '请先在主分支目录配置环境变量',
      branchExists: '分支 "{{branch}}" 已存在 worktree',
      branchExistsHint: 'ID: {{id}}, 路径: {{path}}',
      usingLocalBranch: '使用本地分支: {{branch}}',
      checkingRemote: '检查远程分支...',
      creatingFromRemote: '从远程创建分支: {{branch}}',
      createdFromRemote: '已从远程创建分支: {{branch}}',
      creatingNewBranch: '基于主分支创建新分支: {{branch}}',
      createdNewBranch: '已创建新分支: {{branch}}',
      branchHandleFailed: '分支处理失败',
      creatingWorktree: '创建 worktree...',
      worktreeCreated: 'Worktree 创建完成: task-{{id}}',
      worktreeCreateFailed: '创建 worktree 失败',
      branchAlreadyUsed: '分支 "{{branch}}" 已关联到现有 worktree',
      branchAlreadyUsedHint: `Worktree 信息：
  ID: {{id}}
  路径: {{path}}
  端口: {{port}}

提示：
  - 如果要切换到该 worktree，请使用: cd {{path}}
  - 如果要删除该 worktree，请使用: colyn remove {{id}}
  - 如果要使用不同的分支名，请重新运行 add 命令`,
      branchUsedByOther: '分支 "{{branch}}" 已被其他 worktree 使用',
      branchUsedByOtherHint: `该分支当前被以下 worktree 使用：
  {{path}}

提示：
  - 这可能是其他 colyn 项目或手动创建的 worktree
  - 如果不再需要，请手动删除: git worktree remove "{{path}}"
  - 或者使用不同的分支名`,
      branchUsedUnknown: '分支 "{{branch}}" 已被其他 worktree 使用',
      branchUsedUnknownHint: `提示：
  - 运行 "git worktree list" 查看所有 worktree
  - 删除不需要的 worktree: git worktree remove <path>
  - 或者使用不同的分支名`,
      worktreeError: '创建 worktree 时发生错误',
      worktreeErrorHint: `错误信息: {{error}}

提示：
  - 检查分支是否存在
  - 检查 worktree 目录是否可写
  - 运行 "git worktree list" 查看现有 worktree`,
      configuringEnv: '配置环境变量...',
      envConfigured: '环境变量配置完成',
      envConfigFailed: '配置环境变量失败',
      successTitle: 'Worktree 创建成功！',
      worktreeInfo: 'Worktree 信息：',
      infoId: 'ID: {{id}}',
      infoBranch: '分支: {{branch}}',
      infoPath: '路径: {{path}}',
      infoPort: '端口: {{port}}',
      nextSteps: '后续操作：',
      step1: '1. 进入 worktree 目录：',
      step2: '2. 启动开发服务器（端口已自动配置）：',
      step3: '3. 查看所有 worktree：',
    },

    // list command
    list: {
      description: '列出所有 worktree',
      jsonOption: '以 JSON 格式输出',
      pathsOption: '只输出路径（每行一个）',
      noMainOption: '不显示主分支',
      optionConflict: '选项冲突：--json 和 --paths 不能同时使用',
      optionConflictHint: '请选择其中一种输出格式',
      noWorktrees: '暂无 worktree',
      noWorktreesHint: '提示：使用 colyn add <branch> 创建新的 worktree',
      tableId: 'ID',
      tableBranch: 'Branch',
      tablePort: 'Port',
      tableStatus: 'Status',
      tableDiff: 'Diff',
      tablePath: 'Path',
    },

    // init command
    init: {
      description: '初始化 worktree 管理结构',
      portOption: '主分支开发服务器端口',
      alreadyInProject: '当前目录已在 colyn 项目中',
      alreadyInProjectHint: '项目根目录: {{root}}\n请不要在项目子目录中运行 init 命令',
      invalidPort: '无效的端口号',
      invalidPortHint: '端口必须在 1-65535 之间',
      enterPort: '请输入主分支开发服务器端口',
      portValidation: '端口必须在 1-65535 之间',
      directoryConflict: '主分支目录名 "{{name}}" 与现有文件冲突',
      directoryConflictHint: '请重命名该文件后再运行 init 命令',
      creatingStructure: '创建目录结构...',
      structureCreated: '目录结构创建完成',
      movingFiles: '移动项目文件...',
      moving: '移动: {{file}}',
      filesMoved: '项目文件移动完成',
      moveFilesFailed: '移动文件失败',
      moveFilesError: '移动文件时发生错误',
      moveFilesErrorHint: '请检查文件权限或手动恢复目录结构',
      configuringEnv: '配置环境变量文件...',
      envConfigured: '环境变量配置完成',
      envConfigFailed: '配置环境变量失败',
      configuringGitignore: '配置 .gitignore...',
      gitignoreConfigured: '.gitignore 配置完成（已添加 .env.local）',
      gitignoreSkipped: '.gitignore 已有忽略规则，跳过',
      gitignoreFailed: '配置 .gitignore 失败',
      successTitle: '初始化成功！',
      directoryStructure: '目录结构：',
      mainDirComment: '# 主分支目录',
      mainDirCommentEmpty: '# 主分支目录（请在此目录中初始化项目）',
      worktreesDirComment: '# Worktree 目录',
      configDirComment: '# 配置目录',
      configInfo: '配置信息：',
      mainBranch: '主分支: {{branch}}',
      port: '端口: {{port}}',
      nextSteps: '后续操作：',
      step1CreateWorktree: '1. 创建 worktree:',
      step2ListWorktrees: '2. 查看 worktree 列表:',
      step1EnterDir: '1. 进入主分支目录：',
      step2InitGit: '2. 初始化 git 仓库（如果还没有）：',
      step3InitProject: '3. 初始化你的项目（例如 npm/yarn init）',
      step4CreateWorktree: '4. 创建 worktree：',
      detectedInitialized: '检测到已初始化，进入补全模式...',
      createMainDir: '创建主分支目录: {{name}}',
      createWorktreesDir: '创建 worktrees 目录',
      createConfigDir: '创建 .colyn 配置目录',
      checkEnvLocal: '检查并配置 .env.local',
      checkGitignore: '检查并配置 .gitignore',
      completionDone: '补全完成！',
      noCompletionNeeded: '所有配置已完整，无需补全。',
      detectedExistingFiles: '检测到已有文件，将执行以下操作：',
      existingStep1: '1. 创建主分支目录和 worktrees 目录',
      existingStep2: '2. 将当前目录所有文件移动到 {{name}}/ 目录下',
      currentFileList: '当前目录文件列表：',
      moreFiles: '... 还有 {{count}} 个文件',
      confirmContinue: '确认继续初始化？',
      initCanceled: '已取消初始化',
    },

    // merge command
    merge: {
      description: '将 worktree 分支合并回主分支',
      pushOption: '合并后自动推送到远程',
      noPushOption: '合并后不推送（跳过询问）',
      noRebaseOption: '使用 merge 而非 rebase 更新 worktree',
      cannotAutoDetect: '无法自动识别 worktree',
      cannotAutoDetectHint: `请在 worktree 目录中运行此命令，或指定 ID/分支名：
  colyn merge <id>
  colyn merge <branch-name>

查看所有 worktree：
  colyn list`,
      worktreeNotFound: '找不到 ID 为 {{id}} 的 worktree',
      worktreeNotFoundHint: `当前目录的 .env.local 中 WORKTREE 值可能已过期

查看所有 worktree：
  colyn list`,
      branchNotFound: '找不到分支 "{{branch}}" 对应的 worktree',
      branchNotFoundHint: `查看所有 worktree：
  colyn list`,
      detectedWorktree: '检测到 worktree:',
      preCheck: '执行前置检查...',
      preCheckPassed: '前置检查通过',
      preCheckFailed: '前置检查失败',
      mainDirClean: '✓ 主分支工作目录干净',
      worktreeDirClean: '✓ Worktree 工作目录干净',
      dirHasUncommitted: '{{name}}目录有未提交的更改',
      dirHasUncommittedHint: `{{name}}目录: {{path}}

变更文件 ({{count}} 个):
{{files}}

提示：
  - 查看状态: cd "{{path}}" && git status
  - 提交更改: git add . && git commit -m "..."
  - 或者暂存: git stash`,
      step1Title: '步骤 1/2: 在 worktree 中更新主分支代码',
      step1Dir: '  目录: {{path}}',
      step1Cmd: '  执行: git merge {{branch}}',
      step1CmdRebase: '  执行: git rebase {{branch}}',
      mergingMain: '合并主分支到 worktree...',
      rebasingMain: '变基主分支到 worktree...',
      mainMergeFailed: '合并主分支失败',
      mainRebaseFailed: '变基主分支失败',
      mainMerged: '主分支已合并到 worktree',
      mainRebased: '主分支已变基到 worktree',
      step2Title: '步骤 2/2: 在主分支中合并 worktree 分支',
      step2Dir: '  目录: {{path}}',
      step2Cmd: '  执行: git merge --no-ff {{branch}}',
      mergingWorktree: '合并 worktree 到主分支...',
      worktreeMergeFailed: '合并到主分支失败',
      worktreeMerged: 'worktree 已合并到主分支',
      mergeComplete: '合并完成！',
      unexpectedConflict: '合并到主分支时发生意外冲突',
      unexpectedConflictHint: `这种情况不应该发生。请检查 git 状态并手动解决。
主分支目录: {{path}}`,
      mergeFailed: '合并到主分支失败',
      pushToRemote: '推送到远程仓库...',
      pushed: '已推送到远程仓库',
      pushFailed: '推送失败',
      shouldPush: '是否推送到远程仓库？',
      mergeSuccess: '合并成功！',
      mergeInfo: '合并信息：',
      mainBranchLabel: '主分支: {{branch}}',
      mergeBranchLabel: '合并分支: {{branch}}',
      commitLabel: '提交: {{hash}} Merge branch \'{{branch}}\'',
      mergeAndPushed: '合并完成并已推送到远程！',
      mergeCompleteNoPush: '合并完成！',
      pushLaterHint: '提示：可稍后手动推送：',
      nextSteps: '后续操作：',
      step1ViewCode: '1. 查看合并后的代码：',
      step2ContinueWorktree: '2. 如需继续使用 worktree：',
      step3RemoveWorktree: '3. 如需删除 worktree：',
      conflictTitle: '合并 {{main}} 到 {{branch}} 时发生冲突',
      conflictFiles: '冲突文件：',
      resolveSteps: '解决步骤：',
      resolveStep1: '1. 进入 worktree 目录解决冲突：',
      resolveStep2: '2. 编辑冲突文件，解决冲突标记',
      resolveStep3: '3. 添加已解决的文件：',
      resolveStep4: '4. 完成合并：',
      resolveStep4Rebase: '4. 继续变基：',
      resolveStep4RebaseAbort: '5. 如需放弃变基：',
      resolveStep5: '5. 重新运行合并命令：',
      pushFailedTitle: '推送到远程仓库失败',
      pushFailedError: '错误信息: {{error}}',
      pushFailedHint: '本地合并已完成，可稍后手动推送：',
    },

    // update command
    update: {
      description: '将主分支代码更新到 worktree',
      noRebaseOption: '使用 merge 而非 rebase',
      allOption: '更新所有 worktree',
      cannotAutoDetect: '无法自动识别 worktree',
      cannotAutoDetectHint: `请在 worktree 目录中运行此命令，或指定 ID/分支名：
  colyn update <id>
  colyn update <branch-name>

查看所有 worktree：
  colyn list`,
      worktreeNotFound: '找不到 ID 为 {{id}} 的 worktree',
      worktreeNotFoundHint: `当前目录的 .env.local 中 WORKTREE 值可能已过期

查看所有 worktree：
  colyn list`,
      branchNotFound: '找不到分支 "{{branch}}" 对应的 worktree',
      branchNotFoundHint: `查看所有 worktree：
  colyn list`,
      detectedWorktree: '检测到 worktree:',
      branchLabel: '分支',
      pathLabel: '路径',
      pullingMain: '拉取主分支最新代码...',
      pullSuccess: '主分支已更新',
      pullFailed: '拉取主分支失败',
      pullFailedHint: '请检查网络连接或远程仓库配置\n错误信息: {{error}}',
      checkingStatus: '检查工作目录状态...',
      statusClean: '工作目录干净',
      statusDirty: '工作目录有未提交的更改',
      dirHasUncommitted: '{{name}} 有未提交的更改',
      dirHasUncommittedHint: `{{name}} 目录: {{path}}

变更文件 ({{count}} 个):
{{files}}

提示：
  - 查看状态: cd "{{path}}" && git status
  - 提交更改: git add . && git commit -m "..."
  - 或者暂存: git stash`,
      updating: '正在{{strategy}}...',
      updateDir: '  目录: {{path}}',
      updateCmd: '  执行: {{cmd}}',
      updateSuccess: '更新成功',
      updateFailed: '更新失败',
      updateComplete: '更新完成！',
      mainBranchLabel: '主分支 ({{branch}})',
      strategyLabel: '策略',
      rebaseConflictTitle: '变基失败，存在冲突',
      mergeConflictTitle: '合并失败，存在冲突',
      conflictFiles: '冲突文件：',
      resolveSteps: '解决步骤：',
      rebaseStep1: '1. 编辑冲突文件，解决冲突标记',
      rebaseStep2: '2. 添加已解决的文件：',
      rebaseStep3: '3. 继续变基：',
      rebaseStep4: '4. 如需放弃变基：',
      mergeStep1: '1. 编辑冲突文件，解决冲突标记',
      mergeStep2: '2. 添加已解决的文件：',
      mergeStep3: '3. 完成合并：',
      mergeStep4: '4. 如需放弃合并：',
      noWorktrees: '没有找到任何 worktree',
      noWorktreesHint: '请先使用 colyn add 创建 worktree',
      foundWorktrees: '发现 {{count}} 个 worktree:',
      batchUpdating: '正在批量更新 (策略: {{strategy}})...',
      batchResult: '更新结果:',
      batchSucceeded: '✓ {{count}} 个 worktree 更新成功',
      batchFailed: '✗ {{count}} 个 worktree 更新失败',
      batchSkipped: '○ {{count}} 个 worktree 已跳过',
      failedDetails: '失败详情:',
      dirtySkipped: '工作目录不干净，已跳过',
      hasConflict: '存在冲突，请手动解决',
    },

    // remove command
    remove: {
      description: '删除 worktree',
      forceOption: '强制删除（忽略未提交的更改）',
      yesOption: '跳过确认提示',
      cannotAutoDetect: '无法自动识别 worktree',
      cannotAutoDetectHint: `请在 worktree 目录中运行此命令，或指定 ID/分支名：
  colyn remove <id>
  colyn remove <branch-name>

查看所有 worktree：
  colyn list`,
      worktreeNotFound: '找不到 ID 为 {{id}} 的 worktree',
      worktreeNotFoundHint: `当前目录的 .env.local 中 WORKTREE 值可能已过期

查看所有 worktree：
  colyn list`,
      branchNotFound: '找不到分支 "{{branch}}" 对应的 worktree',
      branchNotFoundHint: `查看所有 worktree：
  colyn list`,
      toBeDeleted: '将要删除的 worktree:',
      uncommittedChanges: '检测到未提交的更改',
      changedFiles: '变更文件:',
      moreFiles: '... 以及其他 {{count}} 个文件',
      cannotDelete: '无法删除：存在未提交的更改',
      cannotDeleteHint: `请先提交或暂存更改，或使用 --force 强制删除：
  cd "{{path}}"
  git add . && git commit -m "..."

或者强制删除：
  colyn remove {{id}} --force`,
      unmergedWarning: '分支 "{{branch}}" 尚未合并到 {{main}}',
      unmergedWarningHint: '删除后可能丢失未合并的更改',
      confirmDelete: '确定要删除这个 worktree 吗？',
      deleteCanceled: '已取消删除',
      deleting: '正在删除 worktree...',
      deleteFailed: '删除 worktree 失败',
      deleted: 'Worktree 已删除',
      deleteBranch: '是否同时删除本地分支 "{{branch}}"？',
      deletingBranch: '正在删除分支...',
      branchDeleted: '分支 "{{branch}}" 已删除',
      branchDeleteFailed: '删除分支失败: {{error}}',
      successTitle: 'Worktree 已删除',
      deleteInfo: '删除信息:',
      branchStatus: '分支: {{branch}}{{status}}',
      branchStatusDeleted: ' (已删除)',
      branchStatusKept: ' (保留)',
      switchedToMain: '已自动切换到主分支目录:',
    },

    // checkout command
    checkout: {
      description: '在 worktree 中切换分支',
      coDescription: 'checkout 的别名',
      noFetchOption: '跳过从远程获取分支信息',
      inMainBranch: '当前在主分支目录中',
      inMainBranchHint: `请指定 worktree ID，或切换到 worktree 目录后执行：
  colyn checkout <worktree-id> <branch>
  colyn list  # 查看所有 worktree`,
      cannotDetermineWorktree: '无法确定目标 worktree',
      cannotDetermineWorktreeHint: `请指定 worktree ID：
  colyn checkout <worktree-id> <branch>
  colyn list  # 查看所有 worktree`,
      alreadyOnBranch: '已经在分支 {{branch}} 上',
      checkingStatus: '检查工作目录状态...',
      dirClean: '工作目录干净',
      dirHasChanges: '工作目录有未提交的更改',
      cannotSwitchToMain: '不能在 worktree 中切换到主分支',
      cannotSwitchToMainHint: '请直接使用主分支目录：\n  cd "{{path}}"',
      branchUsedByOther: '分支 {{branch}} 已在 task-{{id}} 中使用',
      branchUsedByOtherHint: '请直接切换到该 worktree 目录工作：\n  cd "{{path}}"',
      branchNotMerged: '⚠ 当前分支 {{branch}} 尚未合并到主分支',
      branchNotMergedInfo: '如果切换分支，这些更改将保留在原分支上。',
      confirmSwitch: '是否继续切换？',
      switchCanceled: '已取消切换',
      fetchingRemote: '从远程仓库获取最新分支信息...',
      fetchedRemote: '已获取远程分支信息',
      fetchFailed: '获取远程分支信息失败',
      mainBranchUpdated: '✓ {{message}}',
      mainBranchUpdateMsg: '主分支已更新 (合并了 {{count}} 个提交)',
      switchingTo: '切换到分支 {{branch}}...',
      switchedTo: '已切换到分支 {{branch}}',
      switchedToTrack: '已切换到分支 {{branch}}（跟踪 {{remote}}）',
      switchedToNew: '已创建并切换到新分支 {{branch}}',
      switchFailed: '切换分支失败',
      gitCheckoutFailed: 'Git checkout 失败',
      branchMerged: '✓ 分支 {{branch}} 已合并到主分支',
      deleteOldBranch: '是否删除旧分支 {{branch}}？',
      deletingBranch: '删除分支 {{branch}}...',
      branchDeleted: '已删除分支 {{branch}}',
      branchDeleteFailed: '删除分支失败',
      branchDeleteHint: '提示: {{error}}',
      branchDeleteManual: '可稍后手动删除: git branch -d {{branch}}',
      successTitle: '已切换到分支 {{branch}}',
      logsArchived: '日志已归档到: .claude/logs/archived/{{branch}}/ ({{count}} 项)',
      oldBranchDeleted: '旧分支 {{branch}} 已删除',
      currentStatus: '当前状态：',
      statusWorktree: 'Worktree: task-{{id}}',
      statusBranch: '分支: {{branch}}',
      statusPath: '路径: {{path}}',
      argError: '参数错误',
      argErrorHint: '用法: colyn checkout [worktree-id] <branch>',
    },

    // info command
    info: {
      description: '显示当前目录的 colyn 项目信息',
      shortOption: '输出简短标识符（带分支信息）',
      fieldOption: '输出指定字段（可多次使用）',
      formatOption: '使用模板字符串格式化输出',
      separatorOption: '多字段时的分隔符（默认 tab）',
      invalidField: '无效的字段名: {{field}}',
      invalidFieldHint: '有效字段: {{fields}}',
      notInWorktree: '当前目录不在 worktree 或主分支中',
      notInWorktreeHint: '请切换到主分支目录或某个 worktree 目录',
      labelProject: 'Project:',
      labelProjectPath: 'Project Path:',
      labelWorktreeId: 'Worktree ID:',
      labelWorktreeDir: 'Worktree Dir:',
      labelBranch: 'Branch:',
      mainIndicator: '0 (main)',
    },

    // repair command
    repair: {
      description: '检查并修复项目配置（移动目录后使用）',
      notGitRepo: '主分支目录不是 git 仓库',
      notGitRepoHint: '请确保在 git 项目中运行 repair 命令',
      checkingMainEnv: '检查主分支 .env.local...',
      mainEnvCorrect: '主分支 .env.local 配置正确',
      mainEnvFixed: '已修复主分支 .env.local',
      mainEnvFailed: '修复主分支 .env.local 失败',
      checkingWorktreeEnv: '检查 worktree task-{{id}} .env.local...',
      worktreeEnvCorrect: 'Worktree task-{{id}} .env.local 配置正确',
      worktreeEnvFixed: '已修复 worktree task-{{id}} .env.local',
      worktreeEnvFailed: '修复 worktree task-{{id}} .env.local 失败',
      repairingGit: '修复 git worktree 连接...',
      gitRepaired: 'Git worktree 连接已修复',
      gitRepairFailed: 'Git worktree 修复失败',
      detectingOrphans: '检测并修复孤儿 worktree 目录...',
      noOrphans: '未发现孤儿 worktree 目录',
      orphansRepaired: '已修复 {{count}} 个路径失效的 worktree',
      orphansFound: '发现 {{count}} 个孤儿 worktree 目录',
      repairComplete: '修复完成！',
      repairSummary: '修复摘要：',
      fixedItems: '✓ 修复了 {{count}} 个配置项',
      allCorrect: '✓ 所有配置正确，无需修复',
      failedItems: '⚠ {{count}} 个项修复失败（见下方详情）',
      repairedOrphans: '✓ 修复了 {{count}} 个路径失效的 worktree',
      trueOrphans: '⚠ 发现 {{count}} 个孤儿 worktree 目录',
      noOrphansFound: '✓ 未发现孤儿 worktree 目录',
      detailsTitle: '详细信息：',
      configCorrect: '✓ 配置正确',
      repairFailed: '✗ 修复失败: {{error}}',
      repairedOrphansTitle: '已修复路径失效的 worktree：',
      orphanRepaired: '✓ {{dir}} (git 路径已更新)',
      repairFailedTitle: '修复失败的 worktree：',
      orphanFailed: '✗ {{dir}}: {{error}}',
      trueOrphansTitle: '孤儿 worktree 目录：',
      orphanDir: '- {{dir}} (目录存在但 git 不识别)',
      orphanSuggestion: '建议操作：',
      orphanSuggestionHint: '运行 colyn remove 命令清理，或手动删除目录',
      addPort: '添加 PORT={{port}}',
      addWorktree: '添加 WORKTREE={{value}}',
      updateWorktree: 'WORKTREE: {{old}} → {{new}}',
      updatePort: 'PORT: {{old}} → {{new}}',
      gitRepairDetail: 'Git worktree 连接已修复',
    },

    // config command
    config: {
      description: '显示 tmux 配置信息',
      jsonOption: '以 JSON 格式输出',
      title: 'Tmux 配置信息',
      userConfig: '用户级配置',
      projectConfig: '项目级配置',
      effectiveConfig: '生效的配置',
      availableBuiltinCommands: '可用的内置命令',
      path: '路径',
      status: '状态',
      exists: '存在',
      notExists: '不存在',
      content: '内容',
      default: '(默认)',
      noCommand: '(不执行命令)',
      builtin: '(内置)',
      autoClaudeDesc: '自动继续 Claude 会话（检测 .claude 目录）',
      autoClaudeDangerouslyDesc: '同上，但添加 --dangerously-skip-permissions 参数',
      autoDevServerDesc: '自动启动 dev server（检测 package.json）',
    },

    // completion command
    completion: {
      description: '生成 shell 自动补全脚本',
      installOption: '显示安装说明',
      usage: '用法: colyn completion <shell>',
      supportedShells: '支持的 shell:',
      bashDesc: '生成 Bash 补全脚本',
      zshDesc: '生成 Zsh 补全脚本',
      options: '选项:',
      installDesc: '显示安装说明',
      examples: '示例:',
      unsupportedShell: '不支持的 shell: {{shell}}',
      unsupportedShellHint: '支持的 shell: {{shells}}',
      cannotReadScript: '无法读取 {{shell}} 补全脚本',
      cannotReadScriptHint: '请确保项目完整安装，脚本路径: shell/completion.{{shell}}',
      installTitle: '📝 手动安装说明:',
      installStep1: '1. 将以下内容添加到 {{config}}:',
      installStep2: '2. 重新加载配置:',
      installAuto: '或者直接运行以下命令自动安装:',
    },

    // system-integration command
    systemIntegration: {
      description: '配置 shell 集成（支持自动目录切换和命令补全）',
      windowsNotSupported: '⚠ Windows 平台暂不支持自动配置',
      windowsManualHint: '请参考文档手动配置 shell 集成：',
      detectingEnv: '检测系统环境...',
      shellType: '✓ Shell 类型: {{type}}',
      configFile: '✓ 配置文件: {{path}}',
      installPath: '✓ Colyn 安装路径: {{path}}',
      shellScriptNotFound: '找不到 shell 集成脚本',
      shellScriptNotFoundHint: `路径: {{path}}

可能原因：
  - colyn 安装不完整

解决方法：
  重新安装：npm install -g colyn`,
      completionNotFound: '⚠ 补全脚本未找到: {{path}}',
      completionNotFoundHint: '将仅配置 shell 集成功能',
      configuringShell: '配置 shell 集成...',
      configCreated: '✓ 已创建 {{file}}',
      configAdded: '✓ 已添加 shell 集成到 {{file}}',
      completionAdded: '✓ 已添加补全脚本到 {{file}}',
      configUpdated: '✓ 已更新 {{file}} 中的 shell 集成配置',
      completionUpdated: '✓ 已更新补全脚本配置',
      installComplete: '安装完成！',
      updateComplete: '更新完成！',
      activateConfig: '生效配置：',
      activateMethod1: '方式 1（推荐）：重新打开终端',
      activateMethod2: '方式 2：运行命令：',
      features: '功能说明：',
      featureAutoSwitch: '✓ colyn 命令支持自动目录切换',
      featureCompletion: '✓ 使用 Tab 键可自动完成命令和参数',
    },
  },

  // Errors
  errors: {
    notGitRepo: '不是 git 仓库',
    projectNotInitialized: '项目未初始化',
    projectNotInitializedHint: '请先运行 colyn init 命令初始化项目',
    projectRootNotFound: '未找到项目根目录',
    projectRootNotFoundHint: '当前目录不在 colyn 项目中，请先运行 colyn init 初始化项目',
    mainDirNotFound: '主分支目录不存在',
    worktreesDirNotFound: 'worktrees 目录不存在',
    pathExistsNotDir: '路径存在但不是目录: {{path}}',
    pathNotFound: '目录不存在: {{path}}',
    workingDirNotClean: '工作目录不干净，存在未提交的更改',
    workingDirNotCleanHint: '请先提交或 stash 更改后再运行 init 命令',
    cannotGetMainPort: '无法获取主分支端口',
    cannotGetMainPortHint: '请确保 {{path}} 中配置了 PORT 环境变量',
    worktreeConfigIncomplete: 'Worktree 配置不完整',
    worktreeConfigIncompleteHint: '.env.local 文件中缺少 WORKTREE 变量\n文件路径: {{path}}\n\n请确保 .env.local 包含 WORKTREE 配置',
    worktreeConfigInvalid: 'Worktree 配置无效',
    worktreeConfigInvalidHint: '.env.local 中 WORKTREE 值不是有效数字: "{{value}}"\n文件路径: {{path}}',
    worktreeConfigMismatch: 'Worktree 配置不一致',
    worktreeConfigMismatchHint: `目录名与 .env.local 中的 WORKTREE 值不匹配

  目录名: {{dirName}} (ID: {{dirId}})
  WORKTREE: {{envId}}

可能原因：
  - .env.local 文件被手动修改
  - 目录被重命名

请修正 .env.local 中的 WORKTREE 值为 {{dirId}}，或检查目录是否正确`,
  },

  // Output labels
  output: {
    projectRoot: '项目根目录',
    mainBranchDir: '主分支目录',
    worktreeDir: 'worktree 目录',
    configDir: '配置目录',
    subDir: '子目录 ({{path}})',
  },
} as const;
