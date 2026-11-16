import type { App } from 'vue'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'
import Tooltip from 'primevue/tooltip'
import { KitroidPreset } from './preset'
import { i18n } from '@/core/i18n'

/** Shared UI setup for every Kitroid Vue app (tool SPAs and Astro islands). */
export function installUi(app: App) {
  app.use(PrimeVue, {
    theme: {
      preset: KitroidPreset,
      options: {
        darkModeSelector: '.dark',
        cssLayer: { name: 'primevue', order: 'theme, base, primevue, components, utilities' },
      },
    },
  })
  app.use(ToastService)
  app.use(ConfirmationService)
  app.directive('tooltip', Tooltip)
  app.use(i18n)
}
