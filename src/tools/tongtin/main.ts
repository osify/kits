import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import { installUi } from '@/core/ui/install'
import { initPwa } from '@/core/pwa/update'
import TongtinRoot from './TongtinRoot.vue'

/** Kitroid Tong Tin (savings circle): its own on-device book, mounted inside the Astro page /tongtin/. */
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
    { path: '/welcome', name: 'welcome', component: () => import('./views/WelcomeView.vue') },
    { path: '/new', name: 'new', component: () => import('./views/CircleFormView.vue') },
    { path: '/c/:id', name: 'circle', component: () => import('./views/CircleView.vue') },
    { path: '/c/:id/edit', name: 'edit', component: () => import('./views/CircleFormView.vue') },
    { path: '/plan', name: 'plan', component: () => import('./views/PlanView.vue') },
    { path: '/more', name: 'more', component: () => import('./views/MoreView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

const el = document.getElementById('tongtin-app')
if (el) {
  const app = createApp(TongtinRoot)
  installUi(app)
  app.use(createPinia())
  app.use(router)
  app.mount(el)
  initPwa()
}
