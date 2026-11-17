/**
 * Lays out an order as a letter-size invoice PDF, following the layout of
 * LAMO's sample invoices: the business's logo and contact block, the title
 * with date, ship date and invoice number, Bill To and Ship To boxes, a table
 * of line items, and a Total box beside the delivery signature. One set of
 * pages per labelled copy ("Business copy", "Client copy").
 *
 * Long invoices continue onto further pages. Every page repeats the header,
 * Bill To and Ship To; every page but the last ends "Continued on next page";
 * the last carries the Total and the signature.
 *
 * Each business chooses which optional fields print, which columns the table
 * has, colour or black and white, the table lines, and page numbers (see
 * InvoiceOptions). Pure layout: the caller supplies the data and image bytes;
 * this file knows nothing about Supabase.
 */
// Loaded through esm.sh, not `npm:`. The library's @pdf-lib/standard-fonts
// dependency is CommonJS that re-exports through a helper, and the Edge
// Runtime cannot see those exports through `npm:` (boot error "does not
// provide an export named 'FontNames'", 2026-11-17). esm.sh rebuilds it as
// an ES module. Keep the version pinned.
import {
  PageSizes,
  PDFDocument,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  rgb,
  StandardFonts,
} from 'https://esm.sh/@pdfme/pdf-lib@6.2.8?target=denonext'

type Colour = ReturnType<typeof rgb>

export interface InvoiceLine {
  itemCode: string
  description: string
  unit: string
  quantity: number
  unitPriceCents: number
}

