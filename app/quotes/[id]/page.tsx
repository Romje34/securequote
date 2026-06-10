"use client"

import { useState, useEffect, useRef } from "react"
import { use } from "react"

// ─── Types ────────────────────────────────────────────────────────────────────

type RowType = "item" | "note" | "separator"

type Item = {
  id: string
  position: number
  row_type: RowType
  designation: string
  reference: string | null
  brand: string | null
  unit: string
  quantity: number
  buy_price: number
  sell_price: number
  discount: number
  is_labor: boolean
  note_text: string | null
}

type Chapter = {
  id: string
  position: number
  title: string
  items: Item[]
}

type QuoteHeader = {
  quote_number: string
  status: string
  title: string
  reference: string
  site_address: string
  issued_at: string
  valid_until: string
  salesperson: string
  notes: string
  conditions: string
  tva_rate: number
  client_id: string | null
  clients: { id: string; name: string; email: string | null } | null
  companies: { company_name: string; email: string | null } | null
}

type CatalogProduct = {
  id: string
  brand: string
  reference: string | null
  designation: string
  category: string | null
  unit: string
  list_price: number | null
}

const STATUSES = [
  { key: "draft",    label: "Brouillon",  color: "#64748b" },
  { key: "sent",     label: "Envoyé",     color: "#3b82f6" },
  { key: "accepted", label: "Accepté",    color: "#10b981" },
  { key: "rejected", label: "Refusé",     color: "#ef4444" },
  { key: "expired",  label: "Expiré",     color: "#f59e0b" },
]

function fmtNum(n: number) {
  const abs = Math.abs(n)
  const sign = n < 0 ? "-" : ""
  const [int, dec] = abs.toFixed(2).split(".")
  return `${sign}${int.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${dec}`
}

