"""Only listens on 127.0.0.1; document images never leave this computer."""
import argparse, base64, json, os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
os.environ.setdefault("PADDLE_PDX_MODEL_SOURCE", "BOS")
MODEL = None

def get_model():
    global MODEL
    if MODEL is None:
        from paddleocr import PaddleOCR
        MODEL = PaddleOCR(lang="chinese_cht", use_doc_orientation_classify=True, use_doc_unwarping=True, use_textline_orientation=True, device="cpu")
    return MODEL

def result_to_text(result):
    if hasattr(result, "json"):
        data = result.json
        if isinstance(data, str): data = json.loads(data)
        data = data.get("res", data) if isinstance(data, dict) else {}
        texts, scores = data.get("rec_texts", []), data.get("rec_scores", [])
        return "\n".join(text for i, text in enumerate(texts) if text and (i >= len(scores) or float(scores[i]) >= .25))
    lines = []
    for page in result or []:
        for line in page or []:
            if len(line) > 1 and line[1] and float(line[1][1]) >= .25: lines.append(line[1][0])
    return "\n".join(lines)

def recognize(image_bytes):
    from io import BytesIO
    import numpy as np
    from PIL import Image
    image = np.asarray(Image.open(BytesIO(image_bytes)).convert("RGB"))
    ocr = get_model()
    if hasattr(ocr, "predict"): return "\n".join(result_to_text(item) for item in ocr.predict(image))
    return result_to_text(ocr.ocr(image, cls=True))

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def send_json(self, status, data):
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status); self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "http://127.0.0.1:4173"); self.send_header("Content-Length", str(len(payload))); self.end_headers(); self.wfile.write(payload)
    def do_OPTIONS(self):
        self.send_response(204); self.send_header("Access-Control-Allow-Origin", "http://127.0.0.1:4173"); self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS"); self.send_header("Access-Control-Allow-Headers", "Content-Type"); self.end_headers()
    def do_GET(self): self.send_json(200, {"ready": MODEL is not None, "service": "PaddleOCR 精準模式"}) if self.path == "/health" else self.send_json(404, {"error": "Not found"})
    def do_POST(self):
        if self.path != "/api/ocr": return self.send_json(404, {"error": "Not found"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size <= 0 or size > 25 * 1024 * 1024: raise ValueError("影像大小須介於 1 B 至 25 MB。")
            image = base64.b64decode(json.loads(self.rfile.read(size).decode("utf-8"))["image"], validate=True)
            self.send_json(200, {"text": recognize(image)})
        except Exception as exc: self.send_json(500, {"error": str(exc)})

def main():
    parser = argparse.ArgumentParser(); parser.add_argument("--warmup", action="store_true"); args = parser.parse_args()
    if args.warmup: get_model(); print("PaddleOCR 繁體中文精準模型已就緒。"); return
    print("PaddleOCR 精準模式：http://127.0.0.1:8766"); ThreadingHTTPServer(("127.0.0.1", 8766), Handler).serve_forever()
if __name__ == "__main__": main()
