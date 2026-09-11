<script setup lang="ts">
import { ref, onMounted } from 'vue'

// У Nuxt завдяки модулю @nuxtjs/supabase нам не треба вручну створювати клієнта, 
// ми просто використовуємо готовий composable:
const supabase = useSupabaseClient()

const materials = ref<any[]>([])
const isLoading = ref(true)
const errorMessage = ref('')

async function fetchMaterials() {
  isLoading.value = true
  errorMessage.value = ''
  
  try {
    // Звертаємось до таблиці 'materials' і беремо всі колонки (*)
    const { data, error } = await supabase.from('materials').select('*')
    
    if (error) throw error
    
    materials.value = data || []
  } catch (error: any) {
    console.error('Помилка завантаження:', error)
    errorMessage.value = error.message
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  fetchMaterials()
})
</script>

<template>
  <UContainer class="py-12 max-w-2xl">
    <UPageCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h1 class="text-2xl font-bold">Тестова база даних (Матеріали)</h1>
          <UButton icon="i-lucide-refresh-cw" variant="ghost" @click="fetchMaterials" :loading="isLoading" />
        </div>
      </template>

      <!-- Стан завантаження -->
      <div v-if="isLoading" class="flex justify-center py-8">
        <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary" />
      </div>

      <!-- Повідомлення про помилку -->
      <UAlert v-else-if="errorMessage" color="error" variant="soft" icon="i-lucide-alert-triangle" :title="errorMessage" class="mb-4" />

      <!-- Порожній стан -->
      <div v-else-if="materials.length === 0" class="text-center py-8 text-gray-500">
        <UIcon name="i-lucide-database" class="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>Таблиця порожня або ще не створена.</p>
        <p class="text-sm mt-1">Додайте дані в Supabase Dashboard.</p>
      </div>

      <!-- Список матеріалів -->
      <ul v-else class="space-y-3">
        <li v-for="item in materials" :key="item.id" class="p-4 border border-gray-200 rounded-lg shadow-sm bg-gray-50 flex justify-between items-center">
          <div>
            <span class="font-medium text-gray-900">{{ item.name || 'Без назви' }}</span>
            <p class="text-sm text-gray-500" v-if="item.description">{{ item.description }}</p>
          </div>
          
          <UBadge color="primary" variant="subtle" v-if="item.quantity || item.price">
            <span v-if="item.quantity">{{ item.quantity }} шт</span>
            <span v-if="item.quantity && item.price"> • </span>
            <span v-if="item.price">{{ item.price }} ₴</span>
          </UBadge>
        </li>
      </ul>
      
      <template #footer>
        <p class="text-xs text-gray-400 text-center">Дані завантажено напряму з Supabase</p>
      </template>
    </UPageCard>
  </UContainer>
</template>
