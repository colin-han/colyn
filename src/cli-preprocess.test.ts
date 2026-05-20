import { describe, it, expect } from 'vitest';
import { preprocessArgv } from './cli-preprocess.js';

describe('preprocessArgv', () => {
  const BASE = ['node', 'colyn'];

  it('将纯数字参数重写为 switch 子命令', () => {
    expect(preprocessArgv([...BASE, '1'])).toEqual([...BASE, 'switch', '1']);
  });

  it('colyn 0 重写为 colyn switch 0', () => {
    expect(preprocessArgv([...BASE, '0'])).toEqual([...BASE, 'switch', '0']);
  });

  it('非纯数字参数不重写', () => {
    expect(preprocessArgv([...BASE, 'add'])).toEqual([...BASE, 'add']);
  });

  it('多个非选项参数不重写', () => {
    expect(preprocessArgv([...BASE, '1', '2'])).toEqual([...BASE, '1', '2']);
  });

  it('数字 + 选项的组合不重写', () => {
    expect(preprocessArgv([...BASE, '1', '--foo'])).toEqual([...BASE, '1', '--foo']);
  });

  it('--help 不重写', () => {
    expect(preprocessArgv([...BASE, '--help'])).toEqual([...BASE, '--help']);
  });

  it('"12abc" 之类的非纯数字不重写', () => {
    expect(preprocessArgv([...BASE, '12abc'])).toEqual([...BASE, '12abc']);
  });

  it('无参数时不重写', () => {
    expect(preprocessArgv(BASE)).toEqual(BASE);
  });

  it('选项排在数字之前也能识别', () => {
    expect(preprocessArgv([...BASE, '--no-color', '1'])).toEqual([
      ...BASE,
      '--no-color',
      'switch',
      '1',
    ]);
  });
});
