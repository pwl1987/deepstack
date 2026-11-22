# Architecture 架构原则

- **attack-the-premise**：先验证问题是否值得解决，避免在错误前提上修补。
- **exhaust-the-design-space**：选型至少比较最简方案和主要替代方案，并写出最可能失败的位置。
- **foundational-thinking**：先确定核心数据结构、所有权和并发参与者，再写逻辑。
- **redesign-from-first-principles**：现有结构若是问题根源，按目标形状重设计，不在旧结构上堆补丁。
- **model-the-domain**：把实体、状态和不变量放进结构、类型、表或状态机，不散落在条件分支里。
- **build-the-lever**：重复工作优先变成可重跑的脚本、检查器、生成器或技能。
- **boundary-discipline**：在 CLI、配置、网络和外部 API 边界校验；内部代码依靠已解析的类型和契约。
