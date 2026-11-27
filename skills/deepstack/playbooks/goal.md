# Goal 目标

1. 按 `../../goal/SKILL.md` 的目标模式契约明确目标、范围、非目标、约束、授权边界和最终验收标准。
2. 读取宿主能力和 `../../../evals/goal-adapters.json`，优先进入已确认的原生 Goal、计划或会话入口；同时读取适配器的 `recovery`，不把原生 Goal 入口当成跨会话恢复证据。
3. 只有原生持久化不可用且用户明确要求跨会话恢复时，才用 `node scripts/goal-state.mjs init <repo> --goal ... --acceptance ...` 创建最小 `.deepstack/goal.md` 回退状态；普通目标不创建文件。
4. 将目标拆成有限阶段，优先执行当前最小可验证阶段。
5. 每个阶段结束时记录证据、未验证项、阻塞项和下一步；需要授权时停止。
6. 下一轮先读取原生状态或回退检查点、工作区、分支和差异，再将剩余阶段交回对应主流程。
7. 目标完成后运行交付检查，外部发布或部署仍按授权边界处理。

回退状态必须通过 `node scripts/goal-state.mjs validate <repo-or-file>`。阶段切换使用 `update`，每次只追加当前阶段的证据或阻塞项；不能用模型记忆代替检查点。质量门先运行 `node scripts/quality-gate.mjs plan <repo>`，未执行项保留为 `NOT_RUN`。