export interface Party {
  name: string
  /** Multi-line address, lines separated by "\n", or empty. */
  address: string
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export const COLUMN_IDS = ['quantity', 'itemCode', 'description', 'unit', 'priceEach', 'amount'] as const
export type ColumnId = (typeof COLUMN_IDS)[number]

export const TABLE_LINES = ['columns', 'grid', 'none'] as const
export type TableLines = (typeof TABLE_LINES)[number]

export const COLOUR_MODES = ['color', 'blackAndWhite'] as const
export type ColourMode = (typeof COLOUR_MODES)[number]

/**
 * What a business prints. Anything not set takes the default, which matches
 * LAMO's sample invoices. The invoice number, Bill To, Ship To, the
 * Description column and the total always print.
 */
export interface InvoiceOptions {
  showName: boolean
  showAddress: boolean
  showEmail: boolean
  showPhone: boolean
  showDate: boolean
  showShipDate: boolean
  /** The "Business copy" / "Client copy" tags. Both copies are still produced. */
  showCopyLabels: boolean
  /** "Page 1 of 2" in the footer, counted per copy. */
  showPageNumbers: boolean
  /** Table columns, left to right. Description is always included. */
  columns: ColumnId[]
  /** "columns": lines between columns (as on the samples); "grid": also between rows; "none": outline only. */
  tableLines: TableLines
  /** "blackAndWhite" draws everything in black and greys and keeps the table header light to save toner. */
  colorMode: ColourMode
}

export const DEFAULT_OPTIONS: InvoiceOptions = {
  showName: true,
  showAddress: true,
  showEmail: true,
  showPhone: true,
  showDate: true,
  showShipDate: true,
  showCopyLabels: true,
  showPageNumbers: true,
  columns: ['quantity', 'itemCode', 'description', 'priceEach', 'amount'],
  tableLines: 'columns',
  colorMode: 'color',
}

const SWITCHES = [
  'showName',
  'showAddress',
  'showEmail',
  'showPhone',
  'showDate',
  'showShipDate',
  'showCopyLabels',
  'showPageNumbers',
] as const

function oneOf<T extends string>(allowed: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
}

/**
 * Reads a business's stored settings (the tenants.invoice_settings JSON).
 * Values of the wrong type or unknown names are ignored and the default
 * applies, so a typo can never break an invoice.
 */
export function readInvoiceOptions(raw: unknown): InvoiceOptions {
  const options: InvoiceOptions = { ...DEFAULT_OPTIONS, columns: [...DEFAULT_OPTIONS.columns] }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return options
  const settings = raw as Record<string, unknown>

  for (const key of SWITCHES) {
    if (typeof settings[key] === 'boolean') options[key] = settings[key] as boolean
  }
  if (oneOf(TABLE_LINES, settings.tableLines)) options.tableLines = settings.tableLines
  if (oneOf(COLOUR_MODES, settings.colorMode)) options.colorMode = settings.colorMode

  if (Array.isArray(settings.columns)) {
    const columns: ColumnId[] = []
    for (const id of settings.columns) {
      if (oneOf(COLUMN_IDS, id) && !columns.includes(id)) columns.push(id)
    }
    if (columns.length > 0) {
      if (!columns.includes('description')) columns.splice(Math.min(2, columns.length), 0, 'description')
      options.columns = columns
    }
  }
  return options
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export interface InvoiceData {
  options: InvoiceOptions
  business: {
    name: string
    address: string
    email: string
    phone: string
    primaryColor: string
    accentColor: string
  }
  invoiceNumber: string
  invoiceDate: string
  shipDate: string | null
  billTo: Party
  shipTo: Party
  lines: InvoiceLine[]
  /** PNG or JPG bytes, or null to show the business name alone. */
  logo: ImageBytes | null
  /** PNG or JPG bytes of the delivery signature, or null when not signed yet. */
  signature: ImageBytes | null
  generatedAt: Date
}

export interface ImageBytes {
  bytes: Uint8Array
  type: 'png' | 'jpg'
}

export const COPY_LABELS = ['Business copy', 'Client copy'] as const

export class TooManyLinesError extends Error {
  override name = 'TooManyLinesError'
}

// ---------------------------------------------------------------------------
// Geometry, in points (1/72 inch). Letter is 612 x 792.
// ---------------------------------------------------------------------------

const MARGIN = 36
const ROW = 12
const TOP = PageSizes.Letter[1] - MARGIN
const PARTIES_TOP = TOP - 132
const PARTY_HEIGHT = 84
const TABLE_TOP = PARTIES_TOP - PARTY_HEIGHT - 14
const FOOTER_ROW = 66
const TABLE_BOTTOM = MARGIN + 18 + FOOTER_ROW
const FIRST_ROW = TABLE_TOP - 31

/** How many line items fit on one page. */
export const LINES_PER_PAGE = Math.floor((FIRST_ROW - (TABLE_BOTTOM + 4)) / ROW) + 1

/** A cap on pages per copy, which bounds the function's processing time. */
export const MAX_PAGES = 10

const BLACK = rgb(0.1, 0.1, 0.1)
const GREY = rgb(0.4, 0.4, 0.4)
const BORDER = rgb(0.25, 0.25, 0.25)
const RULE = rgb(0.8, 0.8, 0.8)
const SHADE = rgb(0.94, 0.94, 0.94)
const HEADER_GREY = rgb(0.85, 0.85, 0.85)
const WHITE = rgb(1, 1, 1)

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const plain = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

/** "39.98", as in the table of the sample invoices. */
export function formatAmount(cents: number): string {
  return plain.format(cents / 100)
}

/** "$868.45", as in the Total box. */
export function formatTotal(cents: number): string {
  return currency.format(cents / 100)
}

export function lineTotalCents(line: InvoiceLine): number {
  return line.quantity * line.unitPriceCents
}

/** "2026-11-16" to "11/16/2026", as on the sample invoices. */
export function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return iso
  return `${Number(match[2])}/${Number(match[3])}/${match[1]}`
}

/** Hex colour (#rrggbb) to a pdf-lib colour; falls back to near-black. */
function colour(hex: string): Colour {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!match) return BLACK
  const [r, g, b] = match.slice(1).map((part) => parseInt(part, 16) / 255)
  return rgb(r, g, b)
}

/**
 * The standard PDF fonts only cover Latin-1 (WinAnsi). Replace anything else
 * so a stray character in a product name cannot break the whole document.
 */
export function printable(text: string): string {
  return text.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?')
}

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

