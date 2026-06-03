import type { TodoItem, ArchivedTodoItem } from '../types/index.js';
import type { TodoBackend, TodoFilter, AddTodoInput, TodoBackendProvider, TodoBackendDetectContext } from '../types/todo-backend.js';
import type { ProjectPaths } from '../core/paths.js';
import type { TodoConfig } from '../core/config-schema.js';
import {
  readTodoFile, saveTodoFile, readArchivedTodoFile, saveArchivedTodoFile,
} from '../commands/todo.helpers.js';
import { localBranchExists } from '../core/git.js';

/** 旧版 status 值，仅用于读时归一化 */
type RawStatus = TodoItem['status'] | 'completed';

export class LocalFileBackend implements TodoBackend {
  readonly name = 'local';
  readonly displayName = 'Local (todo.json)';
  readonly assignsName = false;

  constructor(
    private readonly configDir: string,
    private readonly autoArchive: boolean,
  ) {}

  /**
   * 读取 active todo 文件，把旧 'completed' 归一化为 in-progress/done，
   * 若发生归一化则一次性写回。
   */
  private async loadActive(): Promise<TodoItem[]> {
    const file = await readTodoFile(this.configDir);
    let changed = false;
    for (const item of file.todos) {
      const status = item.status as RawStatus;
      if (status === 'completed') {
        const hasBranch = !!item.branch && (await localBranchExists(item.branch));
        item.status = hasBranch ? 'in-progress' : 'done';
        changed = true;
      }
    }
    if (changed) {
      await saveTodoFile(this.configDir, file);
    }
    return file.todos;
  }

  async list(filter: TodoFilter): Promise<TodoItem[]> {
    if (filter === 'archived') {
      const archived = await readArchivedTodoFile(this.configDir);
      return archived.todos;
    }
    const todos = await this.loadActive();
    return todos.filter((t) => t.status === filter);
  }

  async find(type: string, name: string): Promise<TodoItem | null> {
    const todos = await this.loadActive();
    const hit = todos.find((t) => t.type === type && t.name === name);
    if (hit) return hit;
    const archived = await readArchivedTodoFile(this.configDir);
    return archived.todos.find((t) => t.type === type && t.name === name) ?? null;
  }

  async add(input: AddTodoInput): Promise<TodoItem> {
    const file = await readTodoFile(this.configDir);
    const item: TodoItem = {
      type: input.type,
      name: input.name ?? '',
      message: input.message,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    file.todos.push(item);
    await saveTodoFile(this.configDir, file);
    return item;
  }

  async markStarted(type: string, name: string, branch: string): Promise<void> {
    const file = await readTodoFile(this.configDir);
    const item = file.todos.find((t) => t.type === type && t.name === name);
    if (!item) return;
    item.status = 'in-progress';
    item.startedAt = new Date().toISOString();
    item.branch = branch;
    await saveTodoFile(this.configDir, file);
  }

  async markDone(type: string, name: string): Promise<void> {
    const file = await readTodoFile(this.configDir);
    const item = file.todos.find((t) => t.type === type && t.name === name);
    if (!item) return;
    item.status = 'done';
    await saveTodoFile(this.configDir, file);
    if (this.autoArchive) {
      await this.archive();
    }
  }

  async reopen(type: string, name: string): Promise<void> {
    const file = await readTodoFile(this.configDir);
    const active = file.todos.find((t) => t.type === type && t.name === name);
    if (active) {
      active.status = 'in-progress';
      await saveTodoFile(this.configDir, file);
      return;
    }
    const archived = await readArchivedTodoFile(this.configDir);
    const idx = archived.todos.findIndex((t) => t.type === type && t.name === name);
    if (idx === -1) return;
    const [removed] = archived.todos.splice(idx, 1);
    await saveArchivedTodoFile(this.configDir, archived);
    const itemToRestore: TodoItem = { ...removed, status: 'in-progress' };
    delete (itemToRestore as Partial<ArchivedTodoItem>).archivedAt;
    file.todos.push(itemToRestore);
    await saveTodoFile(this.configDir, file);
  }

  async edit(type: string, name: string, message: string): Promise<void> {
    const file = await readTodoFile(this.configDir);
    const item = file.todos.find((t) => t.type === type && t.name === name);
    if (item) {
      item.message = message;
      await saveTodoFile(this.configDir, file);
      return;
    }
    const archived = await readArchivedTodoFile(this.configDir);
    const aItem = archived.todos.find((t) => t.type === type && t.name === name);
    if (aItem) {
      aItem.message = message;
      await saveArchivedTodoFile(this.configDir, archived);
    }
  }

  async remove(type: string, name: string): Promise<void> {
    const file = await readTodoFile(this.configDir);
    const idx = file.todos.findIndex((t) => t.type === type && t.name === name);
    if (idx !== -1) {
      file.todos.splice(idx, 1);
      await saveTodoFile(this.configDir, file);
      return;
    }
    const archived = await readArchivedTodoFile(this.configDir);
    const aIdx = archived.todos.findIndex((t) => t.type === type && t.name === name);
    if (aIdx !== -1) {
      archived.todos.splice(aIdx, 1);
      await saveArchivedTodoFile(this.configDir, archived);
    }
  }

  async archive(): Promise<void> {
    const file = await readTodoFile(this.configDir);
    const done = file.todos.filter((t) => t.status === 'done');
    if (done.length === 0) return;
    const archived = await readArchivedTodoFile(this.configDir);
    const now = new Date().toISOString();
    for (const item of done) {
      archived.todos.push({ ...item, archivedAt: now });
    }
    file.todos = file.todos.filter((t) => t.status !== 'done');
    await saveArchivedTodoFile(this.configDir, archived);
    await saveTodoFile(this.configDir, file);
  }
}

export const localProvider: TodoBackendProvider = {
  name: 'local',
  displayName: 'Local (todo.json)',
  async detect(_ctx: TodoBackendDetectContext): Promise<boolean> {
    return true; // 本地 backend 永远可用
  },
  async setup(_ctx: TodoBackendDetectContext): Promise<void> {
    // 无前置依赖，no-op
  },
  create(paths: ProjectPaths, config: TodoConfig): TodoBackend {
    return new LocalFileBackend(paths.configDir, config.autoArchive);
  },
};
