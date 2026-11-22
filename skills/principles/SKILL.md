---
name: principles
description: Index of 23 DeepStack engineering principles. Load the core group and only the reference group required by the selected workflow; do not load every principle into context.
---

# DeepStack 原则索引

原则不是用户要记的命令，也不是完成证据。它们只改变当前任务中的判断，并且要在报告中指出改变了什么决定。

## 加载规则

- 所有写入任务默认读取 `references/core.md`。
- 架构、边界、数据形状或 API 变化读取 `references/architecture.md`。
- 测试、指标、性能或交付验证读取 `references/verification.md`。
- 并行、委托、工作树或共享状态读取 `references/delegation.md`。
- 阅读负担、文档和技能设计读取 `references/meta.md`。
- 只加载当前任务需要的组；不要把本目录所有文本塞进上下文。

## 组索引

- `core.md`: fix-root-causes, laziness-protocol, subtract-before-you-add, prove-it-works, experience-first, authorization-boundary
- `architecture.md`: attack-the-premise, exhaust-the-design-space, foundational-thinking, redesign-from-first-principles, model-the-domain, build-the-lever, boundary-discipline
- `verification.md`: sequence-verifiable-units, test-behavior-not-implementation, type-system-discipline, make-operations-idempotent, explain-the-number
- `delegation.md`: guard-the-context-window, separate-before-serializing-shared-state, migrate-callers-then-delete, outcome-oriented-execution
- `meta.md`: minimize-reader-load
