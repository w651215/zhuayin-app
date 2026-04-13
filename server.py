"""
爪印宠友圈 - 阿里云百炼大模型后端代理
"""
import os
import json
import base64
import tempfile
from flask import Flask, request, jsonify, Response, stream_with_context
import requests

app = Flask(__name__)

BAILIAN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"


@app.route("/api/scan", methods=["POST"])
def scan_image():
    """接收前端上传的图片，代理调用百炼视觉大模型"""
    data = request.json
    api_key = data.get("api_key", "")
    image_base64 = data.get("image_base64", "")
    scan_type = data.get("scan_type", "skin")
    mime_type = data.get("mime_type", "image/jpeg")

    if not api_key:
        return jsonify({"error": "请先设置阿里云百炼 API Key"}), 400

    if not image_base64:
        return jsonify({"error": "请上传宠物照片"}), 400

    # 根据扫描类型构建专业的提示词
    prompt_map = {
        "skin": (
            "你是一位专业的宠物皮肤科兽医。请仔细观察这张宠物皮肤照片，分析以下内容：\n"
            "1. 皮肤外观：是否有红肿、脱毛、鳞屑、结痂、皮疹等异常\n"
            "2. 毛发状态：是否有局部脱毛、毛发暗淡、断毛等\n"
            "3. 初步判断：可能是什么皮肤问题（如猫癣、皮炎、过敏性皮肤病、寄生虫感染等）\n"
            "4. 风险等级：请给出🟢低风险/🟡中风险/🔴高风险\n"
            "5. 建议措施：具体的护理建议和就医建议\n\n"
            "请用结构化的方式回答，包含：检测区域、异常发现、AI判断、风险等级、建议措施。"
            "如果照片中看不到宠物的皮肤，请提示用户重新拍摄更清晰的照片。"
        ),
        "eye": (
            "你是一位专业的宠物眼科兽医。请仔细观察这张宠物眼睛照片，分析以下内容：\n"
            "1. 眼睛外观：是否有红肿、分泌物、泪痕、浑浊等异常\n"
            "2. 眼周状态：是否有泪痕、红褐色分泌物、肿胀等\n"
            "3. 初步判断：可能是什么眼部问题（如泪痕症、结膜炎、白内障、角膜炎等）\n"
            "4. 风险等级：请给出🟢低风险/🟡中风险/🔴高风险\n"
            "5. 建议措施：具体的护理建议和就医建议\n\n"
            "请用结构化的方式回答，包含：检测区域、异常发现、AI判断、风险等级、建议措施。"
            "如果照片中看不到宠物的眼睛，请提示用户重新拍摄更清晰的照片。"
        ),
        "gum": (
            "你是一位专业的宠物口腔科兽医。请仔细观察这张宠物牙龈/口腔照片，分析以下内容：\n"
            "1. 牙龈颜色：是否正常粉红，有无发白、发红、发黄等\n"
            "2. 牙齿状态：是否有牙结石、牙菌斑、牙齿松动等\n"
            "3. 口腔黏膜：是否有溃疡、红肿等异常\n"
            "4. 初步判断：可能是什么口腔问题（如牙龈炎、牙结石、口炎、贫血等）\n"
            "5. 风险等级：请给出🟢低风险/🟡中风险/🔴高风险\n"
            "6. 建议措施：具体的护理建议和就医建议\n\n"
            "请用结构化的方式回答，包含：检测区域、异常发现、AI判断、风险等级、建议措施。"
            "如果照片中看不到宠物的口腔/牙龈，请提示用户重新拍摄更清晰的照片。"
        ),
        "poop": (
            "你是一位专业的宠物内科兽医。请仔细观察这张宠物粪便照片，分析以下内容：\n"
            "1. 粪便形态：成型度（成型/偏软/稀便/水样）、颜色、气味\n"
            "2. 异常特征：是否有血丝、黏液、寄生虫、未消化食物等\n"
            "3. 初步判断：可能反映什么健康问题（如消化不良、寄生虫感染、肠道炎症、出血等）\n"
            "4. 风险等级：请给出🟢低风险/🟡中风险/🔴高风险\n"
            "5. 建议措施：具体的护理建议和就医建议\n\n"
            "请用结构化的方式回答，包含：检测区域、异常发现、AI判断、风险等级、建议措施。"
            "如果照片中看不到宠物的粪便，请提示用户重新拍摄更清晰的照片。"
        ),
    }

    prompt = prompt_map.get(scan_type, prompt_map["skin"])

    # 构建图片URL (base64 data URI)
    image_url = f"data:{mime_type};base64,{image_base64}"

    # 调用百炼API (使用OpenAI兼容模式)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": "qwen-vl-plus",
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": image_url},
                    },
                    {"type": "text", "text": prompt},
                ],
            }
        ],
        "stream": True,
        "stream_options": {"include_usage": True},
    }

    def generate():
        try:
            resp = requests.post(
                f"{BAILIAN_BASE_URL}/chat/completions",
                headers=headers,
                json=payload,
                stream=True,
                timeout=60,
            )
            resp.raise_for_status()

            for line in resp.iter_lines():
                if not line:
                    continue
                line = line.decode("utf-8")
                if line.startswith("data: "):
                    chunk = line[6:]
                    if chunk.strip() == "[DONE]":
                        yield f"data: [DONE]\n\n"
                        break
                    try:
                        chunk_data = json.loads(chunk)
                        choices = chunk_data.get("choices", [])
                        if not choices:
                            continue
                        delta = choices[0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            yield f"data: {json.dumps({'content': content}, ensure_ascii=False)}\n\n"
                    except json.JSONDecodeError:
                        continue

        except requests.exceptions.HTTPError as e:
            error_msg = f"API请求失败: {e.response.status_code}"
            try:
                err_body = e.response.json()
                error_msg = err_body.get("error", {}).get("message", error_msg)
            except:
                pass
            yield f"data: {json.dumps({'error': error_msg}, ensure_ascii=False)}\n\n"
        except requests.exceptions.Timeout:
            yield f"data: {json.dumps({'error': '请求超时，请稍后重试'}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': f'请求异常: {str(e)}'}, ensure_ascii=False)}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
            "Connection": "keep-alive",
            "Transfer-Encoding": "chunked",
        },
    )


@app.route("/api/verify-key", methods=["POST"])
def verify_key():
    """验证API Key是否有效"""
    data = request.json
    api_key = data.get("api_key", "")

    if not api_key:
        return jsonify({"valid": False, "error": "API Key不能为空"}), 400

    try:
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": "qwen-vl-plus",
            "messages": [
                {"role": "user", "content": [{"type": "text", "text": "hi"}]}
            ],
            "max_tokens": 1,
        }
        resp = requests.post(
            f"{BAILIAN_BASE_URL}/chat/completions",
            headers=headers,
            json=payload,
            timeout=15,
        )
        if resp.status_code == 200:
            return jsonify({"valid": True})
        else:
            try:
                err = resp.json()
                msg = err.get("error", {}).get("message", "无效的API Key")
            except:
                msg = f"验证失败: HTTP {resp.status_code}"
            return jsonify({"valid": False, "error": msg})
    except Exception as e:
        return jsonify({"valid": False, "error": f"验证异常: {str(e)}"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
