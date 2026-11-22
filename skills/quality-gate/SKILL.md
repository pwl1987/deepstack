---
name: quality-gate
description: Project-aware verification gate. Detects existing formatting, lint, typecheck, test, and security commands, runs only authorized checks, and reports evidence without installing tools.
user-invocable: false
---

# Quality gate 质量门

这是内部步骤，不要求用户记住或直接调用。

## 发现命令

优先读取项目已有的 package scripts、Makefile/justfile、pyproject、Cargo、Go、Gradle/Maven、CI 配置和贡献文档。使用项目已经选择的命令，不替换工具链，不自动安装依赖。

## 执行顺序

1. 格式检查；写入任务可以在授权范围内格式化本次改动，调查和只读任务只能检查。
2. lint 或静态分析。
3. 类型检查或编译检查。
4. 受影响的单元/集成测试，再运行项目要求的完整测试。
5. 项目已配置的安全、依赖或 secret 检查。

每项使用 `PASS`、`FAIL`、`NOT_CONFIGURED` 或 `SKIPPED: <reason>`。不得把未运行写成通过。

## 输出契约

```text
质量门：PASS / FAIL / PARTIAL
format: <状态> <命令>
lint: <状态> <命令>
type: <状态> <命令>
test: <状态> <命令>
security: <状态> <命令>
未验证：<范围>
```
