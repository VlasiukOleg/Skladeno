<script setup lang="ts">
import { ref } from "vue";

const emit = defineEmits(["success"]);

const isAnalyzing = ref(false);
const manualText = ref("");
const toast = useToast();

// Налаштування табів для Nuxt UI
const items = [
  {
    label: "Завантажити",
    icon: "i-lucide-file-up",
    slot: "upload",
  },
  {
    label: "Написати",
    icon: "i-lucide-edit-3",
    slot: "manual",
  },
];

// Функція відправки ручного тексту на сервер
async function submitManualText() {
  if (!manualText.value.trim()) return;

  try {
    isAnalyzing.value = true;

    // Створюємо FormData, але замість файлу передаємо текстове поле
    const formData = new FormData();
    formData.append("text", manualText.value);

    console.log("Мой текст у FormData:", formData.get("text"));

    const response = await $fetch("/api/analyzeNew", {
      method: "POST",
      body: formData,
    });

    emit("success", response);
  } catch (error: any) {
    console.error("Помилка при аналізі тексту:", error);
    const errorMsg = error.data?.message || "Помилка аналізу тексту";
    const isOverloaded = errorMsg.includes("503") || errorMsg.includes("high demand") || errorMsg.includes("UNAVAILABLE") || errorMsg.includes("Кроці 3");
    
    toast.add({
      title: isOverloaded ? 'Сервери перевантажені' : 'Помилка',
      description: isOverloaded 
        ? 'Сервери штучного інтелекту Google тимчасово перевантажені. Будь ласка, зачекайте пару хвилин і спробуйте ще раз.' 
        : errorMsg,
      color: 'error',
      icon: 'i-lucide-alert-circle',
      duration: isOverloaded ? 8000 : 5000
    });
  } finally {
    isAnalyzing.value = false;
  }
}
</script>

<template>
  <UCard class="w-full shadow-sm">
    <UTabs :items="items" class="w-full">
      <!-- Таб 1: Завантаження файлу (Твій існуючий компонент) -->
      <template #upload>
        <div class="pt-4">
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Завантажте файл зі списком матеріалів для автоматичного аналізу:
          </p>
          <FileUpload @success="(data) => emit('success', data)" />
        </div>
      </template>

      <!-- Таб 2: Ручне введення ("Блокнот") -->
      <template #manual>
        <div v-if="isAnalyzing" class="pt-4 min-h-75 flex flex-col items-center justify-center p-8 text-center space-y-4">
          <UIcon name="i-lucide-loader-2" class="w-10 h-10 animate-spin text-primary" />
          <p class="text-gray-600 dark:text-gray-300 font-medium">Зачекайте, потрібен час на підбір матеріалів...</p>
        </div>
        <div v-else class="pt-4 space-y-4">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Вставте скопійований список або напишіть матеріали вручну:
          </p>

          <!-- Текстове поле стилізоване під легкий жовтуватий "блокнот" -->
          <UTextarea
            v-model="manualText"
            :rows="8"
            placeholder="Наприклад:
1. Гіпсокартон вологостійкий - 10 шт
2. Профіль CD 60 - 15 шт
3. Саморізи - 1 уп..."
            class="w-full font-mono text-gray-800 dark:text-gray-200"
            :ui="{
              base: 'bg-yellow-50/50 dark:bg-gray-800 focus:bg-yellow-50/80 dark:focus:bg-gray-700 transition-colors',
            }"
          />

          <div class="flex justify-end">
            <UButton
              label="Аналізувати текст"
              icon="i-lucide-sparkles"
              color="primary"
              :loading="isAnalyzing"
              :disabled="!manualText.trim()"
              @click="submitManualText"
            />
          </div>
        </div>
      </template>
    </UTabs>
  </UCard>
</template>
