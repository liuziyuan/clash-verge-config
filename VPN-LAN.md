# 客户 VPN(Ivanti Secure)内网分流配置

本文记录 Clash Verge Rev(TUN 模式)与客户 Ivanti Secure VPN 共存时的完整方案与验证结论。
**最近复核:2026-11-06(集成完成、状态稳定)**,实测环境:mihomo v1.19.33 / Clash Verge Rev 2.5.10 / macOS。

> 换电脑或重装系统后按本文操作即可,不依赖任何会话记忆。

---

## 一、环境事实(2026-11-06 复核;动态项以命令为准)

| 项目 | 实际值 |
|---|---|
| VPN 虚拟网卡 | `utun5`(编号可能随重启变化),本机地址与网关相同、由 Ivanti 每次动态分配(2026-11-06 为 `143.36.67.54`),MTU 本次 `1350`(可能随下发变化) |
| VPN DNS | `192.44.212.206`、`192.44.120.10` |
| 搜索域 | `pg.com`、`ap.pg.com`、`na.pg.com`、`cn.pg.com`、`la.pg.com`、`eu.pg.com`、`gnet.gillette.com`、`network.pg.com` |
| 默认路由 | 仍在物理网卡 `en0`(分流模式,非全隧道) |
| Clash TUN 网卡 | `utun4`,地址 `198.18.0.1` |

**VPN 下发的路由约 130 条**(2026-11-06 实测 129 条,每次连接可能变化),覆盖 `10.0.0.0/8`、`131.190.x`、`137.176.0.0/15` 一带、`143.x` 大量细分段、`155.x`、`192.44.x` 等,**全部是公网地址段**,不是 RFC1918 私有网段。

这是本方案最容易误判的一点。

---

## 二、方案:三层保护

内网流量有两个入口,必须分别处理:

| 入口 | 保护方式 | 配置文件 |
|---|---|---|
| 浏览器(走系统代理 → mihomo) | 系统代理 bypass 清单 | `verge.yaml` → `system_proxy_bypass` |
| 规则兜底(任何入口) | 规则链首 `DOMAIN-SUFFIX,...,DIRECT` | `profiles/Merge.yaml` → `rules:` |
| **DNS(核心)** | fake-ip 例外 + 指定 VPN DNS | `dns_config.yaml` |

### 2.1 系统代理 bypass

`verge.yaml`:

```yaml
use_default_bypass: true
system_proxy_bypass: "*.cn-pgcloud.com,*.pg.com.cn,*.cn-x-cloud-pg.com.cn,*.cn-xnp-cloud-pg.com.cn,*.pg.com"
```

逗号分隔(sysproxy 仅按逗号拆分),与默认 bypass 自动合并。

### 2.2 规则链首 DIRECT

`profiles/Merge.yaml` 的 `rules:` 最前面:

```yaml
- DOMAIN-SUFFIX,cn-pgcloud.com,DIRECT
- DOMAIN-SUFFIX,pg.com.cn,DIRECT
- DOMAIN-SUFFIX,cn-x-cloud-pg.com.cn,DIRECT
- DOMAIN-SUFFIX,cn-xnp-cloud-pg.com.cn,DIRECT
- DOMAIN-SUFFIX,pg.com,DIRECT
```

作用:保证任何入口都不会把这些域名送进代理节点。内网 IP 经代理不可达,`vpn.pg.com` 绕道代理还有被风控踢线的风险。

### 2.3 DNS(防 fake-ip 改写;实际解析依赖系统 DNS)

`dns_config.yaml` 通过 Verge「Clash 设置 → DNS 覆写」启用,**按订阅生效**,状态记录在 `verge.yaml` 的 `profile_dns_settings.<uid>.enabled`(当前订阅已开启,配置已合入运行时)。

