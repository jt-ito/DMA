const { contextBridge, ipcRenderer } = require('electron');

// Bridge that mimics the C# WebView2 API so launcher-ui.html works unchanged.
// Messages FROM the main process come as 'log-message' events.
// Messages TO the main process go via ipcRenderer.send('web-message', ...).
const messageListeners = [];

ipcRenderer.on('log-message', (event, msg) => {
  for (const cb of messageListeners) {
    cb({ data: msg });
  }
});

contextBridge.exposeInMainWorld('chrome', {
  webview: {
    postMessage: (message) => {
      ipcRenderer.send('web-message', message);
    },
    addEventListener: (event, callback) => {
      if (event === 'message') {
        messageListeners.push(callback);
      }
    },
    removeEventListener: (event, callback) => {
      if (event === 'message') {
        const idx = messageListeners.indexOf(callback);
        if (idx !== -1) messageListeners.splice(idx, 1);
      }
    }
  }
});
