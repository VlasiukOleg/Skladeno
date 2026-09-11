<script setup lang="ts">
import { computed } from 'vue'

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const router = useRouter()

const handleLogout = async () => {
  await supabase.auth.signOut()
  router.push('/login')
}

const userMenuItems = computed(() => {
  if (!user.value) return []
  return [
    [
      {
        label: user.value.email || 'Профіль',
        disabled: true,
        class: 'font-semibold'
      }
    ],
    [
      {
        label: 'Історія замовлень',
        icon: 'i-lucide-clipboard-list',
        to: '/orders'
      },
      {
        label: 'Налаштування',
        icon: 'i-lucide-settings',
        to: '/settings'
      }
    ],
    [
      {
        label: 'Вийти',
        icon: 'i-lucide-log-out',
        color: 'error',
        onSelect: handleLogout
      }
    ]
  ]
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200 flex flex-col">
    <!-- Header -->
    <UHeader :toggle="false">
      <template #title>
        <NuxtLink to="/" class="flex flex-col">
          <span class="text-xl md:text-3xl font-black text-primary leading-none">SKLADENO</span>
          <span class="text-[9px] md:text-xs text-gray-500 dark:text-gray-400 font-medium tracking-wide leading-tight">
            швидкий прорахунок <br class="md:hidden" />та підбір будматеріалів
          </span>
        </NuxtLink>
      </template>

      <!-- Якщо у майбутньому знадобиться меню -->
      <!-- <UNavigationMenu :items="items" /> -->

      <template #right>
        <UColorModeButton />

        <UDropdownMenu v-if="user" :items="userMenuItems">
          <UButton 
            color="neutral" 
            variant="ghost" 
            icon="i-lucide-user" 
            aria-label="Профіль"
          />
        </UDropdownMenu>
      </template>
    </UHeader>

    <!-- Основний контент сторінки -->
    <main class="flex-1">
      <slot />
    </main>
  </div>
</template>
