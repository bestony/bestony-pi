# bestony-pi-preset

Bestony 的 [Pi](https://pi.dev) coding agent preset。

通过 Pi Package 打包并分发个人常用的 **extensions / skills / prompts / themes**，安装后即可在 Pi 中自动加载。

> **Security:** Pi packages 拥有完整系统权限。Extensions 可执行任意代码，skills 可指示模型执行任意操作。安装第三方包前请先审阅源码。

## 安装

```bash
# 从本地路径安装（开发中）
pi install /absolute/path/to/bestony-pi
pi install ./relative/path/to/bestony-pi

# 从 git 安装（发布后）
pi install git:github.com/bestony/bestony-pi
pi install https://github.com/bestony/bestony-pi

# 从 npm 安装（发布后）
pi install npm:bestony-pi-preset
```

仅当前会话试用（不写入 settings）：

```bash
pi -e /path/to/bestony-pi
pi -e git:github.com/bestony/bestony-pi
```

安装到项目级（写入 `.pi/settings.json`，可团队共享）：

```bash
pi install -l /path/to/bestony-pi
pi install -l npm:@quintinshaw/pi-dynamic-workflows
```

本仓库已配置项目级包：

| 包 | 说明 |
|----|------|
| [@quintinshaw/pi-dynamic-workflows](https://www.npmjs.com/package/@quintinshaw/pi-dynamic-workflows) | Claude Code 风格动态 workflow（`workflow` 工具、`/workflows` 等） |

克隆后在本目录执行 `pi install`（或打开 Pi 时会按 `.pi/settings.json` 自动安装依赖到 `.pi/npm/`）。

## 卸载 / 管理

```bash
pi remove npm:bestony-pi-preset   # 或对应 source
pi list
pi update --extensions
pi config                         # 启用/禁用具体资源
```

## 包结构

```
bestony-pi/
├── package.json          # pi manifest + pi-package keyword
├── README.md
├── extensions/           # .ts / .js 扩展
├── skills/               # SKILL.md 技能目录
├── prompts/              # .md 提示词模板
└── themes/               # .json 主题
```

`package.json` 中的 `pi` 字段声明资源路径：

```json
{
  "name": "bestony-pi-preset",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

路径相对于包根目录；数组支持 glob 与 `!exclusions`。

若省略 `pi` manifest，Pi 会从同名约定目录自动发现资源。

## 开发

1. 在对应目录添加资源：
   - `extensions/*.ts` — 扩展
   - `skills/<name>/SKILL.md` — 技能
   - `prompts/*.md` — 提示词
   - `themes/*.json` — 主题
2. 本地加载验证：

```bash
pi -e .
# 或
pi install .
```

3. 用 `pi config` 检查资源是否被加载。

### 依赖约定

- 运行时第三方依赖放在 `dependencies`（`pi install` 会执行 `npm install`）
- 若 import Pi 核心包，放入 `peerDependencies` 且版本为 `"*"`，不要打包：
  - `@earendil-works/pi-ai`
  - `@earendil-works/pi-agent-core`
  - `@earendil-works/pi-coding-agent`
  - `@earendil-works/pi-tui`
  - `typebox`

## 内置依赖（bundled pi packages）

安装本 preset 时会一并带上下列 Pi 包，并自动加载其 extensions / skills：

| 包 | 提供 |
|----|------|
| [pi-web-access](https://www.npmjs.com/package/pi-web-access) | Web 搜索 / URL 抓取 / GitHub / YouTube 等扩展 + librarian skill |
| [pi-init](https://www.npmjs.com/package/pi-init) | `init` skill（生成/更新 AGENTS.md） |
| [pi-xai](https://www.npmjs.com/package/pi-xai) | xAI Grok Build provider / Responses API |
| [pi-mcp-adapter](https://www.npmjs.com/package/pi-mcp-adapter) | MCP 协议适配扩展 |
| [pi-cache-optimizer](https://www.npmjs.com/package/pi-cache-optimizer) | Prompt/KV cache 命中优化 |
| [@tintinweb/pi-subagents](https://www.npmjs.com/package/@tintinweb/pi-subagents) | Claude Code 风格的自主 sub-agents |
| [@tintinweb/pi-tasks](https://www.npmjs.com/package/@tintinweb/pi-tasks) | Claude Code-style task tracking and coordination |

它们声明在 `dependencies` + `bundledDependencies` 中，资源通过 `pi.extensions` / `pi.skills` 的 `node_modules/...` 路径引用。

## 当前本地资源

| 类型 | 状态 |
|------|------|
| Extensions | 待添加（`./extensions`） |
| Skills | 待添加（`./skills`） |
| Prompts | 待添加（`./prompts`） |
| Themes | 待添加（`./themes`） |

## License

MIT