```yaml
dns:
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  fake-ip-filter:
    # 客户内网域名:必须返回真实 IP,禁止被改写为 198.18.x.x
    - '+.cn-pgcloud.com'
    - '+.pg.com.cn'
    - '+.cn-x-cloud-pg.com.cn'
    - '+.cn-xnp-cloud-pg.com.cn'
    - '+.pg.com'
  nameserver-policy:
    # 纯内网后缀固定交给 VPN DNS;pg.com 不配(见下方死锁说明)
    '+.cn-pgcloud.com':
      - 192.44.212.206
      - 192.44.120.10
    '+.pg.com.cn':
      - 192.44.212.206
      - 192.44.120.10
    '+.cn-x-cloud-pg.com.cn':
      - 192.44.212.206
      - 192.44.120.10
    '+.cn-xnp-cloud-pg.com.cn':
      - 192.44.212.206
      - 192.44.120.10
```

**为什么必须有 fake-ip 例外**:不加的话,经 TUN 的内网域名会被解析成 `198.18.x.x` 假地址,流量被拽进 Clash 的 TUN,再由 mihomo 还原真实域名重新解析。还原链一断(缓存、超时、DNS 抖动),表现就是内网站点"时通时不通"——这是最初"感觉很玄幻"的核心原因。

> 2026-11-06 复核补充:浏览器走系统代理 bypass,不经过 mihomo DNS,实际解析由系统解析器直连 VPN DNS 完成;mihomo 自身向 VPN DNS 的查询当前会超时(见 3.3)。因此 `fake-ip-filter` 仍有意义(防经 TUN 的流量被改写成假地址),但 `nameserver-policy` 目前查不通,内网访问不依赖它。

---

## 三、三个必须知道的坑

### 3.1 不要做"路由排除"

内网是公网地址段,`tun.route-exclude-address` 若按 RFC1918 配置会误伤真实公网;若逐条列约 130 条路由,每次 VPN 连接可能变化,维护不现实。

**实际也不需要**:VPN 路由的前缀(`/15`、`/14`、`/18` 等)比 TUN 的 `0.0.0.0/1` 更具体,macOS 路由表本身就会把内网流量导向 `utun5`。用 `route -n get <内网IP>` 可验证 `interface: utun5`。

### 3.2 `vpn.pg.com` 绝对不能绑定 VPN DNS(死锁)

`vpn.pg.com` 是 **VPN 网关域名**,连接 VPN 之前必须先靠公网 DNS 解析出入口地址。若把它写进 `nameserver-policy` 指向 `192.44.x`,而 `192.44.x` 只有连上 VPN 才可达,就会形成死锁:**解析不了网关 → 连不上 VPN → DNS 永远不可达**。

实测公网 DNS 解析 `vpn.pg.com` 返回 `155.124.244.54`,与 VPN 内部 DNS 返回一致,所以交给公网解析完全够用。

因此 `nameserver-policy` 里只放四个纯内网后缀,`pg.com` 不配策略;`+.pg.com` 只保留在 `fake-ip-filter` 里(保证返回真实 IP)。

### 3.3 DNS 验证工具的假故障(mihomo 自身也会超时)

TUN 的 `dns-hijack: any:53` 会拦截 53 端口查询,用 `dig` 查内网域名会超时,这不代表内网访问失败。2026-11-06 复核还发现:**mihomo 自身向 `192.44.x` 查询内网域名同样返回 `context deadline exceeded`**,即 `nameserver-policy` 目前查不通;真正可用的是系统解析器(直连 VPN DNS,经 `utun5` 解析)。

**正确验证方式**:

```bash
# 看实际连接到的 IP(内网域名应为 10.x / 192.44.x 等真实地址,而非 198.18.x)
curl -sv -o /dev/null --max-time 10 https://qa-rancher.cn-pgcloud.com 2>&1 | grep "Connected to"

# 看路由出口
route -n get 10.126.23.9
```

另外**不要用已下线域名做测试**(如 `jenkins.cn-pgcloud.com` 已下线),会误判成 DNS 故障。用收藏夹里确定在用的域名。

---

## 四、DNS 覆写开关的操作顺序(集成期经验)

> 配置已完成、运行稳定的机器无需重复本节操作;换机或重装时按此顺序执行。

打开「DNS 覆写」会触发**整套网络配置重载**:重新生成配置 → 重载内核 → 重写系统网络设置。

Verge 的安全流程是**先关系统代理,等内核就绪后再恢复**,避免代理指向尚未就绪的端口造成全局断网。

