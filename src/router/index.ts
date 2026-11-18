import { createRouter, createWebHistory } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import HomeView from '@/views/HomeView.vue'

declare module 'vue-router' {
  interface RouteMeta {
    /** Only signed-in users may open the route. */
    requiresAuth?: boolean
    /** Signed-in users are sent on to their account instead. */
    guestOnly?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/saved', name: 'saved', component: () => import('@/views/SavedView.vue') },
    {
      path: '/city/:name',
      name: 'city',
      component: () => import('@/views/CityView.vue'),
      props: true,
    },
    {
      path: '/sign-in',
      name: 'sign-in',
      component: () => import('@/views/SignInView.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/account',
      name: 'account',
      component: () => import('@/views/AccountView.vue'),
      meta: { requiresAuth: true },
    },
    {
      // Supabase Auth's OAuth server sends people here to approve an outside app.
      path: '/oauth/consent',
      name: 'oauth-consent',
      component: () => import('@/views/OAuthConsentView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
    },
  ],
})

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth && !to.meta.guestOnly) return true

  const auth = useAuthStore()
  await auth.init()

  if (to.meta.requiresAuth && !auth.isSignedIn) {
    return { name: 'sign-in', query: { redirect: to.fullPath } }
  }
  if (to.meta.guestOnly && auth.isSignedIn) return { name: 'account' }
  return true
})

export default router
