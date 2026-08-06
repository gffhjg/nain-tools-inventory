import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  onMenuAbout: (callback: () => void) => {
    ipcRenderer.on('menu-about', callback);
  },
  getAppPath: () => process.cwd(),
});
