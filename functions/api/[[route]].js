const BAILIAN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

const PROMPT_MAP = {
  skin: "你是一位专业的宠物皮肤科兽医。请仔细观察这张宠物皮肤照片，分析以下内容：\n1. 皮肤外观：是否有红肿、脱毛、鳞屑、结痂、皮疹等异常\n2. 毛发状态：是否有局部脱毛、毛发暗淡、断毛等\n3. 初步判断：可能是什么皮肤问题（如猫癣、皮炎、过敏性皮肤病、寄生虫感染等）\n4. 风险等级：请给出🟢低风险/🟡中风险/🔴高风险\n5. 建议措施：具体的护理建议和就医建议\n\n请用结构化的方式回答，包含：检测区域、异常发现、AI判断、风险等级、建议措施。如果照片中看不到宠物的皮肤，请提示用户重新拍摄更清晰的照片。",
  eye: "你是一位专业的宠物眼科兽医。请仔细观察这张宠物眼睛照片，分析以下内容：\n1. 眼睛外观：是否有红肿、分泌物、泪痕、浑浊等异常\n2. 眼周状态：是否有泪痕、红褐色分泌物、肿胀等\n3. 初步判断：可能是什么眼部问题（如泪痕症、结膜炎、白内障、角膜炎等）\n4. 风险等级：请给出🟢低风险/🟡中风险/🔴高风险\n5. 建议措施：具体的护理建议和就医建议\n\n请用结构化的方式回答，包含：检测区域、异常发现、AI判断、风险等级、建议措施。如果照片中看不到宠物的眼睛，请提示用户重新拍摄更清晰的照片。",
  gum: "你是一位专业的宠物口腔科兽医。请仔细观察这张宠物牙龈/口腔照片，分析以下内容：\n1. 牙龈颜色：是否正常粉红，有无发白、发红、发黄等\n2. 牙齿状态：是否有牙结石、牙菌斑、牙齿松动等\n3. 口腔黏膜：是否有溃疡、红肿等异常\n4. 初步判断：可能是什么口腔问题（如牙龈炎、牙结石、口炎、贫血等）\n5. 风险等级：请给出🟢低风险/🟡中风险/🔴高风险\n6. 建议措施：具体的护理建议和就医建议\n\n请用结构化的方式回答，包含：检测区域、异常发现、AI判断、风险等级、建议措施。如果照片中看不到宠物的口腔/牙龈，请提示用户重新拍摄更清晰的照片。",
  poop: "你是一位专业的宠物内科兽医。请仔细观察这张宠物粪便照片，分析以下内容：\n1. 粪便形态：成型度（成型/偏软/稀便/水样）、颜色、气味\n2. 异常特征：是否有血丝、黏液、寄生虫、未消化食物等\n3. 初步判断：可能反映什么健康问题（如消化不良、寄生虫感染、肠道炎症、出血等）\n4. 风险等级：请给出🟢低风险/🟡中风险/🔴高风险\n5. 建议措施：具体的护理建议和就医建议\n\n请用结构化的方式回答，包含：检测区域、异常发现、AI判断、风险等级、建议措施。如果照片中看不到宠物的粪便，请提示用户重新拍摄更清晰的照片。",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function handleOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function handleScan(request) {
  try {
    const { api_key, image_base64, scan_type, mime_type } = await request.json();

    if (!api_key) return jsonResponse({ error: "请先设置阿里云百炼 API Key" }, 400);
    if (!image_base64) return jsonResponse({ error: "请上传宠物照片" }, 400);

    const prompt = PROMPT_MAP[scan_type] || PROMPT_MAP.skin;
    const image_url = `data:${mime_type || "image/jpeg"};base64,${image_base64}`;

    const payload = {
      model: "qwen-vl-plus",
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: image_url } },
            { type: "text", text: prompt },
          ],
        },
      ],
      stream: true,
      stream_options: { include_usage: true },
    };

    const resp = await fetch(`${BAILIAN_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      let errMsg = `API请求失败: ${resp.status}`;
      try {
        const errBody = await resp.json();
        errMsg = errBody?.error?.message || errMsg;
      } catch (e) {}
      // Send as SSE error so frontend can parse it
      return new Response(`data: ${JSON.stringify({ error: errMsg })}\n\n`, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          ...CORS_HEADERS,
        },
      });
    }

    // Stream the response through, transforming SSE format
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    // Process the stream in background
    (async () => {
      try {
        const reader = resp.body.getReader();
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop(); // keep incomplete line

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const chunk = line.slice(6).trim();
            if (chunk === "[DONE]") continue;

            try {
              const chunkData = JSON.parse(chunk);
              const choices = chunkData.choices;
              if (!choices || choices.length === 0) continue;
              const content = choices[0]?.delta?.content || "";
              if (content) {
                await writer.write(
                  encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
                );
              }
            } catch (e) {
              // Skip unparseable chunks
            }
          }
        }

        // Process remaining buffer
        if (buf.trim().startsWith("data: ")) {
          const d = buf.trim().slice(6);
          if (d !== "[DONE]") {
            try {
              const chunkData = JSON.parse(d);
              const choices = chunkData.choices;
              if (choices && choices.length > 0) {
                const content = choices[0]?.delta?.content || "";
                if (content) {
                  await writer.write(
                    encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
                  );
                }
              }
            } catch (e) {}
          }
        }

        await writer.write(encoder.encode("data: [DONE]\n\n"));
      } catch (e) {
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({ error: `流式读取异常: ${e.message}` })}\n\n`)
        );
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        ...CORS_HEADERS,
      },
    });
  } catch (e) {
    return jsonResponse({ error: `请求异常: ${e.message}` }, 500);
  }
}

async function handleVerifyKey(request) {
  try {
    const { api_key } = await request.json();

    if (!api_key) return jsonResponse({ valid: false, error: "API Key不能为空" }, 400);

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
      return jsonResponse({ valid: true });
    } else {
      let msg = "无效的API Key";
      try {
        const err = await resp.json();
        msg = err?.error?.message || msg;
      } catch (e) {}
      return jsonResponse({ valid: false, error: msg });
    }
  } catch (e) {
    return jsonResponse({ valid: false, error: `验证异常: ${e.message}` });
  }
}

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost(context) {
  const url = new URL(context.request.url);

  if (url.pathname === "/api/scan") {
    return handleScan(context.request);
  }

  if (url.pathname === "/api/verify-key") {
    return handleVerifyKey(context.request);
  }

  return jsonResponse({ error: "Not Found" }, 404);
}
