/**
 * 运行时配置修复
 *
 * 为 repair / init 提供「身份键校正」能力：保证主分支与各 worktree 的
 * 端口 key 与 WORKTREE 取值正确。
 *
 * 与 runtime-config-sync 的分工：
 * - runtime-config-sync 负责补齐主分支与 worktree 之间缺失的普通 key（身份键被排除）
 * - 本模块负责校正身份键本身（端口、WORKTREE）
 *
 * 运行时配置文件由工具链插件决定（npm/pip 为 .env.local，maven/gradle 为
 * application-local.properties），因此所有读写都经由 PluginManager；
 * 无工具链时回退到 .env.local。
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { pluginManager } from '../plugins/index.js';
import { readEnvFile, updateEnvFilePreserveComments } from './env.js';
import type { ToolchainContext } from './toolchain-resolver.js';

/** 无工具链回退时使用的端口 key */
export const FALLBACK_PORT_KEY = 'PORT';

/** 无工具链回退时使用的默认端口 */
export const FALLBACK_DEFAULT_PORT = 10000;

/**
 * 一个待修复的运行时配置位置
 *
 * 单项目模式下每个 worktree 只有一个 target；Mono Repo 模式下每个子项目一个。
 */
export interface RuntimeTarget {
  /** 工具链上下文；null 表示无工具链，回退 .env.local */
  ctx: ToolchainContext | null;
  /** 配置文件所在目录（Mono Repo 时为 worktree 根 + subPath） */
  dir: string;
  /** 子项目相对路径（'.' 表示根目录） */
  subPath: string;
  /** 端口 key（来自插件 portConfig，回退时为 PORT） */
  portKey: string;
  /** 端口默认值（主分支缺少端口配置时使用） */
  defaultPort: number;
}

/**
 * 身份键的期望值
 */
export interface IdentityExpectation {
  portKey: string;
  /** 期望端口；null 表示保持现状（不校正端口） */
  expectedPort: number | null;
  /** 期望的 WORKTREE 值（'main' 或 worktree ID） */
  expectedWorktree: string;
}

/**
 * 单个身份键的变更描述
 */
export interface IdentityChange {
  key: string;
  /** 原值；缺失时为 undefined */
  from?: string;
  to: string;
}

/**
 * 身份键校正结果
 */
export interface IdentityUpdateResult {
  /** 需要写入的键值（为空表示无需修复） */
  updates: Record<string, string>;
  /** 变更明细，供输出展示 */
  changes: IdentityChange[];
}

/**
 * 纯函数：计算运行时配置中身份键需要的修正
 *
 * - expectedPort 为 null 时不触碰端口（用于主分支：尊重用户已配置的端口）
 * - 仅在取值不符时产生 update，保证幂等
 */
export function computeIdentityUpdates(
  config: Record<string, string>,
  expect: IdentityExpectation
): IdentityUpdateResult {
  const updates: Record<string, string> = {};
  const changes: IdentityChange[] = [];

  if (expect.expectedPort !== null) {
    const expectedPortValue = expect.expectedPort.toString();
    const current = config[expect.portKey];
    if (current !== expectedPortValue) {
      updates[expect.portKey] = expectedPortValue;
      changes.push({ key: expect.portKey, from: current, to: expectedPortValue });
    }
  }

  const currentWorktree = config.WORKTREE;
  if (currentWorktree !== expect.expectedWorktree) {
    updates.WORKTREE = expect.expectedWorktree;
    changes.push({ key: 'WORKTREE', from: currentWorktree, to: expect.expectedWorktree });
  }

  return { updates, changes };
}

/**
 * 由工具链上下文构造运行时配置 target 列表
 *
 * @param contexts 工具链上下文（针对主分支解析得到）
 * @param worktreeRoot 目标 worktree 根目录（主分支目录或某个 worktree 目录）
 */
export async function buildRuntimeTargets(
  contexts: ToolchainContext[],
  worktreeRoot: string
): Promise<RuntimeTarget[]> {
  if (contexts.length === 0) {
    return [
      {
        ctx: null,
        dir: worktreeRoot,
        subPath: '.',
        portKey: FALLBACK_PORT_KEY,
        defaultPort: FALLBACK_DEFAULT_PORT,
      },
    ];
  }

  const targets: RuntimeTarget[] = [];

  for (const ctx of contexts) {
    const dir = ctx.subPath === '.' ? worktreeRoot : path.join(worktreeRoot, ctx.subPath);

    // 子目录在该 worktree 中不存在时跳过（与 add 命令约定一致）
    if (ctx.subPath !== '.') {
      try {
        await fs.access(dir);
      } catch {
        continue;
      }
    }

    const portConfig = pluginManager.getPortConfig([ctx.toolchainName]);
    targets.push({
      ctx,
      dir,
      subPath: ctx.subPath,
      portKey: portConfig?.key ?? FALLBACK_PORT_KEY,
      defaultPort: portConfig?.defaultPort ?? FALLBACK_DEFAULT_PORT,
    });
  }

  return targets;
}

/**
 * 读取 target 的运行时配置
 *
 * @returns 配置内容；文件不存在时返回 null
 */
export async function readRuntimeTarget(
  target: RuntimeTarget
): Promise<Record<string, string> | null> {
  if (target.ctx) {
    return pluginManager.readRuntimeConfig(target.dir, [target.ctx.toolchainName]);
  }

  const envPath = path.join(target.dir, '.env.local');
  try {
    await fs.access(envPath);
  } catch {
    return null;
  }
  return readEnvFile(envPath);
}

/**
 * 将 updates 合并写入 target 的运行时配置
 *
 * @param existing 当前配置内容（插件写入为全量覆盖，需要带上既有内容）
 */
export async function writeRuntimeTarget(
  target: RuntimeTarget,
  existing: Record<string, string>,
  updates: Record<string, string>
): Promise<void> {
  if (target.ctx) {
    await pluginManager.writeRuntimeConfig(
      target.dir,
      { ...existing, ...updates },
      [target.ctx.toolchainName]
    );
    return;
  }

  // 回退路径：直接更新 .env.local，保留注释
  await updateEnvFilePreserveComments(path.join(target.dir, '.env.local'), updates);
}

/**
 * 读取主分支某个 target 的端口基准值
 *
 * worktree 端口 = 主分支端口 + worktree ID（与 add 命令一致）。
 *
 * @returns 主分支配置中的端口；无法读取时返回 null
 */
export async function readBasePort(target: RuntimeTarget): Promise<number | null> {
  const config = await readRuntimeTarget(target);
  if (config === null) return null;

  const value = parseInt(config[target.portKey] ?? '');
  return isNaN(value) ? null : value;
}
