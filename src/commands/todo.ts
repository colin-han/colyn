import type { Command } from 'commander';
import Enquirer from 'enquirer';
const { prompt } = Enquirer;
import chalk from 'chalk';
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
  formatTodoTable
} from './todo.helpers.js';
import { checkoutCommand } from './checkout.js';

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
 * 注册 todo 命令
 */
export function register(program: Command): void {
  const todo = program
    .command('todo')
    .description(t('commands.todo.description'));

  // todo add <todoId> <message>
  todo
    .command('add <todoId> <message>')
    .description(t('commands.todo.add.description'))
    .action(async (todoId: string, message: string) => {
      try {
        const paths = await getProjectPaths();
        await validateProjectInitialized(paths);

        let type: string;
        let name: string;
        try {
          ({ type, name } = parseTodoId(todoId));
        } catch {
          throw new ColynError(t('commands.todo.add.invalidFormat'));
        }

        const todoFile = await readTodoFile(paths.configDir);

        const existing = findTodo(todoFile.todos, type, name);
        if (existing) {
          throw new ColynError(t('commands.todo.add.alreadyExists', { todoId }));
        }

        const newTodo: TodoItem = {
          type,
          name,
          message,
          status: 'pending',
          createdAt: new Date().toISOString(),
        };

        todoFile.todos.push(newTodo);
        await saveTodoFile(paths.configDir, todoFile);

        outputSuccess(t('commands.todo.add.success', { todoId, message }));
      } catch (error) {
        formatError(error);
        process.exit(1);
      }
    });

  // todo start <todoId>
  todo
    .command('start <todoId>')
    .description(t('commands.todo.start.description'))
    .action(async (todoId: string) => {
      try {
        const paths = await getProjectPaths();
        await validateProjectInitialized(paths);

        let type: string;
        let name: string;
        try {
          ({ type, name } = parseTodoId(todoId));
        } catch {
          throw new ColynError(t('commands.todo.add.invalidFormat'));
        }

        const todoFile = await readTodoFile(paths.configDir);
        const item = findTodo(todoFile.todos, type, name);

        if (!item) {
          throw new ColynError(t('commands.todo.start.notFound', { todoId }));
        }

        if (item.status !== 'pending') {
          throw new ColynError(t('commands.todo.start.notPending', { todoId }));
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

        outputSuccess(t('commands.todo.start.success', { todoId }));
      } catch (error) {
        formatError(error);
        process.exit(1);
      }
    });

  // todo list [--completed] [--archived]
  todo
    .command('list')
    .description(t('commands.todo.list.description'))
    .option('--completed', t('commands.todo.list.completedOption'))
    .option('--archived', t('commands.todo.list.archivedOption'))
    .action(async (options: { completed?: boolean; archived?: boolean }) => {
      try {
        const paths = await getProjectPaths();
        await validateProjectInitialized(paths);

        const statusLabels = getStatusLabels();

        if (options.archived) {
          const archivedFile = await readArchivedTodoFile(paths.configDir);
          if (archivedFile.todos.length === 0) {
            outputInfo(t('commands.todo.list.empty'));
            return;
          }
          // ArchivedTodoItem extends TodoItem, display as TodoItem
          const todoItems: TodoItem[] = archivedFile.todos.map(t => ({ ...t, status: 'completed' as const }));
          output(formatTodoTable(todoItems, { ...statusLabels, completed: statusLabels.archived }));
        } else if (options.completed) {
          const todoFile = await readTodoFile(paths.configDir);
          const completed = todoFile.todos.filter(t => t.status === 'completed');
          if (completed.length === 0) {
            outputInfo(t('commands.todo.list.empty'));
            return;
          }
          output(formatTodoTable(completed, statusLabels));
        } else {
          const todoFile = await readTodoFile(paths.configDir);
          const pending = todoFile.todos.filter(t => t.status === 'pending');
          if (pending.length === 0) {
            outputInfo(t('commands.todo.list.empty'));
            return;
          }
          output(formatTodoTable(pending, statusLabels));
        }
      } catch (error) {
        formatError(error);
        process.exit(1);
      }
    });

  // todo remove <todoId> [-y]
  todo
    .command('remove <todoId>')
    .description(t('commands.todo.remove.description'))
    .option('-y, --yes', t('commands.todo.remove.yesOption'))
    .action(async (todoId: string, options: { yes?: boolean }) => {
      try {
        const paths = await getProjectPaths();
        await validateProjectInitialized(paths);

        let type: string;
        let name: string;
        try {
          ({ type, name } = parseTodoId(todoId));
        } catch {
          throw new ColynError(t('commands.todo.add.invalidFormat'));
        }

        const todoFile = await readTodoFile(paths.configDir);
        const index = todoFile.todos.findIndex(t => t.type === type && t.name === name);

        if (index === -1) {
          throw new ColynError(t('commands.todo.remove.notFound', { todoId }));
        }

        if (!options.yes) {
          const response = await prompt<{ confirm: boolean }>({
            type: 'confirm',
            name: 'confirm',
            message: t('commands.todo.remove.confirm', { todoId }),
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

        outputSuccess(t('commands.todo.remove.success', { todoId }));
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
}
