import type { TodoItem } from './index.js';
import type { ProjectPaths } from '../core/paths.js';
import type { TodoConfig } from '../core/config-schema.js';

/** todo 列表过滤维度（对应 4 态语义） */
export type TodoFilter = 'pending' | 'in-progress' | 'done' | 'archived';

/** 新增 todo 的输入；name 可选（IMS backend 会自行分配并回填） */
export interface AddTodoInput {
  type: string;
  message: string;
  name?: string;
}

/**
 * Todo 存储后端抽象。
 * 接口对外暴露 colyn 语义动作，open/closed/label 等 IMS 细节由实现封装。
 */
export interface TodoBackend {
  /** backend 唯一名，如 'local' | 'github' */
  readonly name: string;
  /** 展示名 */
  readonly displayName: string;
  /** 是否由 backend 自行分配 name（IMS=true，local=false） */
  readonly assignsName: boolean;

  /** 按语义状态列出 todo */
  list(filter: TodoFilter): Promise<TodoItem[]>;
  /** 查找单个 todo（任意状态），不存在返回 null */
  find(type: string, name: string): Promise<TodoItem | null>;

  /** 新增 todo（pending）；返回创建后的项（IMS 回填 name） */
  add(input: AddTodoInput): Promise<TodoItem>;
  /** 标记为已开始（建分支后）：→ in-progress */
  markStarted(type: string, name: string, branch: string): Promise<void>;
  /** 标记为完成：→ done */
  markDone(type: string, name: string): Promise<void>;
  /** 撤销完成：done → in-progress */
  reopen(type: string, name: string): Promise<void>;
  /** 编辑 message */
  edit(type: string, name: string, message: string): Promise<void>;
  /** 删除 */
  remove(type: string, name: string): Promise<void>;
  /** 批量归档所有 done 项 */
  archive(): Promise<void>;
}

/** provider 检测/初始化上下文 */
export interface TodoBackendDetectContext {
  projectRoot: string;
  mainDirPath: string;       // 主分支目录（git repo，含 origin）
  nonInteractive: boolean;
}

/**
 * Backend 发现/初始化层（与 ToolchainPlugin 的 detect/repairSettings 对齐）。
 * detect/setup 在尚未配置、尚无实例时运行（init/repair）。
 */
export interface TodoBackendProvider {
  readonly name: string;       // 'local' | 'github'
  readonly displayName: string;
  /** 当前项目是否可用此 backend */
  detect(ctx: TodoBackendDetectContext): Promise<boolean>;
  /** 前置检查 + 安装帮助 + 登录提示；幂等；可交互；失败抛错 */
  setup(ctx: TodoBackendDetectContext): Promise<void>;
  /** 用配置 + 路径创建运行时 backend 实例 */
  create(paths: ProjectPaths, config: TodoConfig): TodoBackend;
}
