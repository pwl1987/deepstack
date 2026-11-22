# DeepStack 深栈

> if you want to go fast, go deep first.
> 严谨工程工作流插件:写得少,但写得更好。

灵感来自 [pstack](https://github.com/cursor/plugins/tree/main/pstack)(Lauren Tan),借鉴其"路由 → 工作流 → 原则"三层结构,内容全部中文重写,适配 ZCode / Claude Code 双宿主。

## 12 个 Skills

| 类别 | Skill | 用途 |
|---|---|---|
| 路由 | `deepstack` | 任务分类派发 + 模型映射(入口) |
| 修复 | `deep-fix` | 根因修复:先复现、5-why、影响面、回归钉 |
| 实现 | `tdd` | 红-绿-重构 + 证据门 |
| 设计 | `architect` | 穷尽设计空间、方案对比、二阶影响 |
| 重构 | `refactor` | 等价变换:先减后加、迁移即删 |
| 交付 | `ship` | 交付检查单:边界/体积/UI/回滚 |
| 复盘 | `reflect` | 返工根因 → 固化为规则/自动化/skill |
| 续接 | `pickup` | 新会话重建上下文,已决事项不重问 |
| 并行 | `arena` | N 模型并行出方案 → 三模型面板投票 |
| 并行 | `swarm` | 真独立子任务蜂群,worker 证明义务 |
| 并行 | `interrogate` | 三 persona 对抗审查 diff(P0 必堵) |
| 原则 | `principles` | 24 条工程原则合订本,按组按需加载 |

## 安装

### Claude Code
```
/plugin marketplace add pwl1987/deepstack
/plugin install deepstack@deepstack
```

### ZCode
插件市场 → 添加 → 添加插件市场 → 粘贴本仓库 clone 后的本地路径,然后在个人市场里安装。
(远程仓库作为市场源的支持因版本而异,本地 clone 最稳。)

### 其他 Agent
skills 是纯 markdown(SKILL.md + name/description frontmatter),直接把 `skills/` 下任意目录拷进你的 agent 的技能目录即可;或把本仓库地址写进你的 AGENTS.md/CLAUDE.md 作为参考。

## 多模型评审面板

`arena` / `swarm` / `interrogate` 运行时先探测宿主可用模型,按下表取票:

| 角色 | 模型 |
|---|---|
| 执行 / 终审 | GLM-5.3(max) |
| 评审一票 ×3 | GLM-5.3-Flash / huihui-qwen3.8 / MiniMax-M3.1-Flash |

模型 ID 以运行时探测为准,换套餐无需改插件;探测失败自动降级(code-mate CLI → 单模型多 persona)。

## License

MIT
