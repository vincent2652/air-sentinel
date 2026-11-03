// 本地联调入口。放在 functions/ 之外，不进发布包。
// 运行：WAQI_TOKEN=xxx deno run --allow-net --allow-env dev/function-local.ts
// 可选：PORT=8001 换端口
import { handler } from "../functions/handler.ts";

const port = Number(Deno.env.get("PORT") || 8000);

Deno.serve({ hostname: "127.0.0.1", port }, handler);
