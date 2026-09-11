<script setup lang="ts">
import { ref, onMounted } from 'vue'

// У Nuxt завдяки модулю @nuxtjs/supabase нам не треба вручну створювати клієнта, 
// ми просто використовуємо готовий composable:
const supabase = useSupabaseClient<any>()

const materials = ref<any[]>([])
const isLoading = ref(true)
const errorMessage = ref('')

const materialForm = reactive({
  name: '',
  description: '',
  quantity: undefined as number | undefined,
  price: undefined as number | undefined
})
const imageFile = ref<File | null>(null)
const fileInputKey = ref(0)
const isSaving = ref(false)

const isFormModalOpen = ref(false)
const modalMode = ref<'add' | 'edit'>('add')
const editingMaterialId = ref<any>(null)

function openAddModal() {
  modalMode.value = 'add';
  editingMaterialId.value = null;
  materialForm.name = '';
  materialForm.description = '';
  materialForm.quantity = undefined;
  materialForm.price = undefined;
  imageFile.value = null;
  fileInputKey.value++;
  errorMessage.value = '';
  isFormModalOpen.value = true;
}

function openEditModal(item: any) {
  modalMode.value = 'edit';
  editingMaterialId.value = item.id;
  materialForm.name = item.name || '';
  materialForm.description = item.description || '';
  materialForm.quantity = item.quantity;
  materialForm.price = item.price;
  imageFile.value = null;
  fileInputKey.value++;
  errorMessage.value = '';
  isFormModalOpen.value = true;
}

const isDeleteModalOpen = ref(false)
const materialToDeleteId = ref<any>(null)

async function saveMaterial() {
  if (!materialForm.name) {
    errorMessage.value = "Назва матеріалу обов'язкова";
    return;
  }
  isSaving.value = true;
  errorMessage.value = '';
  
  try {
    let uploadedImageUrl = undefined;
    
    // 1. Якщо є файл, завантажуємо його в Storage
    if (imageFile.value) {
      const fileExt = imageFile.value.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('material-images')
        .upload(fileName, imageFile.value);
        
      if (uploadError) throw new Error("Помилка завантаження фото: " + uploadError.message);
      
      const { data: publicUrlData } = supabase.storage
        .from('material-images')
        .getPublicUrl(fileName);
        
      uploadedImageUrl = publicUrlData.publicUrl;
    }

    const payload: any = { 
        name: materialForm.name, 
        description: materialForm.description, 
        quantity: materialForm.quantity, 
        price: materialForm.price,
    };
    if (uploadedImageUrl !== undefined) {
        payload.image_url = uploadedImageUrl;
    }

    if (modalMode.value === 'add') {
      const { data, error } = await supabase.from('materials').insert([payload]).select();
      if (error) throw error;
      
      if (data && data.length > 0) {
        materials.value.push(data[0]);
      } else {
        await fetchMaterials();
      }
    } else {
      const { data, error } = await supabase.from('materials').update(payload).eq('id', editingMaterialId.value).select();
      if (error) throw error;
      
      if (data && data.length > 0) {
        const index = materials.value.findIndex(m => m.id === editingMaterialId.value);
        if (index !== -1) {
          materials.value[index] = data[0];
        }
      } else {
        await fetchMaterials();
      }
    }
    
    isFormModalOpen.value = false;
  } catch (error: any) {
    console.error('Помилка збереження:', error);
    errorMessage.value = "Помилка при збереженні: " + error.message;
  } finally {
    isSaving.value = false;
  }
}


function openDeleteModal(id: any) {
  materialToDeleteId.value = id;
  isDeleteModalOpen.value = true;
}

async function confirmDeleteMaterial() {
  if (!materialToDeleteId.value) return;
  
  try {
    const { error } = await supabase.from('materials').delete().eq('id', materialToDeleteId.value);
    if (error) throw error;
    
    // Оновлюємо список після видалення
    materials.value = materials.value.filter(m => m.id !== materialToDeleteId.value);
  } catch (error: any) {
    console.error('Помилка видалення:', error);
    errorMessage.value = "Помилка при видаленні: " + error.message;
  } finally {
    isDeleteModalOpen.value = false;
    materialToDeleteId.value = null;
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
          <div class="flex items-center gap-2">
            <UButton icon="i-lucide-plus" color="primary" @click="openAddModal">Додати матеріал</UButton>
            <UButton icon="i-lucide-refresh-cw" variant="ghost" @click="fetchMaterials" :loading="isLoading" />
          </div>
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
          
          <div class="flex items-center gap-3">
            <UBadge color="primary" variant="subtle" v-if="item.quantity || item.price">
              <span v-if="item.quantity">{{ item.quantity }} шт</span>
              <span v-if="item.quantity && item.price"> • </span>
              <span v-if="item.price">{{ item.price }} ₴</span>
            </UBadge>
            
            <UButton 
              color="primary" 
              variant="ghost" 
              icon="i-lucide-pencil" 
              size="sm"
              title="Редагувати"
              @click="openEditModal(item)" 
            />
            <UButton 
              color="error" 
              variant="ghost" 
              icon="i-lucide-trash-2" 
              size="sm"
              title="Видалити"
              @click="openDeleteModal(item.id)" 
            />
          </div>
        </li>
      </ul>


      
      <template #footer>
        <p class="text-xs text-gray-400 text-center">Дані завантажено напряму з Supabase</p>
      </template>
    </UPageCard>
  </UContainer>

  <!-- Модальне вікно додавання/редагування матеріалу -->
  <UModal v-model:open="isFormModalOpen" :title="modalMode === 'add' ? 'Додати новий матеріал' : 'Редагувати матеріал'">
    <template #body>
      <form @submit.prevent="saveMaterial" class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormGroup label="Назва матеріалу" required>
            <UInput v-model="materialForm.name" placeholder="Наприклад: Цемент М500" />
          </UFormGroup>
          
          <UFormGroup label="Ціна (₴)">
            <UInput v-model="materialForm.price" type="number" placeholder="250.50" />
          </UFormGroup>

          <UFormGroup label="Кількість (шт)">
            <UInput v-model="materialForm.quantity" type="number" placeholder="10" />
          </UFormGroup>
          
          <UFormGroup label="Опис">
            <UInput v-model="materialForm.description" placeholder="Короткий опис..." />
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
        
        <div class="flex justify-end mt-4 gap-3">
          <UButton 
            type="button"
            color="neutral" 
            variant="outline"
            label="Скасувати"
            @click="() => { isFormModalOpen = false }"
          />
          <UButton 
            type="submit" 
            color="primary" 
            :icon="modalMode === 'add' ? 'i-lucide-plus' : 'i-lucide-save'" 
            :label="modalMode === 'add' ? 'Додати' : 'Зберегти'" 
            :loading="isSaving" 
            :disabled="!materialForm.name"
          />
        </div>
      </form>
    </template>
  </UModal>

  <!-- Модальне вікно підтвердження видалення -->
  <UModal
    v-model:open="isDeleteModalOpen"
    title="Видалити матеріал?"
    description="Ви впевнені, що хочете видалити цей матеріал? Цю дію неможливо скасувати."
  >
    <template #footer>
      <div class="flex justify-end gap-3 w-full">
        <UButton
          color="neutral"
          variant="outline"
          label="Скасувати"
          @click="() => { isDeleteModalOpen = false }"
        />
        <UButton
          color="error"
          variant="solid"
          label="Так, видалити"
          @click="confirmDeleteMaterial"
        />
      </div>
    </template>
  </UModal>
</template>
