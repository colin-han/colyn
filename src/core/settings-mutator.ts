/**
 * settings-mutator.ts
 *
 * 基于 JSON5 的嵌套 key 读写模块
 * 支持 verbose 及 commands.* 等新配置项
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import JSON5 from 'json5';
import { z } from 'zod';
import { SettingsSchema } from './config-schema.js';

/**
 * 支持的配置 key（点分路径，映射到 settings.json 中的嵌套字段）
 *
 * 类型说明：
 * - 'boolean': 接受 true/false/yes/no/1/0/on/off
 * - 'string':  任意字符串
 * - 'lang':    枚举类型，仅接受 'en' | 'zh-CN'
 */
export const SETTINGS_KEYS = {
  // 全局
  lang: 'lang',
  verbose: 'boolean',

  // 系统命令
  'systemCommands.npm': 'string',
  'systemCommands.claude': 'string',

  // 命令行为覆盖
  'commands.merge.build': 'boolean',
  'commands.merge.rebase': 'boolean',
  'commands.merge.update': 'boolean',
  'commands.merge.fetch': 'boolean',
  'commands.merge.all': 'boolean',
  'commands.update.rebase': 'boolean',
  'commands.update.fetch': 'boolean',
  'commands.update.all': 'boolean',
  'commands.release.update': 'boolean',
  'commands.release.build': 'boolean',
  'commands.release.tag': 'boolean',
  'commands.release.versionUpdate': 'boolean',
  'commands.checkout.fetch': 'boolean',

  // Todo backend
  'todo.backend': 'string',
  'todo.autoArchive': 'boolean',
  'todo.github.archivedLabel': 'string',
} as const;

export type SettingsKey = keyof typeof SETTINGS_KEYS;

export function isSettingsKey(key: string): key is SettingsKey {
  return key in SETTINGS_KEYS;
}

/**
 * 布尔值解析（宽容接受多种表示）
 */
const TRUE_TOKENS = new Set(['true', 'yes', '1', 'on']);
const FALSE_TOKENS = new Set(['false', 'no', '0', 'off']);

export function parseBoolean(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  if (TRUE_TOKENS.has(v)) return true;
  if (FALSE_TOKENS.has(v)) return false;
  throw new Error(`无法解析布尔值: "${raw}"（接受 true/false/yes/no/1/0/on/off）`);
}

// ---------------------------------------------------------------------------
// File I/O helpers
// ---------------------------------------------------------------------------

async function readRawSettings(filePath: string): Promise<Record<string, unknown>> {
  if (!filePath.endsWith('.json')) {
    throw new Error(`暂不支持非 JSON 配置文件的写入：${filePath}`);
  }
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON5.parse(content) as Record<string, unknown>;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return { version: 4 };
    }
    throw err;
  }
}

async function writeRawSettings(
  filePath: string,
  settings: Record<string, unknown>
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}

function setNestedValue(
  obj: Record<string, unknown>,
  dotted: string,
  value: unknown
): void {
  const parts = dotted.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (cur[part] === undefined || cur[part] === null || typeof cur[part] !== 'object') {
      cur[part] = {};
    }
    cur = cur[part] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

export function getNestedValue(obj: Record<string, unknown>, dotted: string): unknown {
  const parts = dotted.split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function unsetNestedValue(obj: Record<string, unknown>, dotted: string): boolean {
  const parts = dotted.split('.');
  let cur: unknown = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return false;
    cur = (cur as Record<string, unknown>)[parts[i]];
  }
  if (cur === null || cur === undefined || typeof cur !== 'object') return false;
  const map = cur as Record<string, unknown>;
  const lastKey = parts[parts.length - 1];
  if (!(lastKey in map)) return false;
  delete map[lastKey];
  return true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getSettingsValueAtPath(
  filePath: string,
  key: SettingsKey
): Promise<unknown> {
  const raw = await readRawSettings(filePath);
  return getNestedValue(raw, key);
}

/**
 * lang 允许的值
 */
const VALID_LANGS = ['en', 'zh-CN'] as const;

export async function setSettingsValueAtPath(
  filePath: string,
  key: SettingsKey,
  rawValue: string
): Promise<void> {
  const expectedType = SETTINGS_KEYS[key];
  let value: unknown;
  if (expectedType === 'boolean') {
    value = parseBoolean(rawValue);
  } else if (expectedType === 'string') {
    value = rawValue;
  } else if (expectedType === 'lang') {
    if (!(VALID_LANGS as readonly string[]).includes(rawValue)) {
      throw new Error(`无效的语言: "${rawValue}"（接受 ${VALID_LANGS.join(', ')}）`);
    }
    value = rawValue;
  } else {
    throw new Error(`未知类型: ${expectedType}`);
  }

  const raw = await readRawSettings(filePath);
  if (raw.version === undefined) raw.version = 4;
  setNestedValue(raw, key, value);

  // 用 Zod 验证整个 settings 仍然有效
  try {
    SettingsSchema.parse(raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const msgs = err.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
      throw new Error(`配置校验失败:\n${msgs}`);
    }
    throw err;
  }

  await writeRawSettings(filePath, raw);
}

export async function unsetSettingsValueAtPath(
  filePath: string,
  key: SettingsKey
): Promise<boolean> {
  const raw = await readRawSettings(filePath);
  const removed = unsetNestedValue(raw, key);
  if (!removed) return false;

  // 清理空对象：例如 commands.merge 删完了，把 commands.merge 也删掉
  const parts = key.split('.');
  for (let i = parts.length - 1; i > 0; i--) {
    const parentPath = parts.slice(0, i).join('.');
    const parent = getNestedValue(raw, parentPath);
    if (parent && typeof parent === 'object' && Object.keys(parent).length === 0) {
      unsetNestedValue(raw, parentPath);
    } else {
      break;
    }
  }

  await writeRawSettings(filePath, raw);
  return true;
}
