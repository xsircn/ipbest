// 每次有用户访问 /api/get-ips 时，触发此 onRequest 函数
export async function onRequest(context) {
  const { env, request } = context;

  // 1. 检查环境变量中是否绑定了 KV 数据库
if (!env.IP_POOL) {
  return new Response("错误：未绑定 KV 数据库命名空间 IP_POOL", { status: 500 });
}

  // 2. 尝试从 KV 数据库读取上一次筛选出的活 IP
 let cachedIps = await env.IP_POOL.get("VALID_IPS");

  // 3. 触发异步“后台清洗任务”，让系统在后台去探测，不阻塞当前用户的下载请求
  context.waitUntil(triggerInboundCheck(env));

  // 4. 如果 KV 里有缓存，直接一瞬间吐给用户；如果没有，先返回兜底提示
  if (cachedIps) {
    return new Response(cachedIps, {
      headers: { 
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*" // 允许跨域，方便客户端或别的软件订阅
      }
    });
  } else {
    return new Response("首次部署，后台正在拼命进行国内节点网络握手，请在 10 秒后刷新本页面...", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
}

// 后台异步探测与清洗核心逻辑
async function triggerInboundCheck(env) {
  // 替换为你自己在 GitHub 托管的初步优选清单
  const githubUrl = "https://xsircn.github.io/ipbest/ip_ports.txt";

  try {
    const res = await fetch(githubUrl);
    const text = await res.text();
    const allLines = text.trim().split('\n').filter(line => line.includes(':'));

    // 随机抽取 15 个组合进行本次并发死活探测，防止过多引发 CF 请求超限
    const shuffled = allLines.sort(() => 0.5 - Math.random()).slice(0, 15);
    const validArray = [];

    // 并发测试所有选中的 IP:端口
    const promises = shuffled.map(async (ipPort) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200); // 1.2秒硬超时

      try {
        const testRes = await fetch(`https://${ipPort}/`, {
          signal: controller.signal,
          headers: { 'Host': 'www.cloudflare.com' } // 模拟指向 CF 官网
        });
        clearTimeout(timeoutId);
        if (testRes.status) {
          validArray.push(ipPort);
        }
      } catch (e) {
        clearTimeout(timeoutId);
      }
    });

    await Promise.all(promises);

    // 只有测出来的活 IP 大于 0 组时才去写库，防止偶尔的网络波动把原本健康的 KV 数据库清空
if (validArray.length > 0) {
  await env.IP_POOL.put("VALID_IPS", validArray.join('\n'));
}
    }
  } catch (err) {
    console.error("后台异步抓取清洗失败:", err);
  }
}
