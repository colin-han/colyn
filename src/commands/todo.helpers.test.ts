import { describe, it, expect } from 'vitest';
import { strWidth } from './todo.helpers.js';

describe('strWidth', () => {
  it('计算纯 ASCII 字符串宽度', () => {
    expect(strWidth('feat')).toBe(4);
    expect(strWidth('Type')).toBe(4);
    expect(strWidth('')).toBe(0);
  });

  it('计算 CJK 宽字符宽度为 2', () => {
    expect(strWidth('中文')).toBe(4);
    expect(strWidth('中a')).toBe(3);
  });

  describe('emoji abbr 宽度（修复折行问题）', () => {
    // 默认分支分类的 abbr，真实终端显示宽度
    it('✨feat：emoji 计 2 列，总宽 6', () => {
      expect(strWidth('✨feat')).toBe(6);
    });

    it('🐛fix：补充平面 emoji 计 2 列，总宽 5', () => {
      expect(strWidth('🐛fix')).toBe(5);
    });

    it('📝doc：补充平面 emoji 计 2 列，总宽 5', () => {
      expect(strWidth('📝doc')).toBe(5);
    });

    it('♻️ref：文本默认符号 + 变体选择符按 emoji 宽度渲染，总宽 5', () => {
      // ♻ (U+267B) 为文本默认符号，计 1；U+FE0F 计 1（补足升级宽度）；ref 计 3
      expect(strWidth('♻️ref')).toBe(5);
    });
  });

  it('裸 emoji 计 2 列', () => {
    expect(strWidth('🐛')).toBe(2);
    expect(strWidth('✨')).toBe(2);
    expect(strWidth('📝')).toBe(2);
  });
});
