<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import type { MaterialItem } from "../components/ReviewTable.vue";
import ExcelJS from "exceljs";
import * as htmlToImage from "html-to-image";

const parsedItems = ref<MaterialItem[]>([]);
const toast = useToast();

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
    toast.add({
      title: 'Помилка',
      description: error.data?.message || "Помилка при додаванні матеріалу",
      color: 'error',
      icon: 'i-lucide-alert-circle'
    });
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
    toast.add({
      title: 'Помилка',
      description: error.data?.message || "Помилка при переаналізі матеріалу",
      color: 'error',
      icon: 'i-lucide-alert-circle'
    });
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

const totalScreenshotSum = computed(() => {
  return parsedItems.value.reduce((acc, item) => {
    return acc + (item.matchedItem ? item.quantity * item.matchedItem.price : 0);
  }, 0);
});

const isScreenshotting = ref(false);

const downloadScreenshot = async () => {
  const element = document.getElementById('screenshot-container');
  if (!element) return;
  
  isScreenshotting.value = true;
  try {
    const dataUrl = await htmlToImage.toPng(element, {
      backgroundColor: '#ffffff',
      pixelRatio: 2 // better resolution
    });
    
    const link = document.createElement('a');
    link.download = 'skladeno-materials.png';
    link.href = dataUrl;
    link.click();
  } catch (err) {
    console.error("Помилка при створенні скріншоту:", err);
    toast.add({
      title: 'Помилка',
      description: 'Не вдалося створити скріншот',
      color: 'error'
    });
  } finally {
    isScreenshotting.value = false;
  }
};

const exportToExcel = async () => {
  if (parsedItems.value.length === 0) return;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Матеріали');

  // Визначаємо колонки
  worksheet.columns = [
    { header: 'Товар', key: 'name', width: 50 },
    { header: 'Кількість', key: 'quantity', width: 15 },
    { header: 'Ціна з ПДВ', key: 'price', width: 20 },
    { header: 'Сума з ПДВ', key: 'sum', width: 20 }
  ];

  // Стиль для заголовків (перший рядок)
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell((cell, colNumber) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF3F4F6' } // bg-gray-100
    };
    cell.font = { bold: true };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  // Додаємо дані
  parsedItems.value.forEach((item) => {
    if (item.matchedItem) {
      const row = worksheet.addRow({
        name: item.matchedItem.label,
        quantity: `${item.quantity} ${item.matchedItem.measure}`,
        price: item.matchedItem.price,
        sum: item.quantity * item.matchedItem.price
      });

      // Стилізуємо клітинки з даними
      row.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        cell.alignment = { vertical: 'middle' };
        
        if (colNumber === 2) cell.alignment.horizontal = 'center';
        else if (colNumber === 3 || colNumber === 4) {
          cell.alignment.horizontal = 'right';
          cell.numFmt = '0.00';
        }
      });
    }
  });

  // Додаємо порожній рядок для відступу
  worksheet.addRow([]);

  // Додаємо рядок "Разом"
  const totalRow = worksheet.addRow({
    price: 'Разом:',
    sum: totalScreenshotSum.value
  });
  
  // Об'єднуємо клітинки для слова "Разом" (від A до C)
  worksheet.mergeCells(`A${totalRow.number}:C${totalRow.number}`);
  
  const mergedTotalCell = worksheet.getCell(`A${totalRow.number}`);
  mergedTotalCell.value = 'Разом:';
  mergedTotalCell.alignment = { horizontal: 'right', vertical: 'middle' };
  mergedTotalCell.font = { bold: true, size: 14 };
  
  const sumTotalCell = worksheet.getCell(`D${totalRow.number}`);
  sumTotalCell.value = totalScreenshotSum.value;
  sumTotalCell.alignment = { horizontal: 'right', vertical: 'middle' };
  sumTotalCell.font = { bold: true, size: 14 };
  sumTotalCell.numFmt = '#,##0.00 ₴';

  // Зберігаємо файл
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'skladeno_materials.xlsx';
  link.click();
  URL.revokeObjectURL(link.href);
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

        <div class="flex justify-center mt-8 gap-4 flex-wrap">
          <UButton
            color="primary"
            variant="solid"
            size="lg"
            label="Скріншот для клієнта"
            icon="i-lucide-camera"
            :loading="isScreenshotting"
            @click="downloadScreenshot"
          />
          <UButton
            color="primary"
            variant="soft"
            size="lg"
            label="Експорт в Excel"
            icon="i-lucide-file-spreadsheet"
            @click="exportToExcel"
          />
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

    <!-- Схована таблиця для генерації скріншоту -->
    <div class="fixed left-[-9999px] top-[-9999px]">
      <div
        id="screenshot-container"
        class="bg-white p-6 w-[800px]"
      >
        <table class="w-full border-collapse border border-black text-sm font-sans">
          <thead>
            <tr class="bg-gray-100">
              <th class="border border-black px-3 py-2 text-left font-bold text-black">Товар</th>
              <th class="border border-black px-3 py-2 text-center font-bold text-black w-24">Кількість</th>
              <th class="border border-black px-3 py-2 text-right font-bold text-black w-32">Ціна з ПДВ</th>
              <th class="border border-black px-3 py-2 text-right font-bold text-black w-32">Сума з ПДВ</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="(item, index) in parsedItems" :key="index">
              <tr v-if="item.matchedItem">
                <td class="border border-black px-3 py-2 text-black">{{ item.matchedItem.label }}</td>
                <td class="border border-black px-3 py-2 text-center text-black">{{ item.quantity }} {{ item.matchedItem.measure }}</td>
                <td class="border border-black px-3 py-2 text-right text-black">{{ item.matchedItem.price.toFixed(2) }}</td>
                <td class="border border-black px-3 py-2 text-right text-black">{{ (item.quantity * item.matchedItem.price).toFixed(2) }}</td>
              </tr>
            </template>
          </tbody>
        </table>
        <div class="mt-4 flex justify-end gap-4 font-bold text-lg text-black pr-2">
          <span>Разом:</span>
          <span>{{ totalScreenshotSum.toFixed(2) }} ₴</span>
        </div>
      </div>
    </div>
</template>
