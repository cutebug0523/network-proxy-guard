# network-proxy-guard 使用说明

这套工具由 Agent 按 skill 的说明调用 CLI 工作，不是安装后就自动改机器。网络配置和 Claude 清理分别确认，默认先给 dry-run 计划，再决定是否执行。

## 1. 安装与更新 skill

使用 `npx network-proxy-guard@latest install --target agents` 可以把 skill 安装到 LEE 或通用 agents 目录，Claude Code 和 Codex 则分别使用 `claude`、`codex` 目标。安装器只复制文件，不会配置网络或清理 Claude，这样可以把“安装工具”和“授权改动机器”分开。更新时加 `--force` 会先备份旧版本，安装后需要重启对应 Agent 才能重新加载。

## 2. 查看功能和实测环境

`npx network-proxy-guard@latest --help` 用于列出全部 CLI 命令，`npx network-proxy-guard@latest reference` 用于查看最初的实测环境。实测环境是 LisaHost（丽萨主机）**美国4837基础版**（US-LAX-4837），明确标注出来是为了让读者知道结论从哪里来，而不是暗示其他商家也一定相同。其他 VPS 和套餐可以自行尝试，但端口、IP 历史、Google 地区判定和线路质量都要重新验证。

## 3. 自动配置 Clash Verge

`setup` 会从同一份 `node.json` 生成 VLESS Reality 配置，并在确认后写入、激活 Clash Verge 本地 profile。这样做是为了减少手工填写错误，同时保留已有订阅、混合端口和回滚备份。由于自动写入的是 Verge 内部文件而非官方稳定 CLI，所以必须先 dry-run、明确确认，并在 Verge 升级后重新验证。

```bash
network-proxy-guard setup --config ./node.json
network-proxy-guard setup --config ./node.json --yes
```

## 4. 只导出 YAML，走官方 UI 导入

`export-profile` 只生成普通 Mihomo YAML，不修改 Verge 的索引或应用设置。这样可以牺牲一点自动化，换取更好的版本兼容性和人工可控性，特别适合第一次试用或不希望工具直接改内部文件的人。导出的 YAML 同样包含节点凭据，不能公开上传或提交 Git。

```bash
network-proxy-guard export-profile --config ./node.json --output ./profile.yaml
```

## 5. Xray VLESS Reality 服务端配置指导

skill 提供服务端配置 runbook，覆盖端口分层排查、Reality 参数、SSH 防锁定、备份和端到端验收。它不鼓励照抄固定的 443、伪装域名或 BBR 参数，因为这些值在不同 VPS、线路和上游政策下表现不同。这样做是为了把“某一次跑通的配置”变成可验证的流程，而不是另一份可能误导人的万能教程。

## 6. 网络连通与分流诊断

`probe` 和诊断 runbook 会区分本机直连、显式代理、VPS 直连和外部探测，避免旧代理或 TUN 污染测试结论。敏感域名要放在 GeoIP 规则之前，并覆盖实际的 OAuth、API、WebSocket 和 JS SDK 域名，因为主域能打开并不代表完整业务可用。最终还要看 mihomo 的真实连接和命中规则，防止“看似走代理，实际意外 DIRECT”的情况；URL 展示也会去除凭据和敏感参数。

```bash
network-proxy-guard probe
network-proxy-guard probe --proxy http://127.0.0.1:7897
network-proxy-guard probe --offline
```

## 7. TUN、UDP 与 WebRTC 检查

TUN 相关说明会检查特权服务、核心版本、IPC、路由、DNS、UDP 和 WebRTC，而不是只看 `tun: true`。普通 HTTP/SOCKS 系统代理不一定接管 WebRTC UDP，所以只开系统代理仍可能暴露真实 IP。节点服务器的管理流量还应保持 DIRECT，避免 SSH 或 ping 绕进自己的隧道；开启 TUN 前也要接受它会影响所有应用和国内视频通话延迟。

## 8. Google 地区误判与 Lisa 工单

`google-region` 会强制检查 IPv4，并要求 VPS 直连出现 Google 香港跳转时，至少两个地理库对**同一个 IPv4**给出美国结果，才允许生成 Lisa 工单。这样做是为了避免把本机代理、浏览器 Cookie、账号地区或不同出口 IP 误当成商家问题。工单只写“可能影响”并包含禁止擅自重装、迁移的约束，而且只生成草稿，不会自动提交。

```bash
network-proxy-guard google-region --ssh-target user@example.com --ticket ./lisa-ticket.md
```

## 9. Claude Code、桌面版与 CC Switch 重置

`claude-reset` 会先列出 Claude 配置、历史、缓存、第三方切换工具和专用环境变量，确认后才移动到本地备份。它保留 Claude 程序、项目、共享 skills 和通用代理变量，因为目标是清除旧登录态和中转配置，而不是破坏仍可使用的软件与其他 Agent。大小写 `Skills` 和软链接也会受到保护；本地清理不等于撤销服务端 Token，备份也需要用户确认后自行删除。

```bash
network-proxy-guard claude-reset
network-proxy-guard claude-reset --yes
```

## 10. Shadowrocket 手机二维码

`qr` 和 `setup --qr-dir` 使用与电脑端相同的 `node.json`，生成 VLESS URI 和离线二维码，避免两套配置不一致。二维码不经过在线生成服务，这是为了防止完整节点凭据被第三方收集。二维码和链接本身就是敏感凭据，只能私人保存；Shadowrocket 的兼容性仍需按目标版本实测，其他客户端不能默认通用。

```bash
network-proxy-guard qr --config ./node.json --output ./mobile-qr
```

## 11. 确认、备份与验收

`setup` 和 `claude-reset` 的 `--yes` 相互独立，不能用一次“同意配置”覆盖清理、TUN 服务、VPS 变更或工单提交。这样设计是为了让高风险操作始终处在用户可见、可拒绝的范围内，而不是靠一长串默认授权。每次实际执行都要交代改了什么、备份在哪里、验证是否真正通过，以及还有哪些没有验证的风险。

## 推荐的完整使用顺序

1. 先说明具体目标，不要一句“把网络全弄好”就让工具执行所有模块。
2. 查看 dry-run、影响范围、备份和可能的中断，再决定是否确认。
3. 只执行当前需要的模块，Claude 清理、TUN 和 VPS 变更单独确认。
4. 配置后检查国外出口、国内 DIRECT、敏感域名、重启持久化和手机端是否一致。
5. 保留备份直到稳定运行，及时删除不再需要的节点链接、二维码和凭据备份。

## 工具不会承诺的事情

它不会保证某个 IP、端口、节点或套餐一定不会封号或被封，也不会把一次测速当成长期线路结论。它不会自动提交 Lisa 工单、自动卸载 Claude，或在未确认时修改现有环境。Shadowrocket、Clash Verge、Xray 和各家 VPS 都会变化，所以最终应以当前版本的实测结果为准。
