import type { TodoItem } from '../types/index.js';
import type { TodoBackend, TodoFilter, AddTodoInput } from '../types/todo-backend.js';
import { runGh, ensureGhRepo } from './gh.js';
import { branchExistsAnywhere } from '../core/git.js';

const WONTFIX_LABEL = 'wontfix';

interface GhConfig {
  archivedLabel: string | null;
  typeLabels: Record<string, string>;
}

interface GhIssue {
  number: number;
  title: string;
  body: string;
  labels: Array<{ name: string }>;
}

export class GitHubIssuesBackend implements TodoBackend {
  readonly name = 'github';
  readonly displayName = 'GitHub Issues';
  readonly assignsName = true;

  constructor(private readonly config: GhConfig) {}

  /** GitHub label 列表 → colyn type（取首个命中映射或同名的 label）*/
  private labelsToType(labels: string[]): string {
    const reverse = new Map(
      Object.entries(this.config.typeLabels).map(([t, l]) => [l, t])
    );
    const managed = new Set<string>([WONTFIX_LABEL]);
    if (this.config.archivedLabel) managed.add(this.config.archivedLabel);
    for (const label of labels) {
      if (managed.has(label)) continue;
      const mapped = reverse.get(label);
      if (mapped) return mapped;
    }
    const first = labels.find((l) => !managed.has(l));
    return first ?? '';
  }

  private issueToTodo(issue: GhIssue, status: TodoItem['status']): TodoItem {
    const labelNames = issue.labels.map((l) => l.name);
    const message = issue.body ? `${issue.title}\n${issue.body}` : issue.title;
    return {
      type: this.labelsToType(labelNames),
      name: String(issue.number),
      message,
      status,
      createdAt: '',
    };
  }

  private fetchIssues(state: 'open' | 'closed'): GhIssue[] {
    ensureGhRepo();
    const out = runGh([
      'issue', 'list', '--state', state, '--limit', '200',
      '--json', 'number,title,body,labels',
    ]);
    return JSON.parse(out) as GhIssue[];
  }

  private hasLabel(issue: GhIssue, label: string): boolean {
    return issue.labels.some((l) => l.name === label);
  }

  async list(filter: TodoFilter): Promise<TodoItem[]> {
    if (filter === 'pending' || filter === 'in-progress') {
      const open = this.fetchIssues('open').filter(
        (i) => !this.hasLabel(i, WONTFIX_LABEL)
      );
      const result: TodoItem[] = [];
      for (const issue of open) {
        const type = this.labelsToType(issue.labels.map((l) => l.name));
        const branch = `${type}/${issue.number}`;
        const started = await branchExistsAnywhere(branch);
        const status: TodoItem['status'] = started ? 'in-progress' : 'pending';
        if (status === filter) result.push(this.issueToTodo(issue, status));
      }
      return result;
    }

    // done / archived
    const closed = this.fetchIssues('closed').filter(
      (i) => !this.hasLabel(i, WONTFIX_LABEL)
    );
    if (!this.config.archivedLabel) {
      // archivedLabel 未配置：所有 closed 都归为 archived，done 为空
      if (filter === 'archived') {
        return closed.map((i) => this.issueToTodo(i, 'done'));
      }
      return [];
    }
    const label = this.config.archivedLabel;
    const matched =
      filter === 'archived'
        ? closed.filter((i) => this.hasLabel(i, label))
        : closed.filter((i) => !this.hasLabel(i, label));
    return matched.map((i) => this.issueToTodo(i, 'done'));
  }

  async find(type: string, name: string): Promise<TodoItem | null> {
    ensureGhRepo();
    try {
      const out = runGh([
        'issue', 'view', name, '--json', 'number,title,body,labels,state',
      ]);
      const issue = JSON.parse(out) as GhIssue & { state: string };
      if (this.hasLabel(issue, WONTFIX_LABEL)) return null;
      const isClosed = issue.state.toLowerCase() === 'closed';
      const status: TodoItem['status'] = isClosed
        ? 'done'
        : (await branchExistsAnywhere(`${type}/${name}`))
          ? 'in-progress'
          : 'pending';
      return this.issueToTodo(issue, status);
    } catch {
      return null;
    }
  }

  // 写操作在 Task 3.3 实现
  async add(_input: AddTodoInput): Promise<TodoItem> {
    throw new Error('not implemented');
  }
  async markStarted(_t: string, _n: string, _b: string): Promise<void> {
    throw new Error('not implemented');
  }
  async markDone(_t: string, _n: string): Promise<void> {
    throw new Error('not implemented');
  }
  async reopen(_t: string, _n: string): Promise<void> {
    throw new Error('not implemented');
  }
  async edit(_t: string, _n: string, _m: string): Promise<void> {
    throw new Error('not implemented');
  }
  async remove(_t: string, _n: string): Promise<void> {
    throw new Error('not implemented');
  }
  async archive(): Promise<void> {
    throw new Error('not implemented');
  }
}
