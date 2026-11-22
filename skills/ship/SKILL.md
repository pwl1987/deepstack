---
name: ship
description: Pre-delivery shipping checklist. Use before creating a PR, merging, or declaring a task complete. Covers edge cases, package size, UI self-review, rollback, and diff hygiene.
---

# ship 交付检查单

宣称完成 / 建 PR / 合并之前逐项过。任何一项不过 → 修完再来,不降标准换速度。

## 正确性

- [ ] 边界情况:空 / 零 / 负值 / 超长 / 并发 / 失败路径 / 权限不足
- [ ] 测试真实跑过并贴证据(prove-it-works;"应该没问题"不算)
- [ ] diff 自查:调试残留、console.log、无关文件、撒谎的命名、无意格式改动

## 质量

- [ ] 包体积增量:新增依赖值不值这个体积;能复用既有依赖吗
- [ ] UI 改动:截图对照设计稿;真实交互(点击/输入/滚动)走一遍,不只看静态图
- [ ] 二阶影响:调用方、其他模块、监控告警、文档是否同步更新

## 交付

- [ ] 回滚方案一句话说得清(怎么退、退回后是什么状态)
- [ ] PR/提交描述回答"为什么改",不只"改了什么"
- [ ] 小任务合并主分支后推送/建 PR;大任务走工作树分阶段提交,逐个审核后合并
