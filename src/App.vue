<script setup lang="ts">
import AppFooter from '@/components/AppFooter.vue'
import AppHeader from '@/components/AppHeader.vue'
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-slate-50 text-slate-900">
    <AppHeader />
    <main class="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <RouterView />
    </main>
    <AppFooter />
  </div>
</template>
