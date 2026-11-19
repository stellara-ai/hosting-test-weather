<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'

import SignaturePad from '@/components/SignaturePad.vue'
import StatusMessage from '@/components/StatusMessage.vue'
import {
  backend,
  BackendError,
  type CheckMode,
  type DeliveryOrder,
  type DeliveryOutcome,
  type DeliveryResult,
  type LineProblem,
} from '@/services/backend'
import {
  checkModeFor,
  creditCents,
  formatMoney,
  isValidMark,
  type LineMark,
  outcomeFor,
  toExceptions,
} from '@/services/delivery'

// Delivery confirmation, phone and tablet first. The driver (or any member of
// the business) opens the order at the door and hands the device over:
// "Did everything arrive?" -> optional checklist -> who is signing -> sign.
// "Signed on paper" records the current paper practice instead.

type Step = 'loading' | 'error' | 'recorded' | 'choose' | 'check' | 'signer' | 'sign' | 'driver' | 'paper' | 'done'

const route = useRoute()
const orderId = String(route.params.orderId)

const step = ref<Step>('loading')
const errorMessage = ref('')
const saveError = ref('')
const saving = ref(false)
const order = ref<DeliveryOrder | null>(null)
const result = ref<DeliveryResult | null>(null)

// Answers so far.
const outcome = ref<DeliveryOutcome>('all_received')
const checkMode = ref<CheckMode | null>(null)
const checked = reactive(new Set<string>())
const usedSelectAll = ref(false)
const marks = reactive<Record<string, LineMark>>({})
const signerChoice = ref<string>('') // an approved signer's id, or 'new'
const newSignerName = ref('')
const signatureEmpty = ref(true)
// Kept after the customer signs, while the driver finishes on the next screen.
const signatureBlob = ref<Blob | null>(null)
const pad = ref<InstanceType<typeof SignaturePad> | null>(null)
const photo = ref<File | null>(null)
const issueCredit = ref(false)
const noCreditReason = ref('')
const pdfBusy = ref(false)
const pdfError = ref('')

const REASONS = ['Wrong item', 'Not ordered', 'Quality problem', 'Back order', 'Other']
const NO_CREDIT_REASONS = ['Office to decide', 'Will be replaced on next delivery', 'Customer declined credit']
const PROBLEMS: { value: LineProblem; label: string }[] = [
  { value: 'short', label: 'Short' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'refused', label: 'Refused' },
]

const totalCents = computed(() =>
  (order.value?.lines ?? []).reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0),
)
const lines = computed(() => order.value?.lines ?? [])
const unchecked = computed(() => lines.value.filter((line) => !checked.has(line.id)))
const credit = computed(() => creditCents(lines.value, marks, checked))
const allChecked = computed(() => lines.value.length > 0 && unchecked.value.length === 0)
const checklistReady = computed(() => unchecked.value.every((line) => isValidMark(line, marks[line.id])))
const signerReady = computed(() =>
  signerChoice.value === 'new' ? newSignerName.value.trim().length >= 2 : signerChoice.value !== '',
)
const signingAs = computed(() => {
  if (signerChoice.value === 'new') return newSignerName.value.trim()
  return order.value?.signers.find((s) => s.id === signerChoice.value)?.name ?? ''
})

const OUTCOME_TEXT: Record<DeliveryOutcome, string> = {
  all_received: 'Everything arrived',
  exceptions: 'Delivered with problems',
  not_checked: 'Received, not checked',
  signed_on_paper: 'Signed on paper',
}

function messageFor(error: unknown, fallback: string) {
  if (error instanceof BackendError) return error.message
  // Show the device's own error too, so a problem on a phone can be diagnosed.
  return error instanceof Error && error.message ? `${fallback} (${error.message})` : fallback
}

async function load() {
  step.value = 'loading'
  try {
    order.value = await backend.getDeliveryOrder(orderId)
    step.value = order.value.delivery || order.value.status !== 'issued' ? 'recorded' : 'choose'
  } catch (error) {
    errorMessage.value = messageFor(error, 'This order could not be loaded.')
    step.value = 'error'
  }
}

function chooseEverything() {
  outcome.value = 'all_received'
  checkMode.value = 'skipped'
  step.value = 'signer'
}

function chooseChecklist() {
  step.value = 'check'
}

function chooseNotChecked() {
  outcome.value = 'not_checked'
  checkMode.value = null
  step.value = 'signer'
}

function toggle(lineId: string) {
  if (checked.has(lineId)) checked.delete(lineId)
  else checked.add(lineId)
}

function selectAll() {
  for (const line of lines.value) checked.add(line.id)
  usedSelectAll.value = true
}

