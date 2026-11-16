import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import { installUi } from '@/core/ui/install'
import { initPwa } from '@/core/pwa/update'
import CalcRoot from './CalcRoot.vue'

/** Kitroid Useful calculators: stateless, offline, mounted inside the Astro page /calc/. */
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/change' },
    { path: '/change', component: () => import('./views/ChangeView.vue') },
    { path: '/cash', component: () => import('./views/CashView.vue') },
    { path: '/vat', component: () => import('./views/VatView.vue') },
    { path: '/discount', component: () => import('./views/DiscountView.vue') },
    { path: '/unit', component: () => import('./views/UnitView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/change' },
  ],
})

const el = document.getElementById('calc-app')
if (el) {
  const app = createApp(CalcRoot)
  installUi(app)
  app.use(router)
  app.mount(el)
  initPwa()
}