如果此时 Ivanti 同时在改写系统网络设置,可能冲突:

- 日志出现 `set system dns failed: exit code 1`;
- 流程中断,**系统代理停在关闭状态**;
- 之后任意网络事件(如断开 VPN)会触发重新同步,代理又自动开启。

**建议操作顺序**:先断开 VPN → 开启 DNS 覆写并等稳定 → 再连 VPN。

---

## 五、新机器 / 重装系统恢复 Checklist

1. 安装 Clash Verge Rev,导入订阅;
2. `git clone` 本仓库,按 README「新机器恢复步骤」建好 symlink;
3. Verge「Clash 设置 → 开启 TUN」;
4. Verge「Clash 设置 → DNS 覆写」,**先断开 VPN**,打开开关;
5. 确认代理模式为规则模式,系统代理开关保持开启;
6. 连上 VPN,按下面命令验证。

### 验证清单

```bash
# 1. 内网域名应连到真实内网 IP(10.x / 192.44.x 等),不是 198.18.x
curl -sv -o /dev/null --max-time 10 https://qa-rancher.cn-pgcloud.com 2>&1 | grep "Connected to"

# 2. 内网 IP 的出口必须是 utun5
route -n get 10.126.23.9

# 3. 外网正常
curl -s -o /dev/null -w "%{http_code}\n" --max-time 10 https://www.baidu.com
curl -s -o /dev/null -w "%{http_code}\n" --max-time 10 https://github.com

# 4. VPN 网关可解析(连 VPN 前也要能解析;dig 会因 TUN 劫持超时,改用 mihomo DNS 接口)
curl -s --unix-socket /var/run/clash-verge-service/users/$(id -u)/verge-mihomo.sock \
  "http://localhost/dns/query?name=vpn.pg.com&type=A"

# 5. 公网 PG 官网正常(VPN 断开时也应正常)
curl -s -o /dev/null -w "%{http_code}\n" --max-time 10 https://www.pg.com
```

期望结果:`qa-rancher` 返回 200 且连接 IP 为 `10.125.x.x` 一类内网地址;`route` 显示 `interface: utun5`;外网 200;mihomo DNS 接口对 `vpn.pg.com` 返回 `155.124.244.54`;`www.pg.com` 301。

---

## 六、已知限制

- 显式强制走 mihomo(`curl -x 127.0.0.1:7897`)的内网流量是否可达取决于 TUN 出站绑定,属于共存环境的固有限制,日常浏览器/应用不受影响。
- mihomo 自身解析四个内网后缀当前会超时(无论 VPN 是否连接);内网访问依赖系统解析器直连 VPN DNS,浏览器/系统应用不受影响。VPN 未连接时系统解析同样失败,不会落到公共 DNS 拿到错误地址,这是有意设计。
- `nameserver-policy` 里的 VPN DNS 地址(`192.44.212.206`/`192.44.120.10`)是 2026-11-05 实测、2026-11-06 复核仍一致的值;若客户更换 DNS,需同步更新。可用 `scutil --dns | grep nameserver` 查看当前下发值。

---

## 七、域名清单

| 后缀 | 说明 |
|---|---|
| `cn-pgcloud.com` | 内网开发平台(github/jenkins/nexus/rancher/nezha 等) |
| `pg.com.cn` | 公司内部系统(confluence/jira 等,含公网部署的阿里云系统) |
| `cn-x-cloud-pg.com.cn` | 合作方云平台(grafana/kibana/skywalking 等) |
| `cn-xnp-cloud-pg.com.cn` | 合作方云平台(job-admin/rancher 等) |
| `pg.com` | 内外网混合域:`vpn.pg.com` 是网关;`www.pg.com` 是公网官网 |

清单来源:Edge 收藏夹「PG」「pg-project」等文件夹(2026-11-05 导出核对),全部内网域名均已被上述后缀覆盖。

新增后缀时三处同步追加:`verge.yaml` 的 `system_proxy_bypass`、`Merge.yaml` 的 `rules`、`dns_config.yaml` 的 `fake-ip-filter` 与 `nameserver-policy`(若是纯内网域)。
