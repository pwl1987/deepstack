---
name: tdd
description: Test-driven development loop. Use when implementing new behavior or bug fixes where a test can pin the contract. Red-green-refactor with an explicit evidence gate — no claiming done without pasted run output.
---

# tdd 红-绿-重构

## 循环

1. **红**:先写会失败的测试,描述目标行为契约(测行为不测实现),跑一次,确认它以预期方式失败(证据 1:失败输出)。
2. **绿**:用最小实现让测试通过,不预支未来需求(laziness-protocol)。
3. **重构**:在保持全绿的前提下清理结构;每步重构后重跑。
4. **证据门**:宣称完成前必须贴出:测试命令 + 通过输出摘要 + 覆盖了哪些验收点。

## 完成的定义

验收标准中的每条行为都有对应测试且实际跑绿 ≠ "代码写完了"。这两者的差距就是返工的来源。

## 禁止

- 先写实现再补"肯定过"的测试——那是验收测试,不是 TDD
- mock 掉被测行为本身(mock 边界依赖可以,mock 被测逻辑不行)
- 断言实现细节(私有调用序列、内部状态)——重构必碎
- 跳过"红"直接写实现:没见过测试失败,就不能证明它测到了东西