function clearAll() {
  checked.clear()
}

function mark(lineId: string, status: LineProblem) {
  const line = lines.value.find((l) => l.id === lineId)!
  const previous = marks[lineId]
  marks[lineId] = {
    status,
    deliveredQuantity: status === 'short' ? (previous?.deliveredQuantity ?? Math.max(line.quantity - 1, 0)) : 0,
    reason: previous?.reason ?? '',
  }
}

function finishChecklist() {
  outcome.value = outcomeFor(lines.value, checked)
  checkMode.value = checkModeFor(usedSelectAll.value)
  step.value = 'signer'
}

function onPhoto(event: Event) {
  const input = event.target as HTMLInputElement
  photo.value = input.files?.[0] ?? null
}

/** The customer has signed: keep the signature and hand over to the driver. */
async function finishSigning() {
  saveError.value = ''
  const blob = await pad.value?.toBlob()
  if (!blob) {
    saveError.value = 'Please sign before continuing.'
    return
  }
  signatureBlob.value = blob
  step.value = 'driver'
}

async function save(paper: boolean) {
  if (!order.value) return
  saveError.value = ''
  saving.value = true
  try {
    const signature = paper ? null : signatureBlob.value
    if (!paper && !signature) throw new BackendError('Please sign before confirming.')
    result.value = await backend.recordDelivery({
      order: order.value,
      outcome: paper ? 'signed_on_paper' : outcome.value,
      checkMode: paper ? null : checkMode.value,
      exceptions: !paper && outcome.value === 'exceptions' ? toExceptions(lines.value, marks, checked) : [],
      signer: paper
        ? null
        : signerChoice.value === 'new'
          ? { newName: newSignerName.value.trim() }
          : { id: signerChoice.value },
      signature: signature ?? null,
      photo: photo.value,
      issueCredit: issueCredit.value,
      noCreditReason: noCreditReason.value,
    })
    step.value = 'done'
  } catch (error) {
    saveError.value = messageFor(error, 'The delivery could not be saved. Check the connection and try again.')
  } finally {
    saving.value = false
  }
}

