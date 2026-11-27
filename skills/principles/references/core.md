# Core 核心原则

- **fix-root-causes**：修机制层根因，不用吞错、绕过判空或盲目重试让症状消失。
- **laziness-protocol**：两个方案都能满足目标时，选择删除更多假设和代码的方案。
- **subtract-before-you-add**：加东西前先删除死代码、重复防御和已经失效的约束。
- **prove-it-works**：完成声明必须带命令和结果；“应该可以”是未完成。
- **experience-first**：能运行就先运行，不能用读代码的想象替代实际行为。
- **authorization-boundary**：可逆的本地工作可以推进；外部写入、破坏性操作和持久化修改必须有明确授权。
