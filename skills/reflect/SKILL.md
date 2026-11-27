---
name: reflect
description: Post-task retrospective. Use after finishing a task, and especially after rework, rollback, or fixing the same class of problem a second time. Extracts the common root cause and encodes it into rules, automation, or skills — not advice.
user-invocable: false
---

# reflect 复盘沉淀

触发:大任务完成(建议)/ 出现返工、回滚 / 同类问题第二次修。

## 流程

1. **只列事实**:发生了什么、改了几轮、哪轮返工、什么测试能提前拦住。不复述情绪,不自我表扬。
2. **共同根因**:不是近因。回答:"当初哪个环节若有约束,这次返工就不会发生?"单次失误不沉淀,重复模式才沉淀。
3. **选容器**:
   - 会重复犯 → AGENTS.md 项目规则 / 自动化(hook)
   - 是一套可复用流程 → skill
   - 是环境事实 / 用户偏好 → memory
   原则:encode-lessons-in-structure——宁可加一条机器可执行的约束,不加一条靠人记的规矩。
4. **落笔**:在用户授权范围内写入对应文件；没有授权时输出最小补丁建议和待落盘内容，不自行修改项目、远程系统或持久记忆。

## 反模式

- 复盘写成工作总结(没人看第二遍)
- 教训不可执行("以后要更仔细")——必须改成可触发、可检查的条目
- 把环境问题归因为人的问题,或反之
