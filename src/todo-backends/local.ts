import type { TodoItem } from '../types/index.js';
import type { TodoBackend, TodoFilter, AddTodoInput } from '../types/todo-backend.js';
import {
  readTodoFile, saveTodoFile, readArchivedTodoFile,
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

  // 写操作在 Task 2.3 实现
  async add(_input: AddTodoInput): Promise<TodoItem> { throw new Error('not implemented'); }
  async markStarted(_t: string, _n: string, _b: string): Promise<void> { throw new Error('not implemented'); }
  async markDone(_t: string, _n: string): Promise<void> { throw new Error('not implemented'); }
  async reopen(_t: string, _n: string): Promise<void> { throw new Error('not implemented'); }
  async edit(_t: string, _n: string, _m: string): Promise<void> { throw new Error('not implemented'); }
  async remove(_t: string, _n: string): Promise<void> { throw new Error('not implemented'); }
  async archive(): Promise<void> { throw new Error('not implemented'); }
}
