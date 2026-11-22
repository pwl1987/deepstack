---
name: refactor
description: Behavior-preserving refactoring workflow. Use when improving structure without changing behavior. Enforces characterization tests first, subtract-before-add, migrate-callers-then-delete, and a cognitive-cost audit.
user-invocable: false
---

# refactor 等价重构

## 前提

行为钉子先行:目标代码没有测试覆盖就先补**特征测试**(characterization tests),钉住现状行为——包括现有的怪癖。没有钉子的重构 = 凭手感做手术。

## 流程

1. **先减后加**:先找可删的——死代码、为已不存在的问题而引入的包袱(用 git log 验证"当年要解决的问题现在还存在吗")、双重防御。删除本身就是重构。
2. **小步等价变换**:每步行为不变、可独立验证(sequence-verifiable-units),一步一验;禁止大爆炸式重写。
3. **迁移后即删**:所有调用方迁到新结构后立刻删旧接口,不留兼容双轨(migrate-callers-then-delete)。
4. **认知成本审计**:假设明天由完全不了解项目的强工程师接手——命名是否撒谎、抽象是否过度、职责是否不清、是否需要大量上下文才能懂。逐项修。

## 边界

行为不变是硬约束。过程中发现"顺手修个 bug"→ 停,记录,走 deep-fix 单独立项;重构夹带行为变更会让回归无法归因。
