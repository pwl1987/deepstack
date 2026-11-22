---
name: deepstack
description: Rigorous engineering workflow router. Use when starting any non-trivial coding task (bug fix, feature, refactor, design decision) or when the user mentions deepstack / pstack-style rigor. Classifies the task and dispatches to the right deepstack workflow.
---

# deepstack 路由器

定位:接到非平凡编码任务时,先裁决任务类型,派发到对应工作流;一次只派一个主工作流。平凡的单一改动(改文案、改常量)不路由,直接做,但完成后用 principles 的 Core 组自检。

## 路由表

| 任务信号 | 派发 |
|---|---|
| 崩溃 / 报错 / 行为不符预期 / 回归 | deep-fix |
| 新功能 / 新模块 / ≥2 种可行方案需选型 | architect |
| 需求已定、写新行为、可测 | tdd |
| 结构优化、行为不变 | refactor |
| 任务可分解为多个真独立子任务 | swarm |
| 多方案并行实现择优、选错代价高 | arena |
| 高风险 / 大 diff / 即将合并 | interrogate |
| 交付前(建 PR / 合并 / 宣称完成) | ship |
| 任务完成、返工、回滚、同类问题第二次修 | reflect |
| 新会话续接、上下文丢失 | pickup |

## 核心不变量(所有工作流共用)

1. **懒惰协议**:解决问题的最小 diff,偏向删除而非添加。
2. **先复现再修**:没有复现/验证证据,不许动手改。
3. **根因不是症状**:每个修复回答"为什么会发生",不回答"怎样让它闭嘴"。
4. **守卫上下文**:不整读大文件,宽泛探索交给子代理,主对话只收结论。
5. **不阻塞在人类**:能推进就推进;只有破坏性操作和方向级分歧才停下问。
6. **面向结果**:以验收标准为完成定义,不以"代码写完了"为完成定义。

## 模型映射(并行评审/委托用)

运行时先 `ListModels` 探测(跳过 disabled 行),按下表匹配 modelId 末段(大小写不敏感),取第一个命中:

| 角色 | 匹配规则 |
|---|---|
| 执行 / 重判断 / 终审 | 含 `glm-5.3` 且不含 `flash`(跳过 `group/gm`),推理级别 max |
| 评审一票 | 含 `glm-5.3-flash` |
| 评审一票 | 含 `huihui-qwen3.8` |
| 评审一票 | 含 `minimax-m3.1-flash` |

2026-11-22 观测到的完整 ID(仅作参考,以运行时探测为准):
执行 `account:bigmodel-individual-coding-plan/GLM-5.3`;面板 `account:bigmodel-individual-coding-plan/GLM-5.3-Flash`、`new-provider-2/huihui-qwen3.8-flash-next-abliterated-v2-ud-q5_k_xl`、`magpie/minimax-code/MiniMax-M3.1-Flash`。

映射失败的降级链见 arena。派发工作流时,按需把 principles 对应分组注入上下文,不整篇加载。
