# EasyCord

**中文**：EasyCord 是一个通过手势控制录制流程的网页应用，支持开始、暂停、继续、停止与保存录制，并提供本地下载。

**English**: EasyCord is a web app that uses gesture controls to drive the recording flow, including start, pause, resume, stop, and save with local downloads.

## ✨ 功能 | Features

- 手势控制录制流程（开始/暂停/继续/停止/保存）
- 浏览器内录制与回放
- 多次录制稳定性优化
- 兼容模式与高性能模式切换

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
