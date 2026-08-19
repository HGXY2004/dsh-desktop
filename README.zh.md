# DSH Desktop

[English](README.md) | 中文

以 **DeepSeek Harness（dsh）** 为核心的 Windows 10/11 桌面应用。dsh 及其全部运行时都运行在 **WSL2** 内，桌面端只负责引导、生命周期管理与窗口承载——开箱即用，且完整保留 dsh 的配置体系与插件扩展性。

## 架构

```
┌────────────────────────── Windows 10/11 ──────────────────────────┐
│  DSH Desktop (Electron)                                           │
│  ├─ 控制中心：状态 / 设置 / 插件 / 配置编辑 / 日志                    │
│  ├─ 主窗口：加载 dsh Web GUI（http://127.0.0.1:<port>）              │
│  └─ 引导器：wsl.exe 驱动 ↓                                         │
│ ────────────────────────── WSL2（Ubuntu 等）────────────────────── │
│  ~/.dsh-desktop/                 ← 全部用户态、无 sudo              │
│  ├─ runtime/node-v22.x/          ← 官方 tarball 解包的 Node.js      │
│  ├─ npm-global/                  ← dsh、pnpm（私有 prefix）          │
│  └─ state/                       ← pid 等状态                        │
│  ~/.dsh/                         ← dsh 原生家目录（profiles、patch）  │
│  └─ profiles/web/                ← web profile（首次启动自动初始化）   │
│  dsh web --host 127.0.0.1 --port 0  →  WSL2 localhost 转发回 Windows │
└───────────────────────────────────────────────────────────────────┘
```

设计要点：

- **不改造 dsh**：桌面端只是 `dsh web` 的生命周期壳。所有 dsh 命令行能力（`--patch`、`--dump-config`、`dsh plugin`、profiles）原样保留。
- **零 sudo**：Node.js / dsh / pnpm 全部安装在 WSL 用户目录 `~/.dsh-desktop`，通过随应用分发的 `launch.sh` 组装 PATH。
- **网络友好**：Node 镜像与 npm registry 均为可配置的回退链（默认 npmmirror → 官方源）。

## 环境要求

- Windows 10（1903+，含 WSL2 支持）或 Windows 11
- 已启用 WSL2 并安装任意发行版（推荐 Ubuntu；`wsl -l -v` 中 VERSION 为 2）
- 首次启动需要联网（下载 Node.js ~30MB 与 dsh 依赖）；之后离线可用

未安装 WSL2？以管理员身份运行 `wsl --install -d Ubuntu`，重启后在 Microsoft Store 完成发行版初始化。

## 快速开始

### 安装包

1. 构建或获取 `DSH Desktop-1.0.0-setup.exe`（NSIS 安装器，另有免安装 portable 版）
2. 启动后自动完成：
   - 检测 WSL2 与发行版
   - 在发行版内安装用户态运行时（Node.js + dsh + pnpm）
   - 启动 `dsh web` 并打开桌面主窗口
3. 在 Web GUI 的设置中配置模型 / API Key（存储于 WSL 内 `~/.dsh`，与 CLI 完全一致）

### 从源码运行

```powershell
npm install        # .npmrc 已指向 npmmirror 镜像
npm start          # 开发运行
npm run smoke      # 无窗口自动化验证（退出码 0 = 全链路就绪）
npm run dist       # 构建 Windows 安装包 + 便携版（release/ 目录）
```

## 保留的配置项

DSH Desktop 不截留任何 dsh 配置，桌面设置（`%APPDATA%/dsh-desktop/settings.json`）只决定"如何启动 dsh"：

| 桌面设置 | 对应 dsh 侧 |
|---|---|
| 工作目录（Windows 路径） | 映射为 `/mnt/c/...` 作为 dsh 启动 cwd（工作区根） |
| DSH_HOME | 注入 `DSH_HOME` 环境变量（默认 `~/.dsh`） |
| 固定端口 | `dsh web --port`（0 = 随机） |
| 额外参数 | 透传给 `dsh web`（如 `--patch extra.yml`） |
| 额外环境变量 | 逐行 KEY=VALUE 注入 dsh 进程 |
| Node 镜像 / registry / dsh 版本 | 引导器下载与安装参数 |

dsh 自身的配置层叠在 **配置** 标签页直接编辑（也可用任意编辑器经 `\\wsl.localhost\<distro>\home\<user>\.dsh` 访问）：

`dsh.profile.bundles → profiles/web/cordis.patch.yml → ~/.dsh/cordis.patch.yml → --patch`

## 扩展性

- **插件**：控制中心"插件"页即 `dsh plugin --profile web <pnpm args>` 的图形前端——`add / remove / update / outdated / ls / why`，安装声明了 `dsh.bundle` 的包会自动加入层叠。
- **任意命令**："查看合成配置"按钮运行 `dsh --profile web --dump-config`；也可在"插件"页输入任意参数透传执行。
- **WSL 终端**：一键打开落在工作目录的终端（Windows Terminal 优先），直接使用原生 dsh/pnpm。
- **Profiles**：切换或新建 profile 只需改"额外参数"（如 `--profile tui` 相关启动），一切遵循 dsh 原生语义。

## 常见问题

- **提示需要 WSL2**：按引导运行 `wsl --install -d Ubuntu`；已是 W1 的发行版用 `wsl --set-version <name> 2` 转换。
- **localhost 转发不通**：确认 `%USERPROFILE%\.wslconfig` 中未被禁用（默认启用）。应用会持续探测并给出日志。
- **公司网络 / 离线**：在设置里把镜像链换成内网源；或先在有网机器的 WSL 里装好 `~/.dsh-desktop` 后整体拷贝。
- **升级 dsh**：设置页把 dsh 版本改为目标版本（或保持 latest）→ "重新安装运行时（强制）"。

## License

MIT
