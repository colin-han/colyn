/**
 * 命令注册入口
 * 新增命令时，只需在此文件添加一行导入即可
 */
import type { Command } from 'commander';

// 导入所有命令的 register 函数
import { register as registerInit } from './init.js';
import { register as registerAdd } from './add.js';
import { register as registerList } from './list.js';
import { register as registerMerge } from './merge.js';
import { register as registerInfo } from './info.js';
import { register as registerCheckout } from './checkout.js';
import { register as registerRemove } from './remove.js';
import { register as registerRepair } from './repair.js';

/**
 * 注册所有命令到 program
 */
export function registerAllCommands(program: Command): void {
  registerInit(program);
  registerAdd(program);
  registerList(program);
  registerMerge(program);
  registerInfo(program);
  registerCheckout(program);
  registerRemove(program);
  registerRepair(program);
}
