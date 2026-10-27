# network-proxy-guard

[![MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/network-proxy-guard.svg)](https://www.npmjs.com/package/network-proxy-guard)

一个可分享的 macOS 网络代理 Agent Skill 与命令行工具：确认后自动配置 Clash Verge Rev/mihomo，诊断 Xray VLESS Reality、分流/TUN/WebRTC 问题，检测 Google 对美国 IP 的地区误判，生成 Lisa 工单草稿、Claude 本机重置计划，以及 Shadowrocket 离线二维码。

**安装不会配置网络，也不会清理 Claude。** 配置和清理分别默认 dry-run，必须明确使用 `--yes` 才会执行。

## 实测参考环境（非强制）

这套工具的最初实测环境是：

- **VPS 商家**：LisaHost（丽萨主机）
- **套餐**：**美国4837基础版**（`US-LAX-4837`，洛杉矶）
- **服务端**：Xray + VLESS Reality + XTLS Vision
- **客户端**：Clash Verge Rev / mihomo、Shadowrocket

Lisa 不是必选商家，其他 VPS 和套餐可以自行尝试。不同商家的上游端口政策、IP 历史、Google 地区判定和国际线路表现可能不同，不能默认复现同样的结果；尤其不要把这里的 4837 实测经验直接套到 9929、CN2 GIA 或其他线路上。

## 快速开始

### 安装 skill

LEE / 通用 agents：

```bash
npx network-proxy-guard@latest install --target agents
```

Claude Code / Codex：

```bash
npx network-proxy-guard@latest install --target claude
npx network-proxy-guard@latest install --target codex
```

安装后重启对应 Agent。更新已安装 skill 时，`install --force` 会先保留旧目录备份，不会直接删除。

也可以先全局安装命令，再安装 skill：

```bash
npm install -g network-proxy-guard
network-proxy-guard install --target agents
```

### 查看全部功能和完整流程

完整中文说明见 **[GUIDE.md](GUIDE.md)**：每项功能都解释“做什么”和“为什么这样做”。

直接列出 CLI 命令和实测参考环境：

```bash
npx network-proxy-guard@latest --help
npx network-proxy-guard@latest reference
```

安装 skill 后，也可以在 Agent 中直接输入：

> 列出 network-proxy-guard 的全部功能、完整使用流程和安全确认步骤。

## 功能

- Clash Verge：保留旧配置、备份、生成并激活 VLESS Reality 本地配置、规则模式、关闭 PAC 直连兜底
- 分流诊断：区分直连/显式代理/VPS 直连，检查 AI、Google、Stripe 等域名的实际路径
- Google 地区检测：VPS 直连证据 + 多地理库交叉验证，证据足够才生成工单草稿
- Claude 重置：独立确认，清理常见 Claude Code/Desktop/CC Switch 配置，保留程序与共享 skills
- 手机交付：同一份节点配置生成 VLESS 链接与本地二维码，不调用在线二维码服务
- Xray 服务端：提供带确认、备份、验证的 Reality 配置 runbook，不盲目复制固定端口或伪装域名

## 环境

- macOS（自动 Clash Verge 配置）
- Node.js 18+
- Clash Verge Rev / mihomo（仅客户端配置需要）
- VPS 直连检测需要已有 SSH 密钥登录；不会询问或保存 SSH 密码

## 使用

先复制示例并填入自己的节点。**真实 `node.json`、导出的 profile YAML、VLESS 链接和二维码都不要提交 Git 或上传。**

```bash
cp "$(npm root -g)/network-proxy-guard/skill/network-proxy-guard/assets/node.example.json" ./node.json
# 如果是 npx 安装，也可从已安装 skill 的 assets/ 目录复制。
```

### 1. 自动配置：先计划，确认后执行

如果不想让工具写 Clash Verge 的内部索引，可以只导出 YAML，再用官方 UI 导入：

```bash
network-proxy-guard export-profile --config ./node.json --output ./profile.yaml
```

自动配置流程：

```bash
network-proxy-guard setup --config ./node.json
# 检查 dry-run 输出后：
network-proxy-guard setup --config ./node.json --yes
```

Clash Verge 正在运行时，默认停止执行。只有明确允许关闭并重启应用时才加 `--restart`。TUN 默认保持原状；`--enable-tun` 只修改偏好，不会自动安装管理员服务。

备份位于 `~/.network-proxy-guard/backups/`。没有 mihomo 核心时只能做 YAML 验证，输出会明确标注，不能冒充完整验证。自动 `setup` 写入的是 Verge 内部文件，不是官方稳定 CLI；升级 Verge 后需要重新校验，介意时可改用上面的 `export-profile` 加官方 UI。

### 2. 生成手机二维码

```bash
network-proxy-guard qr --config ./node.json --output ./mobile-qr
# 或在已确认的 setup 中同时生成：
network-proxy-guard setup --config ./node.json --yes --qr-dir ./mobile-qr
```

二维码内容是完整 VLESS URI，等同于节点凭据。文件权限设为仅当前用户可读；不要上传、提交或公开发送。Shadowrocket 需使用支持 VLESS Reality 的版本，其他 App 不保证兼容。

### 3. 只读网络诊断

```bash
network-proxy-guard probe
network-proxy-guard probe --proxy http://127.0.0.1:7897
network-proxy-guard probe --offline
```

### 4. Google 地区误判与 Lisa 工单

```bash
# 本机结果，仅供初筛
network-proxy-guard google-region

# VPS 直连结果；证据符合时生成工单草稿
network-proxy-guard google-region \
  --ssh-target user@example.com \
  --identity-file ~/.ssh/id_ed25519 \
  --ticket ./lisa-ticket.md
```

只生成本地草稿，绝不自动提交。IP 更换可能伴随宿主机、SSH key、安全组变化；必须先向商家确认，不可直接授权重装或迁移。

### 5. Claude 本机重置

```bash
network-proxy-guard claude-reset
# 逐项检查 dry-run，单独确认后：
network-proxy-guard claude-reset --yes
```

重置会移动常见 Claude Code/Desktop/CC Switch 数据到本地备份，并清理 Claude 专用环境变量。它保留 Claude 程序、项目、`~/.claude/skills`、`~/.agents`、`~/.codex` 和通用代理变量。它不执行卸载，也不撤销服务端 Token；备份仍需用户确认后自行删除。

## Agent 中直接使用

安装 skill 后，可以这样提问：

- “帮我配置这个节点，先给我计划，别动其他订阅。”
- “检查 Stripe/Claude 是否意外走 DIRECT。”
- “Lisa 的美国 IP 被 Google 判香港，先做 VPS 直连检测，证据够再写工单。”
- “单独清理 Claude 和 CC Switch 配置，但保留程序和共享 skills。”
- “用同一个节点配置生成 Shadowrocket 二维码，不要走在线服务。”

## 开发与测试

```bash
npm install
npm test
npm run pack:check
```

测试全部使用临时目录和虚拟配置，不连接 VPS、不修改真实 Clash/Claude 环境。`evals/evals.json` 提供 Agent 行为测试提示。

## License

MIT © 2026 cutebug0523
