# clash-verge-config

Clash Verge Rev 的覆写配置仓库(macOS)。仓库文件通过 **symlink** 链接到应用配置目录,本仓库是唯一编辑入口,应用直接读取链接文件。

- 应用配置目录:`~/Library/Application Support/io.github.clash-verge-rev.clash-verge-rev/`
- 分流方案:Loyalsoldier/clash-rules 黑名单模式(国内直连、被墙走代理、`MATCH,PROXY` 漏网走代理兜底)

## 追踪的文件(与配置目录同构)

| 仓库路径 | 指向(配置目录内) | 作用 |
|---|---|---|
| `profiles/Merge.yaml` | `profiles/Merge.yaml`(symlink) | 全局覆写:36 条规则链(5 条 P&G 内网直连 + 4 条 GitHub/Copilot 代理例外 + 1 条 VS Code 进程直连 + 4 条国内应用进程直连 + 5 条 Teams 直连 + 17 条黑名单规则)+ 12 个 Loyalsoldier rule-providers(jsDelivr CDN,经 PROXY 组拉取,24h 更新) |
| `profiles/Script.js` | 同名 symlink | 全局脚本覆写:运行时自动注入 `PROXY` 统一选择组(动态收集订阅策略组作选项,任何订阅零配置生效,幂等防重复定义) |
| `dns_config.yaml` | 同名 symlink | DNS 覆写(fake-ip),UI「DNS 覆写」设置页读取 |
| `shell/proxy-leak.zsh` | `~/.zsh-proxy-leak.zsh`(symlink),`.zshrc` 中 source | `proxy-leak` 命令:按进程统计走代理的连接流量,定位国内应用"偷跑" |
| `verge.yaml` | **拷贝同步,非 symlink** | Verge 应用设置(端口/TUN/系统代理 bypass/界面)。Verge 退出/改设置时会用「替换文件」方式重写配置目录中的它,symlink 会被打断,故只能改完仓库后手动拷贝过去 |

## 明确不入库的文件(安全红线)

| 文件 | 原因 |
|---|---|
| `profiles/R9VmDmP4ShuE.yaml` | 订阅本体,含全部节点服务器/密码/UUID 凭证 |
| `profiles.yaml` | 含订阅 URL(本质是 token 凭证) |
| `clash-verge.yaml`、`config.yaml` | 运行时生成物(前者含节点凭证) |
| `*.mmdb`、`*.dat`、`cache.db`、`singleton-instance.*`、`logs/`、`service-logs/` | 自动下载数据与运行时状态 |

## 客户 VPN 内网域名清单(与 Ivanti Secure 共存的关键配置)

工作中需同时使用客户 VPN(Ivanti Secure)。客户内网域名**必须绕开 mihomo**:TUN 的 `auto-detect-interface` 会把 mihomo 出站绑到默认物理网卡,内网 IP(10/8)经它发出不可达。两处配置需保持同步:

1. `verge.yaml` → `system_proxy_bypass`:域名通配,逗号分隔(sysproxy 仅按逗号拆分),浏览器不走 7897,由系统 DNS(VPN 下发)+ 路由(utun5)直达;
2. `profiles/Merge.yaml` → `rules:` 链首 `DOMAIN-SUFFIX,...,DIRECT`:兜底防误入 PROXY。

| 后缀 | 说明 |
|---|---|
| `cn-pgcloud.com` | 内网开发平台(github/jenkins/nexus/rancher/nezha 等) |
| `pg.com.cn` | 公司内部系统(confluence/jira 等,含公网部署的阿里云系统) |
| `cn-x-cloud-pg.com.cn` | 合作方云平台(grafana/kibana/skywalking 等) |
| `cn-xnp-cloud-pg.com.cn` | 合作方云平台(job-admin/rancher 等) |
| `pg.com` | vpn.pg.com(VPN 网关,必须 DIRECT 防止绕道代理被风控)+ search domain 系 |

新增客户/后缀时两处同步追加,先在 VPN 在线时用 `dscacheutil -q host -a name <域名>` 确认公司 DNS 能解析出真实 IP(非 198.18.x fake-ip)再加。裸 IP(10.x、192.168.x)无需配置,默认 bypass 的 CIDR 对字面 IP 生效。

已知限制:显式强制走 mihomo(`curl -x 127.0.0.1:7897`)的内网流量仍不可达,这是 macOS TUN 防环(出站绑 en0)与 VPN 路由共存的固有限制;断 VPN 时 bypass 域名解析落到 fake-ip,站点不可达属预期。

## 使用注意

- **改配置直接改本仓库文件**(或在 Verge UI 中编辑,UI 写入的也是 symlink 目标),改完在 Verge 中重新激活订阅生效。
- **verge 2.5.7 的坑**:全局 Merge 不支持 `prepend-proxy-groups` 等 `prepend-*` 特殊键(会被当作未知键透传进 runtime 而不生效),普通字段覆盖(如 `rules:`、`rule-providers:`)正常生效。追加代理组走全局 Script.js 注入(2026-11-05 起;此前用订阅专属 groups 覆写 prepend,但换订阅后 uid 变化导致覆写失联、`PROXY` 缺失、配置校验失败,已废弃)。
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

4. 在 Verge UI 中重新激活订阅(覆写文件按 uid 关联到订阅);**改过 verge.yaml 时需完全重启 Verge** 才会重读。
