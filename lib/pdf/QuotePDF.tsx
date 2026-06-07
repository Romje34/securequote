import {
  Document, Page, View, Text, Image, StyleSheet,
} from "@react-pdf/renderer"

// ─── Types ────────────────────────────────────────────────────────────────────

export type PDFItem = {
  id: string
  row_type: string
  note_text: string | null
  designation: string
  reference: string | null
  brand: string | null
  unit: string
  quantity: number
  sell_price: number
  discount: number
  is_labor: boolean
}

export type PDFChapter = {
  id: string
  title: string
  items: PDFItem[]
}

export type PDFQuote = {
  quote_number: string
  status: string
  title: string | null
  reference: string | null
  site_address: string | null
  issued_at: string | null
  valid_until: string | null
  salesperson: string | null
  notes: string | null
  conditions: string | null
  tva_rate: number
  show_references: boolean
  show_brands: boolean
  show_unit_prices: boolean
  show_quantities: boolean
  show_chapter_totals: boolean
  client: {
    name: string
    address: string | null
    postal_code: string | null
    city: string | null
    country: string | null
    phone: string | null
    email: string | null
    siret: string | null
  } | null
  chapters: PDFChapter[]
}

export type PDFBranding = {
  trade_name: string | null
  address: string | null
  postal_code: string | null
  city: string | null
  phone: string | null
  email: string | null
  website: string | null
  siret: string | null
  vat_number: string | null
  logo_url: string | null
  signature_url: string | null
  primary_color: string | null
  footer_text: string | null
  default_conditions: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  const [int, dec] = abs.toFixed(2).split('.')
  const intStr = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${sign}${intStr},${dec} €`
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  const day   = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${d.getFullYear()}`
}

function itemTotal(item: PDFItem) {
  if (item.row_type !== 'item') return 0
  return item.quantity * item.sell_price * (1 - item.discount / 100)
}

