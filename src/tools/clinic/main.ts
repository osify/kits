import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import { installUi } from '@/core/ui/install'
import { initPwa } from '@/core/pwa/update'
import ClinicRoot from './ClinicRoot.vue'

/** Kitroid Clinic: patients, queue, check-ups, prescriptions and fees, mounted inside /clinic/. */
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'today', component: () => import('./views/TodayView.vue') },
    { path: '/welcome', name: 'welcome', component: () => import('./views/WelcomeView.vue') },
    { path: '/schedule', name: 'schedule', component: () => import('./views/ScheduleView.vue') },
    { path: '/schedule/setup', name: 'schedule-setup', component: () => import('./views/ScheduleSetupView.vue') },
    { path: '/patients', name: 'patients', component: () => import('./views/PatientsView.vue') },
    { path: '/p/:id', name: 'patient', component: () => import('./views/PatientView.vue') },
    { path: '/v/:id', name: 'visit', component: () => import('./views/VisitView.vue') },
    { path: '/prices', name: 'prices', component: () => import('./views/PricesView.vue') },
    { path: '/report', name: 'report', component: () => import('./views/ReportView.vue') },
    { path: '/more', name: 'more', component: () => import('./views/MoreView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

const el = document.getElementById('clinic-app')
if (el) {
  const app = createApp(ClinicRoot)
  installUi(app)
  app.use(createPinia())
  app.use(router)
  app.mount(el)
  initPwa()
}
