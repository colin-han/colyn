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
import type { ArchivedTodoItem, TodoItem } from '../types/index.js';
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
import {
  readTodoFile,
  saveTodoFile,
  readArchivedTodoFile,
  saveArchivedTodoFile,
  parseTodoId,
  findTodo,
  formatTodoTable,
  editMessageWithEditor,
  copyToClipboard,
  selectTodo,
} from './todo.helpers.js';
import { checkoutCommand } from './checkout.js';

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
    completed: t('commands.todo.list.statusCompleted'),
    archived: t('commands.todo.list.statusArchived'),
  };
}

/**
 * 列出待办任务（默认行为）
 */
async function listPendingTodos(configDir: string): Promise<void> {
  const todoFile = await readTodoFile(configDir);
  const pending = todoFile.todos.filter(item => item.status === 'pending');
  if (pending.length === 0) {
    outputInfo(t('commands.todo.list.empty'));
    return;
  }
  output(formatTodoTable(pending));
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
        await listPendingTodos(paths.configDir);
      } catch (error) {
        formatError(error);
        process.exit(1);
      }
    });

  // todo add [todoId] [message]
  todo
    .command('add [todoId] [message]')
    .description(t('commands.todo.add.description'))
    .action(async (todoId: string | undefined, message: string | undefined) => {
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
          const typeResponse = await prompt<{ type: string }>({
            type: 'select',
            name: 'type',
            message: t('commands.todo.add.selectType'),
            choices: ['feature', 'bugfix', 'refactor', 'document'],
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
        const todoFile = await readTodoFile(paths.configDir);

        const existing = findTodo(todoFile.todos, type, name);
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

        const newTodo: TodoItem = {
          type,
          name,
          message: resolvedMessage,
          status: 'pending',
          createdAt: new Date().toISOString(),
        };

        todoFile.todos.push(newTodo);
        await saveTodoFile(paths.configDir, todoFile);

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

        const todoFile = await readTodoFile(paths.configDir);
        const pendingTodos = todoFile.todos.filter(item => item.status === 'pending');

        let resolvedTodoId: string;

        if (!todoId) {
          if (pendingTodos.length === 0) {
            outputInfo(t('commands.todo.start.noPending'));
            return;
          }

          resolvedTodoId = await selectTodo(pendingTodos, {
            selectMessage: t('commands.todo.start.selectTodo'),
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

        const item = findTodo(todoFile.todos, type, name);

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
        item.status = 'completed';
        item.startedAt = new Date().toISOString();
        item.branch = branch;
        await saveTodoFile(paths.configDir, todoFile);

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

  // todo list [--completed] [--archived] [--id-only] [--json]
  todo
    .command('list')
    .alias('ls')
    .description(t('commands.todo.list.description'))
    .option('--completed', t('commands.todo.list.completedOption'))
    .option('--archived', t('commands.todo.list.archivedOption'))
    .option('--id-only', t('commands.todo.list.idOnlyOption'))
    .option('--json', t('commands.todo.list.jsonOption'))
    .action(async (options: { completed?: boolean; archived?: boolean; idOnly?: boolean; json?: boolean }) => {
      try {
        const paths = await getProjectPaths();
        await validateProjectInitialized(paths);

        if (options.json && options.idOnly) {
          throw new ColynError(t('commands.todo.list.jsonConflict'));
        }

        if (options.idOnly) {
          let todos: TodoItem[];
          if (options.archived) {
            const archivedFile = await readArchivedTodoFile(paths.configDir);
            todos = archivedFile.todos.map(item => ({ ...item, status: 'completed' as const }));
          } else if (options.completed) {
            const todoFile = await readTodoFile(paths.configDir);
            todos = todoFile.todos.filter(item => item.status === 'completed');
          } else {
            const todoFile = await readTodoFile(paths.configDir);
            todos = todoFile.todos.filter(item => item.status === 'pending');
          }
          for (const todo of todos) {
            process.stdout.write(`${todo.type}/${todo.name}\n`);
          }
          return;
        }

        if (options.json) {
          let todos: TodoItem[];
          if (options.archived) {
            const archivedFile = await readArchivedTodoFile(paths.configDir);
            todos = archivedFile.todos;
          } else if (options.completed) {
            const todoFile = await readTodoFile(paths.configDir);
            todos = todoFile.todos.filter(item => item.status === 'completed');
          } else {
            const todoFile = await readTodoFile(paths.configDir);
            todos = todoFile.todos.filter(item => item.status === 'pending');
          }
          console.log(JSON.stringify(todos, null, 2));
          return;
        }

        if (options.archived) {
          const archivedFile = await readArchivedTodoFile(paths.configDir);
          if (archivedFile.todos.length === 0) {
            outputInfo(t('commands.todo.list.empty'));
            return;
          }
          // ArchivedTodoItem extends TodoItem, display as TodoItem
          const todoItems: TodoItem[] = archivedFile.todos.map(item => ({ ...item, status: 'completed' as const }));
          output(formatTodoTable(todoItems));
        } else if (options.completed) {
          const todoFile = await readTodoFile(paths.configDir);
          const completed = todoFile.todos.filter(item => item.status === 'completed');
          if (completed.length === 0) {
            outputInfo(t('commands.todo.list.empty'));
            return;
          }
          output(formatTodoTable(completed));
        } else {
          await listPendingTodos(paths.configDir);
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

        const todoFile = await readTodoFile(paths.configDir);

        let resolvedTodoId: string;

        if (!todoId) {
          if (todoFile.todos.length === 0) {
            outputInfo(t('commands.todo.list.empty'));
            return;
          }

          const statusLabels = getStatusLabels();
          const choices = todoFile.todos.map(item => ({
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

        const index = todoFile.todos.findIndex(item => item.type === type && item.name === name);

        if (index === -1) {
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

        todoFile.todos.splice(index, 1);
        await saveTodoFile(paths.configDir, todoFile);

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

        const todoFile = await readTodoFile(paths.configDir);
        const completed = todoFile.todos.filter(t => t.status === 'completed');

        if (completed.length === 0) {
          outputInfo(t('commands.todo.archive.noCompleted'));
          return;
        }

        if (!options.yes) {
          const response = await prompt<{ confirm: boolean }>({
            type: 'confirm',
            name: 'confirm',
            message: t('commands.todo.archive.confirm', { count: completed.length }),
            initial: true,
            stdout: process.stderr
          });

          if (!response.confirm) {
            output(chalk.gray(t('commands.todo.archive.canceled')));
            return;
          }
        }

        const archivedFile = await readArchivedTodoFile(paths.configDir);
        const now = new Date().toISOString();

        const newArchived: ArchivedTodoItem[] = completed.map(item => ({
          ...item,
          archivedAt: now,
        }));

        archivedFile.todos.push(...newArchived);
        await saveArchivedTodoFile(paths.configDir, archivedFile);

        todoFile.todos = todoFile.todos.filter(t => t.status !== 'completed');
        await saveTodoFile(paths.configDir, todoFile);

        outputSuccess(t('commands.todo.archive.success', { count: completed.length }));
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

        const todoFile = await readTodoFile(paths.configDir);
        const item = findTodo(todoFile.todos, type, name);

        if (!item) {
          throw new ColynError(t('commands.todo.uncomplete.notFound', { todoId: resolvedTodoId }));
        }

        if (item.status !== 'completed') {
          throw new ColynError(t('commands.todo.uncomplete.notCompleted', { todoId: resolvedTodoId }));
        }

        item.status = 'pending';
        delete item.startedAt;
        delete item.branch;
        await saveTodoFile(paths.configDir, todoFile);

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

        const todoFile = await readTodoFile(paths.configDir);
        const pendingTodos = todoFile.todos.filter(item => item.status === 'pending');

        let resolvedTodoId: string;

        if (!todoId) {
          if (pendingTodos.length === 0) {
            outputInfo(t('commands.todo.complete.noPending'));
            return;
          }
          resolvedTodoId = await selectTodo(pendingTodos, {
            selectMessage: t('commands.todo.complete.selectTodo'),
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

        const item = findTodo(todoFile.todos, type, name);
        if (!item) {
          throw new ColynError(t('commands.todo.complete.notFound', { todoId: resolvedTodoId }));
        }

        if (item.status !== 'pending') {
          throw new ColynError(t('commands.todo.complete.notPending', { todoId: resolvedTodoId }));
        }

        item.status = 'completed';
        item.startedAt = new Date().toISOString();
        item.branch = `${type}/${name}`;
        await saveTodoFile(paths.configDir, todoFile);

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

        const todoFile = await readTodoFile(paths.configDir);
        const allTodos = todoFile.todos;

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
          });
        }

        let type: string;
        let name: string;
        try {
          ({ type, name } = parseTodoId(resolvedTodoId));
        } catch {
          throw new ColynError(t('commands.todo.add.invalidFormat'));
        }

        const item = findTodo(allTodos, type, name);
        if (!item) {
          throw new ColynError(t('commands.todo.edit.notFound', { todoId: resolvedTodoId }));
        }

        // 如果 todo 已完成，询问是否改回待办状态
        if (item.status === 'completed') {
          const response = await prompt<{ revert: boolean }>({
            type: 'confirm',
            name: 'revert',
            message: t('commands.todo.edit.isCompleted', { todoId: resolvedTodoId }),
            initial: false,
            stdout: process.stderr,
          });

          if (!response.revert) {
            output(chalk.gray(t('commands.todo.edit.revertCanceled')));
            process.exit(1);
          }

          item.status = 'pending';
          delete item.startedAt;
          delete item.branch;
        }

        // 获取新的 message
        let newMessage = message;
        if (!newMessage) {
          newMessage = await editWithEditor(item.message);
        }

        if (!newMessage || !newMessage.trim()) {
          throw new ColynError(t('commands.todo.edit.messageEmpty'));
        }

        item.message = newMessage.trim();
        await saveTodoFile(paths.configDir, todoFile);

        outputSuccess(t('commands.todo.edit.success', { todoId: resolvedTodoId }));
      } catch (error) {
        formatError(error);
        process.exit(1);
      }
    });
}
