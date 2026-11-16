<script setup lang="ts">
const label = import.meta.env.VITE_APP_LABEL || 'not set'
</script>

<template>
  <footer class="border-t border-slate-200 bg-white">
    <div
      class="mx-auto flex w-full max-w-xl flex-col gap-1 px-4 py-4 text-xs text-slate-500 sm:flex-row sm:justify-between"
    >
      <p>
        Label: <span data-testid="app-label" class="font-medium text-slate-700">{{ label }}</span>
      </p>
      <p>
        <a
          href="https://open-meteo.com/"
          target="_blank"
          rel="noopener"
          class="underline hover:text-slate-700"
          >Weather data by Open-Meteo.com</a
        >
        (CC BY 4.0)
      </p>
    </div>
  </footer>
</template>
