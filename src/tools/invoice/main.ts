import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import { installUi } from '@/core/ui/install'
import { initPwa } from '@/core/pwa/update'
import InvoiceRoot from './InvoiceRoot.vue'

/** Kitroid Invoice: quotes, invoices, payments and clients, mounted inside /invoice/. */
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'invoices', component: () => import('./views/DocsView.vue'), props: { kind: 'INVOICE' } },
    { path: '/quotes', name: 'quotes', component: () => import('./views/DocsView.vue'), props: { kind: 'QUOTE' } },
    { path: '/welcome', name: 'welcome', component: () => import('./views/WelcomeView.vue') },
    { path: '/d/:id', name: 'doc', component: () => import('./views/DocView.vue') },
    { path: '/clients', name: 'clients', component: () => import('./views/ClientsView.vue') },
    { path: '/items', name: 'items', component: () => import('./views/ItemsView.vue') },
    { path: '/report', name: 'report', component: () => import('./views/ReportView.vue') },
    { path: '/more', name: 'more', component: () => import('./views/MoreView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

const el = document.getElementById('invoice-app')
if (el) {
  const app = createApp(InvoiceRoot)
  installUi(app)
  app.use(createPinia())
  app.use(router)
  app.mount(el)
  initPwa()
}