function chapterTotal(ch: PDFChapter) {
  return ch.items.reduce((acc, i) => acc + itemTotal(i), 0)
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const BORDER_LIGHT = "#e2e8f0"

const makeStyles = (primary: string) =>
  StyleSheet.create({
    page: {
      fontFamily: "Helvetica",
      fontSize: 8.5,
      color: "#1a202c",
      paddingTop: 32,
      paddingRight: 40,
      paddingBottom: 60,
      paddingLeft: 40,
      lineHeight: 1.4,
    },

    // ── Header ──
    headerRow: { flexDirection: "row", marginBottom: 18, alignItems: "flex-start" },
    logo: { width: 80, height: 50, objectFit: "contain", marginRight: 14 },
    logoPlaceholder: {
      width: 80, height: 50, marginRight: 14,
      backgroundColor: "#f1f5f9", borderRadius: 4,
      alignItems: "center", justifyContent: "center",
    },
    ownerBlock: { flex: 1 },
    ownerName: { fontSize: 13, fontWeight: "bold", color: primary, marginBottom: 2 },
    ownerLine: { fontSize: 8, color: "#475569", marginBottom: 1 },

    quoteBlock: { alignItems: "flex-end" },
    quoteNumber: { fontSize: 16, fontWeight: "bold", color: primary, marginBottom: 3 },
    quoteMeta: { fontSize: 8, color: "#475569", marginBottom: 1, textAlign: "right" },

    divider: {
      borderBottomWidth: 1.5,
      borderBottomColor: primary,
      borderBottomStyle: "solid",
      marginVertical: 10,
    },
    dividerLight: {
      borderBottomWidth: 0.5,
      borderBottomColor: BORDER_LIGHT,
      borderBottomStyle: "solid",
      marginVertical: 8,
    },

    // ── Client / objet ──
    twoCol: { flexDirection: "row", gap: 16, marginBottom: 10 },
    box: {
      flex: 1,
      paddingTop: 8,
      paddingRight: 10,
      paddingBottom: 8,
      paddingLeft: 10,
      backgroundColor: "#f8fafc",
      borderWidth: 0.5,
      borderColor: BORDER_LIGHT,
      borderStyle: "solid",
      borderRadius: 4,
    },
    boxTitle: {
      fontSize: 7.5, fontWeight: "bold", color: primary,
      textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4,
    },
    boxLine: { fontSize: 8.5, color: "#1a202c", marginBottom: 1 },
    boxLineSub: { fontSize: 8, color: "#64748b", marginBottom: 1 },

    // ── Chapters ──
    chapterTitle: {
      fontSize: 10, fontWeight: "bold", color: "#fff",
      backgroundColor: primary,
      paddingTop: 5, paddingRight: 8, paddingBottom: 5, paddingLeft: 8,
    },
    tableHeader: {
      flexDirection: "row",
      backgroundColor: "#f1f5f9",
      paddingTop: 4, paddingRight: 8, paddingBottom: 4, paddingLeft: 8,
      borderLeftWidth: 0.5, borderRightWidth: 0.5, borderBottomWidth: 0.5,
      borderLeftColor: BORDER_LIGHT, borderRightColor: BORDER_LIGHT, borderBottomColor: BORDER_LIGHT,
      borderLeftStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid",
    },
    tableRow: {
      flexDirection: "row",
      paddingTop: 4, paddingRight: 8, paddingBottom: 4, paddingLeft: 8,
      borderLeftWidth: 0.5, borderRightWidth: 0.5, borderBottomWidth: 0.5,
      borderLeftColor: BORDER_LIGHT, borderRightColor: BORDER_LIGHT, borderBottomColor: BORDER_LIGHT,
      borderLeftStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid",
    },
    tableRowAlt: {
      flexDirection: "row",
      paddingTop: 4, paddingRight: 8, paddingBottom: 4, paddingLeft: 8,
      backgroundColor: "#fafafa",
      borderLeftWidth: 0.5, borderRightWidth: 0.5, borderBottomWidth: 0.5,
      borderLeftColor: BORDER_LIGHT, borderRightColor: BORDER_LIGHT, borderBottomColor: BORDER_LIGHT,
      borderLeftStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid",
    },
    colDesig:  { flex: 3 },
    colRef:    { flex: 1.2, textAlign: "center" },
    colBrand:  { flex: 1, textAlign: "center" },
    colUnit:   { width: 28, textAlign: "center" },
    colQty:    { width: 32, textAlign: "right" },
    colPrice:  { width: 52, textAlign: "right" },
    colDisc:   { width: 32, textAlign: "right" },
    colTotal:  { width: 60, textAlign: "right" },
    thText:    { fontSize: 7.5, fontWeight: "bold", color: "#374151" },
    tdText:    { fontSize: 8.5, color: "#1a202c" },
    tdSub:     { fontSize: 7, color: "#94a3b8" },

    chapterTotal: {
      flexDirection: "row", justifyContent: "flex-end",
      paddingTop: 4, paddingRight: 8, paddingBottom: 4, paddingLeft: 8,
      marginBottom: 12,
      backgroundColor: "#f8fafc",
      borderLeftWidth: 0.5, borderRightWidth: 0.5, borderBottomWidth: 0.5,
      borderLeftColor: BORDER_LIGHT, borderRightColor: BORDER_LIGHT, borderBottomColor: BORDER_LIGHT,
      borderLeftStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid",
    },
    chapterTotalText: { fontSize: 8.5, fontWeight: "bold", color: primary },

    // ── Notes & séparateurs ──
    separatorRow: {
      paddingTop: 4, paddingBottom: 4, paddingLeft: 8, paddingRight: 8,
      backgroundColor: "#1e293b",
    },
    separatorText: {
      fontSize: 8, fontWeight: "bold", color: "#e2e8f0",
      textTransform: "uppercase", letterSpacing: 1,
    },
    noteRow: {
      paddingTop: 4, paddingBottom: 4, paddingLeft: 10, paddingRight: 8,
      backgroundColor: "#fffbeb",
      borderLeftWidth: 2, borderLeftColor: "#fbbf24", borderLeftStyle: "solid",
    },
    noteText: { fontSize: 8, color: "#92400e", fontStyle: "italic" },

    // ── Totaux ──
    totalsSection: { marginTop: 6, alignItems: "flex-end" },
    totalsBox: {
      width: 220,
      paddingTop: 10, paddingRight: 12, paddingBottom: 10, paddingLeft: 12,
      borderWidth: 1,
      borderColor: BORDER_LIGHT,
      borderStyle: "solid",
      borderRadius: 4,
      backgroundColor: "#fafafa",
    },
    totalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
    totalLabel: { fontSize: 8.5, color: "#64748b" },
    totalValue: { fontSize: 8.5, color: "#1a202c" },
    grandTotalRow: {
      flexDirection: "row", justifyContent: "space-between",
      borderTopWidth: 1, borderTopColor: primary, borderTopStyle: "solid",
      paddingTop: 5, marginTop: 3,
    },
    grandLabel: { fontSize: 10, fontWeight: "bold", color: primary },
    grandValue: { fontSize: 10, fontWeight: "bold", color: primary },

    // ── Conditions & footer ──
    conditionsSection: { marginTop: 14 },
    conditionsTitle: { fontSize: 8, fontWeight: "bold", color: "#64748b", marginBottom: 3 },
    conditionsText: { fontSize: 7.5, color: "#64748b", lineHeight: 1.5 },

    footer: {
      position: "absolute",
      bottom: 22, left: 40, right: 40,
      flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end",
    },
    footerText: { fontSize: 7, color: "#94a3b8" },
    signatureBlock: { alignItems: "flex-end" },
    signatureLabel: { fontSize: 7, color: "#94a3b8", marginBottom: 4 },
    signatureImg: { width: 80, height: 30, objectFit: "contain" },
    signatureBox: {
      width: 120, height: 32,
      borderWidth: 0.5, borderColor: BORDER_LIGHT, borderStyle: "solid",
      borderRadius: 3,
    },
    pageNumber: { fontSize: 7, color: "#94a3b8", textAlign: "center" },
  })

// ─── PDF Component ────────────────────────────────────────────────────────────

export function QuotePDF({ quote, branding }: { quote: PDFQuote; branding: PDFBranding }) {
  const primary = branding.primary_color ?? "#1a1a2e"
  const S = makeStyles(primary)

  const totalHT  = quote.chapters.reduce((acc, ch) => acc + chapterTotal(ch), 0)
  const totalTVA = totalHT * (quote.tva_rate / 100)
  const totalTTC = totalHT + totalTVA

  const ownerCity  = [branding.postal_code, branding.city].filter(Boolean).join(" ")
  const clientCity = [quote.client?.postal_code, quote.client?.city].filter(Boolean).join(" ")
  const conditions = quote.conditions ?? branding.default_conditions

  const statusLabel =
    quote.status === "draft"    ? "BROUILLON" :
    quote.status === "sent"     ? "ENVOYÉ" :
    quote.status === "accepted" ? "ACCEPTÉ" :
    quote.status === "rejected" ? "REFUSÉ" :
    quote.status.toUpperCase()

  return (
    <Document>
      <Page size="A4" style={S.page}>

        {/* En-tête */}
        <View style={S.headerRow}>
          {branding.logo_url ? (
            <Image src={branding.logo_url} style={S.logo} />
          ) : (
            <View style={S.logoPlaceholder}>
              <Text style={{ fontSize: 18, fontWeight: "bold", color: primary }}>
                {(branding.trade_name ?? "?").slice(0, 2).toUpperCase()}
              </Text>
            </View>
          )}

          <View style={S.ownerBlock}>
            <Text style={S.ownerName}>{branding.trade_name ?? "Votre société"}</Text>
            {branding.address    && <Text style={S.ownerLine}>{branding.address}</Text>}
            {ownerCity            && <Text style={S.ownerLine}>{ownerCity}</Text>}
            {branding.phone      && <Text style={S.ownerLine}>Tél : {branding.phone}</Text>}
            {branding.email      && <Text style={S.ownerLine}>{branding.email}</Text>}
            {branding.website    && <Text style={S.ownerLine}>{branding.website}</Text>}
            {branding.siret      && <Text style={[S.ownerLine, { color: "#94a3b8", marginTop: 2 }]}>SIRET : {branding.siret}</Text>}
            {branding.vat_number && <Text style={[S.ownerLine, { color: "#94a3b8" }]}>TVA : {branding.vat_number}</Text>}
          </View>

          <View style={S.quoteBlock}>
            <Text style={S.quoteNumber}>{quote.quote_number}</Text>
            <Text style={S.quoteMeta}>Date : {fmtDate(quote.issued_at)}</Text>
            {quote.valid_until  && <Text style={S.quoteMeta}>Validité : {fmtDate(quote.valid_until)}</Text>}
            {quote.salesperson  && <Text style={S.quoteMeta}>Commercial : {quote.salesperson}</Text>}
            <Text style={[S.quoteMeta, { marginTop: 4, color: primary, fontWeight: "bold", textTransform: "uppercase", fontSize: 7.5 }]}>
              {statusLabel}
            </Text>
          </View>
        </View>

        <View style={S.divider} />

        {/* Client + objet */}
        <View style={S.twoCol}>
          <View style={S.box}>
            <Text style={S.boxTitle}>Client</Text>
            {quote.client ? (
              <>
                <Text style={[S.boxLine, { fontWeight: "bold" }]}>{quote.client.name}</Text>
                {quote.client.address    && <Text style={S.boxLineSub}>{quote.client.address}</Text>}
                {clientCity               && <Text style={S.boxLineSub}>{clientCity}</Text>}
                {quote.client.phone      && <Text style={S.boxLineSub}>Tél : {quote.client.phone}</Text>}
                {quote.client.email      && <Text style={S.boxLineSub}>{quote.client.email}</Text>}
                {quote.client.siret      && <Text style={S.boxLineSub}>SIRET : {quote.client.siret}</Text>}
              </>
            ) : (
              <Text style={S.boxLineSub}>—</Text>
            )}
          </View>
          <View style={S.box}>
            <Text style={S.boxTitle}>Objet du devis</Text>
            {quote.title        && <Text style={[S.boxLine, { fontWeight: "bold" }]}>{quote.title}</Text>}
            {quote.reference    && <Text style={S.boxLineSub}>Réf affaire : {quote.reference}</Text>}
            {quote.site_address && <Text style={S.boxLineSub}>Site : {quote.site_address}</Text>}
            <Text style={S.boxLineSub}>TVA applicable : {quote.tva_rate}%</Text>
          </View>
        </View>

        {/* Chapitres */}
        {quote.chapters.map((ch, ci) => {
          const cTotal = chapterTotal(ch)
          return (
            <View key={ch.id} wrap={false} style={{ marginBottom: 10 }}>
              <Text style={S.chapterTitle}>
                {ci + 1}. {ch.title.toUpperCase()}
              </Text>

              <View style={S.tableHeader}>
                <Text style={[S.thText, S.colDesig]}>Désignation</Text>
                {quote.show_references  && <Text style={[S.thText, S.colRef]}>Référence</Text>}
                {quote.show_brands      && <Text style={[S.thText, S.colBrand]}>Marque</Text>}
                <Text style={[S.thText, S.colUnit]}>Unité</Text>
                {quote.show_quantities  && <Text style={[S.thText, S.colQty]}>Qté</Text>}
                {quote.show_unit_prices && <Text style={[S.thText, S.colPrice]}>P.U.</Text>}
                <Text style={[S.thText, S.colDisc]}>Rem.</Text>
                <Text style={[S.thText, S.colTotal]}>Total HT</Text>
              </View>

              {ch.items.map((item, ii) => {
                if (item.row_type === 'separator') {
                  return (
                    <View key={item.id} style={S.separatorRow}>
                      <Text style={S.separatorText}>{item.note_text ?? ''}</Text>
                    </View>
                  )
                }
                if (item.row_type === 'note') {
                  return (
                    <View key={item.id} style={S.noteRow}>
                      <Text style={S.noteText}>{item.note_text ?? ''}</Text>
                    </View>
                  )
                }
                return (
                  <View key={item.id} style={ii % 2 === 0 ? S.tableRow : S.tableRowAlt}>
                    <View style={S.colDesig}>
                      <Text style={S.tdText}>{item.designation}</Text>
                    </View>
                    {quote.show_references  && <Text style={[S.tdSub, S.colRef]}>{item.reference ?? "—"}</Text>}
                    {quote.show_brands      && <Text style={[S.tdSub, S.colBrand]}>{item.brand ?? "—"}</Text>}
                    <Text style={[S.tdSub, S.colUnit]}>{item.unit}</Text>
                    {quote.show_quantities  && <Text style={[S.tdText, S.colQty]}>{item.quantity}</Text>}
                    {quote.show_unit_prices && <Text style={[S.tdText, S.colPrice]}>{fmt(item.sell_price)}</Text>}
                    <Text style={[S.tdSub, S.colDisc]}>
                      {item.discount > 0 ? `-${item.discount}%` : "—"}
                    </Text>
                    <Text style={[S.tdText, S.colTotal, { fontWeight: "bold" }]}>
                      {fmt(itemTotal(item))}
                    </Text>
                  </View>
                )
              })}

              {quote.show_chapter_totals && (
                <View style={S.chapterTotal}>
                  <Text style={S.chapterTotalText}>
                    Total {ch.title} : {fmt(cTotal)}
                  </Text>
                </View>
              )}
            </View>
          )
        })}

        {/* Totaux */}
        <View style={S.dividerLight} />
        <View style={S.totalsSection}>
          <View style={S.totalsBox}>
            <View style={S.totalRow}>
              <Text style={S.totalLabel}>Total HT</Text>
              <Text style={S.totalValue}>{fmt(totalHT)}</Text>
            </View>
            <View style={S.totalRow}>
              <Text style={S.totalLabel}>TVA {quote.tva_rate}%</Text>
              <Text style={S.totalValue}>{fmt(totalTVA)}</Text>
            </View>
            <View style={S.grandTotalRow}>
              <Text style={S.grandLabel}>TOTAL TTC</Text>
              <Text style={S.grandValue}>{fmt(totalTTC)}</Text>
            </View>
          </View>
        </View>

        {/* Notes */}
        {quote.notes && (
          <View style={{ marginTop: 14 }}>
            <Text style={S.conditionsTitle}>Notes</Text>
            <Text style={S.conditionsText}>{quote.notes}</Text>
          </View>
        )}

        {/* Conditions */}
        {conditions && (
          <View style={S.conditionsSection}>
            <Text style={S.conditionsTitle}>Conditions générales</Text>
            <Text style={S.conditionsText}>{conditions}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={S.footer} fixed>
          <Text style={S.footerText}>
            {branding.footer_text ?? (branding.trade_name ?? "")}
          </Text>
          <View style={S.signatureBlock}>
            <Text style={S.signatureLabel}>Signature et cachet :</Text>
            {branding.signature_url
              ? <Image src={branding.signature_url} style={S.signatureImg} />
              : <View style={S.signatureBox} />
            }
          </View>
        </View>

        {/* Numéro de page */}
        <Text
          style={[S.footer, { bottom: 10 } as never]}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  )
}
