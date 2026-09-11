<script setup lang="ts">
import { ref, computed } from "vue";
import type { FormSubmitEvent } from "@nuxt/ui";

const supabase = useSupabaseClient();
const user = useSupabaseUser();
const router = useRouter();

const authMode = ref<'login' | 'signup' | 'forgotPassword'>('login');
const isLoading = ref(false);
const errorMessage = ref("");
const successMessage = ref("");

// Якщо користувач вже авторизований, перенаправляємо на головну
watchEffect(() => {
  if (user.value) {
    router.push("/");
  }
});

const fields = computed(() => {
  if (authMode.value === 'forgotPassword') {
    return [
      {
        name: "email",
        type: "email",
        label: "Email",
        placeholder: "ваш@email.com",
        required: true,
      }
    ];
  }
  return [
    {
      name: "email",
      type: "email",
      label: "Email",
      placeholder: "ваш@email.com",
      required: true,
    },
    {
      name: "password",
      type: "password",
      label: "Пароль",
      placeholder: "••••••••",
      required: true,
    },
  ];
});

const handleAuth = async (payload: FormSubmitEvent<any>) => {
  isLoading.value = true;
  errorMessage.value = "";
  successMessage.value = "";

  const { email, password } = payload.data;

  try {
    if (authMode.value === 'signup') {
      // Реєстрація
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/confirm`,
        }
      });
      if (error) throw error;
      successMessage.value =
        "Реєстрація успішна! Будь ласка, перевірте свою пошту для підтвердження (якщо вимагається), або увійдіть.";
      authMode.value = 'login'; // Перемикаємо на форму входу
    } else if (authMode.value === 'login') {
      // Вхід
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      router.push("/");
    } else if (authMode.value === 'forgotPassword') {
      // Скидання пароля
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`,
      });
      if (error) throw error;
      successMessage.value = "Інструкції з відновлення пароля надіслано на вашу пошту.";
      authMode.value = 'login';
    }
  } catch (error: any) {
    errorMessage.value = error.message || "Сталася помилка під час авторизації.";
  } finally {
    isLoading.value = false;
  }
};

const setMode = (mode: 'login' | 'signup' | 'forgotPassword') => {
  authMode.value = mode;
  errorMessage.value = "";
  successMessage.value = "";
};
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
    <UPageCard class="w-full max-w-md bg-white">
      <UAuthForm
        :fields="fields"
        :title="authMode === 'signup' ? 'Створіть акаунт' : authMode === 'forgotPassword' ? 'Відновлення пароля' : 'З поверненням!'"
        icon="i-lucide-lock"
        :submit="{
          label: authMode === 'signup' ? 'Зареєструватися' : authMode === 'forgotPassword' ? 'Відправити лист' : 'Увійти',
          loading: isLoading
        }"
        @submit="handleAuth"
      >
        <template #description>
          <div v-if="authMode === 'forgotPassword'">
            <span class="text-sm">Згадали пароль? </span>
            <ULink as="button" class="text-primary font-medium" @click="setMode('login')">
              Увійти
            </ULink>
          </div>
          <div v-else>
            <span v-if="authMode === 'signup'">Вже маєте акаунт? </span>
            <span v-else>Немає акаунту? </span>
            <ULink
              as="button"
              class="text-primary font-medium"
              @click="setMode(authMode === 'signup' ? 'login' : 'signup')"
            >
              {{ authMode === 'signup' ? 'Увійти' : 'Зареєструватися' }}
            </ULink>
          </div>
        </template>

        <template #footer v-if="authMode === 'login'">
          <div class="text-center mt-4">
            <ULink as="button" class="text-sm text-gray-500 hover:text-primary transition-colors" @click="setMode('forgotPassword')">
              Забули пароль?
            </ULink>
          </div>
        </template>
        
        <template #validation>
          <UAlert
            v-if="errorMessage"
            color="error"
            icon="i-lucide-alert-circle"
            variant="soft"
            :title="errorMessage"
          />
          <UAlert
            v-if="successMessage"
            color="success"
            icon="i-lucide-check-circle"
            variant="soft"
            :title="successMessage"
          />
        </template>
      </UAuthForm>
    </UPageCard>
  </div>
</template>
