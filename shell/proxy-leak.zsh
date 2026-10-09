# proxy-leak: 按进程统计当前走 Clash 代理(PROXY)的连接流量
# 用途:定位国内应用"偷跑"代理的杂散流量;发现偷跑后到 profiles/Merge.yaml
#       的「国内应用进程直连」区追加 PROCESS-PATH-REGEX 规则
# 依赖:mihomo root 服务的 unix socket(Clash Verge 服务模式默认路径)

proxy-leak() {
  curl -sS --unix-socket /var/run/clash-verge-service/users/501/verge-mihomo.sock http://localhost/connections | python3 -c '
import json,sys
from collections import defaultdict
conns=(json.load(sys.stdin).get("connections") or [])
stat=defaultdict(lambda: {"up":0,"down":0,"n":0,"hosts":set()})
for c in conns:
    ch="->".join(c.get("chains") or [])
    if "PROXY" not in ch: continue
    proc=c["metadata"].get("process") or "(未知)"
    s=stat[proc]
    s["up"]+=c.get("upload",0); s["down"]+=c.get("download",0); s["n"]+=1
    h=c["metadata"].get("host") or c["metadata"].get("destinationIP") or "?"
    if len(s["hosts"])<5: s["hosts"].add(h)
def fmt(b): return "%.1fMB"%(b/1048576) if b>1048576 else "%.0fKB"%(b/1024)
print("%-26s %4s %10s %10s  %s"%("进程","连接","上传","下载","主要域名"))
for p,s in sorted(stat.items(), key=lambda x:-(x[1]["up"]+x[1]["down"])):
    print("%-26s %4d %10s %10s  %s"%(p,s["n"],fmt(s["up"]),fmt(s["down"]),", ".join(sorted(s["hosts"])[:4])))'
}
