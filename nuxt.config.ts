// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', '@nuxtjs/google-fonts'],
  css: ['~/assets/css/main.css'],
  googleFonts: {
    families: {
      Nunito: [400, 700, 900], // 900 — для тих самих жирних заголовків
    },
    display: 'swap',
    download: true // Завантажує шрифт локально при збірці (краще для швидкості)
  }
});