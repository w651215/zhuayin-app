const BAILIAN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  try {
    const { api_key } = await context.request.json();

    if (!api_key) {
      return new Response(JSON.stringify({ valid: false, error: "API Key不能为空" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    const resp = await fetch(`${BAILIAN_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen-plus",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
      }),
    });

    if (resp.ok) {
      return new Response(JSON.stringify({ valid: true }), {
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    } else {
      let msg = "无效的API Key";
      try {
        const err = await resp.json();
        msg = err?.error?.message || msg;
      } catch (e) {}
      return new Response(JSON.stringify({ valid: false, error: msg }), {
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
  } catch (e) {
    return new Response(JSON.stringify({ valid: false, error: `验证异常: ${e.message}` }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
}
