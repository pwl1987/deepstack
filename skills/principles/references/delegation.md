# Delegation 委托与并行原则

- **guard-the-context-window**：宽泛探索交给子代理，主对话只保留结论和证据路径。
- **separate-before-serializing-shared-state**：并行前先分离工作树、文件和输出；只有真实不变量才串行共享状态。
- **migrate-callers-then-delete**：调用方迁移完成后同一波删除旧接口，不留无期限双轨。
- **outcome-oriented-execution**：委托交付定义和证明义务，不交一长串过程脚本；验收看结果。
