import { createRouter, createWebHashHistory } from 'vue-router'
import { useShopStore } from './stores/shop'

// Hash routing (/pos/#/sell): GitHub Pages has no server rewrites, so a refresh on
// any screen always loads /pos/index.html, from the network or the offline cache.
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
    { path: '/welcome', name: 'welcome', component: () => import('./views/WelcomeView.vue') },
    { path: '/setup', name: 'setup', component: () => import('./views/SetupView.vue') },
    { path: '/sell', name: 'sell', component: () => import('./views/SellView.vue') },
    { path: '/quick', name: 'quick', component: () => import('./views/QuickView.vue') },
    { path: '/summary', name: 'summary', component: () => import('./views/SummaryView.vue') },
    { path: '/backup', name: 'backup', component: () => import('./views/BackupView.vue') },
    { path: '/stock', name: 'stock', component: () => import('./views/StockView.vue') },
    { path: '/customers', name: 'customers', component: () => import('./views/CustomersView.vue') },
    { path: '/more', name: 'more', component: () => import('./views/MoreView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

/** No shop yet → first-run wizard (restore is offered there too). */
router.beforeEach((to) => {
  const shop = useShopStore()
  if (shop.loaded && !shop.shop && to.name !== 'welcome' && to.name !== 'backup') return { name: 'welcome' }
})
