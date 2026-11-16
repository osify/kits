import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import { installUi } from '@/core/ui/install'
import { initPwa } from '@/core/pwa/update'
import FinanceRoot from './FinanceRoot.vue'

/** Kitroid Financial calculator: stateless, offline, mounted inside the Astro page /finance/. */
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/loan' },
    { path: '/loan', component: () => import('./views/LoanView.vue') },
    { path: '/savings', component: () => import('./views/SavingsView.vue') },
    { path: '/profit', component: () => import('./views/ProfitView.vue') },
    { path: '/breakeven', component: () => import('./views/BreakEvenView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/loan' },
  ],
})

const el = document.getElementById('finance-app')
if (el) {
  const app = createApp(FinanceRoot)
  installUi(app)
  app.use(router)
  app.mount(el)
  initPwa()
}
