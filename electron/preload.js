const { contextBridge, ipcRenderer } = require('electron');

// Expose a function to window.chrome.webview.postMessage for compatibility with the C# wrapper
contextBridge.exposeInMainWorld('chrome', {
  webview: {
    postMessage: (message) => {
      ipcRenderer.send('web-message', message);
    },
    addEventListener: (event, callback) => {
      if (event === 'message') {
        ipcRenderer.on('log-message', (e, msg) => {
          callback({ data: msg });
        });
      }
    }
  }
});
