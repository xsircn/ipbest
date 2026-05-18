export default {
  async fetch(request, env) {
    // 1. 指向你在 GitHub 已经全自动定时生成好的 IP 库
    const githubUrl = "https://xsircn.github.io/ipbest/ip_ports.txt"; 
    
    try {
      // 现场从 GitHub 拉取最新的 IP:端口 列表
      const res = await fetch(githubUrl);
      if (!res.ok) return new Response("无法从 GitHub 获取源数据", { status: 500 });
      
      const text = await res.text();
      const allLines = text.trim().split('\n').filter(line => line.includes(':'));
      
      // 2. 随机抽取 8 个组合进行现场“全活竞速测试”
      const shuffled = allLines.sort(() => 0.5 - Math.random()).slice(0, 8);
      const validArray = [];
      
      // 并发发起连接探测，严格限制 800ms 超时（对客户端软件更新订阅来说，800ms 几乎无感）
      await Promise.all(shuffled.map(async (ipPort) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 800); // 800毫秒硬超时
        
        try {
          const testRes = await fetch(`https://${ipPort}/`, {
            signal: controller.signal,
            headers: { 'Host': 'www.cloudflare.com' } // 模拟指向 CF 边缘网络
          });
          // 只要网络层有任何响应状态码，说明中国骨干网到该 CF 节点的该端口是绝对畅通的
          if (testRes.status) {
            validArray.push(ipPort);
          }
        } catch (e) {
          // 超时或被墙 Reset 的节点直接丢弃
        } finally {
          clearTimeout(timeoutId);
        }
      }));
      
      // 3. 谁在 800ms 内活下来了，就将谁吐给客户端
      if (validArray.length > 0) {
        return new Response(validArray.join('\n'), {
          headers: { 
            "Content-Type": "text/plain; charset=utf-8",
            "Access-Control-Allow-Origin": "*" // 允许三方软件跨域订阅
          }
        });
      }
      
      // 4. 兜底策略：如果那一瞬间网络波动导致全灭，随机吐 3 个原始 IP 确保客户端不报错断连
      return new Response(shuffled.slice(0, 3).join('\n'), {
        headers: { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" }
      });
      
    } catch (err) {
      return new Response(`Router Error: ${err.message}`, { status: 500 });
    }
  }
};
