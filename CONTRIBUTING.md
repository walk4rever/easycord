# 🤖 EasyCord 团队 AI 协作与 GitHub 工作流指南 (AI-Human Collaboration Guide)

本指南旨在规范 **人类（项目主理人）** 与 **多个 AI 智能体（Agent）** 之间的协作流程。无论你是负责写代码的工程师 Agent，还是负责写方案的产品经理 Agent，都必须严格遵守本工作流。

---

## 👥 1. 团队角色与职责 (Roles)

在本项目中，我们按职责划分以下角色：

| 角色图标 | 角色名称 | 核心职责 | 主要产出物位置 |
| :--- | :--- | :--- | :--- |
| 👨‍💻 | **项目主理人 (Human)** | 下发指令、进行 Review、最终合并代码/文档。 | `main` 分支管理 |
| 📋 | **产品经理 (PM Agent)** | 市场调研、定价策略、功能定义、营销文案。 | `docs/product/*.md` |
| 🎨 | **UI/UX 设计师 (UI Agent)** | 交互流程、CSS 动画、视觉反馈、页面原型。 | `src/styles/`, `docs/design/` |
| 🛠️ | **前端工程师 (Dev Agent)** | 核心功能开发、AI 模型集成、状态管理。 | `src/components/`, `src/utils/` |
| 🧪 | **测试工程师 (QA Agent)** | 自动化测试、兼容性检查、Bug 验证。 | `tests/`, `docs/qa/` |

---

## 🌿 2. 分支管理策略 (Branching)

为了确保大家的工作互不干扰，**严禁直接在 `main` 分支操作**。所有任务必须在独立分支完成。

### 命名规范：
- **产品/文档类**: `doc/功能名` (如: `doc/pricing-strategy`)
- **功能开发类**: `feat/功能名` (如: `feat/gesture-v-highlight`)
- **样式/视觉类**: `ui/功能名` (如: `ui/loading-animation`)
- **修复/优化类**: `fix/问题名` 或 `refactor/优化名`

---

## 🔄 3. Agent 标准执行流程 (Standard Workflow)

每当 Agent 接收到任务时，必须按以下 **5 个步骤** 操作：

### Step 1: 同步最新状态
开始工作前，必须拉取最新的 `main` 代码，确保基础环境一致。
```bash
git checkout main
git pull origin main
```

### Step 2: 创建任务分支
基于最新的 `main` 创建属于自己的“沙盒”。
```bash
git checkout -b feat/your-feature-name
```

### Step 3: 执行任务 (工作区)
- **技术人员**: 修改代码、增加组件、优化算法。
- **非技术人员**: 在 `docs/` 目录下创建或修改 Markdown 文档。
- **提交规范**: 使用 `git commit -m "类型(范围): 描述"` (如: `feat(ui): add v-gesture ripple effect`)。

### Step 4: 推送至远程仓库
完成工作并自测通过后，将分支推送到 GitHub。
```bash
git push origin feat/your-feature-name
```

### Step 5: 汇报与发起 Review
在对话框中向 **项目主理人** 汇报：
> "任务已完成，已推送到分支 `feat/your-feature-name`。修改了 `X` 文件，实现了 `Y` 功能。请进行 Review。"

---

## ✅ 4. Review 与 合并规范 (Review & Merge)

### 🧐 人类主理人的操作：
1. **查看 PR**: 在 GitHub 页面查看 Agent 推送的分支。
2. **文档 Review**: 检查 PM 写的方案是否符合商业预期。
3. **代码 Review**: 检查工程师的代码是否规范、有无 Bug。
4. **提出意见**: 若不满意，直接在对话框要求 Agent 修改，Agent 修复后再次推送。
5. **合并**: 确认无误后，通过 **Squash and Merge** 合并到 `main`。

---

## 🤝 5. 跨角色协作模式

- **PM 驱动 Dev**: PM Agent 产出的 `docs/product/PRD.md` 是开发 Agent 的唯一需求来源。
- **UI 辅助 Dev**: UI Agent 产出的 CSS 方案，开发 Agent 必须直接引用。
- **QA 验收 Dev**: 开发 Agent 推送代码后，QA Agent 负责拉取该分支进行测试，并产出测试报告。

---

## 🚩 6. 禁令 (Golden Rules)

1. **禁止强制推送 (`git push -f`)**: 永远不要覆盖远程历史。
2. **禁止静默提交**: 每次 commit 必须有清晰的描述，每次推送必须在对话框汇报。
3. **隔离原则**: 一个分支只解决一个问题。如果你在写文案时发现了代码 Bug，请记录下来，另开分支修复。

---
*最后更新日期：2026年3月7日*
