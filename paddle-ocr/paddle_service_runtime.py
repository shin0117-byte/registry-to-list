import argparse, base64, json, os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
MODEL_ROOT = Path(os.environ['OCR_MODELS_DIR'])
MODEL = None
def get_model():
 global MODEL
 if MODEL is None:
  from paddleocr import PaddleOCR
  MODEL = PaddleOCR(use_angle_cls=True, lang='chinese_cht', show_log=False, det_model_dir=str(MODEL_ROOT/'det/ml/Multilingual_PP-OCRv3_det_infer'), rec_model_dir=str(MODEL_ROOT/'rec/chinese_cht/chinese_cht_PP-OCRv3_rec_infer'), cls_model_dir=str(MODEL_ROOT/'cls/ch_ppocr_mobile_v2.0_cls_infer'))
 return MODEL
def recognize(data):
 import numpy as np
 from PIL import Image
 return '\n'.join(line[1][0] for page in get_model().ocr(np.asarray(Image.open(BytesIO(data)).convert('RGB')), cls=True) or [] for line in page or [] if line[1][1] >= .25)
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*_): pass
 def reply(self,status,payload):
  data=json.dumps(payload,ensure_ascii=False).encode(); self.send_response(status); self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Access-Control-Allow-Origin','*'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)
 def do_GET(self): self.reply(200,{'ready':MODEL is not None}) if self.path=='/health' else self.reply(404,{})
 def do_POST(self):
  try: self.reply(200,{'text':recognize(base64.b64decode(json.loads(self.rfile.read(int(self.headers['Content-Length'])))['image']))})
  except Exception as exc: self.reply(500,{'error':str(exc)})
if __name__=='__main__': ThreadingHTTPServer(('127.0.0.1',8766),Handler).serve_forever()
