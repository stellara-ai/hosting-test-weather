<script setup lang="ts">
import { onMounted, ref } from 'vue'

import StatusMessage from '@/components/StatusMessage.vue'
import {
  backend,
  BackendError,
  type OrderPdfLink,
  type OrderSummary,
} from '@/services/backend'

// Stage three, Part C: seeded orders and a server-built invoice PDF.
const status = ref<'loading' | 'ready' | 'empty' | 'error'>('loading')
const orders = ref<OrderSummary[]>([])
const errorMessage = ref('')
const busyId = ref<string | null>(null)
const pdfError = ref('')
const lastPdf = ref<{ number: string; link: OrderPdfLink } | null>(null)

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

const STATUS_TEXT: Record<OrderSummary['status'], string> = {
  draft: 'Draft',
  issued: 'Issued',
  delivered: 'Delivered',
  paid: 'Paid',
  void: 'Void',
}

function messageFor(error: unknown, fallback: string): string {
  return error instanceof BackendError ? error.message : fallback
}

async function load() {
  status.value = 'loading'
  try {
    orders.value = await backend.listOrders()
    status.value = orders.value.length > 0 ? 'ready' : 'empty'
  } catch (error) {
    errorMessage.value = messageFor(error, 'Your orders could not be loaded.')
    status.value = 'error'
  }
}

async function openPdf(order: OrderSummary) {
  busyId.value = order.id
  pdfError.value = ''
  try {
    const link = await backend.getOrderPdfLink(order.id)
    lastPdf.value = { number: order.number, link }
    window.location.assign(link.url)
  } catch (error) {
    pdfError.value = messageFor(error, 'The invoice PDF could not be created.')
  } finally {
    busyId.value = null
  }
}

onMounted(load)
</script>

<template>
  <section class="space-y-3">
    <h2 class="text-lg font-semibold">Orders</h2>
    <p class="text-sm text-slate-600">
      Test orders for your business. The invoice PDF is built on the server and downloaded
      through a link that expires after five minutes.
    </p>

    <StatusMessage v-if="status === 'loading'" tone="loading">Loading orders…</StatusMessage>
    <StatusMessage v-else-if="status === 'error'" tone="error" @retry="load">
      {{ errorMessage }}
    </StatusMessage>
    <StatusMessage v-else-if="status === 'empty'" tone="empty">
      No orders for your business.
    </StatusMessage>
    <ul v-else class="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
      <li
        v-for="order in orders"
        :key="order.id"
        class="flex items-center justify-between gap-3 px-4 py-3"
        data-testid="order-row"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium">Order {{ order.number }} · {{ order.customerName }}</p>
          <p class="text-sm text-slate-600">
            {{ order.orderedOn }} · {{ money.format(order.totalCents / 100) }} ·
            <span :class="order.status === 'delivered' ? 'font-medium text-green-800' : ''">{{
              STATUS_TEXT[order.status]
            }}</span>
          </p>
        </div>
        <RouterLink
          v-if="order.status === 'issued'"
          :to="{ name: 'deliver', params: { orderId: order.id } }"
          class="shrink-0 rounded-lg border-2 border-brand px-4 py-2 text-sm font-semibold text-brand hover:bg-slate-50"
        >
          Deliver
        </RouterLink>
        <button
          type="button"
          class="shrink-0 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white hover:brightness-90 disabled:opacity-60"
          :disabled="busyId !== null"
          :aria-label="`Download invoice PDF for order ${order.number}`"
          @click="openPdf(order)"
        >
          {{ busyId === order.id ? 'Building…' : 'Invoice PDF' }}
        </button>
      </li>
    </ul>
    <p v-if="pdfError" role="alert" class="text-sm text-red-800">{{ pdfError }}</p>
    <p v-if="lastPdf" class="text-xs text-slate-500" data-testid="pdf-measurements">
      Order {{ lastPdf.number }}: {{ Math.round(lastPdf.link.measurements.bytes / 1024) }} KB,
      built in {{ lastPdf.link.measurements.buildMs }} ms,
      {{ lastPdf.link.measurements.totalMs }} ms in the function,
      {{ lastPdf.link.measurements.heapMb }} MB memory in use.
    </p>
  </section>
</template>
