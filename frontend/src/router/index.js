import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '../stores/user'

const routes = [
  { path: '/login', component: () => import('../views/Login.vue'), meta: { public: true } },
  {
    path: '/',
    component: () => import('../views/Layout.vue'),
    redirect: '/dashboard',
    children: [
      { path: 'dashboard', component: () => import('../views/Dashboard.vue'), meta: { title: '工作台' } },
      { path: 'equipment', component: () => import('../views/Equipment.vue'), meta: { title: '器材台账' } },
      { path: 'borrow', component: () => import('../views/Borrow.vue'), meta: { title: '借用归还' } },
      { path: 'damage', component: () => import('../views/DamageReport.vue'), meta: { title: '报损管理' } },
      { path: 'approval', component: () => import('../views/Approval.vue'), meta: { title: '审批中心' } },
      { path: 'history', component: () => import('../views/History.vue'), meta: { title: '历史查询' } }
    ]
  },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' }
]

const router = createRouter({ history: createWebHistory(), routes })

router.beforeEach((to, from, next) => {
  const userStore = useUserStore()
  if (to.meta.public) { next(); return }
  if (!userStore.isLogin) { next('/login'); return }
  next()
})

export default router
