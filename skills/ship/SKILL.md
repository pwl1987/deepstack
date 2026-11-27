---
name: ship
description: Internal pre-delivery verification. Use before declaring a task complete or preparing an authorized PR. It checks evidence, quality gates, edge cases, rollback, and diff hygiene without assuming external write permission.
user-invocable: false
---

# ship 交付检查单

宣称完成或准备授权的交付动作之前逐项过。不适用的项目标记 N/A 并说明原因；未运行的检查不能标成通过。

## 正确性

- [ ] 边界情况:空 / 零 / 负值 / 超长 / 并发 / 失败路径 / 权限不足
- [ ] 测试真实跑过并贴证据(prove-it-works;"应该没问题"不算)
- [ ] 项目质量门已运行:格式 / lint / 类型或编译 / 受影响测试 / 完整测试(按项目配置)
- [ ] diff 自查:调试残留、console.log、无关文件、撒谎的命名、无意格式改动

## 质量

- [ ] 包体积增量:新增依赖值不值这个体积;能复用既有依赖吗
- [ ] UI 改动:截图对照设计稿;真实交互(点击/输入/滚动)走一遍,不只看静态图
- [ ] 二阶影响:调用方、其他模块、监控告警、文档是否同步更新

## 交付

- [ ] 回滚方案一句话说得清(怎么退、退回后是什么状态)
- [ ] PR/提交描述回答"为什么改",不只"改了什么"
- [ ] 当前操作在用户明确授权范围内
- [ ] 只有用户明确授权时才提交、推送、建 PR、合并或发布
