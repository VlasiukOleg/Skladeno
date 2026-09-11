<script setup lang="ts">
import { ref, onMounted } from "vue";
import type { MaterialItem } from "../components/ReviewTable.vue";

const parsedItems = ref<MaterialItem[]>([]);

const fetchAndLogMaterials = async () => {
  console.log("=== ЗАПУСК ЗАПИТУ ПРАЙСУ ===");
  try {
    const data = await $fetch("/api/materials");

    // Виводимо в консоль гарну таблицю та сирий масив для інспектування
    console.log("Успішно отримано товарів (перші 1000):", data.length);
    console.log("Приклад першого товару з бази:", data[0]);
    console.dir(data); // Тут можна буде розгорнути будь-який об'єкт в консолі
  } catch (error) {
    console.error("Помилка при отриманні товарів з бекенду:", error);
  }
};

const handleUploadSuccess = (data: { items: any[] }) => {
  // Сервер вже генерує унікальні ID, але якщо ти хочеш перестрахуватися, залишаємо так:
  parsedItems.value = data.items.map((item, index) => ({
    ...item,
    id: item.id || `item-${index}-${Date.now()}`,
  }));
};

const isClearModalOpen = ref(false);
const openClearModal = () => {
  isClearModalOpen.value = true;
};
const closeClearModal = () => {
  isClearModalOpen.value = false;
};
const isAddingItem = ref(false);
const newItemText = ref("");

const handleAddNewItem = async () => {
  if (!newItemText.value.trim()) return;
  isAddingItem.value = true;

  try {
    const formData = new FormData();
    formData.append("text", newItemText.value);

    const data = await $fetch("/api/analyzeNew", {
      method: "POST",
      body: formData,
    });

    if (data && data.items && data.items.length > 0) {
      data.items.forEach((item: any, index: number) => {
        const newItem = {
          ...item,
          id: item.id || `item-new-${Date.now()}-${index}`,
        };
        parsedItems.value.push(newItem);
      });
    } else {
      parsedItems.value.push({
        id: `item-new-${Date.now()}`,
        originalText: newItemText.value,
        quantity: 1,
        needsClarification: false,
        matchedItem: null,
        matchedItems: [],
      });
    }
    newItemText.value = ""; // Очищаємо поле
  } catch (error: any) {
    console.error("Помилка при додаванні матеріалу:", error);
    alert(error.data?.message || "Помилка при додаванні матеріалу");
  } finally {
    isAddingItem.value = false;
  }
};

const isReanalyzing = ref<Record<string, boolean>>({});

const handleReanalyze = async (id: string, newText: string) => {
  isReanalyzing.value[id] = true;
  try {
    const formData = new FormData();
    formData.append("text", newText);

    const data = await $fetch("/api/analyzeNew", {
      method: "POST",
      body: formData,
    });

    const index = parsedItems.value.findIndex((item) => item.id === id);
    if (index !== -1) {
      const item = parsedItems.value[index];
      if (item) {
        if (data && data.items && data.items.length > 0) {
          // Оновлюємо дані, але зберігаємо старий id та quantity
          const oldQuantity = item.quantity;
          parsedItems.value[index] = {
            ...data.items[0],
            id,
            quantity: oldQuantity,
          };
        } else {
          // Якщо нічого не знайдено, скидаємо стан до "не знайдено"
          parsedItems.value[index] = {
            ...item,
            originalText: newText,
            matchedItem: null,
            matchedItems: [],
            needsClarification: false,
            searchKeywords: [],
            topCandidates: [],
          };
        }
      }
    }
  } catch (error: any) {
    console.error("Помилка при переаналізі:", error);
    alert(error.data?.message || "Помилка при переаналізі матеріалу");
  } finally {
    isReanalyzing.value[id] = false;
  }
};

const handleQuantityUpdate = (id: string, newQuantity: number) => {
  const index = parsedItems.value.findIndex((item) => item.id === id);
  if (index !== -1) {
    const item = parsedItems.value[index];
    if (item) {
      item.quantity = newQuantity;
    }
  }
};

const clearList = () => {
  parsedItems.value = [];
  isClearModalOpen.value = false;
};

const supabase = useSupabaseClient();
const user = useSupabaseUser();
const router = useRouter();

const handleLogout = async () => {
  await supabase.auth.signOut();
  router.push("/login");
};

onMounted(() => {
  fetchAndLogMaterials();
});
</script>

<template>
  <UContainer class="py-8">
      <!-- Заголовок -->
      <div class="mb-8 flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">Skladeno</h1>
          <p class="text-gray-500 mt-1">Швидкий прорахунок будматеріалів</p>
        </div>
        <div class="flex items-center gap-4" v-if="user">
          <span class="text-sm text-gray-600">{{ user.email }}</span>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-log-out"
            @click="handleLogout"
          />
        </div>
      </div>

      <!-- Використовуємо новий компонент з табами замість FileUpload -->
      <InputTabs
        v-if="parsedItems.length === 0"
        @success="handleUploadSuccess"
      />

      <!-- Таблиця результатів + кнопка скидання -->
      <div v-else class="space-y-6">
        <ReviewTable
          :items="parsedItems"
          :loading-states="isReanalyzing"
          @remove-item="
            (id) => (parsedItems = parsedItems.filter((i) => i.id !== id))
          "
          @reanalyze-item="handleReanalyze"
          @update-quantity="handleQuantityUpdate"
        />

        <!-- Форма для швидкого додавання матеріалів (Блокнот) -->
        <div
          class="flex flex-col gap-3 bg-white p-4 rounded-xl shadow-sm border border-gray-100"
        >
          <p class="text-sm text-gray-500 font-medium">
            Забули щось? Впишіть додаткові матеріали нижче:
          </p>
          <UTextarea
            v-model="newItemText"
            :rows="4"
            placeholder="Наприклад:
1. Гіпсокартон вологостійкий - 10 шт
2. Профіль CD 60 - 15 шт
3. Саморізи - 1 уп..."
            class="w-full font-mono text-gray-800"
            :ui="{
              base: 'bg-yellow-50/50 focus:bg-yellow-50/80 transition-colors',
            }"
            :disabled="isAddingItem"
          />
          <div class="flex justify-end">
            <UButton
              icon="i-lucide-plus"
              label="Додати матеріали"
              color="primary"
              size="lg"
              :loading="isAddingItem"
              :disabled="!newItemText.trim()"
              @click="handleAddNewItem"
            />
          </div>
        </div>

        <div class="flex justify-center mt-8">
          <UButton
            color="neutral"
            variant="soft"
            size="lg"
            label="Очистити список і почати заново"
            icon="i-lucide-trash-2"
            @click="openClearModal"
          />
        </div>
      </div>
    </UContainer>

    <!-- Модальне вікно підтвердження -->
    <UModal
      v-model:open="isClearModalOpen"
      title="Очистити список?"
      description="Ви впевнені, що хочете видалити всі матеріали та почати заново? Цю дію неможливо скасувати."
    >
      <template #footer>
        <div class="flex justify-end gap-3 w-full">
          <UButton
            color="neutral"
            variant="outline"
            label="Скасувати"
            @click="closeClearModal"
          />
          <UButton
            color="error"
            variant="solid"
            label="Так, очистити"
            @click="clearList"
          />
        </div>
      </template>
    </UModal>
</template>
