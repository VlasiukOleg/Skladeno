<script setup lang="ts">
import { ref, onMounted } from 'vue'

// У Nuxt завдяки модулю @nuxtjs/supabase нам не треба вручну створювати клієнта, 
// ми просто використовуємо готовий composable:
const supabase = useSupabaseClient<any>()

const materials = ref<any[]>([])
const isLoading = ref(true)
const errorMessage = ref('')

const newItem = reactive({
  name: '',
  description: '',
  quantity: undefined as number | undefined,
  price: undefined as number | undefined
})
const imageFile = ref<File | null>(null)
const fileInputKey = ref(0) // Для скидання поля файлу
const isAdding = ref(false)

async function addMaterial() {
  if (!newItem.name) {
    errorMessage.value = "Назва матеріалу обов'язкова";
    return;
  }
  isAdding.value = true;
  errorMessage.value = '';
  
  try {
    let uploadedImageUrl = null;
    
    // 1. Якщо є файл, завантажуємо його в Storage
    if (imageFile.value) {
      const fileExt = imageFile.value.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('material-images')
        .upload(fileName, imageFile.value);
        
      if (uploadError) throw new Error("Помилка завантаження фото: " + uploadError.message);
      
      // Отримуємо публічне посилання
      const { data: publicUrlData } = supabase.storage
        .from('material-images')
        .getPublicUrl(fileName);
        
      uploadedImageUrl = publicUrlData.publicUrl;
    }

    // 2. Зберігаємо запис в базу
    const { data, error } = await supabase.from('materials').insert([
      { 
        name: newItem.name, 
        description: newItem.description, 
        quantity: newItem.quantity, 
        price: newItem.price,
        image_url: uploadedImageUrl
      }
    ]).select();
    
    if (error) throw error;
    
    // Очищаємо форму
    newItem.name = '';
    newItem.description = '';
    newItem.quantity = undefined;
    newItem.price = undefined;
    imageFile.value = null;
    fileInputKey.value++; // Примусово оновлюємо інпут файлу, щоб очистити його
    
    // Додаємо новий запис в список без перезавантаження
    if (data && data.length > 0) {
      materials.value.push(data[0]);
    } else {
      await fetchMaterials();
    }
  } catch (error: any) {
    console.error('Помилка додавання:', error);
    errorMessage.value = "Помилка при додаванні (можливо RLS блокує запис): " + error.message;
  } finally {
    isAdding.value = false;
  }
}


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
      <ul v-else class="space-y-3 mb-8">
        <li v-for="item in materials" :key="item.id" class="p-4 border border-gray-200 rounded-lg shadow-sm bg-gray-50 flex justify-between items-center gap-4">
          <div class="flex items-center gap-4">
            <!-- Зображення -->
            <UAvatar 
              v-if="item.image_url" 
              :src="item.image_url" 
              :alt="item.name" 
              size="xl" 
              imgClass="object-cover"
              class="shadow-sm border border-gray-200"
            />
            <div v-else class="w-14 h-14 bg-gray-200 rounded-full flex items-center justify-center shrink-0 shadow-sm border border-gray-200">
              <UIcon name="i-lucide-image" class="w-6 h-6 text-gray-400" />
            </div>
            
            <div>
              <span class="font-medium text-gray-900">{{ item.name || 'Без назви' }}</span>
              <p class="text-sm text-gray-500" v-if="item.description">{{ item.description }}</p>
            </div>
          </div>
          
          <UBadge color="primary" variant="subtle" v-if="item.quantity || item.price">
            <span v-if="item.quantity">{{ item.quantity }} шт</span>
            <span v-if="item.quantity && item.price"> • </span>
            <span v-if="item.price">{{ item.price }} ₴</span>
          </UBadge>
        </li>
      </ul>

      <UDivider class="my-6" />

      <!-- Форма додавання нового матеріалу -->
      <div>
        <h3 class="text-lg font-medium mb-4">Додати новий матеріал</h3>
        <form @submit.prevent="addMaterial" class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormGroup label="Назва матеріалу" required>
              <UInput v-model="newItem.name" placeholder="Наприклад: Цемент М500" />
            </UFormGroup>
            
            <UFormGroup label="Ціна (₴)">
              <UInput v-model="newItem.price" type="number" placeholder="250.50" />
            </UFormGroup>

            <UFormGroup label="Кількість (шт)">
              <UInput v-model="newItem.quantity" type="number" placeholder="10" />
            </UFormGroup>
            
            <UFormGroup label="Опис">
              <UInput v-model="newItem.description" placeholder="Короткий опис..." />
            </UFormGroup>
            
            <UFormGroup label="Зображення (опціонально)">
              <UFileUpload 
                :key="fileInputKey"
                v-model="imageFile"
                accept="image/*" 
                icon="i-lucide-camera"
              />
            </UFormGroup>
          </div>
          
          <div class="flex justify-end mt-4">
            <UButton 
              type="submit" 
              color="primary" 
              icon="i-lucide-plus" 
              label="Додати в базу" 
              :loading="isAdding" 
              :disabled="!newItem.name"
            />
          </div>
        </form>
      </div>
      
      <template #footer>
        <p class="text-xs text-gray-400 text-center">Дані завантажено напряму з Supabase</p>
      </template>
    </UPageCard>
  </UContainer>
</template>
