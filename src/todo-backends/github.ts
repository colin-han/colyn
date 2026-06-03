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

  /** colyn type → GitHub label（有映射用映射值，否则原样返回 type）*/
  private typeToLabel(type: string): string {
    return this.config.typeLabels[type] ?? type;
  }

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

  /** 拆分 message 为 title（首行）和 body（其余） */
  private splitMessage(message: string): { title: string; body: string } {
    const idx = message.indexOf('\n');
    if (idx === -1) return { title: message, body: '' };
    return { title: message.slice(0, idx), body: message.slice(idx + 1) };
  }

  async add(input: AddTodoInput): Promise<TodoItem> {
    ensureGhRepo();
    const { title, body } = this.splitMessage(input.message);
    const out = runGh([
      'issue', 'create', '--title', title, '--body', body,
      '--label', this.typeToLabel(input.type),
    ]);
    const number = out.split('/').pop()?.trim() ?? '';
    return {
      type: input.type,
      name: number,
      message: input.message,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
  }

  async markStarted(_type: string, _name: string, _branch: string): Promise<void> {
    // in-progress 靠分支推断，IMS 侧无需操作
  }

  async markDone(_type: string, name: string): Promise<void> {
    ensureGhRepo();
    runGh(['issue', 'close', name]);
  }

  async reopen(_type: string, name: string): Promise<void> {
    ensureGhRepo();
    runGh(['issue', 'reopen', name]);
  }

  async edit(_type: string, name: string, message: string): Promise<void> {
    ensureGhRepo();
    const { title, body } = this.splitMessage(message);
    runGh(['issue', 'edit', name, '--title', title, '--body', body]);
  }

  async remove(_type: string, name: string): Promise<void> {
    ensureGhRepo();
    runGh(['issue', 'edit', name, '--add-label', WONTFIX_LABEL]);
    runGh(['issue', 'close', name]);
  }

  async archive(): Promise<void> {
    const label = this.config.archivedLabel;
    if (!label) return;
    const closed = this.fetchIssues('closed')
      .filter((i) => !this.hasLabel(i, WONTFIX_LABEL) && !this.hasLabel(i, label));
    for (const issue of closed) {
      runGh(['issue', 'edit', String(issue.number), '--add-label', label]);
    }
  }
}
