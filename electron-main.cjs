const { app, BrowserWindow, shell, ipcMain } = require('electron');
const { cpSync, createWriteStream, existsSync, mkdirSync, writeFileSync } = require('node:fs');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const https = require('node:https');
const path = require('node:path');
const os = require('node:os');

const RELEASE_API = 'https://api.github.com/repos/shin0117-byte/registry-to-list/releases/latest';
let ocrProcess;
let mainWindow;
let availableUpdate;

function sendUpdate(status) { mainWindow?.webContents.send('update-status', status); }
function compareVersions(left, right) {
  const a = left.replace(/^v/, '').split('.').map(Number); const b = right.replace(/^v/, '').split('.').map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) { const diff = (a[index] || 0) - (b[index] || 0); if (diff) return diff; }
  return 0;
}
function request(url) {
  return new Promise((resolve, reject) => https.get(url, { headers: { 'User-Agent': 'registry-to-list-desktop' } }, response => {
    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) { response.resume(); resolve(request(new URL(response.headers.location, url))); return; }
    if (response.statusCode !== 200) { response.resume(); reject(new Error(`更新伺服器回應 ${response.statusCode}`)); return; }
    resolve(response);
  }).on('error', reject));
}
async function checkForUpdate() {
  if (!app.isPackaged || process.platform !== 'win32') return;
  try {
    const response = await request(RELEASE_API); let body = '';
    for await (const chunk of response) body += chunk;
    const release = JSON.parse(body); const version = String(release.tag_name || '').replace(/^v/, '');
    const asset = (release.assets || []).find(item => /registry-to-list-paddle-portable-.*\.zip$/i.test(item.name));
    if (!version || !asset || compareVersions(version, app.getVersion()) <= 0) return;
    availableUpdate = { version, url: asset.browser_download_url, size: asset.size };
    sendUpdate({ state: 'available', version });
  } catch { sendUpdate({ state: 'unavailable' }); }
}
async function downloadUpdate() {
  if (!availableUpdate) throw new Error('目前沒有可用更新。');
  const zipPath = path.join(os.tmpdir(), `registry-to-list-${availableUpdate.version}.zip`);
  sendUpdate({ state: 'downloading' });
  const response = await request(availableUpdate.url);
  await pipeline(response, createWriteStream(zipPath));
  if (!existsSync(zipPath)) throw new Error('更新檔下載失敗。');
  const targetDir = path.dirname(process.execPath);
  const scriptPath = path.join(os.tmpdir(), `registry-to-list-update-${Date.now()}.ps1`);
  const script = "param([int]$ParentPid,[string]$ZipPath,[string]$TargetDir)\n" +
    "$ErrorActionPreference = 'Stop'\n" +
    "while (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 400 }\n" +
    "$stage = Join-Path $env:TEMP ('registry-to-list-update-' + [guid]::NewGuid())\n" +
    "New-Item -ItemType Directory -Path $stage -Force | Out-Null\n" +
    "Expand-Archive -LiteralPath $ZipPath -DestinationPath $stage -Force\n" +
    "$package = Get-ChildItem -LiteralPath $stage -Directory | Select-Object -First 1\n" +
    "if (-not $package) { throw '更新檔格式不正確。' }\n" +
    "Copy-Item -Path (Join-Path $package.FullName '*') -Destination $TargetDir -Recurse -Force\n" +
    "Start-Process -FilePath (Join-Path $TargetDir '謄本轉清冊.exe')\n" +
    "Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue\n" +
    "Remove-Item -LiteralPath $ZipPath -Force -ErrorAction SilentlyContinue\n" +
    "Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue\n";
  writeFileSync(scriptPath, script, 'utf8');
  const updater = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-ParentPid', String(process.pid), '-ZipPath', zipPath, '-TargetDir', targetDir], { detached: true, stdio: 'ignore', windowsHide: true });
  updater.unref(); sendUpdate({ state: 'installing' }); app.quit();
}
function startOcr() {
  const bundled = path.join(process.resourcesPath, 'paddle-models');
  const modelRoot = 'C:\\PaddleOCRRuntime\\models';
  const requiredModel = path.join(modelRoot, 'rec', 'chinese_cht', 'chinese_cht_PP-OCRv3_rec_infer', 'inference.pdmodel');
  if (!existsSync(requiredModel)) { mkdirSync(path.dirname(modelRoot), { recursive: true }); cpSync(bundled, modelRoot, { recursive: true, force: true }); }
  const python = path.join(process.resourcesPath, 'ocr-runtime', 'Scripts', 'python.exe');
  const service = path.join(process.resourcesPath, 'paddle_service_runtime.py');
  ocrProcess = spawn(python, [service], { windowsHide: true, env: { ...process.env, OCR_MODELS_DIR: modelRoot } });
}
function createWindow() {
  mainWindow = new BrowserWindow({ width: 1480, height: 960, minWidth: 980, minHeight: 700, title: '謄本轉清冊', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  mainWindow.loadFile(path.join(__dirname, 'index.html')); mainWindow.webContents.once('did-finish-load', checkForUpdate);
}
ipcMain.handle('install-update', downloadUpdate);
app.whenReady().then(() => { startOcr(); createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); }); });
app.on('window-all-closed', () => { if (ocrProcess) ocrProcess.kill(); if (process.platform !== 'darwin') app.quit(); });