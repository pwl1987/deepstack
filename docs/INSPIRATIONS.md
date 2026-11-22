# 借鉴、来源与边界

DeepStack 的实现借鉴了多个公开项目的工作流思想，但没有把这些项目的源文件复制进本仓库，也不把对比研究写成已经实现的能力。下表区分直接骨架、方法参考和仅作对比的项目。

| 来源 | 在 DeepStack 中实际吸收的内容 | 归属边界 |
|---|---|---|
| [Cursor pstack](https://github.com/cursor/plugins/tree/main/pstack) | 单一入口、任务路由、工程原则、按需组合内部步骤，以及 arena/swarm/interrogate 的能力边界意识 | 直接设计骨架；上游 MIT，DeepStack 不是上游代码的副本 |
| [obra/superpowers](https://github.com/obra/superpowers) | 需求澄清、计划、TDD、系统化调试、代码审查和交付门 | 方法参考；未复制其实现 |
| [mattpocock/skills](https://github.com/mattpocock/skills) | 面向真实软件工程的任务拆解、测试和审查习惯；区分用户调用与模型调用技能 | 方法参考；DeepStack 将这一分层用于隐藏内部技能，未复制其实现 |
| [wshobson/agents](https://github.com/wshobson/agents) | 模块化技能和专门角色的组织方式 | 组织方式参考；未引入其代理包 |
| [github/spec-kit](https://github.com/github/spec-kit) | 先定义目标、规格和验收证据 | 规格方法参考；不依赖其工具链 |
| [anthropics/skills](https://github.com/anthropics/skills) | 技能目录、宿主边界和可组合技能的表达方式 | 技能规范参考；不声称兼容其全部宿主行为 |
| [trailofbits/skills](https://github.com/trailofbits/skills) | 安全检查、证据和验证优先的工程习惯 | 验证方法参考；未复制其安全内容 |
| BMAD、GSD、Ponytail、Comet | 任务分层、最小必要实现、阶段化推进等概念上的对比输入 | 当前没有可核验的代码级移植；不宣称已完整融合 |

## 许可证和归因

DeepStack 自身使用 MIT 许可证。上表中的项目仍归其原作者和许可证所有；名称和链接用于归因与对比，不表示这些项目为 DeepStack 的依赖、背书或共同维护者。若未来复制具体代码、模板或受特殊许可证约束的内容，应在对应文件旁补充原始版权和许可证说明，并重新检查分发条件。

## 如何判断“已借鉴”

- **已实现**：本仓库有对应的可运行规则、技能或校验，并能指出文件位置。
- **方法参考**：吸收决策方式或流程习惯，但没有复制实现。
- **对比研究**：用于评估取舍，当前不应在产品说明中写成已有能力。
