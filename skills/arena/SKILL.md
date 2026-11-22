---
name: arena
description: Optional parallel implementation arena. Use when several viable approaches exist and picking wrong is costly. It requires verified host support for isolated candidates and independent review; otherwise it reports a scoped fallback.
---

# arena 多模型并行竞技

适用:≥2 种可行方案且选错代价高(架构选型、关键算法、UI 方案)。小改动直接做,不 arena。

## 流程

1. **先检查能力和授权**:确认宿主支持隔离工作区、并行代理和所需模型；能力不存在时不能声称执行了 arena。
2. **先定评估标准**(先于生成,防事后合理化):正确性、边界处理、可维护性、改动量、性能,各给权重。
3. **并行生成**:使用宿主实际可用的隔离工作区和代理接口；每个 worker 拿到相同任务书(需求+验收标准+评估标准),输出互不可见。
4. **评审投票**:只有实际运行了独立模型或独立上下文的评审才计票；不足时降级为单模型多视角，并明确标注。
5. **裁决**:汇总方案 × 标准对比表,宣布赢家 + 诚实边界(赢家在哪些项上输了)。平票 → 执行模型终审。
6. **回收败者**:败者方案中局部更优的技巧,显式并入赢家实现,不浪费。

## 降级链

隔离工作流不可用 → 已授权且已验证存在的外部 CLI 顺序或并行执行 → 再不行 → 单模型顺序生成 + 多视角审查(汇报中注明)。

## 禁止

- 作者模型给自己投票
- 没定标准就开始生成
- 汇报"各方案都不错"而不裁决——arena 的产出必须是选择
