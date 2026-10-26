const { contextBridge, ipcRenderer } = require('electron')
const invoke = (method, value) => ipcRenderer.invoke(`beta-printers:${method}`, value)
contextBridge.exposeInMainWorld('betaPrinters', Object.freeze({
  getStatus: () => invoke('getStatus'), setEnabled: value => invoke('setEnabled', value),
  setProfileSettings: value => invoke('setProfileSettings', value),
  setPrismaEnabled: value => invoke('setPrismaEnabled', value),
  savePaper: value => invoke('savePaper', value),
  calibrateProfile: value => invoke('calibrateProfile', value),
  setLetterheadProfile: id => invoke('setLetterheadProfile', id),
  setLabelsProfile: id => invoke('setLabelsProfile', id),
  refresh: () => invoke('refresh'), saveProfile: value => invoke('saveProfile', value),
  removeProfile: id => invoke('removeProfile', id), testPrint: value => invoke('testPrint', value),
}))
