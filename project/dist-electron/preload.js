"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    onMenuAbout: (callback) => {
        electron_1.ipcRenderer.on('menu-about', callback);
    },
    getAppPath: () => process.cwd(),
});