function itemTotal(item: Item) {
  if (item.row_type !== "item") return 0
  return item.quantity * item.sell_price * (1 - item.discount / 100)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function QuoteEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const [header,   setHeader]   = useState<QuoteHeader | null>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [saving,   setSaving]   = useState(false)
  const [dirty,    setDirty]    = useState(false)
  const [toast,    setToast]    = useState("")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [newChapterTitle, setNewChapterTitle] = useState("")
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [catalogTarget, setCatalogTarget] = useState<{ chapterId: string } | null>(null)
  const [sendOpen, setSendOpen] = useState(false)
  const [sendEmail, setSendEmail] = useState("")
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000) }

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        const res = await fetch(`/api/quotes/${id}`)
        if (res.status === 401) { window.location.href = "/login"; return }
        if (cancelled) return
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          if (!cancelled) setLoadError(`Erreur ${res.status} — ${body.error ?? "devis introuvable"}`)
          return
        }
        const d = await res.json()
        const sorted: Chapter[] = ((d.quote_chapters ?? []) as Chapter[])
          .sort((a, b) => a.position - b.position)
          .map(ch => ({
            id:       ch.id,
            position: ch.position,
            title:    ch.title,
            items:    [...(ch.items ?? [])].sort((a, b) => a.position - b.position),
          }))
        if (cancelled) return
        setHeader({
          quote_number: d.quote_number, status: d.status,
          title:        d.title        ?? "",
          reference:    d.reference    ?? "",
          site_address: d.site_address ?? "",
          issued_at:    d.issued_at    ?? "",
          valid_until:  d.valid_until  ?? "",
          salesperson:  d.salesperson  ?? "",
          notes:        d.notes        ?? "",
          conditions:   d.conditions   ?? "",
          tva_rate:     d.tva_rate     ?? 20,
          client_id:    d.client_id    ?? null,
          clients:      d.clients      ?? null,
          companies:    d.companies    ?? null,
        })
        setChapters(sorted)
        setDirty(false)
        setLoadError(null)
      } catch (e) {
        if (!cancelled) setLoadError(`Erreur réseau : ${String(e)}`)
      }
    }
    run()
    return () => { cancelled = true }
  }, [id, reloadTick])

  async function saveHeader(patch: Partial<QuoteHeader>) {
    setSaving(true)
    await fetch(`/api/quotes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    setSaving(false)
    setDirty(false)
    showToast("Sauvegardé")
  }

  function updateHeader(key: keyof QuoteHeader, value: string | number | null) {
    setHeader(h => h ? { ...h, [key]: value } : h)
    setDirty(true)
  }

  async function addChapter() {
    const title = newChapterTitle.trim() || "Nouveau chapitre"
    const res = await fetch(`/api/quotes/${id}/chapters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, position: chapters.length }),
    })
    if (res.ok) {
      const ch = await res.json()
      setChapters(prev => [...prev, { ...ch, items: [] }])
      setNewChapterTitle("")
    } else {
      const body = await res.json().catch(() => ({}))
      showToast(`Erreur chapitre : ${body.error ?? res.status}`)
    }
  }

  async function renameChapter(cid: string, title: string) {
    await fetch(`/api/quotes/${id}/chapters/${cid}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
    setChapters(prev => prev.map(ch => ch.id === cid ? { ...ch, title } : ch))
  }

  async function deleteChapter(cid: string) {
    if (!confirm("Supprimer ce chapitre et toutes ses lignes ?")) return
    await fetch(`/api/quotes/${id}/chapters/${cid}`, { method: "DELETE" })
    setChapters(prev => prev.filter(ch => ch.id !== cid))
  }

  async function addRow(chapterId: string, row_type: RowType, prefill?: Partial<Item>) {
    const ch = chapters.find(c => c.id === chapterId)
    const res = await fetch(`/api/quotes/${id}/chapters/${chapterId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        row_type,
        position: ch?.items.length ?? 0,
        ...prefill,
      }),
    })
    if (res.ok) {
      const item = await res.json()
      setChapters(prev => prev.map(c =>
        c.id === chapterId ? { ...c, items: [...c.items, { ...item, row_type }] } : c
      ))
      // Après un séparateur, ajouter automatiquement une ligne vide (MO si "Main d")
      if (row_type === "separator") {
        const noteText = (prefill?.note_text ?? "").toLowerCase()
        const isLabor  = noteText.includes("main d")
        await addRow(chapterId, "item", isLabor ? { is_labor: true, unit: "H" } : undefined)
      }
    } else {
      const body = await res.json().catch(() => ({}))
      showToast(`Erreur ligne : ${body.error ?? res.status}`)
      console.error("[addRow]", body)
    }
  }

  async function saveItem(item: Item) {
    await fetch(`/api/quotes/${id}/items/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    })
  }

  function updateItem(chapterId: string, itemId: string, key: keyof Item, value: string | number | boolean | null) {
    setChapters(prev => prev.map(ch =>
      ch.id !== chapterId ? ch : {
        ...ch,
        items: ch.items.map(it => it.id !== itemId ? it : { ...it, [key]: value }),
      }
    ))
  }

  async function deleteItem(chapterId: string, itemId: string) {
    await fetch(`/api/quotes/${id}/items/${itemId}`, { method: "DELETE" })
    setChapters(prev => prev.map(ch =>
      ch.id !== chapterId ? ch : { ...ch, items: ch.items.filter(it => it.id !== itemId) }
    ))
  }

  async function downloadPdf() {
    setPdfLoading(true)
    if (dirty && header) await saveHeader(header)
    const res = await fetch(`/api/quotes/${id}/pdf`)
    if (res.ok) {
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url; a.download = `${header?.quote_number ?? "devis"}.pdf`
      a.click(); URL.revokeObjectURL(url)
    } else {
      showToast("Erreur génération PDF")
    }
    setPdfLoading(false)
  }

  function openSend() {
    setSendError(null)
    // Pré-remplit avec l'email déjà renseigné : client en priorité, sinon société (toujours modifiable)
    setSendEmail(header?.clients?.email || header?.companies?.email || "")
    setSendOpen(true)
  }

  async function handleSendQuote() {
    const email = sendEmail.trim()
    if (!email) { setSendError("Merci de saisir une adresse email"); return }
    setSendError(null)
    setSending(true)
    try {
      const res = await fetch(`/api/quotes/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Erreur lors de l'envoi")
      setSendOpen(false)
      showToast(`✉ Devis envoyé à ${json.sent_to}`)
      setHeader(prev => prev ? { ...prev, status: "sent" } : prev)
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Erreur lors de l'envoi")
    } finally {
      setSending(false)
    }
  }

  function openCatalog(chapterId: string) {
    setCatalogTarget({ chapterId })
    setCatalogOpen(true)
  }

  function handleAddFromCatalog(chapterId: string, p: CatalogProduct) {
    addRow(chapterId, "item", {
      designation: p.designation,
      reference:   p.reference   ?? "",
      brand:       p.brand,
      unit:        p.unit,
      sell_price:  p.list_price  ?? 0,
      buy_price:   0,
      quantity:    1,
      discount:    0,
    })
  }

  const chapterTotal = (ch: Chapter) => ch.items.reduce((acc, it) => acc + itemTotal(it), 0)
  const totalHT  = chapters.reduce((acc, ch) => acc + chapterTotal(ch), 0)
  const totalTVA = totalHT * ((header?.tva_rate ?? 20) / 100)
  const totalTTC = totalHT + totalTVA
  const statusInfo = STATUSES.find(s => s.key === header?.status) ?? STATUSES[0]

  if (loadError) return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", flexDirection: "column", gap: 16 }}>
      <div style={{ color: "#ef4444", fontSize: 15, fontWeight: 600 }}>{loadError}</div>
      <button onClick={() => setReloadTick(t => t + 1)} style={{ padding: "8px 20px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14 }}>
        Réessayer
      </button>
      <a href="/companies" style={{ color: "#94a3b8", fontSize: 13 }}>← Retour</a>
    </div>
  )

  if (!header) return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ color: "#94a3b8", fontSize: 14 }}>Chargement…</div>
    </div>
  )

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {toast && <div style={S.toast}>{toast}</div>}

      {/* Modale d'envoi au client */}
      {sendOpen && (
        <div
          onClick={() => !sending && setSendOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: "28px 32px", width: 420, maxWidth: "92vw" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#1a202c", marginBottom: 6 }}>✉ Envoyer le devis au client</div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 18, lineHeight: 1.6 }}>
              Le client recevra un email avec un lien personnel pour consulter et signer électroniquement le devis <strong>{header.quote_number}</strong>.
            </div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 6 }}>Adresse email du destinataire</label>
            <input
              value={sendEmail}
              onChange={e => setSendEmail(e.target.value)}
              placeholder="client@exemple.fr"
              type="email"
              style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14, marginBottom: 14, boxSizing: "border-box" }}
            />
            {sendError && <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 12 }}>{sendError}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setSendOpen(false)} disabled={sending} style={{ padding: "10px 18px", background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                Annuler
              </button>
              <button onClick={handleSendQuote} disabled={sending} style={{ padding: "10px 22px", background: sending ? "#94a3b8" : "#10b981", color: "#fff", border: "none", borderRadius: 8, cursor: sending ? "default" : "pointer", fontSize: 13, fontWeight: 700 }}>
                {sending ? "Envoi…" : "Envoyer le devis →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Catalogue drawer */}
      {catalogOpen && catalogTarget && (
        <CatalogDrawer
          onClose={() => setCatalogOpen(false)}
          onAdd={p => handleAddFromCatalog(catalogTarget.chapterId, p)}
        />
      )}

      {/* ── Header ── */}
      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="/companies" style={S.backLink}>← Retour</a>
          <span style={{ color: "#334155", fontSize: 13 }}>|</span>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{header.quote_number}</span>
          <span style={{
            fontSize: 11, fontWeight: 700, color: statusInfo.color,
            background: `${statusInfo.color}22`, border: `1px solid ${statusInfo.color}44`,
            borderRadius: 20, padding: "2px 10px",
          }}>{statusInfo.label}</span>
          {header.companies && (
            <span style={{ fontSize: 12, color: "#94a3b8" }}>{header.companies.company_name}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => saveHeader(header)} disabled={saving} style={{ ...S.btnSave, opacity: saving ? 0.6 : 1, cursor: saving ? "default" : "pointer" }}>
            {saving ? "Enregistrement…" : "💾 Enregistrer"}
          </button>
          <button onClick={downloadPdf} disabled={pdfLoading} style={S.btnPdf}>
            {pdfLoading ? "Génération…" : "⬇ PDF"}
          </button>
          <button onClick={openSend} style={S.btnSend}>
            ✉ Envoyer au client
          </button>
          <select
            value={header.status}
            onChange={e => { updateHeader("status", e.target.value); saveHeader({ status: e.target.value }) }}
            style={S.statusSelect}
          >
            {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
      </header>

      <div style={{ maxWidth: 1340, margin: "0 auto", padding: "20px 16px" }}>

        {/* ── Fiche ── */}
        <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
          <div style={{ ...S.card, flex: "2 1 320px" }}>
            <p style={S.cardTitle}>Devis</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
              <Field label="Objet" value={header.title}
                onChange={v => updateHeader("title", v)} onBlur={() => saveHeader({ title: header.title })} />
              <Field label="Référence affaire" value={header.reference}
                onChange={v => updateHeader("reference", v)} onBlur={() => saveHeader({ reference: header.reference })} />
              <Field label="Adresse site" value={header.site_address}
                onChange={v => updateHeader("site_address", v)} onBlur={() => saveHeader({ site_address: header.site_address })} />
              <Field label="Commercial" value={header.salesperson}
                onChange={v => updateHeader("salesperson", v)} onBlur={() => saveHeader({ salesperson: header.salesperson })} />
              <Field label="Date émission" value={header.issued_at} type="date"
                onChange={v => updateHeader("issued_at", v)} onBlur={() => saveHeader({ issued_at: header.issued_at })} />
              <Field label="Validité jusqu'au" value={header.valid_until} type="date"
                onChange={v => updateHeader("valid_until", v)} onBlur={() => saveHeader({ valid_until: header.valid_until })} />
            </div>
          </div>
          <div style={{ ...S.card, flex: "1 1 180px" }}>
            <p style={S.cardTitle}>Client</p>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1a202c", marginBottom: 4 }}>
              {header.clients?.name ?? <span style={{ color: "#cbd5e1", fontWeight: 400 }}>Non renseigné</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>TVA</label>
              <input inputMode="decimal"
                value={header.tva_rate}
                onChange={e => updateHeader("tva_rate", parseFloat(e.target.value) || 0)}
                onBlur={() => saveHeader({ tva_rate: header.tva_rate })}
                style={{ width: 64, padding: "5px 8px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13 }}
              />
              <span style={{ fontSize: 12, color: "#64748b" }}>%</span>
            </div>
          </div>
          <div style={{ ...S.card, flex: "1 1 200px" }}>
            <p style={S.cardTitle}>Notes internes</p>
            <textarea
              value={header.notes}
              onChange={e => updateHeader("notes", e.target.value)}
              onBlur={() => saveHeader({ notes: header.notes })}
              placeholder="Visible uniquement pour vous…"
              rows={4}
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 13, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box", outline: "none" }}
            />
          </div>
        </div>

        {/* ── Chapitres ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
          {chapters.map((ch, ci) => (
            <ChapterBlock
              key={ch.id}
              chapter={ch}
              index={ci}
              onRename={t => renameChapter(ch.id, t)}
              onDelete={() => deleteChapter(ch.id)}
              onAddRow={(rt, pf) => addRow(ch.id, rt, pf)}
              onOpenCatalog={() => openCatalog(ch.id)}
              onUpdateItem={(iid, key, val) => updateItem(ch.id, iid, key, val)}
              onSaveItem={item => saveItem(item)}
              onDeleteItem={iid => deleteItem(ch.id, iid)}
              chapterTotal={chapterTotal(ch)}
            />
          ))}

          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={newChapterTitle}
              onChange={e => setNewChapterTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addChapter() }}
              placeholder="Titre du nouveau chapitre…"
              style={{ flex: 1, padding: "10px 14px", border: "2px dashed #cbd5e1", borderRadius: 10, fontSize: 14, background: "transparent", outline: "none", color: "#64748b" }}
            />
            <button onClick={addChapter} style={{
              padding: "10px 20px", background: "#1a1a2e", color: "#fff",
              border: "none", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 700,
            }}>
              + Chapitre
            </button>
          </div>
        </div>

        {/* ── Récap ── */}
        <div style={{ ...S.card, maxWidth: 380, marginLeft: "auto" }}>
          <p style={S.cardTitle}>Récapitulatif financier</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {chapters.filter(ch => chapterTotal(ch) > 0).map(ch => (
              <div key={ch.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{ch.title}</span>
                <span style={{ fontWeight: 600, flexShrink: 0 }}>{fmtNum(chapterTotal(ch))} €</span>
              </div>
            ))}
            <div style={{ height: 1, background: "#e2e8f0", margin: "6px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: "#64748b" }}>Total HT</span>
              <span style={{ fontWeight: 600 }}>{fmtNum(totalHT)} €</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: "#64748b" }}>TVA {header.tva_rate}%</span>
              <span>{fmtNum(totalTVA)} €</span>
            </div>
            <div style={{ height: 2, background: "#1a1a2e", margin: "6px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 800, fontSize: 16, color: "#1a1a2e" }}>TOTAL TTC</span>
              <span style={{ fontWeight: 800, fontSize: 16, color: "#1a1a2e" }}>{fmtNum(totalTTC)} €</span>
            </div>
          </div>
          <button onClick={downloadPdf} disabled={pdfLoading} style={{ ...S.btnPdf, width: "100%", marginTop: 16, justifyContent: "center" }}>
            {pdfLoading ? "Génération…" : "⬇ Télécharger le PDF"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── ChapterBlock ─────────────────────────────────────────────────────────────

function ChapterBlock({
  chapter, index, onRename, onDelete,
  onAddRow, onOpenCatalog, onUpdateItem, onSaveItem, onDeleteItem, chapterTotal,
}: {
  chapter:       Chapter
  index:         number
  onRename:      (t: string) => void
  onDelete:      () => void
  onAddRow:      (rt: RowType, pf?: Partial<Item>) => void
  onOpenCatalog: () => void
  onUpdateItem:  (iid: string, key: keyof Item, val: string | number | boolean | null) => void
  onSaveItem:    (item: Item) => void
  onDeleteItem:  (iid: string) => void
  chapterTotal:  number
}) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleVal, setTitleVal] = useState(chapter.title)
  const [aiLoading, setAiLoading] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editingTitle) titleRef.current?.focus() }, [editingTitle])

  function commitTitle() {
    setEditingTitle(false)
    if (titleVal.trim() && titleVal !== chapter.title) onRename(titleVal.trim())
    else setTitleVal(chapter.title)
  }

  async function runAI() {
    setAiLoading(true)
    try {
      const res = await fetch("/api/ai/quote-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "chapter", chapter_title: chapter.title, existing_items: chapter.items.map(i => i.designation) }),
      })
      if (!res.ok) return
      const { items } = await res.json()
      if (Array.isArray(items)) {
        for (const it of items) {
          await new Promise(r => setTimeout(r, 60))
          onAddRow("item", {
            designation: it.designation ?? "",
            reference:   it.reference   ?? null,
            brand:       it.brand       ?? null,
            unit:        it.unit        ?? "U",
            quantity:    it.quantity    ?? 1,
            sell_price:  it.sell_price  ?? 0,
            buy_price:   0,
            discount:    0,
          })
        }
      }
    } finally {
      setAiLoading(false)
    }
  }

  const SEPARATORS = ["Caméras", "Réseau", "VMS", "Contrôle d'accès", "Alarme", "Serveurs", "Câblage", "Main d'œuvre"]

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.04)", overflow: "hidden" }}>

      {/* Chapter header bar */}
      <div style={{ background: "#1a1a2e", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: 700, minWidth: 24 }}>{index + 1}</span>

        {editingTitle ? (
          <input
            ref={titleRef}
            value={titleVal}
            onChange={e => setTitleVal(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={e => { if (e.key === "Enter") commitTitle() }}
            style={{ flex: 1, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", borderRadius: 6, padding: "3px 10px", fontSize: 14, fontWeight: 700, outline: "none" }}
          />
        ) : (
          <span
            onDoubleClick={() => setEditingTitle(true)}
            title="Double-clic pour renommer"
            style={{ flex: 1, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "text" }}
          >
            {chapter.title}
          </span>
        )}

        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: 600, marginRight: 6 }}>
          {fmtNum(chapterTotal)} €
        </span>

        {/* AI button */}
        <button onClick={runAI} disabled={aiLoading} title="Suggestions IA" style={{
          padding: "4px 12px", background: aiLoading ? "#334155" : "linear-gradient(135deg,#7c3aed,#4f46e5)",
          color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: aiLoading ? "not-allowed" : "pointer",
        }}>
          {aiLoading ? "IA…" : "✦ IA"}
        </button>

        <button onClick={onDelete} title="Supprimer" style={{ background: "none", border: "none", color: "rgba(255,255,255,0.35)", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
      </div>

      {/* Rows */}
      <div>
        {chapter.items.length === 0 && (
          <div style={{ padding: "20px 16px", textAlign: "center", color: "#cbd5e1", fontSize: 13 }}>
            Aucune ligne — utilisez le bouton <strong style={{ color: "#94a3b8" }}>+ Ajouter</strong> ci-dessous
          </div>
        )}

        {chapter.items.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <Th style={{ minWidth: 200 }}>Désignation</Th>
                  <Th style={{ width: 110 }}>Référence</Th>
                  <Th style={{ width: 100 }}>Marque</Th>
                  <Th style={{ width: 80, textAlign: "right" }}>Quantité</Th>
                  <Th style={{ width: 86, textAlign: "right" }}>P.A. 🔒</Th>
                  <Th style={{ width: 86, textAlign: "right" }}>P.V.</Th>
                  <Th style={{ width: 70, textAlign: "right" }}>Rem%</Th>
                  <Th style={{ width: 70, textAlign: "right" }}>Marge 🔒</Th>
                  <Th style={{ width: 96, textAlign: "right" }}>Total HT</Th>
                  <Th style={{ width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {chapter.items.map((item, ii) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    alt={ii % 2 === 1}
                    onChange={(key, val) => onUpdateItem(item.id, key, val)}
                    onBlur={() => onSaveItem(item)}
                    onDelete={() => onDeleteItem(item.id)}
                    onSaveWith={patch => onSaveItem({ ...item, ...patch })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add row toolbar */}
      <div style={{ padding: "10px 14px", borderTop: "1px solid #f1f5f9", display: "flex", gap: 8, alignItems: "center", background: "#fafbfc" }}>
        {/* Séparateurs rapides */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
          {SEPARATORS.map(s => (
            <button
              key={s}
              onClick={() => onAddRow("separator", { note_text: s })}
              style={{
                padding: "3px 10px", fontSize: 11, fontWeight: 700,
                background: "#f1f5f9", color: "#475569",
                border: "1px solid #e2e8f0", borderRadius: 20, cursor: "pointer",
              }}
            >
              # {s}
            </button>
          ))}
        </div>
        {/* Buttons */}
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button onClick={() => onAddRow("note")} style={{ padding: "5px 12px", background: "#fef9c3", color: "#92400e", border: "1px solid #fde68a", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
            + Note
          </button>
          <button onClick={onOpenCatalog} style={{ padding: "5px 12px", background: "#ede9fe", color: "#5b21b6", border: "1px solid #c4b5fd", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
            📦 Bibliothèque
          </button>
          <button onClick={() => onAddRow("item", { is_labor: true, unit: "H" })} style={{ padding: "5px 12px", background: "#dbeafe", color: "#1d4ed8", border: "1px solid #bfdbfe", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
            + MO
          </button>
          <button onClick={() => onAddRow("item")} style={{ padding: "5px 14px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
            + Ligne
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── ItemRow ──────────────────────────────────────────────────────────────────

function ItemRow({ item, alt, onChange, onBlur, onDelete, onSaveWith }: {
  item:        Item
  alt:         boolean
  onChange:    (key: keyof Item, val: string | number | boolean | null) => void
  onBlur:      () => void
  onDelete:    () => void
  onSaveWith?: (patch: Partial<Item>) => void
}) {
  const n = (v: string) => parseFloat(v) || 0
  const total = itemTotal(item)
  const bg = alt ? "#fafbfc" : "#fff"
  const margePct = item.sell_price > 0 ? ((item.sell_price - item.buy_price) / item.sell_price) * 100 : 0
  const margeColor = margePct >= 30 ? "#10b981" : margePct >= 15 ? "#f59e0b" : "#ef4444"

  // ── Séparateur ──
  if (item.row_type === "separator") {
    return (
      <tr style={{ background: "#1e293b" }}>
        <td colSpan={9} style={{ padding: "6px 14px" }}>
          <input
            value={item.note_text ?? ""}
            onChange={e => onChange("note_text", e.target.value)}
            onBlur={onBlur}
            placeholder="Titre de section…"
            style={{ background: "transparent", border: "none", outline: "none", color: "#e2e8f0", fontWeight: 800, fontSize: 12, width: "100%", textTransform: "uppercase", letterSpacing: 1 }}
          />
        </td>
        <td style={{ padding: "6px 4px", textAlign: "center" }}>
          <button onClick={onDelete} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
        </td>
      </tr>
    )
  }

  // ── Note ──
  if (item.row_type === "note") {
    return (
      <tr style={{ background: "#fffbeb" }}>
        <td colSpan={9} style={{ padding: "6px 14px" }}>
          <input
            value={item.note_text ?? ""}
            onChange={e => onChange("note_text", e.target.value)}
            onBlur={onBlur}
            placeholder="Note ou commentaire…"
            style={{ background: "transparent", border: "none", outline: "none", color: "#92400e", fontSize: 13, width: "100%", fontStyle: "italic" }}
          />
        </td>
        <td style={{ padding: "6px 4px", textAlign: "center" }}>
          <button onClick={onDelete} style={{ background: "none", border: "none", color: "#d97706", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
        </td>
      </tr>
    )
  }

  // ── Main d'œuvre ──
  if (item.is_labor) {
    const activeUnit = ["H", "J", "Forfait"].includes(item.unit) ? item.unit : "Forfait"
    const isForfait  = activeUnit === "Forfait"
    const isHourly   = activeUnit === "H"
    const tauxLabel  = isHourly ? "Taux/h" : activeUnit === "J" ? "Taux/j" : "Montant"

    return (
      <tr style={{ background: "#eff6ff", borderBottom: "1px solid #dbeafe" }}>
        <td colSpan={9} style={{ padding: "5px 10px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>

            {/* Désignation */}
            <input
              value={item.designation}
              onChange={e => onChange("designation", e.target.value)}
              onBlur={onBlur}
              placeholder="Description de la prestation…"
              style={{ ...S.ci, flex: "1 1 160px", border: "1px solid #bfdbfe", borderRadius: 6, background: "#fff" }}
            />

            {/* Forfait / H / J */}
            <div style={{ display: "flex", flexShrink: 0 }}>
              {["Forfait", "H", "J"].map((u, idx) => (
                <button key={u}
                  onClick={() => {
                    const patch: Partial<Item> = { unit: u, ...(u === "Forfait" ? { quantity: 1 } : {}) }
                    onChange("unit", u)
                    if (u === "Forfait") onChange("quantity", 1)
                    onSaveWith?.(patch)
                  }}
                  style={{
                    padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                    border: "1px solid",
                    background:  activeUnit === u ? "#1d4ed8" : "#f0f4ff",
                    color:       activeUnit === u ? "#fff"    : "#3b82f6",
                    borderColor: activeUnit === u ? "#1d4ed8" : "#bfdbfe",
                    borderRadius: idx === 0 ? "6px 0 0 6px" : idx === 2 ? "0 6px 6px 0" : "0",
                    marginLeft: idx > 0 ? -1 : 0,
                  }}>
                  {u}
                </button>
              ))}
            </div>

            {/* Durée — masqué en Forfait */}
            {!isForfait && (
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                <input
                  inputMode="decimal"
                  value={item.quantity}
                  onChange={e => onChange("quantity", n(e.target.value))}
                  onBlur={onBlur}
                  placeholder="0"
                  style={{ ...S.ci, width: 64, textAlign: "right", border: "1px solid #bfdbfe", borderRadius: 6, background: "#fff" }}
                />
                <span style={{ fontSize: 11, color: "#3b82f6", fontWeight: 600 }}>{isHourly ? "h" : "j"}</span>
              </div>
            )}

            {/* Taux / Montant */}
            <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600, whiteSpace: "nowrap" }}>{tauxLabel}</span>
              <input
                inputMode="decimal"
                value={item.sell_price}
                onChange={e => onChange("sell_price", n(e.target.value))}
                onBlur={onBlur}
                style={{ ...S.ci, width: 86, textAlign: "right", fontWeight: 700, border: "1px solid #bfdbfe", borderRadius: 6, background: "#fff" }}
              />
              <span style={{ fontSize: 11, color: "#64748b" }}>€</span>
            </div>

            {/* Marge 🔒 */}
            <span style={{ fontSize: 12, fontWeight: 700, color: margeColor, flexShrink: 0, minWidth: 46, textAlign: "right" }}>
              {item.buy_price > 0 ? `${margePct.toFixed(1)} %` : "—"}
            </span>

            {/* Total HT */}
            <span style={{ fontSize: 13, fontWeight: 800, color: "#1a1a2e", flexShrink: 0, minWidth: 80, textAlign: "right", whiteSpace: "nowrap" }}>
              {fmtNum(total)} €
            </span>

          </div>
        </td>
        <td style={{ padding: "5px 4px", textAlign: "center", verticalAlign: "middle" }}>
          <button onClick={onDelete}
            style={{ background: "none", border: "none", color: "#93c5fd", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
            onMouseLeave={e => (e.currentTarget.style.color = "#93c5fd")}>×</button>
        </td>
      </tr>
    )
  }

  // ── Ligne produit ──
  return (
    <tr style={{ background: bg, borderBottom: "1px solid #f1f5f9" }}>
      <td style={S.td}>
        <input value={item.designation} onChange={e => onChange("designation", e.target.value)} onBlur={onBlur}
          placeholder="Désignation…" style={S.ci} />
      </td>
      <td style={S.td}>
        <input value={item.reference ?? ""} onChange={e => onChange("reference", e.target.value)} onBlur={onBlur}
          placeholder="Réf." style={S.ci} />
      </td>
      <td style={S.td}>
        <input value={item.brand ?? ""} onChange={e => onChange("brand", e.target.value)} onBlur={onBlur}
          placeholder="Marque" style={S.ci} />
      </td>
      <td style={{ ...S.td, textAlign: "right" }}>
        <input inputMode="decimal" value={item.quantity}
          onChange={e => onChange("quantity", n(e.target.value))} onBlur={onBlur}
          style={{ ...S.ci, textAlign: "right" }} />
      </td>
      <td style={{ ...S.td, textAlign: "right", background: "#f8f9fb" }}>
        <input inputMode="decimal" value={item.buy_price}
          onChange={e => onChange("buy_price", n(e.target.value))} onBlur={onBlur}
          style={{ ...S.ci, textAlign: "right", color: "#475569" }} />
      </td>
      <td style={{ ...S.td, textAlign: "right" }}>
        <input inputMode="decimal" value={item.sell_price}
          onChange={e => onChange("sell_price", n(e.target.value))} onBlur={onBlur}
          style={{ ...S.ci, textAlign: "right", fontWeight: 600 }} />
      </td>
      <td style={{ ...S.td, textAlign: "right" }}>
        <input inputMode="decimal" value={item.discount}
          onChange={e => onChange("discount", n(e.target.value))} onBlur={onBlur}
          style={{ ...S.ci, textAlign: "right", color: "#f59e0b" }} />
      </td>
      <td style={{ ...S.td, textAlign: "right", background: "#f8f9fb", paddingRight: 8, whiteSpace: "nowrap" }}>
        <span style={{ fontWeight: 700, fontSize: 12, color: margeColor }}>
          {margePct.toFixed(1)} %
        </span>
      </td>
      <td style={{ ...S.td, textAlign: "right", fontWeight: 700, color: "#1a1a2e", paddingRight: 8, whiteSpace: "nowrap" }}>
        {fmtNum(total)} €
      </td>
      <td style={{ ...S.td, textAlign: "center" }}>
        <button onClick={onDelete} style={{ background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px" }}
          onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
          onMouseLeave={e => (e.currentTarget.style.color = "#cbd5e1")}>×</button>
      </td>
    </tr>
  )
}

// ─── CatalogDrawer ────────────────────────────────────────────────────────────

function CatalogDrawer({ onClose, onAdd }: { onClose: () => void; onAdd: (p: CatalogProduct) => void }) {
  const [products, setProducts] = useState<CatalogProduct[] | null>(null)
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("")

  const CATS = ["", "VMS", "Cloud", "IA / Analyse", "Accès", "Support"]

  useEffect(() => {
    let cancel = false
    const params = new URLSearchParams()
    if (search)   params.set("q", search)
    if (category) params.set("category", category)
    fetch(`/api/catalog?${params}`)
      .then(r => r.json())
      .then(d => { if (!cancel) setProducts(Array.isArray(d) ? d : []) })
    return () => { cancel = true }
  }, [search, category])

  const loading = products === null
  const items = products ?? []

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex" }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ flex: 1, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(2px)" }} />
      {/* Panel */}
      <div style={{ width: 400, background: "#fff", boxShadow: "-8px 0 40px rgba(0,0,0,0.2)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#1a202c" }}>Bibliothèque produits</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Network Optix & catalogue</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94a3b8", lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            autoFocus
            placeholder="Rechercher…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none" }}
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {CATS.map(c => (
              <button key={c || "all"} onClick={() => setCategory(c)}
                style={{
                  padding: "3px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer", border: "1px solid",
                  background: category === c ? "#1a1a2e" : "#f8fafc",
                  color:      category === c ? "#fff"    : "#475569",
                  borderColor: category === c ? "#1a1a2e" : "#e2e8f0",
                }}>
                {c || "Tous"}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, padding: "8px 0" }}>
          {loading && <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Chargement…</div>}
          {!loading && items.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Aucun produit trouvé</div>
          )}
          {items.map(p => (
            <div key={p.id}
              onClick={() => { onAdd(p); onClose() }}
              style={{ padding: "12px 16px", cursor: "pointer", borderBottom: "1px solid #f8fafc", transition: "background 0.1s" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f8fafc")}
              onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1a202c", lineHeight: 1.3 }}>{p.designation}</div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                    {p.brand} {p.reference ? `· ${p.reference}` : ""}
                  </div>
                </div>
                {p.list_price != null && (
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#1a1a2e", flexShrink: 0, marginLeft: 12 }}>
                    {fmtNum(p.list_price)} €
                  </div>
                )}
              </div>
              {p.category && (
                <span style={{ marginTop: 5, display: "inline-block", fontSize: 10, fontWeight: 700, color: "#7c3aed", background: "#ede9fe", borderRadius: 10, padding: "1px 8px", textTransform: "uppercase" }}>
                  {p.category}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Field({ label, value, onChange, onBlur, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; onBlur?: () => void; type?: string
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</label>
      <input
        type={type} value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        style={{ display: "block", width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid #e2e8f0", fontSize: 13, boxSizing: "border-box", outline: "none", background: "#fafafa" }}
        autoComplete="off"
      />
    </div>
  )
}

function Th({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th style={{ padding: "7px 8px", fontSize: 11, fontWeight: 700, color: "#64748b", textAlign: "left", whiteSpace: "nowrap", ...style }}>
      {children}
    </th>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  toast: {
    position: "fixed" as const, top: 20, right: 20, zIndex: 9999,
    background: "#1a1a2e", color: "#fff",
    padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600,
    boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
  } as React.CSSProperties,

  header: {
    background: "#1a1a2e", padding: "11px 24px",
    display: "flex", justifyContent: "space-between", alignItems: "center",
    flexWrap: "wrap" as const, gap: 10,
    position: "sticky" as const, top: 0, zIndex: 50,
    boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
  },

  backLink: { color: "#93c5fd", fontSize: 13, textDecoration: "none", fontWeight: 600 },

  btnSave: {
    padding: "6px 16px", background: "#3b82f6", color: "#fff",
    border: "none", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 700,
  } as React.CSSProperties,

  btnPdf: {
    padding: "6px 16px",
    background: "linear-gradient(135deg, #c9a227, #f5e075, #c9a227)",
    color: "#07070f", border: "none", borderRadius: 7, cursor: "pointer",
    fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", gap: 6,
  } as React.CSSProperties,
  btnSend: {
    padding: "6px 16px", background: "#10b981", color: "#fff",
    border: "none", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 700,
  } as React.CSSProperties,

  statusSelect: {
    padding: "5px 10px", background: "#0f172a", color: "#94a3b8",
    border: "1px solid #334155", borderRadius: 6, fontSize: 13, cursor: "pointer",
  } as React.CSSProperties,

  card: {
    background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0",
    boxShadow: "0 1px 4px rgba(0,0,0,0.04)", padding: "16px 20px",
  } as React.CSSProperties,

  cardTitle: { margin: "0 0 12px", fontSize: 11, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: 0.6 },

  td: { padding: "3px 4px", verticalAlign: "middle" } as React.CSSProperties,

  ci: {
    display: "block", width: "100%", padding: "5px 6px",
    border: "1px solid transparent", borderRadius: 5,
    fontSize: 13, background: "transparent", outline: "none",
    boxSizing: "border-box" as const,
  } as React.CSSProperties,
}
