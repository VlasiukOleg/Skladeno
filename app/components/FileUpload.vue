<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 2MB

const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (
    Number.parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i]
  );
};

// Максимально проста схема: файл є і він не важить як фільм
const schema = z.object({
  file: z
    .instanceof(File, {
      message: "Будь ласка, оберіть файл.",
    })
    .refine((file) => file.size <= MAX_FILE_SIZE, {
      message: `Файл завеликий. Максимальний розмір: ${formatBytes(MAX_FILE_SIZE)}.`,
    }),
});

type Schema = z.output<typeof schema>;

const state = reactive<Partial<Schema>>({
  file: undefined,
});

const isUploading = ref(false);

const emit = defineEmits(["success"]);

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (!event.data.file) return;

  const formData = new FormData();
  formData.append("file", event.data.file);

  try {
    console.log("Відправка файлу на сервер...");
    isUploading.value = true;

    const response = await $fetch("/api/analyzeNew", {
      method: "POST",
      body: formData,
    });

    emit("success", response);
  } catch (error: any) {
    console.error("Помилка при відправці файлу:", error);
    // Якщо ШІ відповість помилкою (наприклад, не розпізнає формат), ми це побачимо
    alert(error.data?.message || "Помилка при обробці файлу");
  } finally {
    isUploading.value = false;
  }
}
</script>

<template>
  <UForm
    :schema="schema"
    :state="state"
    class="space-y-4 w-full"
    @submit="onSubmit"
  >
    <UFormField
      name="image"
      label="Image"
      description="JPG, GIF or PNG. 2MB Max."
    >
      <div v-if="isUploading" class="min-h-48 flex items-center justify-center">
        <AntLoader text="Мураха-кошторисник розпізнає ваш файл..." />
      </div>
      <UFileUpload
        v-else
        v-model="state.file"
        accept="image/*"
        class="min-h-48"
      />
    </UFormField>

    <UButton
      v-if="!isUploading"
      type="submit"
      label="Аналізувати"
      color="primary"
      :loading="isUploading"
    />
  </UForm>
</template>
