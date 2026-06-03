import type { Command } from 'commander';
import Enquirer from 'enquirer';
const { prompt } = Enquirer;
import chalk from 'chalk';
import { spawn } from 'child_process';
import type { StdioOptions } from 'child_process';
import { openSync, closeSync } from 'fs';
import * as os from 'os';
import { writeFile, readFile, unlink } from 'fs/promises';
import * as path from 'path';
import type { TodoItem } from '../types/index.js';
import { ColynError } from '../types/index.js';
import {
  output,
  outputLine,
  outputSuccess,
  outputError,
  outputInfo,
  formatError
} from '../utils/logger.js';
import {
  getProjectPaths,
  validateProjectInitialized,
  getLocationInfo
} from '../core/paths.js';
import { t } from '../i18n/index.js';
import { getBranchCategories, resolveAbbr } from '../core/config.js';
import {
  parseTodoId,
  formatTodoTable,
  editMessageWithEditor,
  copyToClipboard,
  selectTodo,
} from './todo.helpers.js';
import { checkoutCommand } from './checkout.js';
import { getActiveTodoBackend } from '../todo-backends/registry.js';

/**
 * 打开编辑器编辑文本内容，返回编辑后的内容
 */
async function editWithEditor(initialContent: string): Promise<string> {
  const tmpFile = path.join(os.tmpdir(), `colyn-todo-edit-${Date.now()}.txt`);
  try {
    await writeFile(tmpFile, initialContent, 'utf-8');
    const editor = process.env.VISUAL || process.env.EDITOR || 'vim';

    let ttyFd: number | undefined;
    let stdio: StdioOptions = 'inherit';
    if (process.platform !== 'win32') {
      try {
        ttyFd = openSync('/dev/tty', 'r+');
        stdio = [ttyFd, ttyFd, ttyFd];
      } catch {
        // /dev/tty 不可用时回退到 inherit
      }
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(editor, [tmpFile], { stdio });
        child.on('close', code => {
          if (code === 0) resolve();
          else reject(new ColynError(t('commands.todo.edit.editorFailed')));
        });
        child.on('error', () => {
          reject(new ColynError(t('commands.todo.edit.editorFailed')));
        });
      });
    } finally {
      if (ttyFd !== undefined) closeSync(ttyFd);
    }
    return await readFile(tmpFile, 'utf-8');
  } finally {
    await unlink(tmpFile).catch(() => {});
  }
}

/**
 * 获取状态标签映射
 */
function getStatusLabels(): Record<string, string> {
  return {
    pending: t('commands.todo.list.statusPending'),
    'in-progress': t('commands.todo.list.statusInProgress'),
    done: t('commands.todo.list.statusDone'),
    archived: t('commands.todo.list.statusArchived'),
  };
}

/**
 * 列出待办任务（默认行为）
 */
async function listPendingTodos(paths: Awaited<ReturnType<typeof getProjectPaths>>): Promise<void> {
  const backend = await getActiveTodoBackend(paths);
  const pending = await backend.list('pending');
  if (pending.length === 0) {
    outputInfo(t('commands.todo.list.empty'));
    return;
  }
  const categories = await getBranchCategories(paths.configDir);
  const abbrMap = new Map(categories.map(c => [c.name, resolveAbbr(c)]));
  output(formatTodoTable(pending, abbrMap));
}

/**
 * 注册 todo 命令
 */
