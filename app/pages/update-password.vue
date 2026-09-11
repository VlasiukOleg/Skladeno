<script setup lang="ts">
import { ref, onMounted } from "vue";

const supabase = useSupabaseClient();
const router = useRouter();
const newPassword = ref('');
const isLoading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

// Слухаємо подію відновлення пароля (як вказано в документації)
onMounted(() => {
  supabase.auth.onAuthStateChange(async (event, session) => {
    // Коли користувач переходить за лінком скидання пароля, Supabase видає PASSWORD_RECOVERY
    if (event === "PASSWORD_RECOVERY") {
      // Ми готові до введення нового пароля, форма вже відкрита
    }
  });
});

const updateUserPassword = async () => {
  if (!newPassword.value) return;
  
  isLoading.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  const { error } = await supabase.auth.updateUser({
    password: newPassword.value
  });

  if (error) {
    errorMessage.value = error.message || "Сталася помилка при оновленні пароля.";
  } else {
    successMessage.value = 'Пароль успішно оновлено! Перенаправлення...';
    setTimeout(() => {
      router.push('/');
    }, 2000);
  }
  isLoading.value = false;
};
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
    <UPageCard class="w-full max-w-md bg-white">
      <div class="mb-6 text-center">
        <UIcon name="i-lucide-key" class="w-12 h-12 text-primary mx-auto mb-4" />
        <h2 class="text-2xl font-bold">Оновлення пароля</h2>
        <p class="text-sm text-gray-500 mt-2">Введіть ваш новий пароль нижче</p>
      </div>

      <form @submit.prevent="updateUserPassword" class="space-y-4">
        <UFormGroup label="Новий пароль">
          <UInput 
            v-model="newPassword" 
            type="password" 
            required 
            placeholder="••••••••" 
            icon="i-lucide-lock"
          />
        </UFormGroup>
        
        <UAlert v-if="errorMessage" color="error" variant="soft" icon="i-lucide-alert-circle" :title="errorMessage" />
        <UAlert v-if="successMessage" color="success" variant="soft" icon="i-lucide-check-circle" :title="successMessage" />
        
        <UButton type="submit" block color="primary" :loading="isLoading">
          Оновити пароль
        </UButton>
      </form>
    </UPageCard>
  </div>
</template>
