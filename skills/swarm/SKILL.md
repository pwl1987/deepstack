---
name: swarm
description: Parallel worker swarm for genuinely independent subtasks. Use when a task decomposes into isolated units of work. Enforces dependency analysis first, per-worker proof-of-work, and serialized handling of shared state.
user-invocable: false
---

# swarm 并行蜂群

## 前置:依赖分析(必做,防假并行)

画出子任务依赖图。**只有真独立的子任务才并行**;共享文件/共享状态的任务先拆边界或串行(separate-before-serializing)。假并行省下的时间 < 合并冲突还债的时间。

## 流程

1. **分解**:每个 worker 一张任务书:范围(允许触碰的文件)、完成定义(验收标准)、**证明义务**(测试/运行证据)、禁止事项(不越界、不顺手改别的)。
2. **并行执行**:先确认宿主有隔离工作区、并行代理和实际可用的模型；worker 数不超过独立子任务数和宿主预算。没有能力时顺序执行并说明原因。
3. **逐个验收**:合并前逐 worker 验收产出与证据;未证明的不合并(outcome-oriented-execution)。
4. **冲突收尾**:触碰同一文件的改动串行处理;接口处由主对话统一拍板。

## 降级链

同 arena:已验证的宿主并行能力 → 已授权且已验证存在的外部 CLI → 顺序执行。

## 禁止

- 无依赖图直接开 N 个 worker
- worker 之间互相等待/通信——那是编排不是蜂群;拆不出真独立就回 architect 重切
