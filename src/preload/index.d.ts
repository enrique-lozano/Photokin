import { ElectronAPI } from '@electron-toolkit/preload'
import { WindowAPI } from './apiType'

declare global {
  interface Window {
    electron: ElectronAPI
    api: WindowAPI
  }
}
