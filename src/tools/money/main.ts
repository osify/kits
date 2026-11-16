import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import { installUi } from '@/core/ui/install'
import { initPwa } from '@/core/pwa/update'
import MoneyRoot from './MoneyRoot.vue'

/** Kitroid Income & Expense: its own on-device SQLite book, mounted inside the Astro page /money/. */
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'month', component: () => import('./views/MonthView.vue') },
    { path: '/welcome', name: 'welcome', component: () => import('./views/WelcomeView.vue') },
    { path: '/report', name: 'report', component: () => import('./views/ReportView.vue') },
    { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue') },
    { path: '/backup', name: 'backup', component: () => import('./views/BackupView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

const el = document.getElementById('money-app')
if (el) {
  const app = createApp(MoneyRoot)
  installUi(app)
  app.use(createPinia())
  app.use(router)
  app.mount(el)
  initPwa()
}
