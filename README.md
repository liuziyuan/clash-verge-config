# clash-verge-config

Clash Verge Rev 的覆写配置仓库(macOS)。仓库文件通过 **symlink** 链接到应用配置目录,本仓库是唯一编辑入口,应用直接读取链接文件。

- 应用配置目录:`~/Library/Application Support/io.github.clash-verge-rev.clash-verge-rev/`
- 分流方案:Loyalsoldier/clash-rules 黑名单模式(国内直连、被墙走代理、`MATCH,PROXY` 漏网兜底)

## 追踪的文件(与配置目录同构)

| 仓库路径 | 指向(配置目录内) | 作用 |
|---|---|---|
| `profiles/Merge.yaml` | `profiles/Merge.yaml`(symlink) | 全局覆写:17 条黑名单规则链 + 12 个 Loyalsoldier rule-providers(jsDelivr CDN,经 PROXY 组拉取,24h 更新) |
| `profiles/g121H3lCtYp4.yaml` | 同名 symlink | SDKDNS 订阅专属「编辑代理组」覆写:prepend `PROXY` 组 |
| `profiles/rwwrvXpHF0G5.yaml` | 同名 symlink | SDKDNS 订阅专属「编辑规则」覆写(空模板) |
| `profiles/pqP2VQo6pSH0.yaml` | 同名 symlink | SDKDNS 订阅专属「编辑代理」覆写(空模板) |
| `profiles/mhITyZvPMAbR.yaml` | 同名 symlink | SDKDNS 订阅专属 merge 覆写(空模板) |
| `profiles/sRc4HDbP346A.js` / `Script.js` | 同名 symlink | 订阅专属/全局脚本覆写(空模板) |
| `dns_config.yaml` | 同名 symlink | DNS 覆写(fake-ip),UI「DNS 覆写」设置页读取 |
| `verge.yaml` | 同名 symlink | Verge 应用设置(端口/TUN/界面) |

## 明确不入库的文件(安全红线)

| 文件 | 原因 |
|---|---|
| `profiles/R9VmDmP4ShuE.yaml` | 订阅本体,含全部节点服务器/密码/UUID 凭证 |
| `profiles.yaml` | 含订阅 URL(本质是 token 凭证) |
| `clash-verge.yaml`、`config.yaml` | 运行时生成物(前者含节点凭证) |
| `*.mmdb`、`*.dat`、`cache.db`、`singleton-instance.*`、`logs/`、`service-logs/` | 自动下载数据与运行时状态 |

## 使用注意

- **改配置直接改本仓库文件**(或在 Verge UI 中编辑,UI 写入的也是 symlink 目标),改完在 Verge 中重新激活订阅生效。
- **verge 2.5.7 的坑**:全局 Merge 不支持 `prepend-proxy-groups` 等 `prepend-*` 特殊键(会被当作未知键透传进 runtime 而不生效);追加代理组必须走订阅专属 groups 覆写(`prepend/append/delete` 格式),普通字段覆盖(如 `rules:`、`rule-providers:`)正常生效。
- **新增订阅时**:订阅本体和 `profiles.yaml` 仍不入库;若要为新订阅加覆写,在配置目录 `profiles/` 下新建对应 uid 文件,再 `ln -s` 进本仓库。
- 内核为 root 服务模式,调试通道:`curl --unix-socket /var/run/clash-verge-service/users/501/verge-mihomo.sock http://localhost/rules`(另可 `/proxies`、`/connections`、`PUT /proxies/<组名>` 切节点)。

## 新机器恢复步骤

1. 安装 Clash Verge Rev,导入订阅(订阅 URL 自行保管,不入库);
2. `git clone` 本仓库到任意位置;
3. 删除应用自动生成的下列文件,改为 symlink(路径按实际 clone 位置调整):

```bash
conf="$HOME/Library/Application Support/io.github.clash-verge-rev.clash-verge-rev"
repo="<clone 位置>/clash-verge-config"
ln -sf "$repo/dns_config.yaml" "$conf/dns_config.yaml"
ln -sf "$repo/verge.yaml" "$conf/verge.yaml"
for f in Merge.yaml g121H3lCtYp4.yaml rwwrvXpHF0G5.yaml pqP2VQo6pSH0.yaml mhITyZvPMAbR.yaml sRc4HDbP346A.js Script.js; do
  ln -sf "$repo/profiles/$f" "$conf/profiles/$f"
done
```

4. 在 Verge UI 中重新激活订阅(覆写文件按 uid 关联到订阅)。
