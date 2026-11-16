<template>
  <section class="space-y-4 py-8 text-center">
    <h1 class="text-2xl font-semibold">Page not found</h1>
    <p class="text-slate-600">There is nothing at this address.</p>
    <RouterLink :to="{ name: 'home' }" class="inline-block py-2 font-medium text-sky-700 underline">
      Back to search
    </RouterLink>
  </section>
</template>
