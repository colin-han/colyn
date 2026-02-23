import * as fs from 'fs/promises';
import { openSync, closeSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import type { StdioOptions } from 'child_process';
import Enquirer from 'enquirer';
import chalk from 'chalk';
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

  // shell wrapper 会用 $(...) 捕获 stdout，导致 stdout 变成管道而非 TTY。
  // 直接打开 /dev/tty 确保编辑器始终连接到真实终端。
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

  const result = spawnSync(editor, [tmpFile], { stdio });
  if (ttyFd !== undefined) closeSync(ttyFd);

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

/** 截断字符串到指定显示宽度，超出时末尾加省略号（不补空格） */
function truncStr(s: string, maxW: number): string {
  if (strWidth(s) <= maxW) return s;
  let w = 0;
  let result = '';
  for (const ch of s) {
    const cw = isWideCodePoint(ch.codePointAt(0) ?? 0) ? 2 : 1;
    if (w + cw + 1 > maxW) break;
    result += ch;
    w += cw;
  }
  return result + '…';
}

/** 按显示宽度软换行，返回每一行（不包含换行符） */
function wrapByWidth(s: string, maxW: number): string[] {
  if (maxW <= 0) return [''];
  if (s.length === 0) return [''];

  const lines: string[] = [];
  let current = '';
  let width = 0;

  for (const ch of s) {
    const chWidth = isWideCodePoint(ch.codePointAt(0) ?? 0) ? 2 : 1;

    if (width > 0 && width + chWidth > maxW) {
      lines.push(current);
      current = ch;
      width = chWidth;
      continue;
    }

    current += ch;
    width += chWidth;
  }

  if (current.length > 0) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [''];
}

// enquirer Select 类的构造函数类型（enquirer 未导出内部类型）
type SelectCtor = new (options: Record<string, unknown>) => {
  run(): Promise<string>;
  choices: Array<{ name?: string; message?: string }>;
  index: number;
  footer(): string | Promise<string>;
};

/**
 * Todo 交互式选择参数
 */
export interface TodoSelectOptions {
  selectMessage: string;
  showStatus?: boolean;
  statusLabels?: Record<string, string>;
  previewLineCount?: number;
  initial?: number;
}

/**
 * 带预览区域的通用选择项
 */
export interface PreviewSelectItem {
  value: string;
  label: string;
  labelDisplay?: string;
  summary: string;
  preview?: string;
}

/**
 * 带预览区域的通用选择参数
 */
export interface PreviewSelectOptions {
  selectMessage: string;
  previewLineCount?: number;
  initial?: number;
}

/**
 * 生成 Todo ID 双列标签：
 * - type 列固定宽度（灰色）
 * - name 列突出显示
 */
export function formatTodoIdLabel(
  type: string,
  name: string,
  typeWidth: number,
): { plain: string; display: string } {
  const paddedType = padWidth(type, typeWidth);
  const gap = '  ';
  return {
    plain: `${paddedType}${gap}${name}`,
    display: `${chalk.gray(paddedType)}${gap}${chalk.bold(name)}`,
  };
}

/**
 * 带预览区域的通用交互式选择器
 * - 左侧显示 label，右侧显示 summary 首行并按终端宽度截断
 * - 下方固定预留 previewLineCount 行显示 preview
 */
export async function selectWithPreview(
  items: PreviewSelectItem[],
  options: PreviewSelectOptions,
): Promise<string> {
  if (items.length === 0) {
    throw new Error('No selectable items provided');
  }

  const { selectMessage, previewLineCount = 4, initial = 0 } = options;
  const termW = process.stderr.columns ?? process.stdout.columns ?? 80;
  const previewMap = new Map<string, string>(items.map(item => [item.value, item.preview ?? '']));

  const maxLabelW = Math.max(...items.map(item => strWidth(item.label)));
  // enquirer select 左侧渲染"❯ "前缀加内边距，保守估计占用 6 列
  const msgAvail = Math.max(1, termW - maxLabelW - 2 - 6);
  const previewWidth = Math.max(1, termW - 2);

  const choices = items.map(item => ({
    name: item.value,
    message: `${item.labelDisplay ?? item.label}${' '.repeat(Math.max(0, maxLabelW - strWidth(item.label)))}  ${chalk.gray(truncStr(item.summary, msgAvail))}`,
  }));

  const EnquirerSelect = (Enquirer as unknown as { Select: SelectCtor }).Select;

  class PreviewSelect extends EnquirerSelect {
    async footer(): Promise<string> {
      if (this.index >= this.choices.length) {
        return '\n' + Array.from({ length: previewLineCount }, () => '  ').join('\n');
      }
      const choice = this.choices[this.index];
      const msg = previewMap.get(choice.name ?? '') ?? '';
      const displayLines = msg
        ? msg.split('\n').flatMap(line => wrapByWidth(line, previewWidth)).slice(0, previewLineCount)
        : [];

      while (displayLines.length < previewLineCount) {
        displayLines.push('');
      }

      return '\n' + displayLines
        .map(line => `  ${chalk.gray(padWidth(line, previewWidth))}`)
        .join('\n');
    }
  }

  const select = new PreviewSelect({
    name: 'value',
    message: selectMessage,
    choices,
    initial,
    stdout: process.stderr,
  });

  return select.run();
}

/**
 * 交互式选择任务
 * - 每行仅显示 message 首行，按终端宽度截断
 * - 选中项下方显示 message 前 4 行预览
 */
export async function selectTodo(todos: TodoItem[], options: TodoSelectOptions): Promise<string> {
  const {
    selectMessage,
    showStatus = false,
    statusLabels = {},
    previewLineCount = 4,
    initial = 0,
  } = options;
  const maxTypeW = Math.max(...todos.map(item => strWidth(item.type)));

  const items: PreviewSelectItem[] = todos.map(item => {
    const id = `${item.type}/${item.name}`;
    const firstLine = item.message.split('\n')[0];
    const statusPrefix = showStatus ? `${statusLabels[item.status] ?? item.status}: ` : '';
    const todoLabel = formatTodoIdLabel(item.type, item.name, maxTypeW);
    return {
      value: id,
      label: todoLabel.plain,
      labelDisplay: todoLabel.display,
      summary: `${statusPrefix}${firstLine}`,
      preview: item.message,
    };
  });

  return selectWithPreview(items, {
    selectMessage,
    previewLineCount,
    initial,
  });
}

/**
 * 兼容旧调用：仅选择 pending 任务
 */
export async function selectPendingTodo(
  pendingTodos: TodoItem[],
  selectMessage: string,
): Promise<string> {
  return selectTodo(pendingTodos, { selectMessage });
}

/**
 * 格式化 Todo 表格输出
 * - message 仅显示首行
 * - 其他列按内容自适应宽度，message 列填满终端剩余空间
 * - message 过长时自动截断并加省略号
 */
export function formatTodoTable(todos: TodoItem[]): string {
  if (todos.length === 0) return '';

  const INDENT = 2;
  const GAP = 2;

  const rows = todos.map(item => ({
    type: item.type,
    name: item.name,
    message: item.message.split('\n')[0],
    createdAt: formatDate(item.createdAt),
  }));

  const typeW = Math.max(strWidth('Type'), ...rows.map(r => strWidth(r.type)));
  const nameW = Math.max(strWidth('Name'), ...rows.map(r => strWidth(r.name)));
  const createdW = Math.max(strWidth('Created'), ...rows.map(r => strWidth(r.createdAt)));

  const termW = process.stdout.columns ?? process.stderr.columns ?? 80;
  // INDENT + typeW + GAP + nameW + GAP + msgW + GAP + createdW = termW
  const msgW = Math.max(strWidth('Message'), termW - INDENT - typeW - nameW - createdW - GAP * 3);

  const mkRow = (type: string, name: string, msg: string, created: string): string =>
    ' '.repeat(INDENT) +
    padWidth(type, typeW) + ' '.repeat(GAP) +
    padWidth(name, nameW) + ' '.repeat(GAP) +
    truncWidth(msg, msgW) + ' '.repeat(GAP) +
    created;

  const sepRow =
    ' '.repeat(INDENT) +
    '-'.repeat(typeW) + '-'.repeat(GAP) +
    '-'.repeat(nameW) + '-'.repeat(GAP) +
    '-'.repeat(msgW) + '-'.repeat(GAP) +
    '-'.repeat(createdW);

  return [
    mkRow('Type', 'Name', 'Message', 'Created'),
    sepRow,
    ...rows.map(r => mkRow(r.type, r.name, r.message, r.createdAt)),
  ].join('\n');
}
