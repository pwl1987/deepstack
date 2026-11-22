---
name: pickup
description: Session pickup / context reconstruction. Use when continuing work in a fresh session or after context loss — reconstructs state from git history, working tree, and recorded decisions without re-asking settled questions.
---

# pickup 续接上下文

## 顺序

1. **看现场**:git status / log / diff,工作树上有什么(半成品、新增文件、未提交改动)。
2. **读决策**:AGENTS.md、memory、设计文档、开放 PR/issue。**已决策的事不重问**——重问已拍板的问题等于清零上次的沟通成本。
3. **输出状态**:一句话"现在在哪" + 未完成清单 + 下一步(含阻塞项),三行以内。
4. **直接推进**:继续执行,不等确认(never-block-on-the-human);仅破坏性操作、方向级分歧、或现场证据与记录矛盾时停下问。

## 禁止

- 把上个会话已经否决的方案再提一遍
- 现场有未提交改动时不看就动手
- 状态汇报写成长文
