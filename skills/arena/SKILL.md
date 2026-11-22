---
name: arena
description: Parallel multi-model implementation arena. Use when several viable approaches exist and picking wrong is costly. Spawns N isolated candidate implementations on different models via CreateWorkflow, then a three-model panel votes and recovers the best parts of the losers.
---

# arena 多模型并行竞技

适用:≥2 种可行方案且选错代价高(架构选型、关键算法、UI 方案)。小改动直接做,不 arena。

## 流程

1. **先定评估标准**(先于生成,防事后合理化):正确性、边界处理、可维护性、改动量、性能,各给权重。
2. **并行生成**:ToolSearch 加载 `CreateWorkflow` schema,spawn N 个 worker subagent,`subagent_model` 按 deepstack 模型映射各配**不同模型**;每个 worker 拿到相同任务书(需求+验收标准+评估标准),输出到隔离目录/工作树,互不可见。
3. **评审投票**:三个面板模型各一票;评审不得是任一作者的模型(重合则换 provider 行)。每个评审按标准逐项打分 + 一句关键理由。
4. **裁决**:汇总方案 × 标准对比表,宣布赢家 + 诚实边界(赢家在哪些项上输了)。平票 → 执行模型终审。
5. **回收败者**:败者方案中局部更优的技巧,显式并入赢家实现,不浪费。

## 降级链

CreateWorkflow 不可用 → 已装 code-mate-* skill(deepseek / claude-code / codex CLI)并行实现 → 再不行 → 单模型顺序生成 + 三 persona 评审(汇报中注明)。

## 禁止

- 作者模型给自己投票
- 没定标准就开始生成
- 汇报"各方案都不错"而不裁决——arena 的产出必须是选择
