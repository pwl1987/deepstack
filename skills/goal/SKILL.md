---
name: goal
description: Internal long-running goal workflow. Use only when a task has explicit phases, checkpoints, or cross-session continuation; keep state small and human-readable.
user-invocable: false
---

# Goal 目标模式

目标模式是一个可恢复的执行协议，不是后台守护进程，也不是让所有任务都变成长流程。只有路由器判断任务确实需要多阶段或跨会话恢复时才使用。

## 持久化优先级

先读取 `../../docs/HOST-CAPABILITIES.md` 和 `../../evals/goal-adapters.json`，探测宿主是否提供 `native-goal` 并选择对应适配器。宿主提供且已确认时，优先使用原生 Goal、任务、计划或会话恢复机制，不再创建平行状态文件。当前已知适配包括 MiniMax Code 的 Goal 控件、ZCode 的 `/goal`、Claude Code 的 plan/resume、Codex 的持久线程/resume 和 Pi 的 session/resume。只有宿主没有可用的原生持久化能力、且用户明确要求跨会话恢复时，才使用 `.deepstack/goal.md` 作为最小回退。

普通任务不要写入状态文件。回退状态只保留以下内容：

```text
# Goal
目标：
范围：
非目标：
完成标准：
约束与授权：
当前阶段：
已完成与证据：
阻塞项：
下一步：
最后更新：
```

如果当前宿主或工作区不适合持久化，先在回复中输出同样的检查点，并明确说明跨会话恢复需要用户再次提供该检查点。不能假装已经保存，也不能把回退文件描述成宿主原生 Goal。

## 执行规则

1. 先把目标拆成有限的阶段，每阶段必须有一个可观察的完成标准。
2. 每次只推进一个有边界的阶段；完成、阻塞或需要授权时都写检查点。
3. 下一阶段开始前读取状态和当前工作区，不能依赖模型记忆补全历史。
4. 证据必须对应当前阶段和当前提交；未运行的检查标为 `UNVERIFIED`。
5. 外部写入、提交、推送、合并、发布和部署仍然需要明确授权。
6. 目标发生变化时先更新目标和验收标准，再继续执行，不能悄悄扩大范围。

目标模式完成时输出：目标持久化（原生 / 回退文件 / 未确认）、当前阶段、已完成证据、未完成阶段、阻塞项、下一步和是否需要授权。
