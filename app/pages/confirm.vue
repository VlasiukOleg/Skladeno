<script setup lang="ts">
const user = useSupabaseUser()
const redirectInfo = useSupabaseCookieRedirect()

watch(user, () => {
  if (user.value) {
    // Get redirect path, and clear it from the cookie
    const path = redirectInfo.pluck()
    // Redirect to the saved path, or fallback to home
    return navigateTo(path || '/') 
  }
}, { immediate: true })
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50">
    <div class="bg-white p-8 rounded-xl shadow-sm text-center flex flex-col items-center gap-4">
      <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary" />
      <p class="text-gray-600">Перевірка авторизації...</p>
    </div>
  </div>
</template>
