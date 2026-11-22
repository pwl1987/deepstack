# 宿主能力探测协议

DeepStack 的内部步骤不能凭宿主名称或配置文件猜测能力。每次准备调用内部技能时，先记录当前宿主已经确认、尚未确认和不可用的能力。`unknown` 不等于 `true`。

## 能力定义

| 能力 | 最小证据 |
|---|---|
| `single-entry` | 宿主真实执行 `/deepstack` 或等价入口，并加载路由器 |
| `skill-loading` | 宿主读取 DeepStack 技能并在会话中显示或执行 |
| `readonly-execution` | 以只读/计划模式执行一次任务，并确认未写入工作区 |
| `parallel-agents` | 真实启动两个独立 worker，并回读各自结果 |
| `isolated-workspace` | 真实创建隔离工作区，并证明 worker 之间不可见 |
| `external-cli` | 真实调用已授权的外部 CLI，并回读退出状态和输出 |
| `quality-gate` | 真实发现并运行项目已有的格式、静态检查、类型或测试入口 |
| `native-goal` | 真实观察或使用宿主原生 Goal、任务、计划或会话入口 |
| `session-recovery` | 开始一轮后，在下一轮或重新打开的会话中读回上一轮状态 |
| `model-policy` | 使用统一 L0/L1/L2 输入，真实返回风险优先分级和单模型降级契约 |

## 决策规则

1. `arena` 需要 `parallel-agents`、`isolated-workspace` 和独立评审证据；缺一项就顺序降级。
2. `swarm` 需要 `parallel-agents` 和隔离或明确的文件边界；缺失时按依赖顺序执行。
3. `interrogate` 需要独立上下文或独立模型证据；不可用时使用单模型多视角，并标记降级。
4. `quality-gate` 只在 `quality-gate` 已确认且项目入口实际存在时运行；否则标记 `NOT_CONFIGURED`。
5. 任何只读承诺都需要 `readonly-execution` 证据；仅有宿主名称、模式名称或配置文件不能算确认。
6. `native-goal` 只证明入口存在；跨会话承诺必须另有 `session-recovery` 证据。
7. `model-policy` 未确认时，不能宣称该宿主自动执行 DeepStack 的模型升级策略。

开始任务时输出最小探测结果：

```text
宿主能力：已确认 <列表>
未确认：<列表>
本轮降级：<没有 / 具体降级>
```

五个宿主的当前点时记录见 [宿主路由基准](../evals/host-routing-benchmark.json) 和 [宿主验证记录](HOST-VALIDATION.md)。
