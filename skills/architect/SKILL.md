---
name: architect
description: Design-before-code workflow. Use for new features, new modules, or decisions with more than one viable approach. Exhausts the design space, compares options with failure modes and second-order effects, records the decision.
---

# architect 先设计后动手

产出是**决策**,不是文档堆。写完就能开工的方案才算合格。

## 流程

1. **对齐问题**:底层需求是什么?用户提的是手段还是目标(attack-the-premise)?验收标准是什么?不清晰处一次问完,不挤牙膏。
2. **穷举方案**:≥2 版(通常 3 版),必须含"不做/最简"选项。每版写清:**最可能死在哪里**(一票否决点)。
3. **影响评估**:一阶效果之外必须写二阶影响——其他模块、用户行为、系统复杂度、长期维护成本、回滚成本。
4. **跨领域检索**:其他领域/成熟开源项目怎么解同类问题?优先复用,评估许可证、维护活跃度、安全性、包体积、集成成本,不盲目引入。
5. **选型**:给推荐 + 一句话理由 + 被放弃方案中可回收的部分。架构级/不可逆的方向分歧交用户裁决;其余自主决定并记录决策。

## 输出格式

方案对比表(方案 × 标准:改动量/风险/维护成本/扩展性)+ 选型结论 + 首个可验证单元怎么切(sequence-verifiable-units)。
