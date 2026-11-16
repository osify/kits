import type { App } from 'vue'
import { installUi } from '@/core/ui/install'

// Astro calls this for every Vue island on a page.
export default (app: App) => {
  installUi(app)
}
