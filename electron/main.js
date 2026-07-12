const { app, BrowserWindow, ipcMain, shell, Menu, Tray, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let tray;
let nodeProcess;
let serverReady = false;

function getIconPath() {
  if (process.platform === 'win32') {
    const icoPath = path.join(__dirname, '..', 'favicon.ico');
    if (fs.existsSync(icoPath)) return icoPath;
  }
  const pngPath = path.join(__dirname, '..', 'public', 'icon.png');
  if (fs.existsSync(pngPath)) return pngPath;
  return path.join(__dirname, '..', 'favicon.ico');
}

function startNodeServer() {
  let startJsPath = path.join(__dirname, '..', '.next', 'standalone', 'start.js');
  let cwd = path.join(__dirname, '..', '.next', 'standalone');

  if (!fs.existsSync(startJsPath)) {
    startJsPath = path.join(__dirname, '..', 'start.js');
    cwd = path.join(__dirname, '..');
  }

  // If packaged, rewrite paths to use the unpacked ASAR directory so that
  // the pure Node process (ELECTRON_RUN_AS_NODE) can read the real files on disk.
  if (startJsPath.includes('app.asar')) {
    startJsPath = startJsPath.replace('app.asar', 'app.asar.unpacked');
    cwd = cwd.replace('app.asar', 'app.asar.unpacked');
  }

  nodeProcess = spawn(process.execPath, [startJsPath], {
    cwd: cwd,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'pipe'
  });

  const forward = (data) => {
    const text = data.toString();
    try { fs.appendFileSync(path.join(app.getPath('userData'), 'dma-debug.log'), text + '\\n'); } catch (e) {}
    if (mainWindow) {
      mainWindow.webContents.send('log-message', text);
    }
    // Auto-open browser on first ready signal
    if (!serverReady && (text.includes('Ready in') || text.includes('localhost:3000') || text.includes('Listening on'))) {
      serverReady = true;
      shell.openExternal('http://localhost:3000');
    }
  };

  nodeProcess.stdout.on('data', forward);
  nodeProcess.stderr.on('data', forward);

  nodeProcess.on('exit', (code) => {
    try { fs.appendFileSync(path.join(app.getPath('userData'), 'dma-debug.log'), `[DMA] Server process exited with code ${code}\\n`); } catch (e) {}
    if (mainWindow) {
      mainWindow.webContents.send('log-message', `\\n[DMA] Server process exited with code ${code}`);
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 500,
    icon: getIconPath(),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, '..', 'launcher-ui.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      // Send ASK_CLOSE to the webview so it can show the modal
      mainWindow.webContents.send('log-message', 'ASK_CLOSE');
    }
    return false;
  });
}

function createTray() {
  const iconPath = getIconPath();
  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Manager', click: () => mainWindow.show() },
    { label: 'Open in Browser', click: () => shell.openExternal('http://localhost:3000') },
    { type: 'separator' },
    { label: 'Exit Server', click: () => {
        app.isQuitting = true;
        if (nodeProcess) nodeProcess.kill();
        app.quit();
    }}
  ]);
  tray.setToolTip('Docker Manager Server');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => mainWindow.show());
}

app.whenReady().then(() => {
  startNodeServer();
  createWindow();
  createTray();

  ipcMain.on('web-message', (event, arg) => {
    if (arg === 'OPEN_BROWSER') {
      shell.openExternal('http://localhost:3000');
    } else if (arg === 'MINIMIZE') {
      mainWindow.hide();
    } else if (arg === 'FORCE_EXIT') {
      app.isQuitting = true;
      if (nodeProcess) nodeProcess.kill();
      app.quit();
    } else if (arg === 'STOP_SERVER') {
      if (nodeProcess) nodeProcess.kill();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow.show();
  });
});

app.on('window-all-closed', () => {
  // Keep running in tray on all platforms
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (nodeProcess) nodeProcess.kill();
});
