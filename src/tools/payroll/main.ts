import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import { installUi } from '@/core/ui/install'
import { initPwa } from '@/core/pwa/update'
import PayrollRoot from './PayrollRoot.vue'

/** Kitroid Payroll: staff, monthly payroll, tax on salary and NSSF return, mounted inside /payroll/. */
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'month', component: () => import('./views/MonthView.vue') },
    { path: '/m/:month', name: 'monthOf', component: () => import('./views/MonthView.vue') },
    { path: '/welcome', name: 'welcome', component: () => import('./views/WelcomeView.vue') },
    { path: '/staff', name: 'staff', component: () => import('./views/StaffView.vue') },
    { path: '/year', name: 'year', component: () => import('./views/YearView.vue') },
    { path: '/more', name: 'more', component: () => import('./views/MoreView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

const el = document.getElementById('payroll-app')
if (el) {
  const app = createApp(PayrollRoot)
  installUi(app)
  app.use(createPinia())
  app.use(router)
  app.mount(el)
  initPwa()
}