/** Splits the lines into pages of at most LINES_PER_PAGE (at least one page). */
export function paginate<T>(items: T[]): T[][] {
  const pages: T[][] = []
  for (let i = 0; i < items.length; i += LINES_PER_PAGE) pages.push(items.slice(i, i + LINES_PER_PAGE))
  return pages.length > 0 ? pages : [[]]
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

interface Fonts {
  regular: PDFFont
  bold: PDFFont
}

type Align = 'left' | 'right' | 'center'

/** Draws one line of text, shortened with an ellipsis if it would exceed maxWidth. */
function text(
  page: PDFPage,
  value: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  options: { color?: Colour; align?: Align; maxWidth?: number } = {},
) {
  let safe = printable(value)
  if (options.maxWidth !== undefined && font.widthOfTextAtSize(safe, size) > options.maxWidth) {
    while (safe.length > 1 && font.widthOfTextAtSize(`${safe}...`, size) > options.maxWidth) {
      safe = safe.slice(0, -1)
    }
    safe = `${safe}...`
  }
  const width = font.widthOfTextAtSize(safe, size)
  const left = options.align === 'right' ? x - width : options.align === 'center' ? x - width / 2 : x
  page.drawText(safe, { x: left, y, size, font, color: options.color ?? BLACK })
}

function box(page: PDFPage, x: number, y: number, width: number, height: number, fill?: Colour) {
  page.drawRectangle({ x, y, width, height, borderColor: BORDER, borderWidth: 0.75, color: fill })
}

function vline(page: PDFPage, x: number, top: number, bottom: number) {
  page.drawLine({ start: { x, y: top }, end: { x, y: bottom }, thickness: 0.75, color: BORDER })
}

function hline(page: PDFPage, left: number, right: number, y: number, color = RULE) {
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color })
}

async function embed(doc: PDFDocument, image: ImageBytes | null): Promise<PDFImage | null> {
  if (!image) return null
  return image.type === 'png' ? doc.embedPng(image.bytes) : doc.embedJpg(image.bytes)
}

// ---------------------------------------------------------------------------
// Table columns
// ---------------------------------------------------------------------------

interface ColumnSpec {
  heading: string
  /** Fixed width in points; the Description column takes what is left. */
  width: number | null
  align: Align
  value: (line: InvoiceLine) => string
}

const COLUMN_SPECS: Record<ColumnId, ColumnSpec> = {
  quantity: { heading: 'Quantity', width: 58, align: 'right', value: (l) => String(l.quantity) },
  itemCode: { heading: 'Item Code', width: 70, align: 'left', value: (l) => l.itemCode },
  description: { heading: 'Description', width: null, align: 'left', value: (l) => l.description },
  unit: { heading: 'Unit', width: 50, align: 'left', value: (l) => l.unit },
  priceEach: { heading: 'Price Each', width: 80, align: 'right', value: (l) => formatAmount(l.unitPriceCents) },
  amount: { heading: 'Amount', width: 80, align: 'right', value: (l) => formatAmount(lineTotalCents(l)) },
}

interface PlacedColumn extends ColumnSpec {
  left: number
  right: number
}

