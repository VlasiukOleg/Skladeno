export default defineNuxtRouteMiddleware((to, from) => {
  const user = useSupabaseUser()

  const publicRoutes = ['/login', '/confirm', '/update-password', '/test-db']

  if (!user.value && !publicRoutes.includes(to.path)) {
    return navigateTo('/login')
  }

  if (user.value && to.path === '/login') {
    return navigateTo('/')
  }
})
