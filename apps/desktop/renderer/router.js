import { dashboard } from './pages/dashboard.js'
import { printPage } from './pages/print.js'
import { historyPage } from './pages/history.js'

export function router(route) {
  switch (route) {
    case 'print':
      return printPage()
    case 'history':
      return historyPage()
    default:
      return dashboard()
  }
}