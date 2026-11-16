import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { installUi } from '@/core/ui/install'
import { initPwa } from '@/core/pwa/update'
import PosRoot from './PosRoot.vue'
import { router } from './router'

/** Kitroid POS: a standalone Vue SPA mounted inside the Astro page /pos/. */
const el = document.getElementById('pos-app')
if (el) {
  const app = createApp(PosRoot)
  installUi(app)
  app.use(createPinia())
  app.use(router)
  app.mount(el)
  initPwa()
}
