import type { ProjectPaths } from '../core/paths.js';
import type { TodoBackend, TodoBackendProvider, TodoBackendDetectContext } from '../types/todo-backend.js';
import { ColynError } from '../types/index.js';
import { t } from '../i18n/index.js';
import { getTodoConfig } from '../core/config.js';
import { localProvider } from './local.js';

/** 注册顺序即选择列表展示顺序 */
const PROVIDERS: TodoBackendProvider[] = [localProvider];

export function getProvider(name: string): TodoBackendProvider | undefined {
  return PROVIDERS.find((p) => p.name === name);
}

export function getAllProviders(): TodoBackendProvider[] {
  return PROVIDERS;
}

/** 返回当前项目可用的 provider 列表（detect=true）*/
export async function detectProviders(ctx: TodoBackendDetectContext): Promise<TodoBackendProvider[]> {
  const result: TodoBackendProvider[] = [];
  for (const p of PROVIDERS) {
    if (await p.detect(ctx)) result.push(p);
  }
  return result;
}

/**
 * 按配置返回当前激活的 todo backend（默认 local）。
 */
export async function getActiveTodoBackend(paths: ProjectPaths): Promise<TodoBackend> {
  const config = await getTodoConfig(paths.configDir);
  const provider = getProvider(config.backend);
  if (!provider) {
    throw new ColynError(t('commands.todo.backend.unknown', { backend: config.backend }));
  }
  return provider.create(paths, config);
}
