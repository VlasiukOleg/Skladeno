<template>
  <div class="flex flex-col items-center justify-center py-10 w-full overflow-hidden">
    <!-- Текст завантаження -->
    <div class="text-sm font-medium text-gray-500 mb-6 flex items-center gap-2">
      <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin text-primary" />
      {{ text || 'Мураха-кошторисник збирає ваші матеріали в кошик...' }}
    </div>

    <!-- Відео мурахи -->
    <div class="w-full max-w-md rounded-xl overflow-hidden shadow-sm border border-gray-100">
      <video 
        src="/video-loader.mp4" 
        autoplay 
        loop 
        muted 
        playsinline 
        class="w-full h-auto object-cover"
      ></video>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  text?: string
}>()
</script>

<style scoped>
/* Стилі для відео (анімація більше не потрібна) */
</style>