export function register(program: Command): void {
  const todo = program
    .command('todo')
    .description(t('commands.todo.description'))
    .action(async () => {
      try {
        const paths = await getProjectPaths();
        await validateProjectInitialized(paths);
        await listPendingTodos(paths);
      } catch (error) {
        formatError(error);
        process.exit(1);
      }
    });

  // todo add [todoId] [message...]
  todo
    .command('add [todoId] [message...]')
    .description(t('commands.todo.add.description'))
    .action(async (todoId: string | undefined, messageParts: string[] | undefined) => {
      const message = messageParts?.length ? messageParts.join(' ') : undefined;
      try {
        const paths = await getProjectPaths();
        await validateProjectInitialized(paths);

        let type: string;
        let name: string;

        if (todoId) {
          try {
            ({ type, name } = parseTodoId(todoId));
          } catch {
            throw new ColynError(t('commands.todo.add.invalidFormat'));
          }
        } else {
          // 交互式选择 type 和输入 name
          const categories = await getBranchCategories(paths.configDir);
          const typeResponse = await prompt<{ type: string }>({
            type: 'select',
            name: 'type',
            message: t('commands.todo.add.selectType'),
            choices: categories.map(c => ({ name: c.name, message: `${resolveAbbr(c)} (${c.name})` })),
            stdout: process.stderr,
          });
          type = typeResponse.type;

          const nameResponse = await prompt<{ name: string }>({
            type: 'input',
            name: 'name',
            message: t('commands.todo.add.inputName'),
            stdout: process.stderr,
          });
          name = nameResponse.name.trim();

          if (!name) {
            throw new ColynError(t('commands.todo.add.emptyName'));
          }
        }

        const resolvedTodoId = `${type}/${name}`;
        const backend = await getActiveTodoBackend(paths);

        const existing = await backend.find(type, name);
        if (existing) {
          throw new ColynError(t('commands.todo.add.alreadyExists', { todoId: resolvedTodoId }));
        }

        let resolvedMessage = message;

        if (!resolvedMessage) {
          let edited: string | null;
          try {
            edited = await editMessageWithEditor(resolvedTodoId);
          } catch (error) {
            const editor = error instanceof Error ? error.message : 'vim';
            throw new ColynError(t('commands.todo.add.editorFailed', { editor }));
          }
          if (edited === null) {
            output(chalk.gray(t('commands.todo.add.editorCanceled')));
            return;
          }
          resolvedMessage = edited;
        }

        if (!resolvedMessage.trim()) {
          throw new ColynError(t('commands.todo.add.emptyMessage'));
        }

        await backend.add({ type, name, message: resolvedMessage });

        outputSuccess(t('commands.todo.add.success', { todoId: resolvedTodoId, message: resolvedMessage }));
      } catch (error) {
        formatError(error);
        process.exit(1);
      }
    });

  // todo start [todoId]
  todo
    .command('start [todoId]')
    .description(t('commands.todo.start.description'))
    .option('--no-clipboard', t('commands.todo.start.noClipboardOption'))
    .action(async (todoId: string | undefined, options: { clipboard: boolean }) => {
      try {
        const paths = await getProjectPaths();
        await validateProjectInitialized(paths);

        const backend = await getActiveTodoBackend(paths);
        const pendingTodos = await backend.list('pending');

        let resolvedTodoId: string;

        if (!todoId) {
          if (pendingTodos.length === 0) {
            outputInfo(t('commands.todo.start.noPending'));
            return;
          }

          const categories = await getBranchCategories(paths.configDir);
          const abbrMap = new Map(categories.map(c => [c.name, resolveAbbr(c)]));
          resolvedTodoId = await selectTodo(pendingTodos, {
            selectMessage: t('commands.todo.start.selectTodo'),
            abbrMap,
          });
        } else {
          resolvedTodoId = todoId;
        }

        let type: string;
        let name: string;
        try {
          ({ type, name } = parseTodoId(resolvedTodoId));
        } catch {
          throw new ColynError(t('commands.todo.add.invalidFormat'));
        }

        const item = await backend.find(type, name);

        if (!item) {
          throw new ColynError(t('commands.todo.start.notFound', { todoId: resolvedTodoId }));
        }

        if (item.status !== 'pending') {
          throw new ColynError(t('commands.todo.start.notPending', { todoId: resolvedTodoId }));
        }

        const branch = `${type}/${name}`;

        try {
          await checkoutCommand(undefined, branch, {});
        } catch {
          outputError(t('commands.todo.start.checkoutFailed'));
          process.exit(1);
        }

        // checkout 成功，更新 todo 状态
        await backend.markStarted(type, name, branch);

        outputSuccess(t('commands.todo.start.success', { todoId: resolvedTodoId }));

        // 输出 message 并复制到剪贴板
        outputLine();
        output(chalk.bold(t('commands.todo.start.messageTitle')));
        output(item.message);
        outputLine();

        if (options.clipboard) {
          const copied = copyToClipboard(item.message);
          if (copied) {
            outputInfo(t('commands.todo.start.clipboardCopied'));
          } else {
            outputInfo(t('commands.todo.start.clipboardFailed'));
          }
        }
      } catch (error) {
        formatError(error);
        process.exit(1);
      }
    });

  // todo list [--done] [--in-progress] [--all] [--archived] [--id-only] [--json]
  todo
    .command('list')
    .alias('ls')
    .description(t('commands.todo.list.description'))
    .option('--done', t('commands.todo.list.doneOption'))
    .option('--in-progress', t('commands.todo.list.inProgressOption'))
    .option('--all', t('commands.todo.list.allOption'))
    .option('--archived', t('commands.todo.list.archivedOption'))
    .option('--id-only', t('commands.todo.list.idOnlyOption'))
    .option('--json', t('commands.todo.list.jsonOption'))
    .action(async (options: { done?: boolean; inProgress?: boolean; all?: boolean; archived?: boolean; idOnly?: boolean; json?: boolean }) => {
      try {
        const paths = await getProjectPaths();
        await validateProjectInitialized(paths);

        if (options.json && options.idOnly) {
          throw new ColynError(t('commands.todo.list.jsonConflict'));
        }

        const backend = await getActiveTodoBackend(paths);

        if (options.idOnly) {
          let todos: TodoItem[];
          if (options.archived) {
            todos = await backend.list('archived');
          } else if (options.done) {
            todos = await backend.list('done');
          } else if (options.inProgress) {
            todos = await backend.list('in-progress');
          } else if (options.all) {
            const [pending, inProgress, done, archived] = await Promise.all([
              backend.list('pending'),
              backend.list('in-progress'),
              backend.list('done'),
              backend.list('archived'),
            ]);
            todos = [...pending, ...inProgress, ...done, ...archived];
          } else {
            todos = await backend.list('pending');
          }
          for (const todo of todos) {
            process.stdout.write(`${todo.type}/${todo.name}\n`);
          }
          return;
        }

        if (options.json) {
          let todos: TodoItem[];
          if (options.archived) {
            todos = await backend.list('archived');
          } else if (options.done) {
            todos = await backend.list('done');
          } else if (options.inProgress) {
            todos = await backend.list('in-progress');
          } else if (options.all) {
            const [pending, inProgress, done, archived] = await Promise.all([
              backend.list('pending'),
              backend.list('in-progress'),
              backend.list('done'),
              backend.list('archived'),
            ]);
            todos = [...pending, ...inProgress, ...done, ...archived];
          } else {
            todos = await backend.list('pending');
          }
          console.log(JSON.stringify(todos, null, 2));
          return;
        }

        if (options.archived) {
          const todos = await backend.list('archived');
          if (todos.length === 0) {
            outputInfo(t('commands.todo.list.empty'));
            return;
          }
          const categories = await getBranchCategories(paths.configDir);
          const abbrMap = new Map(categories.map(c => [c.name, resolveAbbr(c)]));
          output(formatTodoTable(todos, abbrMap));
        } else if (options.done) {
          const todos = await backend.list('done');
          if (todos.length === 0) {
            outputInfo(t('commands.todo.list.empty'));
            return;
          }
          const categories = await getBranchCategories(paths.configDir);
          const abbrMap = new Map(categories.map(c => [c.name, resolveAbbr(c)]));
          output(formatTodoTable(todos, abbrMap));
        } else if (options.inProgress) {
          const todos = await backend.list('in-progress');
          if (todos.length === 0) {
            outputInfo(t('commands.todo.list.empty'));
            return;
          }
          const categories = await getBranchCategories(paths.configDir);
          const abbrMap = new Map(categories.map(c => [c.name, resolveAbbr(c)]));
          output(formatTodoTable(todos, abbrMap));
        } else if (options.all) {
          const [pending, inProgress, done, archived] = await Promise.all([
            backend.list('pending'),
            backend.list('in-progress'),
            backend.list('done'),
            backend.list('archived'),
          ]);
          const todos = [...pending, ...inProgress, ...done, ...archived];
          if (todos.length === 0) {
            outputInfo(t('commands.todo.list.empty'));
            return;
          }
          const categories = await getBranchCategories(paths.configDir);
          const abbrMap = new Map(categories.map(c => [c.name, resolveAbbr(c)]));
          output(formatTodoTable(todos, abbrMap));
        } else {
          await listPendingTodos(paths);
        }
      } catch (error) {
        formatError(error);
        process.exit(1);
      }
    });

  // todo remove [todoId] [-y]
  todo
    .command('remove [todoId]')
    .description(t('commands.todo.remove.description'))
    .option('-y, --yes', t('commands.todo.remove.yesOption'))
    .action(async (todoId: string | undefined, options: { yes?: boolean }) => {
      try {
        const paths = await getProjectPaths();
        await validateProjectInitialized(paths);

        const backend = await getActiveTodoBackend(paths);

        // 获取所有任务用于交互式选择
        const [pending, inProgress, done] = await Promise.all([
          backend.list('pending'),
          backend.list('in-progress'),
          backend.list('done'),
        ]);
        const allTodos = [...pending, ...inProgress, ...done];

        let resolvedTodoId: string;

        if (!todoId) {
          if (allTodos.length === 0) {
            outputInfo(t('commands.todo.list.empty'));
            return;
          }

          const statusLabels = getStatusLabels();
          const choices = allTodos.map(item => ({
            name: `${item.type}/${item.name}`,
            message: `${item.type}/${item.name}  (${statusLabels[item.status] ?? item.status})`,
          }));

          const response = await prompt<{ todoId: string }>({
            type: 'select',
            name: 'todoId',
            message: t('commands.todo.remove.selectTodo'),
            choices,
            stdout: process.stderr,
          });

          resolvedTodoId = response.todoId;
        } else {
          resolvedTodoId = todoId;
        }

        let type: string;
        let name: string;
        try {
          ({ type, name } = parseTodoId(resolvedTodoId));
        } catch {
          throw new ColynError(t('commands.todo.add.invalidFormat'));
        }

        const item = await backend.find(type, name);

        if (!item) {
          throw new ColynError(t('commands.todo.remove.notFound', { todoId: resolvedTodoId }));
        }

        if (!options.yes) {
          const response = await prompt<{ confirm: boolean }>({
            type: 'confirm',
            name: 'confirm',
            message: t('commands.todo.remove.confirm', { todoId: resolvedTodoId }),
            initial: false,
            stdout: process.stderr
          });

          if (!response.confirm) {
            output(chalk.gray(t('commands.todo.remove.canceled')));
            return;
          }
        }

        await backend.remove(type, name);

        outputSuccess(t('commands.todo.remove.success', { todoId: resolvedTodoId }));
      } catch (error) {
        formatError(error);
        process.exit(1);
      }
    });

  // todo archive [-y]
  todo
    .command('archive')
    .description(t('commands.todo.archive.description'))
    .option('-y, --yes', t('commands.todo.archive.yesOption'))
    .action(async (options: { yes?: boolean }) => {
      try {
        const paths = await getProjectPaths();
        await validateProjectInitialized(paths);

        const backend = await getActiveTodoBackend(paths);
        const doneTodos = await backend.list('done');

        if (doneTodos.length === 0) {
          outputInfo(t('commands.todo.archive.noCompleted'));
          return;
        }

        if (!options.yes) {
          const response = await prompt<{ confirm: boolean }>({
            type: 'confirm',
            name: 'confirm',
            message: t('commands.todo.archive.confirm', { count: doneTodos.length }),
            initial: true,
            stdout: process.stderr
          });

          if (!response.confirm) {
            output(chalk.gray(t('commands.todo.archive.canceled')));
            return;
          }
        }

        await backend.archive();

        outputSuccess(t('commands.todo.archive.success', { count: doneTodos.length }));
      } catch (error) {
        formatError(error);
        process.exit(1);
      }
    });

  // todo uncomplete [todoId]
  todo
    .command('uncomplete [todoId]')
    .description(t('commands.todo.uncomplete.description'))
    .action(async (todoId: string | undefined) => {
      try {
        const paths = await getProjectPaths();
        await validateProjectInitialized(paths);

        let resolvedTodoId = todoId;

        if (!resolvedTodoId) {
          // 尝试使用当前 worktree 的分支名
          try {
            const location = await getLocationInfo();
            if (location.isMainBranch) {
              throw new ColynError(t('commands.todo.uncomplete.noBranch'));
            }
            resolvedTodoId = location.branch;
            outputInfo(t('commands.todo.uncomplete.usingCurrentBranch', { branch: resolvedTodoId }));
          } catch (error) {
            if (error instanceof ColynError) {
              throw error;
            }
            throw new ColynError(t('commands.todo.uncomplete.noBranch'));
          }
        }

        let type: string;
        let name: string;
        try {
          ({ type, name } = parseTodoId(resolvedTodoId));
        } catch {
          throw new ColynError(t('commands.todo.add.invalidFormat'));
        }

        const backend = await getActiveTodoBackend(paths);
        const item = await backend.find(type, name);

        if (!item) {
          throw new ColynError(t('commands.todo.uncomplete.notFound', { todoId: resolvedTodoId }));
        }

        if (item.status !== 'done') {
          throw new ColynError(t('commands.todo.uncomplete.notCompleted', { todoId: resolvedTodoId }));
        }

        await backend.reopen(type, name);

        outputSuccess(t('commands.todo.uncomplete.success', { todoId: resolvedTodoId }));
        outputLine();
      } catch (error) {
        formatError(error);
        process.exit(1);
      }
    });

  // todo complete [todoId]
  todo
    .command('complete [todoId]')
    .description(t('commands.todo.complete.description'))
    .action(async (todoId: string | undefined) => {
      try {
        const paths = await getProjectPaths();
        await validateProjectInitialized(paths);

        const backend = await getActiveTodoBackend(paths);
        const inProgressTodos = await backend.list('in-progress');

        let resolvedTodoId: string;

        if (!todoId) {
          if (inProgressTodos.length === 0) {
            outputInfo(t('commands.todo.complete.noPending'));
            return;
          }
          const categories = await getBranchCategories(paths.configDir);
          const abbrMap = new Map(categories.map(c => [c.name, resolveAbbr(c)]));
          resolvedTodoId = await selectTodo(inProgressTodos, {
            selectMessage: t('commands.todo.complete.selectTodo'),
            abbrMap,
          });
        } else {
          resolvedTodoId = todoId;
        }

        let type: string;
        let name: string;
        try {
          ({ type, name } = parseTodoId(resolvedTodoId));
        } catch {
          throw new ColynError(t('commands.todo.add.invalidFormat'));
        }

        const item = await backend.find(type, name);
        if (!item) {
          throw new ColynError(t('commands.todo.complete.notFound', { todoId: resolvedTodoId }));
        }

        if (item.status !== 'in-progress') {
          throw new ColynError(t('commands.todo.complete.notPending', { todoId: resolvedTodoId }));
        }

        await backend.markDone(type, name);

        outputSuccess(t('commands.todo.complete.success', { todoId: resolvedTodoId }));
        outputLine();
      } catch (error) {
        formatError(error);
        process.exit(1);
      }
    });

  // todo edit [todoId] [message]
  todo
    .command('edit [todoId] [message]')
    .description(t('commands.todo.edit.description'))
    .action(async (todoId: string | undefined, message: string | undefined) => {
      try {
        const paths = await getProjectPaths();
        await validateProjectInitialized(paths);

        const backend = await getActiveTodoBackend(paths);

        // 获取所有任务用于交互式选择
        const [pending, inProgress, done] = await Promise.all([
          backend.list('pending'),
          backend.list('in-progress'),
          backend.list('done'),
        ]);
        const allTodos = [...pending, ...inProgress, ...done];

        let resolvedTodoId = todoId;

        // 如果没有指定 todoId，交互式选择
        if (!resolvedTodoId) {
          if (allTodos.length === 0) {
            outputInfo(t('commands.todo.edit.noTodos'));
            return;
          }

          resolvedTodoId = await selectTodo(allTodos, {
            selectMessage: t('commands.todo.edit.selectTodo'),
            showStatus: true,
            statusLabels: getStatusLabels(),
            abbrMap: new Map((await getBranchCategories(paths.configDir)).map(c => [c.name, resolveAbbr(c)])),
          });
        }

        let type: string;
        let name: string;
        try {
          ({ type, name } = parseTodoId(resolvedTodoId));
        } catch {
          throw new ColynError(t('commands.todo.add.invalidFormat'));
        }

        const item = await backend.find(type, name);
        if (!item) {
          throw new ColynError(t('commands.todo.edit.notFound', { todoId: resolvedTodoId }));
        }

        // 获取新的 message
        let newMessage = message;
        if (!newMessage) {
          newMessage = await editWithEditor(item.message);
        }

        if (!newMessage || !newMessage.trim()) {
          throw new ColynError(t('commands.todo.edit.messageEmpty'));
        }

        await backend.edit(type, name, newMessage.trim());

        outputSuccess(t('commands.todo.edit.success', { todoId: resolvedTodoId }));
      } catch (error) {
        formatError(error);
        process.exit(1);
      }
    });
}
