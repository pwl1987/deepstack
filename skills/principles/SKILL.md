---
name: principles
description: Reference skill of 24 distilled engineering principles grouped into core / architecture / verification / delegation / meta. Load only the needed group on demand — never the whole file. Shared checklist used by all deepstack workflows.
---

# 24 条工程原则(合订本)

用法:按分组按需加载,不要整篇进上下文。Core 组默认全时生效;其余组由当前工作流按需取。

## Core(默认生效)

- **fix-root-causes**:修根因不修症状。每个修复要能回答"这个问题以后为什么不再发生"。
- **laziness-protocol**:解决问题的最小改动;两个方案都对,选删代码的那个。
- **subtract-before-you-add**:加东西之前先找可删的:死代码、为已不存在的问题而存在的防御。
- **prove-it-works**:宣称完成前必须有运行证据(命令+结果)。没有证据的"应该可以"= 未完成。
- **experience-first**:先实际跑一遍再下结论,不靠读代码想象行为。
- **never-block-on-the-human**:能推进就推进,把问题攒到批量问;只有破坏性/方向级分歧才停。

## Architecture

- **attack-the-premise**:先攻击需求本身:这个问题值得解吗?是症状还是原因?是手段还是目标?
- **exhaust-the-design-space**:选型前穷举可行空间(含"不做"选项),每版写清最可能死在哪里。
- **foundational-thinking**:从基础原理推演,不从惯例抄;惯例只在证明仍适用后沿用。
- **redesign-from-first-principles**:若现有结构是问题根源,推倒重来比重装修便宜。
- **model-the-domain**:先对领域建模(实体、状态、不变量),再写代码。
- **build-the-lever**:优先造让后续工作变便宜的机制(工具、类型、脚手架),不做重复劳动。
- **boundary-discipline**:模块边界即承诺;图省事越界 = 给未来埋债。

## Verification

- **sequence-verifiable-units**:把工作切成每步可独立验证的单元,失败能定位到步。
- **test-behavior-not-implementation**:钉行为契约,不钉实现细节;实现重构时测试不该红。
- **type-system-discipline**:让非法状态不可表示;类型能排除的错误不要写运行时 if。
- **make-operations-idempotent**:操作设计成幂等,重试/并发/回放才安全。
- **explain-the-number**:任何指标变化(体积、耗时、覆盖率)必须有因果解释,不许"大约"。

## Delegation(子代理/并行)

- **guard-the-context-window**:上下文是最稀缺资源;宽泛探索给子代理,主对话只收结论。
- **separate-before-serializing-shared-state**:并行前先分离共享状态;串行化共享状态是最后的妥协。
- **migrate-callers-then-delete**:迁移完所有调用方就删旧接口,不留双轨。
- **outcome-oriented-execution**:委托时给"完成定义+证明义务",不给步骤清单;验收看结果不看过程。

## Meta

- **minimize-reader-load**:代码和文档为读者写;能用名字说清的不用注释,能删掉的不用解释。
