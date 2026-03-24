import { router } from './router.js'

window.navigate = function (route) {
  document.getElementById('app').innerHTML = router(route)
}

// inicial
document.addEventListener('DOMContentLoaded', () => {
  navigate('dashboard')
})