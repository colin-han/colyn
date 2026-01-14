import * as fs from 'fs/promises';
import dotenv from 'dotenv';

/**
 * 读取环境变量文件
 */
export async function readEnvFile(filePath: string): Promise<Record<string, string>> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = dotenv.parse(content);
    return parsed;
  } catch (error) {
    // 文件不存在，返回空对象
    return {};
  }
}

/**
 * 写入环境变量文件
 */
export async function writeEnvFile(
  filePath: string,
  env: Record<string, string>
): Promise<void> {
  const lines = Object.entries(env).map(([key, value]) => {
    // 如果值包含空格或特殊字符，需要加引号
    const needsQuotes = /\s|[#"']/.test(value);
    return `${key}=${needsQuotes ? `"${value}"` : value}`;
  });

  await fs.writeFile(filePath, lines.join('\n') + '\n', 'utf-8');
}

/**
 * 更新环境变量文件（保留注释）
 */
export async function updateEnvFilePreserveComments(
  filePath: string,
  updates: Record<string, string>
): Promise<void> {
  let content = '';

  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch {
    // 文件不存在，创建新的
    await writeEnvFile(filePath, updates);
    return;
  }

  const lines = content.split('\n');
  const result: string[] = [];
  const updatedKeys = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();

    // 保留注释和空行
    if (trimmed.startsWith('#') || trimmed === '') {
      result.push(line);
      continue;
    }

    // 解析 key=value
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      if (updates[key] !== undefined) {
        result.push(`${key}=${updates[key]}`);
        updatedKeys.add(key);
      } else {
        result.push(line);
      }
    } else {
      result.push(line);
    }
  }

  // 添加新的环境变量
  for (const [key, value] of Object.entries(updates)) {
    if (!updatedKeys.has(key)) {
      result.push(`${key}=${value}`);
    }
  }

  await fs.writeFile(filePath, result.join('\n') + '\n', 'utf-8');
}
