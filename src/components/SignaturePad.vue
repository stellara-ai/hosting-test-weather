<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

// A signature pad on the browser canvas, for finger, stylus or mouse.
// Strokes are kept as points relative to the pad's size, so the drawing
// survives a resize or a tablet turning between portrait and landscape.
// `touch-action: none` stops the page scrolling while someone signs.

const emit = defineEmits<{ change: [empty: boolean] }>()

type Point = { x: number; y: number }

const canvas = ref<HTMLCanvasElement | null>(null)
const strokes: Point[][] = []
let current: Point[] | null = null
let observer: ResizeObserver | null = null

function context() {
  return canvas.value?.getContext('2d') ?? null
}

/** Matches the canvas's pixel size to its displayed size, for sharp lines. */
function fit() {
  const el = canvas.value
  if (!el) return
  const ratio = window.devicePixelRatio || 1
  const { width, height } = el.getBoundingClientRect()
  el.width = Math.round(width * ratio)
  el.height = Math.round(height * ratio)
  redraw()
}

function redraw() {
  const el = canvas.value
  const ctx = context()
  if (!el || !ctx) return
  const ratio = window.devicePixelRatio || 1
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, el.width, el.height)
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#1e3a8a'
  const width = el.width / ratio
  const height = el.height / ratio
  for (const stroke of strokes) {
    if (stroke.length === 0) continue
    ctx.beginPath()
    const first = stroke[0]!
    ctx.moveTo(first.x * width, first.y * height)
    if (stroke.length === 1) {
      ctx.lineTo(first.x * width + 0.1, first.y * height)
    }
    // Smooth the line through the midpoints between samples.
    for (let i = 1; i < stroke.length - 1; i++) {
      const p = stroke[i]!
      const next = stroke[i + 1]!
      ctx.quadraticCurveTo(p.x * width, p.y * height, ((p.x + next.x) / 2) * width, ((p.y + next.y) / 2) * height)
    }
    if (stroke.length > 1) {
      const last = stroke[stroke.length - 1]!
      ctx.lineTo(last.x * width, last.y * height)
    }
    ctx.stroke()
  }
}

function pointFrom(event: PointerEvent): Point {
  const rect = canvas.value!.getBoundingClientRect()
  return {
    x: Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1),
    y: Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1),
  }
}

function start(event: PointerEvent) {
  event.preventDefault()
  canvas.value?.setPointerCapture(event.pointerId)
  current = [pointFrom(event)]
  strokes.push(current)
  redraw()
}

function move(event: PointerEvent) {
  if (!current) return
  event.preventDefault()
  // Use every sample the device recorded, not only the last, for smooth lines.
  const samples = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event]
  for (const sample of samples) current.push(pointFrom(sample))
  redraw()
}

function end() {
  if (!current) return
  current = null
  emit('change', strokes.length === 0)
}

function clear() {
  strokes.length = 0
  current = null
  redraw()
  emit('change', true)
}

/** The signature as a PNG with a transparent background, or null if empty. */
function toBlob(): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (!canvas.value || strokes.length === 0) return resolve(null)
    canvas.value.toBlob((blob) => resolve(blob), 'image/png')
  })
}

defineExpose({ clear, toBlob })

onMounted(() => {
  fit()
  observer = new ResizeObserver(fit)
  if (canvas.value) observer.observe(canvas.value)
})

onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div class="space-y-2">
    <div class="relative rounded-xl border-2 border-dashed border-slate-300 bg-white">
      <canvas
        ref="canvas"
        class="block h-56 w-full cursor-crosshair touch-none select-none sm:h-72"
        aria-label="Signature pad. Sign with your finger, a stylus or the mouse."
        role="img"
        @pointerdown="start"
        @pointermove="move"
        @pointerup="end"
        @pointercancel="end"
        @pointerleave="end"
      />
      <div class="pointer-events-none absolute right-4 bottom-10 left-4 border-b border-slate-300" />
      <p class="pointer-events-none absolute bottom-3 left-4 text-xs text-slate-400">Sign above the line</p>
    </div>
    <button
      type="button"
      class="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
      @click="clear"
    >
      Clear signature
    </button>
  </div>
</template>
