const { app, BrowserWindow, ipcMain, shell, Menu, Tray } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let tray;
let nodeProcess;

function startNodeServer() {
  // Try to use bundled standalone start.js or the one in the project root
  const startJsPath = path.join(__dirname, '..', 'start.js');
  
  // Actually, wait, when packaged, __dirname is inside resources/app.asar
  nodeProcess = spawn(process.execPath, [startJsPath], {
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'pipe'
  });

  nodeProcess.stdout.on('data', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('log-message', data.toString());
    }
  });

  nodeProcess.stderr.on('data', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('log-message', data.toString());
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 500,
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
      mainWindow.hide();
    }
    return false;
  });
}

function createTray() {
  let iconPath = path.join(__dirname, '..', 'favicon.ico');
  
  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open UI', click: () => mainWindow.show() },
    { label: 'Exit Server', click: () => {
      app.isQuitting = true;
      if (nodeProcess) {
        nodeProcess.kill();
      }
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
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Overridden by close handler
});
