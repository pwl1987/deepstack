---
name: interrogate
description: Adversarial multi-model diff interrogation. Use before high-risk merges or after large or security-sensitive changes. Three models attack the diff with distinct personas; P0 findings must be fixed before merge.
user-invocable: false
---

# interrogate 多模型对抗审查

适用:高风险 / 大 diff / 安全敏感 / 即将合并。小 diff 用 ship 检查单即可。

## 流程

1. **备料**:完整 diff + 一句话背景 + 风险面清单(并发/权限/数据迁移/对外接口)。
2. **三 persona 攻击**:在宿主支持独立上下文和并行时并行执行；否则顺序执行并明确标注降级：
   - **边界猎手**:空值/极值/并发/失败路径/权限,每个边界追问"这个输入真的进得来吗"
   - **回归猎手**:改了 A 会不会坏 B——全搜调用方与依赖方,列受影响面
   - **简洁批评家**:过度设计、可删代码、认知成本、撒谎的命名
3. **汇总裁决**:每个 persona 输出发现列表(P0 必堵 / P1 应修 / P2 建议)+ 一句总判断(approve / block)。
4. **处置**:P0 全修完才可交付;P1 修复或**书面驳回**(驳回必须给证据,不许静默忽略);产出修订 diff 后高危可再过一轮。

## 禁止

- 把"模型们没发现 bug"当"没有 bug"——审查提高置信度,不提供正确性证明
- 同一模型扮三个 persona 冒充多模型(降级时三 persona 可单模型顺序跑,但汇报必须注明)
- 审查意见不分级全部照改——P2 自主判断
