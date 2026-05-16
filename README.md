# npmDesktopManager

<div align="center">

A cross-platform desktop dependency and plugin management system for npm, pip, Maven, Cargo, Gradle, and Go.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-42+-47848f.svg)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19+-61DAFB.svg)](https://react.dev/)
[![Ant Design](https://img.shields.io/badge/Ant%20Design-6+-1677ff.svg)](https://ant.design/)
[![Vite](https://img.shields.io/badge/Vite-8+-646cff.svg)](https://vite.dev/)

[English](#english) | [中文](#中文)

</div>

---

## English

### Overview

npmDesktopManager is evolving from a desktop npm manager into a full-stack, multi-language dependency and plugin management system. It now provides consistent workflows for JavaScript, Python, JVM, Rust, and Go projects through npm, pip, Maven, Cargo, Gradle, and Go module support.

The app focuses on project dependency management, global toolchain configuration, package search, publishing and release workflows, security audits, dependency graphs, terminal/log visibility, and componentized plugin management.

### Highlights

- **Six package managers**: npm, pip, Maven, Cargo, Gradle, and Go are available as first-class manager modules.
- **Unified switching**: manager pages share the same quick switch behavior for moving between npm, pip, Maven, Cargo, Gradle, and Go.
- **Global search**: the search page supports npm, PyPI, Maven, crates.io, Gradle/Maven Central, and Go/GitHub module discovery.
- **Project and global scopes**: manage project dependencies and global toolchain paths without mixing concerns.
- **Toolchain management**: configure global and project-specific executable paths for npm, pip/Python, Maven, Cargo, Gradle, and Go.
- **Plugin components**: plugin catalog and componentized manager extensions provide a foundation for broader ecosystem support.
- **Terminal and command logs**: integrated terminal, command history, clickable log entries, expandable details, and automatic terminal hiding when terminal and logs are both collapsed.
- **Localization**: English and Simplified Chinese UI text, Ant Design locale support, Electron menu localization, and first-run language selection.
- **Ant Design 6 compatibility**: updated UI props for current Ant Design APIs.

### Manager Capabilities

#### npm

- Search npm packages and inspect metadata, versions, README/changelog links, dependents, and package size.
- Manage project dependencies and global packages.
- Install, uninstall, update, batch update, and move dependencies between production and development scopes.
- Run project scripts and open project terminals.
- View project/global dependency trees.
- Run `npm audit` and audit fixes.
- Manage registry, cache, login, npm config, and published package metadata.

#### pip

- List, install, uninstall, update, and batch update packages in the current Python environment or user scope.
- Search PyPI packages with dynamic suggestions.
- Read, install, and export `requirements.txt`.
- Run `pip check`, dependency self-repair, `pip-audit`, and `pipdeptree`.
- Manage pip config scopes, cache, mirrors, custom index URLs, trusted hosts, and publishing credentials.
- Publish Python packages after optional build steps.

#### Maven

- Detect `pom.xml`, list dependencies, and show structured dependency trees.
- Add/remove dependencies with groupId/artifactId suggestions from the current project, local `.m2`, and Maven Central.
- Load available versions and switch dependency versions.
- Run common or custom Maven goals.
- Manage local repository location, mirrors, `settings.xml` backups, server credentials, and deploy repositories.
- Prepare offline dependencies, purge local repository cache, and run OWASP dependency-check audits.

#### Cargo

- Detect Rust projects through `Cargo.toml`.
- List runtime and development crates.
- Search crates.io and add/update/remove crate dependencies.
- Load crate versions and switch dependency versions.
- Run Cargo commands, show dependency trees, and run security audit workflows when available.

#### Gradle

- Detect Gradle build files and list dependencies by configuration.
- Search Maven Central compatible dependencies for Gradle usage.
- Add/update/remove Gradle dependencies and switch versions.
- Run Gradle tasks and custom arguments.
- Show dependency trees and dependency insight output.

#### Go

- Detect Go modules through `go.mod`.
- List direct and indirect modules.
- Search Go/GitHub modules, add/update/remove modules, and switch module versions.
- Run `go mod tidy`, custom Go commands, and module graph workflows.
- Run vulnerability checks when `govulncheck` is available.

#### Plugin Components

- Manage componentized manager extensions from a plugin catalog.
- Provide a shared surface for install, command execution, status, output, and manager-specific actions.
- Prepare the app for additional ecosystems beyond the built-in managers.

### Screenshots

The repository includes historical screenshots that can be updated as the UI evolves:

![Package management](image-1.png)
![Dependency analysis](image.png)
![Publishing](image-4.png)
![Settings](image-6.png)

### Tech Stack

- **Desktop**: Electron 42
- **Frontend**: React 19 + TypeScript 6
- **UI**: Ant Design 6 + CSS Modules
- **State**: Zustand 5
- **Build**: Vite 8 + vite-plugin-electron
- **Packaging**: electron-builder 26

### Installation & Development

```bash
git clone https://github.com/yixunfei/npmDesktopManager.git
cd npmDesktopManager
npm install
npm run dev
```

Optional icon generation:

```bash
npm run build:icons
```

### Build

```bash
# Production build and package for the current platform
npm run dist

# Windows
npm run build:win
npm run build:win-installer
npm run build:win-portable

# macOS
npm run build:mac
npm run build:mac-dmg
npm run build:mac-zip

# Linux
npm run build:linux
npm run build:linux-appimage
npm run build:linux-deb

# All configured platforms
npm run build:all
```

### Project Structure

```text
npmDesktopManager/
├─ build/                 # electron-builder resources and NSIS customization
├─ electron/              # Electron main process and backend services
│  ├─ main.ts             # Main process entry, IPC, window, menu, language bootstrap
│  ├─ preload.ts          # Secure renderer bridge
│  └─ services/           # npm, pip, Maven, Cargo, Gradle, Go, plugin, system, terminal, publish, toolchain services
├─ src/                   # React renderer
│  ├─ components/         # Layout, localization, package, manager switch, project path, toolchain UI
│  ├─ pages/              # Manager pages, search, plugins, global, publish, settings, tool versions
│  ├─ stores/             # Zustand state
│  ├─ styles/             # Global styles
│  ├─ types/              # Renderer global types
│  └─ i18n.ts             # UI dictionaries and runtime text localization
├─ scripts/               # Build, release, and icon scripts
├─ dist/                  # Renderer build output
├─ dist-electron/         # Electron build output
└─ release/               # Packaged application output
```

### Troubleshooting

- **Tool version unavailable**: check the global or project tool path in Tool Versions.
- **Windows command output is garbled**: command output is decoded with UTF-8/GB18030 scoring. Configure terminals and package managers to UTF-8 when possible.
- **pip audit tools are missing**: use the pip manager's audit/self-repair actions to install or repair `pip-audit` and `pipdeptree`.
- **Cargo audit is unavailable**: install `cargo-audit` in the Rust toolchain and retry the audit action.
- **Go vulnerability checking is unavailable**: install `govulncheck` and ensure it is available on PATH or in the configured Go environment.
- **Maven/Gradle search is slow**: local repository scanning depends on repository size. Remote results are merged with local and project dependencies.

### Contributing

Issues and pull requests are welcome.

1. Fork this repository.
2. Create a feature branch.
3. Run `npm run build` before submitting.
4. Open a pull request with a clear summary and verification notes.

### License

This project is licensed under the MIT License. See [LICENSE](LICENSE).

---

## 中文

### 简介

npmDesktopManager 正在从桌面 npm 管理器扩展为面向全栈、多语言、多场景的依赖与插件管理系统。当前已支持 npm、pip、Maven、Cargo、Gradle、Go 六类生态，覆盖 JavaScript、Python、JVM、Rust 与 Go 项目的常见依赖管理工作流。

应用重点提供项目依赖管理、全局工具链配置、包搜索、发布与发布前准备、安全审计、依赖树/模块图、终端与日志管理，以及组件化插件管理能力。

### 核心特性

- **六类管理器**：npm、pip、Maven、Cargo、Gradle、Go 均作为一级管理模块提供。
- **统一快速切换**：各管理页使用一致的页签切换行为，可在 npm、pip、Maven、Cargo、Gradle、Go 之间快速跳转。
- **全局搜索扩展**：搜索页支持 npm、PyPI、Maven、crates.io、Gradle/Maven Central、Go/GitHub 模块搜索。
- **项目与全局分层**：项目依赖、全局环境、工具链路径分开管理，减少不同项目之间互相影响。
- **工具链管理**：支持为 npm、pip/Python、Maven、Cargo、Gradle、Go 配置全局路径与项目级覆盖。
- **插件组件化**：插件目录与组件化管理页为更多生态扩展提供基础。
- **终端与日志体验**：集成交互式终端、命令历史、可点击日志条目、自动展开详情，以及终端和日志都折叠时自动隐藏面板。
- **多语言文本**：支持英文与简体中文界面、Ant Design 组件语言、Electron 菜单本地化和首次启动语言选择。
- **Ant Design 6 兼容**：已更新为当前 Ant Design 6 推荐 API。

### 管理能力

#### npm

- 搜索 npm 包并查看详情、版本、README/变更入口、被依赖数量和包体积。
- 管理项目依赖与全局包。
- 安装、卸载、更新、批量更新，以及在生产依赖和开发依赖之间移动。
- 运行项目脚本并打开项目终端。
- 查看项目/全局依赖树。
- 执行 `npm audit` 和自动修复。
- 管理 registry、缓存、登录、npm config 和已发布包信息。

#### pip

- 在当前 Python 环境或用户范围列出、安装、卸载、升级和批量升级包。
- 搜索 PyPI 包并显示动态建议。
- 读取、安装和导出 `requirements.txt`。
- 执行 `pip check`、依赖自修复、`pip-audit` 和 `pipdeptree`。
- 管理 pip 配置作用域、缓存、镜像源、自定义 index URL、trusted host 和发布凭据。
- 支持构建后发布 Python 包。

#### Maven

- 识别 `pom.xml`，列出依赖并结构化展示依赖树。
- 基于当前项目、本地 `.m2` 仓库和 Maven Central 提供 groupId/artifactId 建议。
- 获取可用版本并切换依赖版本。
- 执行常用或自定义 Maven goal。
- 管理本地仓库、镜像、`settings.xml` 备份、server 凭据和 deploy 仓库。
- 支持离线依赖准备、本地仓库缓存清理和 OWASP dependency-check 安全审计。

#### Cargo

- 通过 `Cargo.toml` 识别 Rust 项目。
- 列出运行时与开发 crates。
- 搜索 crates.io，添加、更新、移除 crate 依赖。
- 加载 crate 版本并切换依赖版本。
- 运行 Cargo 命令、查看依赖树，并在工具可用时执行安全审计。

#### Gradle

- 识别 Gradle 构建文件，并按 configuration 列出依赖。
- 搜索 Maven Central 兼容依赖，用于 Gradle 项目。
- 添加、更新、移除 Gradle 依赖并切换版本。
- 运行 Gradle task 或自定义参数。
- 查看依赖树与 dependency insight 输出。

#### Go

- 通过 `go.mod` 识别 Go module。
- 列出直接与间接模块。
- 搜索 Go/GitHub 模块，添加、更新、移除模块并切换版本。
- 运行 `go mod tidy`、自定义 Go 命令和模块图工作流。
- 在 `govulncheck` 可用时执行漏洞检查。

#### 插件组件

- 基于插件目录管理组件化管理器扩展。
- 提供安装、命令执行、状态、输出和管理器专属动作的统一界面。
- 为内置管理器之外的更多生态扩展预留能力。

### 截图

仓库中保留了历史截图，可随着 UI 演进继续更新：

![包管理](image-1.png)
![依赖分析](image.png)
![发布](image-4.png)
![设置](image-6.png)

### 技术栈

- **桌面**：Electron 42
- **前端**：React 19 + TypeScript 6
- **UI**：Ant Design 6 + CSS Modules
- **状态管理**：Zustand 5
- **构建**：Vite 8 + vite-plugin-electron
- **打包**：electron-builder 26

### 安装与开发

```bash
git clone https://github.com/yixunfei/npmDesktopManager.git
cd npmDesktopManager
npm install
npm run dev
```

可选图标生成：

```bash
npm run build:icons
```

### 构建

```bash
# 当前平台生产构建并打包
npm run dist

# Windows
npm run build:win
npm run build:win-installer
npm run build:win-portable

# macOS
npm run build:mac
npm run build:mac-dmg
npm run build:mac-zip

# Linux
npm run build:linux
npm run build:linux-appimage
npm run build:linux-deb

# 所有配置平台
npm run build:all
```

### 项目结构

```text
npmDesktopManager/
├─ build/                 # electron-builder 资源与 NSIS 自定义脚本
├─ electron/              # Electron 主进程与后端服务
│  ├─ main.ts             # 主进程入口、IPC、窗口、菜单和语言初始化
│  ├─ preload.ts          # 安全的渲染进程桥接
│  └─ services/           # npm、pip、Maven、Cargo、Gradle、Go、插件、系统、终端、发布、工具链服务
├─ src/                   # React 渲染进程
│  ├─ components/         # 布局、本地化、包管理、管理器切换、项目路径、工具链组件
│  ├─ pages/              # 管理页、搜索、插件、全局、发布、设置、工具版本页面
│  ├─ stores/             # Zustand 状态
│  ├─ styles/             # 全局样式
│  ├─ types/              # 渲染进程类型
│  └─ i18n.ts             # 词典和运行时文本本地化
├─ scripts/               # 构建、发布和图标脚本
├─ dist/                  # 渲染进程构建产物
├─ dist-electron/         # Electron 构建产物
└─ release/               # 应用打包输出
```

### 常见问题

- **工具版本不可用**：检查“工具版本”中的全局路径或项目级路径。
- **Windows 命令输出乱码**：程序会识别 UTF-8/GB18030 输出。建议终端和包管理器尽量配置为 UTF-8。
- **pip 审计工具缺失**：使用 pip 管理中的审计或自修复功能安装/修复 `pip-audit` 和 `pipdeptree`。
- **Cargo 审计不可用**：安装 `cargo-audit` 后重试安全审计。
- **Go 漏洞检查不可用**：安装 `govulncheck`，并确保它在 PATH 或配置的 Go 环境中可用。
- **Maven/Gradle 搜索较慢**：本地仓库扫描速度取决于仓库体积；远程结果会与本地和项目依赖合并。

### 贡献

欢迎提交 Issue 和 Pull Request。

1. Fork 本仓库。
2. 创建功能分支。
3. 提交前运行 `npm run build`。
4. 在 Pull Request 中说明变更内容和验证方式。

### 许可证

本项目使用 MIT 许可证，详见 [LICENSE](LICENSE)。
