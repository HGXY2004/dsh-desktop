# DSH Desktop 1.0.1 — dsh ≥ 0.1.5 兼容性修复 / compatibility fix

## 修复内容 / What's fixed

### 1. 附属主窗口 401 / 白屏（核心修复）
dsh 0.1.5 引入了**进程级浏览器启动令牌鉴权**：就绪行从
`dsh web: http://127.0.0.1:<port>` 变为 `dsh web: http://127.0.0.1:<port>/?token=<令牌>`，
且无令牌请求一律返回 401（`dsh web authentication required`）。

1.0.0 的 `server.js` 只截取端口号拼出**无令牌 URL** 交给主窗口 → 窗口永远是 401；
同时 dsh 默认 `openBrowser: true` 自动用带令牌 URL 弹开系统浏览器 → 呈现「WebUI 仅浏览器可用」的假象。

现在应用捕获**完整带令牌 URL**，主窗口首次加载即完成鉴权（令牌经 303 换签名 cookie）。

The attached window showed a 401 page because the app discarded the new
launch-token query from the ready line. It now captures the full
authenticated URL; the main window authenticates on first load.

### 2. 不再自动弹系统浏览器
启动 `dsh web` 时追加 `--no-open`（桌面窗口才是主界面）。
如需恢复旧行为：控制中心 → 设置 → `extraArgs` 填 `--open`。

### 3. 插件管理按钮修复（「版本更新与插件更新冲突报错」的根源）
控制中心的 ls / outdated / update / add 原先走 `dsh --profile web <参数>` 旧语法；
新 CLI 下这会**再启动一个 web 实例**并撞上插件独占锁
（`task-board ledger is already owned by process <pid>`）。
现改用官方新语法 `dsh plugin --profile web <pnpm 参数>`（在 profile 目录内转发 pnpm 并自动对账 bundles 清单）。

### 4. 窗口重载逻辑
按 origin 比较窗口 URL（令牌换 cookie 后地址会变干净）；
服务器每次重启（端口/令牌轮换）强制重载，避免旧令牌残留。

## 安装（原地补丁，无需重装整个应用）/ Install (in-place patch)

前提：已安装 DSH Desktop 1.0.0（`C:\Program Files\DSH Desktop`），WSL2 内 dsh ≥ 0.1.5。

1. 解压本压缩包
2. 双击 `install-patch.bat`，UAC 弹窗点「是」（仅一次）
3. 脚本自动完成：退出应用 → 停止 WSL 内旧服务器 → 备份 `resources\app.asar` 为 `app.asar.bak-1.0.0`（仅首次）→ 安装新 `app.asar` → 询问是否立即启动

⚠️ 安装瞬间 WebUI 会话服务器会终止；会话已持久化，重启后在历史会话中继续即可。

**回滚 / Rollback**：把 `app.asar.bak-1.0.0` 复制回 `app.asar`。

## 文件清单 / Contents

| 文件 | 说明 |
| --- | --- |
| `app-1.0.1.asar` | 补丁后的应用主体（替换 `resources\app.asar`） |
| `install-patch.ps1` | 自提权安装脚本（可单独用 PowerShell 运行） |
| `install-patch.bat` | 双击入口 |
| `PATCH-NOTES.md` | 本说明 |

完整 NSIS 安装包本版本未重新构建；asar 原地补丁对 1.0.0 安装完全等效。
