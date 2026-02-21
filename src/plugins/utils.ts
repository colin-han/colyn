/**
 * 插件共享工具函数
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { type SpawnSyncReturns } from 'child_process';

/**
 * 将 execSync 错误中的 stdout/stderr 合并为字符串
 */
export function extractOutput(error: unknown): string {
  if (error && typeof error === 'object') {
    const err = error as SpawnSyncReturns<Buffer> & {
      stdout?: Buffer | string;
      stderr?: Buffer | string;
    };
    const stdout = err.stdout ? err.stdout.toString() : '';
    const stderr = err.stderr ? err.stderr.toString() : '';
    return [stdout, stderr].filter(Boolean).join('\n');
  }
  return String(error);
}

/**
 * 在 .gitignore 中添加规则
 * @param worktreePath   项目目录
 * @param rule           要添加的规则字符串（如 `.env.local`）
 * @param existsPatterns 若 .gitignore 中已含这些字符串之一则跳过
 * @param sectionComment 新增规则前的注释（不含 #）
 */
export async function addToGitignore(
  worktreePath: string,
  rule: string,
  existsPatterns: string[],
  sectionComment: string
): Promise<void> {
  const gitignorePath = path.join(worktreePath, '.gitignore');

  let content = '';
  try {
    content = await fs.readFile(gitignorePath, 'utf-8');
  } catch {
    // 文件不存在，将创建新的
  }

  // 如果已有相关规则，跳过
  if (existsPatterns.some((p) => content.includes(p))) return;

  const newContent = content.trim()
    ? `${content}\n\n# ${sectionComment}\n${rule}\n`
    : `# ${sectionComment}\n${rule}\n`;

  await fs.writeFile(gitignorePath, newContent, 'utf-8');
}

/**
 * 解析 Java .properties 文件
 * 格式：key=value（支持 # 注释，忽略空行）
 */
export function parseProperties(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      result[key] = value;
    }
  }
  return result;
}

/**
 * 将键值对序列化为 .properties 文件格式
 */
export function stringifyProperties(data: Record<string, string>): string {
  return (
    Object.entries(data)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n'
  );
}

/**
 * 读取 Spring Boot 本地运行时配置
 *
 * 优先级：
 * 1. src/main/resources/application-local.properties
 * 2. src/main/resources/application-local.yaml
 * 3. src/main/resources/application.properties（fallback）
 * 4. src/main/resources/application.yaml（fallback）
 *
 * 以上均不存在则返回 null。
 */
export async function readSpringRuntimeConfig(
  worktreePath: string
): Promise<Record<string, string> | null> {
  const resourcesDir = path.join(worktreePath, 'src', 'main', 'resources');

  const candidates = [
    { file: path.join(resourcesDir, 'application-local.properties'), type: 'properties' },
    { file: path.join(resourcesDir, 'application-local.yaml'), type: 'yaml' },
    { file: path.join(resourcesDir, 'application.properties'), type: 'properties' },
    { file: path.join(resourcesDir, 'application.yaml'), type: 'yaml' },
  ] as const;

  for (const candidate of candidates) {
    try {
      const content = await fs.readFile(candidate.file, 'utf-8');
      if (candidate.type === 'properties') {
        return parseProperties(content);
      } else {
        // 将 YAML 扁平化为 key=value（仅支持顶层单值键）
        const yaml = await import('js-yaml');
        const parsed = yaml.load(content) as Record<string, unknown> | null;
        if (parsed && typeof parsed === 'object') {
          return flattenYaml(parsed);
        }
      }
    } catch {
      // 文件不存在，尝试下一个
    }
  }
  return null;
}

/**
 * 将 YAML 对象扁平化为 dot-notation 键值对
 * 例如：{ server: { port: 8080 } } → { 'server.port': '8080' }
 */
function flattenYaml(
  obj: Record<string, unknown>,
  prefix = ''
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenYaml(value as Record<string, unknown>, fullKey));
    } else {
      result[fullKey] = String(value ?? '');
    }
  }
  return result;
}

/**
 * 写入 Spring Boot 本地运行时配置
 * 写入 src/main/resources/application-local.properties
 */
export async function writeSpringRuntimeConfig(
  worktreePath: string,
  config: Record<string, string>
): Promise<void> {
  const resourcesDir = path.join(worktreePath, 'src', 'main', 'resources');
  await fs.mkdir(resourcesDir, { recursive: true });

  const localPropertiesPath = path.join(resourcesDir, 'application-local.properties');

  let existingContent = '';
  try {
    existingContent = await fs.readFile(localPropertiesPath, 'utf-8');
  } catch {
    // 文件不存在，写入全新内容
    await fs.writeFile(localPropertiesPath, stringifyProperties(config), 'utf-8');
    return;
  }

  // 保留注释，更新已有 key，追加新 key
  const lines = existingContent.split('\n');
  const result: string[] = [];
  const updatedKeys = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) {
      result.push(line);
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      if (config[key] !== undefined) {
        result.push(`${key}=${config[key]}`);
        updatedKeys.add(key);
      } else {
        result.push(line);
      }
    } else {
      result.push(line);
    }
  }

  for (const [key, value] of Object.entries(config)) {
    if (!updatedKeys.has(key)) {
      result.push(`${key}=${value}`);
    }
  }

  await fs.writeFile(localPropertiesPath, result.join('\n') + '\n', 'utf-8');
}
