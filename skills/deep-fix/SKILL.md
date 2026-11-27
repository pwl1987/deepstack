---
name: deep-fix
description: Root-cause bug fixing workflow. Use for crashes, errors, unexpected behavior, or regressions — before patching symptoms. Enforces reproduce-first, 5-whys root cause isolation, blast-radius sweep, and a regression test that pins the cause.
user-invocable: false
---

# deep-fix 根因修复

## 流程

1. **复现**:拿到最小复现(命令/输入/步骤)。复现不了 → 先造复现,禁止盲改。间歇性问题先找确定性触发条件(prove-it-works 的前置)。
2. **定位根因**:5-why 追到机制层——不是"X 为空",而是"X 为什么会在此时为空"。用 git log/blame 区分有意设计与历史遗留;读错误路径周围的边界处理。
3. **影响面(blast radius)**:全库搜索同类调用点/同构模式,判断是个例还是系统性缺口。系统性缺口 → 修结构(principles: encode lessons in structure),不是只修被报告的这一处。
4. **最小修复**:偏向删除错误假设,而非添加防御分支。每个候选修复自问:这是让问题不再发生,还是让症状闭嘴?
5. **回归测试**:钉住根因触发的行为,不是钉住报错文本;放在能防复发的层级(单测/集成)。
6. **验证**:原复现用例通过 + 相邻行为未破坏(跑相关既有测试)+ 贴出运行证据。

## 反模式(出现即返工)

- try-catch 吞错、判空绕过空指针源头、重试掩盖超时根因
- 只修被报告的那一处,同类位置不搜
- "改了应该好了"——没有复现验证
- 顺手大重构:修复任务禁止夹带行为变更,发现新问题记录后走 deep-fix 单独立项
