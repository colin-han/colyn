/**
 * 识别 `colyn <N>` 形式的 argv，将其重写为 `colyn switch <N>`。
 *
 * 支持两种模式：
 * - 切换模式：`colyn <N>` → `colyn switch <N>`
 * - 执行模式：`colyn <N> <cmd...>` → `colyn switch <N> <cmd...>`
 *
 * 仅在"至少一个非选项参数且第一个为纯数字"时触发；其他情况返回原 argv 的副本。
 *
 * @param argv 原始 argv 数组
 * @returns 重写后的 argv（或原数组的副本）
 */
export function preprocessArgv(argv: string[]): string[] {
  const args = argv.slice(2);
  const nonOptionArgs = args.filter((a) => !a.startsWith('-'));

  if (nonOptionArgs.length === 0 || !/^\d+$/.test(nonOptionArgs[0])) {
    return [...argv];
  }

  const digitArg = nonOptionArgs[0];
  const digitIdx = args.indexOf(digitArg);

  if (nonOptionArgs.length >= 2) {
    // 执行模式: colyn <N> <cmd...> → colyn switch <N> <cmd...>
    const result = [...argv];
    result.splice(digitIdx + 2, 0, 'switch');
    return result;
  }

  // 切换模式: colyn <N> → colyn switch <N>
  // 防止 `colyn 1 --foo` 这类混合用法被误识别为快速切换
  const hasOptionAfterDigit = args.slice(digitIdx + 1).some((a) => a.startsWith('-'));
  if (hasOptionAfterDigit) return [...argv];

  const result = [...argv];
  result.splice(digitIdx + 2, 0, 'switch');
  return result;
}