function placeColumns(ids: ColumnId[], left: number, right: number): PlacedColumn[] {
  const fixed = ids.reduce((sum, id) => sum + (COLUMN_SPECS[id].width ?? 0), 0)
  const flexible = Math.max(100, right - left - fixed)
  let x = left
  return ids.map((id) => {
    const spec = COLUMN_SPECS[id]
    const width = spec.width ?? flexible
    const placed = { ...spec, left: x, right: x + width }
    x += width
    return placed
  })
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface Palette {
  title: Colour
  headerFill: Colour
  headerText: Colour
  tagFill: Colour | null
  tagText: Colour
  total: Colour
}

function palette(data: InvoiceData): Palette {
  if (data.options.colorMode === 'blackAndWhite') {
    return { title: BLACK, headerFill: HEADER_GREY, headerText: BLACK, tagFill: null, tagText: BLACK, total: BLACK }
  }
  const primary = colour(data.business.primaryColor)
  return {
    title: primary,
    headerFill: primary,
    headerText: WHITE,
    tagFill: colour(data.business.accentColor),
    tagText: WHITE,
    total: primary,
  }
}

interface PageContext {
  data: InvoiceData
  fonts: Fonts
  colours: Palette
  logo: PDFImage | null
  signature: PDFImage | null
  label: string
  pageNumber: number
  pageCount: number
  totalCents: number
}

function drawHeader(page: PDFPage, ctx: PageContext, left: number, right: number) {
  const { data, fonts, colours, logo } = ctx
  const options = data.options

  // Business: logo, then whichever of name, address, email and phone are on.
  // Lines that are switched off or empty take no space.
  let y = TOP
  if (logo) {
    const scale = Math.min(170 / logo.width, 56 / logo.height)
    page.drawImage(logo, { x: left, y: y - logo.height * scale, width: logo.width * scale, height: logo.height * scale })
    y -= logo.height * scale + 2
  }
  const contact: { value: string; bold: boolean }[] = [
    ...(options.showName ? [{ value: data.business.name, bold: true }] : []),
    ...(options.showAddress
      ? lines(data.business.address).slice(0, 2).map((value) => ({ value, bold: false }))
      : []),
    ...(options.showEmail ? [{ value: data.business.email, bold: false }] : []),
    ...(options.showPhone ? [{ value: data.business.phone, bold: false }] : []),
  ].filter((line) => line.value.trim().length > 0)
  for (const line of contact) {
    y -= ROW
    text(page, line.value, left, y, line.bold ? fonts.bold : fonts.regular, line.bold ? 11 : 10, { maxWidth: 270 })
  }

  // Title; whichever of date and ship date are on, and the invoice number.
  text(page, 'Invoice', right, TOP - 22, fonts.bold, 24, { color: colours.title, align: 'right' })
  const cells = [
    ...(options.showDate ? [['Date', formatDate(data.invoiceDate)]] : []),
    ...(options.showShipDate ? [['Ship Date', data.shipDate ? formatDate(data.shipDate) : '']] : []),
    ['Invoice #', data.invoiceNumber],
  ]
  const cell = 78
  const boxLeft = right - cell * cells.length
  box(page, boxLeft, TOP - 72, cell * cells.length, 36)
  box(page, boxLeft, TOP - 54, cell * cells.length, 18, SHADE)
  cells.forEach(([heading, value], i) => {
    const centre = boxLeft + cell * i + cell / 2
    if (i > 0) vline(page, boxLeft + cell * i, TOP - 36, TOP - 72)
    text(page, heading, centre, TOP - 49, fonts.regular, 9, { align: 'center' })
    text(page, value, centre, TOP - 67, fonts.regular, 9, { align: 'center', maxWidth: cell - 8 })
  })

  // Copy label: filled in colour, outlined in black and white.
  if (options.showCopyLabels) {
    const tag = ctx.label.toUpperCase()
    const tagWidth = fonts.bold.widthOfTextAtSize(tag, 8) + 14
    page.drawRectangle({
      x: right - tagWidth,
      y: TOP - 94,
      width: tagWidth,
      height: 15,
      color: colours.tagFill ?? undefined,
      borderColor: colours.tagFill ? undefined : BLACK,
      borderWidth: colours.tagFill ? 0 : 0.75,
    })
    text(page, tag, right - 7, TOP - 89, fonts.bold, 8, { color: colours.tagText, align: 'right' })
  }

  // Bill To and Ship To.
  const partyWidth = (right - left - 24) / 2
  partyBox(page, 'Bill To', data.billTo, left, partyWidth, fonts)
  partyBox(page, 'Ship To', data.shipTo, left + partyWidth + 24, partyWidth, fonts)
}

/** A titled box (Bill To, Ship To) holding a name and address. */
function partyBox(page: PDFPage, title: string, party: Party, x: number, width: number, fonts: Fonts) {
  const top = PARTIES_TOP
  box(page, x, top - PARTY_HEIGHT, width, PARTY_HEIGHT)
  box(page, x, top - 16, width, 16, SHADE)
  text(page, title, x + 6, top - 12, fonts.bold, 9)
  let y = top - 30
  for (const [i, line] of [party.name, ...lines(party.address)].slice(0, 5).entries()) {
    text(page, line, x + 6, y, i === 0 ? fonts.bold : fonts.regular, 9, { maxWidth: width - 12 })
    y -= ROW
  }
}

function drawTable(page: PDFPage, ctx: PageContext, pageLines: InvoiceLine[], left: number, right: number) {
  const { data, fonts, colours } = ctx
  const columns = placeColumns(data.options.columns, left, right)
  const tableLines = data.options.tableLines

  box(page, left, TABLE_BOTTOM, right - left, TABLE_TOP - TABLE_BOTTOM)
  page.drawRectangle({ x: left, y: TABLE_TOP - 18, width: right - left, height: 18, color: colours.headerFill })
  for (const column of columns) {
    text(page, column.heading, (column.left + column.right) / 2, TABLE_TOP - 13, fonts.bold, 9, {
      color: colours.headerText,
      align: 'center',
      maxWidth: column.right - column.left - 6,
    })
  }
  if (tableLines !== 'none') {
    for (const column of columns.slice(1)) vline(page, column.left, TABLE_TOP, TABLE_BOTTOM)
  }

  let rowY = FIRST_ROW
  for (const line of pageLines) {
    for (const column of columns) {
      const width = column.right - column.left - 10
      const x = column.align === 'right' ? column.right - 5 : column.left + 5
      text(page, column.value(line), x, rowY, fonts.regular, 9, { align: column.align, maxWidth: width })
    }
    if (tableLines === 'grid') hline(page, left, right, rowY - 3.5)
    rowY -= ROW
  }
}

function drawBottomRow(page: PDFPage, ctx: PageContext, left: number, right: number) {
  const { fonts, colours, signature } = ctx
  const rowTop = TABLE_BOTTOM
  const rowBottom = TABLE_BOTTOM - FOOTER_ROW
  box(page, left, rowBottom, right - left, FOOTER_ROW)

  if (ctx.pageNumber < ctx.pageCount) {
    text(page, 'Continued on next page', (left + right) / 2, rowBottom + 28, fonts.regular, 10, {
      color: GREY,
      align: 'center',
    })
    return
  }

  const divider = right - 160
  vline(page, divider, rowTop, rowBottom)
  text(page, 'Received by', left + 6, rowTop - 12, fonts.regular, 8, { color: GREY })
  if (signature) {
    const scale = Math.min(170 / signature.width, 44 / signature.height)
    page.drawImage(signature, {
      x: left + 70,
      y: rowBottom + 6,
      width: signature.width * scale,
      height: signature.height * scale,
    })
  } else {
    text(page, 'Not signed yet', left + 70, rowBottom + 24, fonts.regular, 9, { color: GREY })
  }
  text(page, 'Total', divider + 12, rowBottom + 25, fonts.bold, 16)
  text(page, formatTotal(ctx.totalCents), right - 6, rowBottom + 26, fonts.bold, 11, {
    color: colours.total,
    align: 'right',
  })
}

function drawFooter(page: PDFPage, ctx: PageContext, left: number, right: number) {
  const { data, fonts } = ctx
  if (data.options.showPageNumbers) {
    text(page, `Page ${ctx.pageNumber} of ${ctx.pageCount}`, left, MARGIN, fonts.regular, 8, { color: GREY })
  }
  // The copy name follows the same setting as the tag.
  const generated = `generated ${data.generatedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC - test document`
  text(page, data.options.showCopyLabels ? `${ctx.label} - ${generated}` : generated, right, MARGIN, fonts.regular, 7, {
    color: GREY,
    align: 'right',
  })
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export async function buildInvoicePdf(data: InvoiceData): Promise<Uint8Array> {
  const pages = paginate(data.lines)
  if (pages.length > MAX_PAGES) {
    throw new TooManyLinesError(
      `This invoice has ${data.lines.length} lines; at most ${MAX_PAGES * LINES_PER_PAGE} fit (${MAX_PAGES} pages).`,
    )
  }
  const doc = await PDFDocument.create()
  doc.setTitle(printable(`Invoice ${data.invoiceNumber} - ${data.business.name}`))
  doc.setProducer(printable(data.business.name))

  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  }
  // Embedded once, drawn on every page.
  const logo = await embed(doc, data.logo)
  const signature = await embed(doc, data.signature)
  const colours = palette(data)
  const totalCents = data.lines.reduce((sum, line) => sum + lineTotalCents(line), 0)

  for (const label of COPY_LABELS) {
    pages.forEach((pageLines, i) => {
      const page = doc.addPage(PageSizes.Letter)
      const left = MARGIN
      const right = page.getWidth() - MARGIN
      const ctx: PageContext = {
        data,
        fonts,
        colours,
        logo,
        signature,
        label,
        pageNumber: i + 1,
        pageCount: pages.length,
        totalCents,
      }
      drawHeader(page, ctx, left, right)
      drawTable(page, ctx, pageLines, left, right)
      drawBottomRow(page, ctx, left, right)
      drawFooter(page, ctx, left, right)
    })
  }
  return doc.save()
}
