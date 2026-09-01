const { app, BrowserWindow, shell } = require('electron');
const { cpSync, existsSync, mkdirSync } = require('node:fs');
const { spawn } = require('node:child_process');
const path = require('node:path');
let ocrProcess;
function startOcr() {
  const bundled = path.join(process.resourcesPath, 'paddle-models');
  const modelRoot = 'C:\\PaddleOCRRuntime\\models';
  if (!existsSync(modelRoot)) { mkdirSync(path.dirname(modelRoot), { recursive: true }); cpSync(bundled, modelRoot, { recursive: true }); }
  const python = path.join(process.resourcesPath, 'ocr-runtime', 'Scripts', 'python.exe');
  const service = path.join(process.resourcesPath, 'paddle_service_runtime.py');
  ocrProcess = spawn(python, [service], { windowsHide: true, env: { ...process.env, OCR_MODELS_DIR: modelRoot } });
}
function createWindow() { const window = new BrowserWindow({ width:1480,height:960,minWidth:980,minHeight:700,title:'謄本轉清冊',webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true} }); window.webContents.setWindowOpenHandler(({url})=>{shell.openExternal(url);return {action:'deny'};}); window.loadFile(path.join(__dirname,'index.html')); }
app.whenReady().then(()=>{startOcr();createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});});
app.on('window-all-closed',()=>{if(ocrProcess)ocrProcess.kill();if(process.platform!=='darwin')app.quit();});
