# Verification 验证原则

- **sequence-verifiable-units**：把多步工作拆成每步都能单独验证的单元。
- **test-behavior-not-implementation**：测试用户可观察的行为，不锁死内部调用顺序。
- **type-system-discipline**：类型能排除的非法状态不要留给运行时分支。
- **make-operations-idempotent**：重试、并发和恢复后应收敛到同一结果。
- **explain-the-number**：任何耗时、体积、覆盖率或 eval 数字都要说明测量边界和因果限制。
