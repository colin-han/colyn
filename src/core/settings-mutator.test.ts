/**
 * settings-mutator.test.ts
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import {
  parseBoolean,
  parseStringArray,
  isSettingsKey,
  getSettingsValueAtPath,
  getNestedValue,
  setSettingsValueAtPath,
  unsetSettingsValueAtPath,
} from './settings-mutator.js';
import { readFileSync } from 'fs';

function makeTempFile(initial: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'colyn-test-'));
  const filePath = path.join(dir, 'settings.json');
  writeFileSync(filePath, initial);
  return filePath;
}

describe('parseBoolean', () => {
  it('true / yes / 1 / on（大小写不敏感）→ true', () => {
    for (const v of ['true', 'True', 'yes', 'YES', '1', 'on', 'ON']) {
      expect(parseBoolean(v)).toBe(true);
    }
  });

  it('false / no / 0 / off → false', () => {
    for (const v of ['false', 'No', '0', 'off']) {
      expect(parseBoolean(v)).toBe(false);
    }
  });

  it('其他值抛错', () => {
    expect(() => parseBoolean('maybe')).toThrow();
    expect(() => parseBoolean('')).toThrow();
    expect(() => parseBoolean('enabled')).toThrow();
  });
});

describe('isSettingsKey', () => {
  it('已注册的 key 返回 true', () => {
    expect(isSettingsKey('verbose')).toBe(true);
    expect(isSettingsKey('commands.merge.build')).toBe(true);
    expect(isSettingsKey('commands.checkout.fetch')).toBe(true);
  });

  it('未跟踪文件同步相关 key 已注册', () => {
    expect(isSettingsKey('syncFiles')).toBe(true);
    expect(isSettingsKey('commands.merge.syncConfig')).toBe(true);
    expect(isSettingsKey('commands.merge.syncFiles')).toBe(true);
    expect(isSettingsKey('commands.update.syncConfig')).toBe(true);
    expect(isSettingsKey('commands.update.syncFiles')).toBe(true);
  });

  it('未注册的 key 返回 false', () => {
    expect(isSettingsKey('foo.bar')).toBe(false);
    expect(isSettingsKey('npm')).toBe(false);
    expect(isSettingsKey('lang')).toBe(true);
    expect(isSettingsKey('branchCategories')).toBe(false);
  });
});

describe('parseStringArray', () => {
  it('按逗号分隔并去除首尾空白', () => {
    expect(parseStringArray('data/.env.local, certs/**')).toEqual([
      'data/.env.local',
      'certs/**',
    ]);
  });

  it('过滤空项', () => {
    expect(parseStringArray('a.json,, b.json ,')).toEqual(['a.json', 'b.json']);
  });

  it('空字符串返回空数组', () => {
    expect(parseStringArray('')).toEqual([]);
  });
});

describe('set / get / unset', () => {
  it('set 后能 get 到', async () => {
    const fp = makeTempFile('{ "version": 4 }');
    try {
      await setSettingsValueAtPath(fp, 'commands.merge.build', 'false');
      expect(await getSettingsValueAtPath(fp, 'commands.merge.build')).toBe(false);
    } finally {
      rmSync(path.dirname(fp), { recursive: true });
    }
  });

  it('unset 后 get 返回 undefined', async () => {
    const fp = makeTempFile(
      '{ "version": 4, "commands": { "merge": { "build": true } } }'
    );
    try {
      await unsetSettingsValueAtPath(fp, 'commands.merge.build');
      expect(await getSettingsValueAtPath(fp, 'commands.merge.build')).toBeUndefined();
    } finally {
      rmSync(path.dirname(fp), { recursive: true });
    }
  });

  it('unset 后空 commands.merge 也会被清理', async () => {
    const fp = makeTempFile(
      '{ "version": 4, "commands": { "merge": { "build": true } } }'
    );
    try {
      await unsetSettingsValueAtPath(fp, 'commands.merge.build');
      // 直接读文件验证空对象已被清理
      const raw = JSON.parse(readFileSync(fp, 'utf-8')) as Record<string, unknown>;
      expect(getNestedValue(raw, 'commands.merge')).toBeUndefined();
      expect(getNestedValue(raw, 'commands')).toBeUndefined();
    } finally {
      rmSync(path.dirname(fp), { recursive: true });
    }
  });

  it('verbose 顶层写入', async () => {
    const fp = makeTempFile('{ "version": 4 }');
    try {
      await setSettingsValueAtPath(fp, 'verbose', '1');
      expect(await getSettingsValueAtPath(fp, 'verbose')).toBe(true);
    } finally {
      rmSync(path.dirname(fp), { recursive: true });
    }
  });

  it('设置 invalid 布尔值抛错', async () => {
    const fp = makeTempFile('{ "version": 4 }');
    try {
      await expect(setSettingsValueAtPath(fp, 'verbose', 'maybe')).rejects.toThrow();
    } finally {
      rmSync(path.dirname(fp), { recursive: true });
    }
  });

  it('unset 不存在的 key 返回 false', async () => {
    const fp = makeTempFile('{ "version": 4 }');
    try {
      const result = await unsetSettingsValueAtPath(fp, 'verbose');
      expect(result).toBe(false);
    } finally {
      rmSync(path.dirname(fp), { recursive: true });
    }
  });

  it('多个字段共存时只删除指定字段', async () => {
    const fp = makeTempFile(
      '{ "version": 4, "commands": { "merge": { "build": true, "rebase": false } } }'
    );
    try {
      await unsetSettingsValueAtPath(fp, 'commands.merge.build');
      expect(await getSettingsValueAtPath(fp, 'commands.merge.build')).toBeUndefined();
      // rebase 应该还在
      expect(await getSettingsValueAtPath(fp, 'commands.merge.rebase')).toBe(false);
    } finally {
      rmSync(path.dirname(fp), { recursive: true });
    }
  });

  it('文件不存在时 get 返回 undefined', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'colyn-test-'));
    const fp = path.join(dir, 'settings.json');
    try {
      expect(await getSettingsValueAtPath(fp, 'verbose')).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('set commands.release.versionUpdate', async () => {
    const fp = makeTempFile('{ "version": 4 }');
    try {
      await setSettingsValueAtPath(fp, 'commands.release.versionUpdate', 'yes');
      expect(await getSettingsValueAtPath(fp, 'commands.release.versionUpdate')).toBe(true);
    } finally {
      rmSync(path.dirname(fp), { recursive: true });
    }
  });

  it('set syncFiles 逗号分隔字符串解析为数组', async () => {
    const fp = makeTempFile('{ "version": 4 }');
    try {
      await setSettingsValueAtPath(fp, 'syncFiles', 'data/.env.local, certs/**');
      expect(await getSettingsValueAtPath(fp, 'syncFiles')).toEqual([
        'data/.env.local',
        'certs/**',
      ]);
    } finally {
      rmSync(path.dirname(fp), { recursive: true });
    }
  });

  it('set commands.* 的 syncConfig / syncFiles 布尔键', async () => {
    const fp = makeTempFile('{ "version": 4 }');
    try {
      await setSettingsValueAtPath(fp, 'commands.merge.syncConfig', 'true');
      await setSettingsValueAtPath(fp, 'commands.merge.syncFiles', 'false');
      await setSettingsValueAtPath(fp, 'commands.update.syncConfig', '1');
      await setSettingsValueAtPath(fp, 'commands.update.syncFiles', 'on');
      expect(await getSettingsValueAtPath(fp, 'commands.merge.syncConfig')).toBe(true);
      expect(await getSettingsValueAtPath(fp, 'commands.merge.syncFiles')).toBe(false);
      expect(await getSettingsValueAtPath(fp, 'commands.update.syncConfig')).toBe(true);
      expect(await getSettingsValueAtPath(fp, 'commands.update.syncFiles')).toBe(true);
    } finally {
      rmSync(path.dirname(fp), { recursive: true });
    }
  });

  it('设置 syncFiles 布尔键的 invalid 值抛错', async () => {
    const fp = makeTempFile('{ "version": 4 }');
    try {
      await expect(
        setSettingsValueAtPath(fp, 'commands.update.syncFiles', 'maybe')
      ).rejects.toThrow();
    } finally {
      rmSync(path.dirname(fp), { recursive: true });
    }
  });
});
