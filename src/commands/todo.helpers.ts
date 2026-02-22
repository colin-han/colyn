import * as fs from 'fs/promises';
import * as path from 'path';
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
 * 格式化 Todo 表格输出
 */
export function formatTodoTable(todos: TodoItem[], statusLabel: Record<string, string>): string {
  if (todos.length === 0) {
    return '';
  }

  const rows = todos.map(t => ({
    type: t.type,
    name: t.name,
    message: t.message,
    status: statusLabel[t.status] ?? t.status,
    createdAt: formatDate(t.createdAt),
  }));

  const colWidths = {
    type: Math.max(4, ...rows.map(r => r.type.length)),
    name: Math.max(4, ...rows.map(r => r.name.length)),
    message: Math.max(4, ...rows.map(r => r.message.length)),
    status: Math.max(4, ...rows.map(r => r.status.length)),
    createdAt: Math.max(8, ...rows.map(r => r.createdAt.length)),
  };

  const pad = (s: string, w: number) => s.padEnd(w);
  const separator = `${'-'.repeat(colWidths.type + 2)}-${'-'.repeat(colWidths.name + 2)}-${'-'.repeat(colWidths.message + 2)}-${'-'.repeat(colWidths.status + 2)}-${'-'.repeat(colWidths.createdAt + 2)}`;

  const header = `  ${pad('Type', colWidths.type)}  ${pad('Name', colWidths.name)}  ${pad('Message', colWidths.message)}  ${pad('Status', colWidths.status)}  ${pad('Created', colWidths.createdAt)}`;

  const lines = [header, `  ${separator}`];
  for (const row of rows) {
    lines.push(`  ${pad(row.type, colWidths.type)}  ${pad(row.name, colWidths.name)}  ${pad(row.message, colWidths.message)}  ${pad(row.status, colWidths.status)}  ${pad(row.createdAt, colWidths.createdAt)}`);
  }

  return lines.join('\n');
}