/** Builds the signed invoice PDF on the server and downloads it. */
async function openPdf() {
  if (!order.value) return
  pdfBusy.value = true
  pdfError.value = ''
  try {
    const link = await backend.getOrderPdfLink(order.value.id)
    window.location.assign(link.url)
  } catch (error) {
    pdfError.value = messageFor(error, 'The invoice PDF could not be created.')
  } finally {
    pdfBusy.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="mx-auto max-w-2xl space-y-5 pb-28">
    <StatusMessage v-if="step === 'loading'" tone="loading">Loading the order…</StatusMessage>
    <StatusMessage v-else-if="step === 'error'" tone="error" @retry="load">{{ errorMessage }}</StatusMessage>

    <template v-else-if="order">
      <!-- Order header, on every step -->
      <header class="rounded-xl border border-slate-200 bg-white p-4">
        <p class="text-sm text-slate-500">Delivery · Order {{ order.number }}</p>
        <h1 class="text-xl font-semibold">{{ order.shipToName }}</h1>
        <p v-if="order.shipToAddress" class="text-sm whitespace-pre-line text-slate-600">{{ order.shipToAddress }}</p>
        <p class="mt-1 text-sm text-slate-600">{{ order.lines.length }} items · {{ formatMoney(totalCents) }}</p>
      </header>

      <!-- Already recorded -->
      <div v-if="step === 'recorded'" class="rounded-xl border border-slate-200 bg-white p-4" data-testid="delivery-recorded">
        <p class="text-lg font-semibold">Delivery already recorded</p>
        <p v-if="order.delivery" class="text-slate-600">
          {{ OUTCOME_TEXT[order.delivery.outcome] }}
          <template v-if="order.delivery.signerName"> · signed by {{ order.delivery.signerName }}</template>
          · {{ new Date(order.delivery.recordedAt).toLocaleString() }}
        </p>
        <p v-else class="text-slate-600">This order is {{ order.status }}.</p>
        <button
          type="button"
          class="mt-3 w-full rounded-xl bg-brand px-5 py-4 text-lg font-semibold text-white disabled:opacity-50"
          :disabled="pdfBusy"
          @click="openPdf"
        >
          {{ pdfBusy ? 'Building the invoice…' : 'Invoice PDF (signed)' }}
        </button>
        <p v-if="pdfError" role="alert" class="mt-2 text-sm text-red-800">{{ pdfError }}</p>
        <RouterLink to="/account" class="mt-3 inline-block font-medium text-brand">Back to orders</RouterLink>
      </div>

      <!-- Step 1: did everything arrive? -->
      <div v-else-if="step === 'choose'" class="space-y-3">
        <h2 class="text-2xl font-semibold">Did everything arrive?</h2>
        <button
          type="button"
          class="w-full rounded-xl bg-brand px-5 py-5 text-left text-lg font-semibold text-white hover:brightness-90"
          @click="chooseEverything"
        >
          Yes, everything arrived
          <span class="block text-sm font-normal opacity-90">Go straight to signing</span>
        </button>
        <button
          type="button"
          class="w-full rounded-xl border-2 border-slate-300 bg-white px-5 py-5 text-left text-lg font-semibold hover:bg-slate-50"
          @click="chooseChecklist"
        >
          Check the items
          <span class="block text-sm font-normal text-slate-600">One by one, or select all, and note any problems</span>
        </button>
        <button
          type="button"
          class="w-full rounded-xl border-2 border-slate-300 bg-white px-5 py-5 text-left text-lg font-semibold hover:bg-slate-50"
          @click="chooseNotChecked"
        >
          Can't check now
          <span class="block text-sm font-normal text-slate-600">Sign as received, not checked. The office will follow up.</span>
        </button>
        <button type="button" class="px-1 py-3 font-medium text-brand underline" @click="step = 'paper'">
          The customer signed the paper copy
        </button>
      </div>

      <!-- Step 2: checklist -->
      <div v-else-if="step === 'check'" class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-2xl font-semibold">Check the items</h2>
          <button
            v-if="!allChecked"
            type="button"
            class="shrink-0 rounded-lg border-2 border-brand px-4 py-2.5 font-semibold text-brand"
            @click="selectAll"
          >
            Select all
          </button>
          <button
            v-else
            type="button"
            class="shrink-0 rounded-lg border-2 border-slate-300 px-4 py-2.5 font-semibold text-slate-700"
            @click="clearAll"
          >
            Clear all
          </button>
        </div>
        <p class="text-sm text-slate-600">Tap each item that arrived. Any item left unticked needs a reason.</p>

        <ul class="space-y-2">
          <li
            v-for="line in lines"
            :key="line.id"
            class="rounded-xl border-2 bg-white"
            :class="checked.has(line.id) ? 'border-green-600' : 'border-slate-200'"
            data-testid="delivery-line"
          >
            <button
              type="button"
              class="flex w-full items-center gap-4 p-4 text-left"
              :aria-pressed="checked.has(line.id)"
              @click="toggle(line.id)"
            >
              <span
                class="flex size-8 shrink-0 items-center justify-center rounded-lg border-2 text-lg font-bold"
                :class="checked.has(line.id) ? 'border-green-600 bg-green-600 text-white' : 'border-slate-300 text-transparent'"
                aria-hidden="true"
                >✓</span
              >
              <span class="min-w-0 flex-1">
                <span class="block font-semibold">{{ line.description }}</span>
                <span class="block text-sm text-slate-600">
                  {{ line.quantity }} {{ line.unit }} · {{ line.itemCode }}
                </span>
              </span>
            </button>

            <!-- Unticked: what happened? -->
            <div v-if="!checked.has(line.id)" class="space-y-3 border-t border-slate-100 p-4 pt-3">
              <div class="grid grid-cols-3 gap-2" role="group" :aria-label="`What happened to ${line.description}?`">
                <button
                  v-for="problem in PROBLEMS"
                  :key="problem.value"
                  type="button"
                  class="rounded-lg border-2 px-2 py-3 font-semibold"
                  :class="
                    marks[line.id]?.status === problem.value
                      ? 'border-red-700 bg-red-50 text-red-800'
                      : 'border-slate-300 text-slate-700'
                  "
                  @click="mark(line.id, problem.value)"
                >
                  {{ problem.label }}
                </button>
              </div>
              <label v-if="marks[line.id]?.status === 'short'" class="flex items-center gap-3">
                <span class="text-sm text-slate-700">How many arrived?</span>
                <input
                  v-model.number="marks[line.id]!.deliveredQuantity"
                  type="number"
                  inputmode="numeric"
                  min="0"
                  :max="line.quantity - 1"
                  class="w-24 rounded-lg border border-slate-300 px-3 py-2.5 text-lg"
                />
                <span class="text-sm text-slate-600">of {{ line.quantity }}</span>
              </label>
              <select
                v-if="marks[line.id]"
                v-model="marks[line.id]!.reason"
                class="w-full rounded-lg border border-slate-300 bg-white px-3 py-3"
                :aria-label="`Reason for ${line.description}`"
              >
                <option value="">Reason (optional)</option>
                <option v-for="reason in REASONS" :key="reason" :value="reason">{{ reason }}</option>
              </select>
              <p v-if="!marks[line.id]" class="text-sm text-red-800">Choose short, damaged or refused, or tick the item.</p>
            </div>
          </li>
        </ul>
      </div>

      <!-- Step 3: who is signing -->
      <div v-else-if="step === 'signer'" class="space-y-3">
        <h2 class="text-2xl font-semibold">Who is signing?</h2>
        <p class="text-sm text-slate-600">{{ order.customerName }}'s approved signers</p>
        <div class="space-y-2" role="radiogroup" aria-label="Who is signing">
          <label
            v-for="signer in order.signers"
            :key="signer.id"
            class="flex cursor-pointer items-center gap-4 rounded-xl border-2 bg-white p-4"
            :class="signerChoice === signer.id ? 'border-brand' : 'border-slate-200'"
          >
            <input v-model="signerChoice" type="radio" :value="signer.id" class="size-6 accent-brand" />
            <span class="text-lg font-medium">{{ signer.name }}</span>
            <span v-if="signer.addedAtDelivery" class="ml-auto text-xs text-amber-800">added at a delivery</span>
          </label>
          <label
            class="flex cursor-pointer items-center gap-4 rounded-xl border-2 bg-white p-4"
            :class="signerChoice === 'new' ? 'border-brand' : 'border-slate-200'"
          >
            <input v-model="signerChoice" type="radio" value="new" class="size-6 accent-brand" />
            <span class="text-lg font-medium">Someone else</span>
          </label>
        </div>
        <div v-if="signerChoice === 'new'" class="space-y-2">
          <label for="new-signer" class="text-sm font-medium">Full name</label>
          <input
            id="new-signer"
            v-model="newSignerName"
            type="text"
            autocomplete="name"
            maxlength="80"
            class="w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
          />
          <p class="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            This person is not on the approved list. They will be added to {{ order.customerName }}'s
            signers and the office will be told.
          </p>
        </div>
      </div>

      <!-- Step 4: sign -->
      <div v-else-if="step === 'sign'" class="space-y-3">
        <h2 class="text-2xl font-semibold">Sign to confirm</h2>
        <div class="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <p class="font-medium">{{ OUTCOME_TEXT[outcome] }}</p>
          <p v-if="outcome === 'exceptions'" class="text-slate-700">
            {{ unchecked.length }} item(s) with problems · worth {{ formatMoney(credit) }}
          </p>
          <p class="text-slate-700">Signing as <span class="font-medium">{{ signingAs }}</span></p>
        </div>
        <SignaturePad ref="pad" @change="signatureEmpty = $event" />
      </div>

      <!-- Step 5: back to the driver. Money decisions belong to the business,
           so the customer never sees the credit choice. -->
      <div v-else-if="step === 'driver'" class="space-y-3">
        <p class="rounded-xl bg-slate-900 p-4 text-center text-lg font-semibold text-white">
          Signed. Please hand the phone back to the driver.
        </p>
        <h2 class="text-2xl font-semibold">Driver: confirm the delivery</h2>
        <div class="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <p class="font-medium">{{ OUTCOME_TEXT[outcome] }}</p>
          <p v-if="outcome === 'exceptions'" class="text-slate-700">
            {{ unchecked.length }} item(s) with problems · worth {{ formatMoney(credit) }}
          </p>
          <p class="text-slate-700">Signed by <span class="font-medium">{{ signingAs }}</span></p>
        </div>
        <!-- The credit memo is optional; problems are recorded either way. -->
        <div v-if="outcome === 'exceptions'" class="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <label class="flex cursor-pointer items-center justify-between gap-4">
            <span>
              <span class="block font-semibold">Issue credit memo now for {{ formatMoney(credit) }}</span>
              <span class="block text-sm text-slate-600">
                Off: the problems are recorded and the office decides on a credit.
              </span>
            </span>
            <input v-model="issueCredit" type="checkbox" role="switch" class="size-7 shrink-0 accent-brand" />
          </label>
          <select
            v-if="!issueCredit"
            v-model="noCreditReason"
            class="w-full rounded-lg border border-slate-300 bg-white px-3 py-3"
            aria-label="Why no credit memo"
          >
            <option value="">Note for the office (optional)</option>
            <option v-for="reason in NO_CREDIT_REASONS" :key="reason" :value="reason">{{ reason }}</option>
          </select>
        </div>
      </div>

      <!-- Signed on paper -->
      <div v-else-if="step === 'paper'" class="space-y-3">
        <h2 class="text-2xl font-semibold">Signed on paper</h2>
        <p class="text-slate-600">
          Mark this order delivered because the customer signed the printed copy. A photo of the signed copy
          is optional but recommended.
        </p>
        <label class="block rounded-xl border-2 border-dashed border-slate-300 bg-white p-5 text-center">
          <span class="text-lg font-semibold">{{ photo ? 'Change photo' : 'Take a photo of the signed copy' }}</span>
          <input type="file" accept="image/*" capture="environment" class="sr-only" @change="onPhoto" />
          <span v-if="photo" class="mt-1 block text-sm text-slate-600">{{ photo.name }}</span>
        </label>
      </div>

      <!-- Done -->
      <div v-else-if="step === 'done' && result" class="space-y-3 rounded-xl border-2 border-green-600 bg-white p-5" data-testid="delivery-done">
        <p class="text-2xl font-semibold text-green-800">Delivery recorded</p>
        <p class="text-lg">{{ OUTCOME_TEXT[result.outcome] }}</p>
        <p v-if="result.signerName">Signed by {{ result.signerName }}</p>
        <p v-if="result.creditMemoNumber" class="font-medium">
          Credit memo {{ result.creditMemoNumber }} for {{ formatMoney(result.creditMemoCents) }}
        </p>
        <p v-else-if="result.creditSkipped" class="font-medium">
          Problems worth {{ formatMoney(result.missingCents) }} recorded · no credit memo ({{ result.noCreditReason }})
        </p>
        <button
          type="button"
          class="w-full rounded-xl bg-brand px-5 py-4 text-lg font-semibold text-white disabled:opacity-50"
          :disabled="pdfBusy"
          @click="openPdf"
        >
          {{ pdfBusy ? 'Building the invoice…' : 'Invoice PDF (signed)' }}
        </button>
        <p v-if="pdfError" role="alert" class="text-sm text-red-800">{{ pdfError }}</p>
        <RouterLink to="/account" class="inline-block font-medium text-brand">Back to orders</RouterLink>
      </div>

      <p v-if="saveError" role="alert" class="rounded-lg bg-red-50 p-3 text-red-800">{{ saveError }}</p>

      <!-- Bottom action bar: thumb-reachable on a phone -->
      <div
        v-if="['check', 'signer', 'sign', 'driver', 'paper'].includes(step)"
        class="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur"
      >
        <div class="mx-auto flex max-w-2xl items-center gap-3">
          <button
            type="button"
            class="rounded-xl border-2 border-slate-300 px-5 py-4 font-semibold text-slate-700"
            :disabled="saving"
            @click="
              step =
                step === 'driver'
                  ? 'sign'
                  : step === 'sign'
                    ? 'signer'
                    : step === 'signer' && checkMode !== 'skipped' && outcome !== 'not_checked'
                      ? 'check'
                      : 'choose'
            "
          >
            Back
          </button>
          <button
            v-if="step === 'check'"
            type="button"
            class="flex-1 rounded-xl bg-brand px-5 py-4 text-lg font-semibold text-white disabled:opacity-50"
            :disabled="!checklistReady"
            @click="finishChecklist"
          >
            {{ allChecked ? 'All received · Continue' : `Continue · problems worth ${formatMoney(credit)}` }}
          </button>
          <button
            v-else-if="step === 'signer'"
            type="button"
            class="flex-1 rounded-xl bg-brand px-5 py-4 text-lg font-semibold text-white disabled:opacity-50"
            :disabled="!signerReady"
            @click="step = 'sign'"
          >
            Continue to sign
          </button>
          <button
            v-else-if="step === 'sign'"
            type="button"
            class="flex-1 rounded-xl bg-brand px-5 py-4 text-lg font-semibold text-white disabled:opacity-50"
            :disabled="signatureEmpty"
            @click="finishSigning"
          >
            Done signing
          </button>
          <button
            v-else-if="step === 'driver'"
            type="button"
            class="flex-1 rounded-xl bg-brand px-5 py-4 text-lg font-semibold text-white disabled:opacity-50"
            :disabled="saving"
            @click="save(false)"
          >
            {{ saving ? 'Saving…' : 'Confirm delivery' }}
          </button>
          <button
            v-else
            type="button"
            class="flex-1 rounded-xl bg-brand px-5 py-4 text-lg font-semibold text-white disabled:opacity-50"
            :disabled="saving"
            @click="save(true)"
          >
            {{ saving ? 'Saving…' : 'Mark delivered' }}
          </button>
        </div>
      </div>
    </template>
  </section>
</template>
