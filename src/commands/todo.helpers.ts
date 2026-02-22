import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import type { TodoFile, ArchivedTodoFile, TodoItem } from '../types/index.js';

const TODO_FILE_NAME = 'todo.json';
const ARCHIVED_TODO_FILE_NAME = 'archived-todo.json';

/**
 * 读取 todo 文件
 */
export async function readTodoFile(configDir: string): Promise<TodoFile> {
  const filePath = path.join(configDir, TODO_FILE_NAME);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as TodoFile;
  } catch {
    return { todos: [] };
  }
}

/**
 * 保存 todo 文件
 */
export async function saveTodoFile(configDir: string, file: TodoFile): Promise<void> {
  const filePath = path.join(configDir, TODO_FILE_NAME);
  await fs.writeFile(filePath, JSON.stringify(file, null, 2) + '\n', 'utf-8');
}

/**
 * 读取归档 todo 文件
 */
export async function readArchivedTodoFile(configDir: string): Promise<ArchivedTodoFile> {
  const filePath = path.join(configDir, ARCHIVED_TODO_FILE_NAME);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as ArchivedTodoFile;
  } catch {
    return { todos: [] };
  }
}

/**
 * 保存归档 todo 文件
 */
export async function saveArchivedTodoFile(configDir: string, file: ArchivedTodoFile): Promise<void> {
  const filePath = path.join(configDir, ARCHIVED_TODO_FILE_NAME);
  await fs.writeFile(filePath, JSON.stringify(file, null, 2) + '\n', 'utf-8');
}

/**
 * 解析 Todo ID（格式：type/name）
 */
export function parseTodoId(todoId: string): { type: string; name: string } {
  const slashIndex = todoId.indexOf('/');
  if (slashIndex === -1) {
    throw new Error(`Invalid Todo ID format: "${todoId}"`);
  }
  const type = todoId.substring(0, slashIndex);
  const name = todoId.substring(slashIndex + 1);
  if (!type || !name) {
    throw new Error(`Invalid Todo ID format: "${todoId}"`);
  }
  return { type, name };
}

/**
 * 查找 Todo 条目
 */
export function findTodo(todos: TodoItem[], type: string, name: string): TodoItem | undefined {
  return todos.find(t => t.type === type && t.name === name);
}

/**
 * 格式化日期为可读字符串
 */
function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 使用编辑器交互式编辑 message，返回内容；用户取消返回 null
 */
export async function editMessageWithEditor(todoId: string): Promise<string | null> {
  const tmpFile = path.join(os.tmpdir(), `colyn-todo-${Date.now()}.md`);

  const template = [
    '',
    '',
    `# Todo: ${todoId}`,
    '# 请在上方输入任务描述，完成后保存退出（:wq）',
    '# 支持 Markdown 格式，以 "# " 开头的行为注释会被忽略',
  ].join('\n');

  await fs.writeFile(tmpFile, template, 'utf-8');

  const editor = process.env.VISUAL ?? process.env.EDITOR ?? 'vim';
  const result = spawnSync(editor, [tmpFile], { stdio: 'inherit' });

  let content: string;
  try {
    content = await fs.readFile(tmpFile, 'utf-8');
  } finally {
    await fs.unlink(tmpFile).catch(() => undefined);
  }

  if (result.error) {
    throw new Error(editor);
  }

  // 过滤注释行（以 "# " 开头），保留其余内容
  const message = content
    .split('\n')
    .filter(line => !line.startsWith('# '))
    .join('\n')
    .trim();

  return message || null;
}

/**
 * 复制文本到系统剪贴板，返回是否成功
 */
export function copyToClipboard(text: string): boolean {
  const platform = process.platform;
  let cmd: string;
  let args: string[];

  if (platform === 'darwin') {
    cmd = 'pbcopy';
    args = [];
  } else if (platform === 'linux') {
    cmd = 'xclip';
    args = ['-selection', 'clipboard'];
  } else if (platform === 'win32') {
    cmd = 'clip';
    args = [];
  } else {
    return false;
  }

  const result = spawnSync(cmd, args, { input: text, encoding: 'utf-8' });
  return result.status === 0;
}

/** 判断 Unicode 码点是否为宽字符（终端显示宽度 2） */
function isWideCodePoint(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0x303e) ||
    (code >= 0x3040 && code <= 0x33ff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x2a6df) ||
    (code >= 0x2a700 && code <= 0x2ceaf)
  );
}

/** 计算字符串在终端中的显示宽度 */
function strWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    w += isWideCodePoint(ch.codePointAt(0) ?? 0) ? 2 : 1;
  }
  return w;
}

/** 填充字符串到指定显示宽度 */
function padWidth(s: string, target: number): string {
  return s + ' '.repeat(Math.max(0, target - strWidth(s)));
}

/** 截断字符串到指定显示宽度，超出时末尾加省略号并补全剩余空格 */
function truncWidth(s: string, maxW: number): string {
  if (strWidth(s) <= maxW) return padWidth(s, maxW);
  let w = 0;
  let result = '';
  for (const ch of s) {
    const cw = isWideCodePoint(ch.codePointAt(0) ?? 0) ? 2 : 1;
    if (w + cw + 1 > maxW) break; // 保留 1 格放省略号
    result += ch;
    w += cw;
  }
  return padWidth(result + '…', maxW);
}

/**
 * 格式化 Todo 表格输出
 * - message 仅显示首行
 * - 其他列按内容自适应宽度，message 列填满终端剩余空间
 * - message 过长时自动截断并加省略号
 */
export function formatTodoTable(todos: TodoItem[], statusLabel: Record<string, string>): string {
  if (todos.length === 0) return '';

  const INDENT = 2;
  const GAP = 2;

  const rows = todos.map(item => ({
    type: item.type,
    name: item.name,
    message: item.message.split('\n')[0],
    status: statusLabel[item.status] ?? item.status,
    createdAt: formatDate(item.createdAt),
  }));

  const typeW = Math.max(strWidth('Type'), ...rows.map(r => strWidth(r.type)));
  const nameW = Math.max(strWidth('Name'), ...rows.map(r => strWidth(r.name)));
  const statusW = Math.max(strWidth('Status'), ...rows.map(r => strWidth(r.status)));
  const createdW = Math.max(strWidth('Created'), ...rows.map(r => strWidth(r.createdAt)));

  const termW = process.stdout.columns ?? process.stderr.columns ?? 80;
  // INDENT + typeW + GAP + nameW + GAP + msgW + GAP + statusW + GAP + createdW = termW
  const msgW = Math.max(strWidth('Message'), termW - INDENT - typeW - nameW - statusW - createdW - GAP * 4);

  const mkRow = (type: string, name: string, msg: string, status: string, created: string): string =>
    ' '.repeat(INDENT) +
    padWidth(type, typeW) + ' '.repeat(GAP) +
    padWidth(name, nameW) + ' '.repeat(GAP) +
    truncWidth(msg, msgW) + ' '.repeat(GAP) +
    padWidth(status, statusW) + ' '.repeat(GAP) +
    created;

  const sepRow =
    ' '.repeat(INDENT) +
    '-'.repeat(typeW) + '-'.repeat(GAP) +
    '-'.repeat(nameW) + '-'.repeat(GAP) +
    '-'.repeat(msgW) + '-'.repeat(GAP) +
    '-'.repeat(statusW) + '-'.repeat(GAP) +
    '-'.repeat(createdW);

  return [
    mkRow('Type', 'Name', 'Message', 'Status', 'Created'),
    sepRow,
    ...rows.map(r => mkRow(r.type, r.name, r.message, r.status, r.createdAt)),
  ].join('\n');
}
