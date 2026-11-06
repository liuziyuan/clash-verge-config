# clash-verge-config

Clash Verge Rev 的覆写配置仓库(macOS)。仓库文件通过 **symlink** 链接到应用配置目录,本仓库是唯一编辑入口,应用直接读取链接文件。

- 应用配置目录:`~/Library/Application Support/io.github.clash-verge-rev.clash-verge-rev/`
- 分流方案:Loyalsoldier/clash-rules 黑名单模式(国内直连、被墙走代理、`MATCH,PROXY` 漏网走代理兜底)

## 追踪的文件(与配置目录同构)

| 仓库路径 | 指向(配置目录内) | 作用 |
|---|---|---|
| `profiles/Merge.yaml` | `profiles/Merge.yaml`(symlink) | 全局覆写:36 条规则链(5 条 P&G 内网直连 + 4 条 GitHub/Copilot 代理例外 + 1 条 VS Code 进程直连 + 4 条国内应用进程直连 + 5 条 Teams 直连 + 17 条黑名单规则)+ 12 个 Loyalsoldier rule-providers(jsDelivr CDN,经 PROXY 组拉取,24h 更新) |
| `profiles/Script.js` | 同名 symlink | 全局脚本覆写:运行时自动注入 `PROXY` 统一选择组(动态收集订阅策略组作选项,任何订阅零配置生效,幂等防重复定义) |
| `dns_config.yaml` | 同名 symlink | DNS 覆写(fake-ip + 客户内网域名的 fake-ip 例外与 VPN DNS 策略)。**按订阅生效,当前订阅已开启** |
| `shell/proxy-leak.zsh` | `~/.zsh-proxy-leak.zsh`(symlink),`.zshrc` 中 source | `proxy-leak` 命令:按进程统计走代理的连接流量,定位国内应用"偷跑" |
| `verge.yaml` | **拷贝同步,非 symlink** | Verge 应用设置(端口/TUN/系统代理 bypass/界面)。Verge 退出/改设置时会用「替换文件」方式重写配置目录中的它,symlink 会被打断,故只能改完仓库后手动拷贝过去 |

## 明确不入库的文件(安全红线)

| 文件 | 原因 |
|---|---|
| `profiles/<订阅 uid>.yaml`(当前 `RGtTw3uKJGIT.yaml`) | 订阅本体,含全部节点服务器/密码/UUID 凭证。uid 随订阅重导变化,已在 `.gitignore` 中按模式忽略整个 `profiles/` |
| `profiles.yaml` | 含订阅 URL(本质是 token 凭证) |
| `clash-verge.yaml`、`config.yaml` | 运行时生成物(前者含节点凭证) |
| `*.mmdb`、`*.dat`、`cache.db`、`singleton-instance.*`、`logs/`、`service-logs/` | 自动下载数据与运行时状态 |

## 客户 VPN(Ivanti)内网分流

完整方案、实测数据、验证方法与已知坑见 **[VPN-LAN.md](VPN-LAN.md)**。

核心结论(细节以 VPN-LAN.md 为准):

- 客户内网**是公网地址段**(`10/8`、`131.190.x`、`137.176.0.0/15` 一带、`143.x`、`155.x`、`192.44.x` 等,约 130 条动态路由,2026-11-06 实测 129 条,出口 `utun5`),不是 RFC1918——所以 **TUN 路由排除方案不适用**(会误伤公网,且路由每次连接可能变化);
- 需要三层配合:系统代理 bypass + 规则链首 DIRECT + **DNS 层**(`dns_config.yaml` 的 `fake-ip-filter` 与 `nameserver-policy`);
- **`vpn.pg.com` 不能绑定 VPN DNS**,否则会造成"解析不了网关 → 连不上 VPN"的死锁;
- 验证不要用 `dig`(TUN 劫持 53 端口会给出超时假象),用 `curl -sv` 看实际连接 IP;mihomo 自身解析内网后缀当前也会超时,属已知现象。

新增客户后缀时三处同步追加:`verge.yaml` 的 `system_proxy_bypass`、`Merge.yaml` 的 `rules`、`dns_config.yaml` 的 `fake-ip-filter`(纯内网域还要加 `nameserver-policy`)。

## 使用注意

- **改配置直接改本仓库文件**(或在 Verge UI 中编辑:除 `verge.yaml` 外,UI 写入的都是 symlink 目标),改完在 Verge 中重新激活订阅生效;`verge.yaml` 是拷贝同步,UI 改动**不会回写仓库**,需手动同步回仓库。
- **Verge Merge 的坑(2.5.7 发现,当前 2.5.10 未复核)**:全局 Merge 不支持 `prepend-proxy-groups` 等 `prepend-*` 特殊键(会被当作未知键透传进 runtime 而不生效),普通字段覆盖(如 `rules:`、`rule-providers:`)正常生效。追加代理组走全局 Script.js 注入(2026-11-05 起;此前用订阅专属 groups 覆写 prepend,但换订阅后 uid 变化导致覆写失联、`PROXY` 缺失、配置校验失败,已废弃)。
- **新增订阅时**:零配置——`PROXY` 组由全局 Script.js 自动注入,导入订阅后重新激活即可。仅当确需订阅专属覆写时,才在配置目录 `profiles/` 下新建对应 uid 文件再 `ln -s` 进本仓库(注意 uid 随订阅重导而变,专属覆写易失联,能用全局方案就不用专属)。
- 内核为 root 服务模式,调试通道:`curl --unix-socket /var/run/clash-verge-service/users/501/verge-mihomo.sock http://localhost/rules`(另可 `/proxies`、`/connections`、`PUT /proxies/<组名>` 切节点)。

## 新机器恢复步骤

1. 安装 Clash Verge Rev,导入订阅(订阅 URL 自行保管,不入库);
2. `git clone` 本仓库到任意位置;
3. 删除应用自动生成的下列文件,改为 symlink(路径按实际 clone 位置调整):

```bash
conf="$HOME/Library/Application Support/io.github.clash-verge-rev.clash-verge-rev"
repo="<clone 位置>/clash-verge-config"
# verge.yaml 特殊:Verge 会重写该文件,symlink 必断,用拷贝同步
cp "$repo/verge.yaml" "$conf/verge.yaml"
ln -sf "$repo/dns_config.yaml" "$conf/dns_config.yaml"
ln -sf "$repo/shell/proxy-leak.zsh" "$HOME/.zsh-proxy-leak.zsh"   # proxy-leak 命令(.zshrc 中 source)
for f in Merge.yaml Script.js; do
  ln -sf "$repo/profiles/$f" "$conf/profiles/$f"
done
```

4. 在 Verge UI 中重新激活订阅(覆写文件按 uid 关联到订阅);**改过 verge.yaml 时需完全重启 Verge** 才会重读;
5. 按 [VPN-LAN.md](VPN-LAN.md) 的「新机器恢复 Checklist」开启 TUN 与 DNS 覆写(先断 VPN),并逐项验证内网/外网连通。`verge.yaml` 里的 `profile_dns_settings` 记录的是旧订阅 uid,拷贝后与当前订阅不匹配,须在 UI 中按当前订阅重新打开 DNS 覆写。
