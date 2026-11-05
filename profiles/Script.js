// 全局脚本覆写:自动注入 PROXY 统一选择组,对任何订阅生效,无需订阅专属覆写。
// Merge.yaml 规则链与 rule-providers 的 proxy 字段引用的 PROXY 指向这里。
// 历史方案(订阅专属 groups 覆写 prepend)已废弃:换订阅后 uid 变化导致覆写
// 失联,PROXY 缺失引发配置校验失败(2026-11-05)。
// 注意:verge 的脚本引擎为 Boa,请保持保守的 ES5 风格语法,勿用新特性。

function main(config, profileName) {
  if (!config) return config;
  var groups = config["proxy-groups"];
  if (!groups || !groups.length) groups = [];

  // 幂等:先移除同名组,防订阅专属覆写或重复激活造成重复定义
  var rest = [];
  for (var i = 0; i < groups.length; i++) {
    if (groups[i] && groups[i].name !== "PROXY") rest.push(groups[i]);
  }

  // PROXY 选项 = 订阅全部真实策略组(select/url-test/fallback/load-balance)+ DIRECT。
  // 机场「流量/到期/官网」等信息假节点位于 proxies 而非 proxy-groups,天然被排除。
  var TYPES = { select: 1, "url-test": 1, fallback: 1, "load-balance": 1 };
  var options = [];
  for (var j = 0; j < rest.length; j++) {
    if (rest[j] && TYPES[rest[j].type]) options.push(rest[j].name);
  }

  var proxy;
  if (options.length > 0) {
    options.push("DIRECT");
    proxy = { name: "PROXY", type: "select", proxies: options };
  } else {
    // 兜底:订阅无任何策略组(纯节点订阅)时,包含全部节点与 DIRECT
    proxy = { name: "PROXY", type: "select", "include-all": true };
  }

  rest.unshift(proxy);
  config["proxy-groups"] = rest;
  return config;
}
