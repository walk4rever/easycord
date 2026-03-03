# EasyCord

**中文**：EasyCord 是一个通过手势控制录制流程的网页应用，支持开始、暂停、继续、停止与保存录制，并提供本地下载。

**English**: EasyCord is a web app that uses gesture controls to drive the recording flow, including start, pause, resume, stop, and save with local downloads.

## ✨ 功能 | Features

- **纯手势控制录制流程**：
  - 👍 **竖起大拇指**：保持 3 秒，开始录制
  - ✊ **握拳**：保持 3 秒，停止录制
  - 🖐️ **张开手掌**：保持 3 秒，重置/放弃录制
- **防误触机制**：所有手势均需保持 3 秒，配合可视化倒计时圆环，避免误操作
- **浏览器原生支持**：
  - **原生 MP4 录制**：在 Chrome/Edge 等现代浏览器中直接生成 MP4 文件（无需转码，高性能）
  - **兼容模式**：自动检测浏览器能力，不支持原生 MP4 时回退到 WebM 录制并自动转码为 MP4（使用 FFmpeg WASM）
- **完全本地化**：视频数据不上传云端，所有处理均在浏览器内完成，保护隐私

## 🌐 浏览器兼容性 | Browser Compatibility

| 浏览器 | 状态 | 说明 |
| :--- | :--- | :--- |
| **Google Chrome** | ✅ 完美支持 | 支持原生 MP4 录制，性能最佳（推荐） |
| **Microsoft Edge** | ✅ 完美支持 | 支持原生 MP4 录制，性能最佳（推荐） |
| **Mozilla Firefox** | ⚠️ 可能有问题 | 不支持原生 MP4，将回退到兼容模式（WebM 转码），可能存在性能或兼容性问题 |
| **Safari** | ❓ 未充分测试 | 可能受限于 MediaRecorder 支持情况 |

> **注意**：本项目主要针对 Chrome 和 Edge 内核浏览器进行了优化和测试。Firefox 用户可能会遇到性能瓶颈或功能限制。

## 🧩 技术栈 | Tech Stack

- React + TypeScript
- Vite
- WebCodecs / MediaRecorder
- FFmpeg WASM（WebM → MP4 转换）

## � 本地运行 | Local Development

```bash
npm install
npm run dev
```

## � 构建 | Build

```bash
npm run build
npm run preview
```

## � Docker 部署 | Docker Deployment

已提供 `deploy.sh`，用于一键构建与运行：

```bash
./deploy.sh
```

默认容器端口为 `8081`，请在服务器上将 `https://air7.fun/easycord/` 通过反向代理映射到该容器。

## 📄 License

MIT License
