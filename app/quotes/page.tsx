"use client"

import { useState, useEffect, useMemo, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

const sb = createClient()

type Quote = {
  id:           string
  quote_number: string
  status:       string
  title:        string | null
  issued_at:    string | null
  valid_until:  string | null
  tva_rate:     number | null
  sent_at:      string | null
  signed_at:    string | null
  signed_by:    string | null
  public_token: string | null
  total_ht:     number
  company_id:   string | null
  client_id:    string | null
  clients:      { name: string } | { name: string }[] | null
  companies:    { company_name: string } | { company_name: string }[] | null
}

const TRADES = [
  "Vidéosurveillance", "Contrôle d'accès", "Alarme & Intrusion",
  "Réseau & Infrastructure", "Interphonie", "Cybersécurité", "Maintenance",
]

const EMPTY_QFORM = {
  client_name: "", title: "", reference: "", salesperson: "",
  issued_at: new Date().toISOString().split("T")[0],
}

const STATUSES = [
  { key: "draft",    label: "Brouillon",  color: "#64748b" },
  { key: "sent",     label: "Envoyé",     color: "#3b82f6" },
  { key: "accepted", label: "Accepté",    color: "#10b981" },
  { key: "rejected", label: "Refusé",     color: "#ef4444" },
  { key: "expired",  label: "Expiré",     color: "#f59e0b" },
]

function fmtNum(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(d: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("fr-FR")
}
function single<T>(v: T | T[] | null): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}
// Un devis est "gagné" s'il est signé électroniquement OU marqué accepté manuellement
function isWon(q: { status: string; signed_at: string | null }) {
  return q.status === "accepted" || !!q.signed_at
}

function QuotesPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const companyFilterFromUrl = searchParams.get("company")

  const [user,        setUser]        = useState<User | null>(null)
  const [quotes,      setQuotes]      = useState<Quote[]>([])
  const [loading,     setLoading]     = useState(true)
  const [loadingKey,  setLoadingKey]  = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [search,      setSearch]      = useState("")
  const [companyFilter, setCompanyFilter] = useState<string | null>(companyFilterFromUrl)
  const [prevCompanyFilterFromUrl, setPrevCompanyFilterFromUrl] = useState(companyFilterFromUrl)
  if (companyFilterFromUrl !== prevCompanyFilterFromUrl) {
    setPrevCompanyFilterFromUrl(companyFilterFromUrl)
    setCompanyFilter(companyFilterFromUrl)
  }

  const [quotePopup, setQuotePopup] = useState(false)
  const [qForm, setQForm] = useState(EMPTY_QFORM)
  const [qTrades, setQTrades] = useState<string[]>([])
  const [qCreating, setQCreating] = useState(false)
  const [qError, setQError] = useState("")
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [validatingId, setValidatingId] = useState<string | null>(null)
  // company_id → propriété (société de l'owner ou d'un member) pour taguer l'origine du devis
  const [companyMeta, setCompanyMeta] = useState<Record<string, { is_own: boolean; member_email: string | null }>>({})

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: listener } = sb.auth.onAuthStateChange((_, session) => setUser(session?.user ?? null))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) return
    fetch("/api/companies")
      .then(r => r.ok ? r.json() : [])
      .then((cs: { id: string; is_own: boolean; member_email: string | null }[]) => {
        const map: Record<string, { is_own: boolean; member_email: string | null }> = {}
        for (const c of cs) map[c.id] = { is_own: c.is_own, member_email: c.member_email }
        setCompanyMeta(map)
      })
  }, [user])

  const queryKey = user ? `${user.id}|${companyFilter ?? ""}` : null
  if (queryKey && queryKey !== loadingKey) {
    setLoadingKey(queryKey)
    setLoading(true)
  }

  useEffect(() => {
    if (!user) return
    const url = companyFilter ? `/api/quotes?company_id=${companyFilter}` : "/api/quotes"
    fetch(url)
      .then(r => r.ok ? r.json() : [])
      .then(setQuotes)
      .finally(() => setLoading(false))
  }, [user, companyFilter])

  const filtered = useMemo(() => {
    return quotes.filter(q => {
      if (statusFilter && q.status !== statusFilter) return false
      if (search.trim()) {
        const s = search.trim().toLowerCase()
        const client  = single(q.clients)?.name?.toLowerCase() ?? ""
        const company = single(q.companies)?.company_name?.toLowerCase() ?? ""
        if (!q.quote_number.toLowerCase().includes(s) && !client.includes(s) && !company.includes(s) && !(q.title ?? "").toLowerCase().includes(s)) {
          return false
        }
      }
      return true
    })
  }, [quotes, statusFilter, search])

  const stats = useMemo(() => {
    const total      = quotes.length
    const sent       = quotes.filter(q => q.sent_at).length
    const accepted   = quotes.filter(isWon).length
    const totalHT    = quotes.reduce((acc, q) => acc + q.total_ht, 0)
    const signedHT   = quotes.filter(isWon).reduce((acc, q) => acc + q.total_ht, 0)
    const conversion = sent > 0 ? Math.round((accepted / sent) * 100) : 0
    return { total, sent, accepted, totalHT, signedHT, conversion }
  }, [quotes])

  const filteredCompanyName = companyFilter
    ? (single(quotes.find(q => q.company_id === companyFilter)?.companies ?? null)?.company_name ?? null)
    : null

  function openNewQuote() {
    setQForm(EMPTY_QFORM)
    setQTrades([])
    setQError("")
    setQuotePopup(true)
  }

  async function handleCreateQuote() {
    if (!companyFilter) return
    setQCreating(true)
    setQError("")
    const res = await fetch("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_id: companyFilter,
        client_name: qForm.client_name,
        title: qForm.title,
        reference: qForm.reference,
        salesperson: qForm.salesperson,
        issued_at: qForm.issued_at,
        trades: qTrades,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      router.push(`/quotes/${data.id}`)
    } else {
      setQError(data.error ?? "Erreur lors de la création du devis")
      setQCreating(false)
    }
  }

  async function handleValidate(quoteId: string) {
    setValidatingId(quoteId)
    const res = await fetch(`/api/quotes/${quoteId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "accepted" }),
    })
    if (res.ok) {
      setQuotes(prev => prev.map(q => q.id === quoteId ? { ...q, status: "accepted" } : q))
    } else {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? "Erreur lors de la validation du devis")
    }
    setValidatingId(null)
  }

  async function handleDuplicate(quoteId: string) {
    setDuplicatingId(quoteId)
    const res = await fetch(`/api/quotes/${quoteId}/duplicate`, { method: "POST" })
    const data = await res.json()
    if (res.ok) {
      window.location.assign(`/quotes/${data.id}`)
    } else {
      setDuplicatingId(null)
      alert(data.error ?? "Erreur lors de la duplication du devis")
    }
  }

  if (!user) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ color: "#94a3b8", fontSize: 14 }}>Chargement…</div>
    </div>
  )

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <header style={{ background: "#1a1a2e", padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="/companies" style={{ color: "#94a3b8", fontSize: 13, textDecoration: "none" }}>← Tableau de bord</a>
          <span style={{ color: "#334155" }}>|</span>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>Mes devis</span>
        </div>
        <a href="/account" style={{ color: "#93c5fd", fontSize: 13, textDecoration: "none", fontWeight: 600 }}>Mon compte</a>
      </header>

      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "24px 16px" }}>

        {/* Filtre actif société */}
        {companyFilter && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13, color: "#475569" }}>
                Vue filtrée sur une seule société{filteredCompanyName && <>: <strong>{filteredCompanyName}</strong></>}
              </span>
              <button
                onClick={() => { setCompanyFilter(null); window.history.replaceState(null, "", "/quotes") }}
                style={{ fontSize: 13, color: "#fff", background: "#1a1a2e", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 700 }}
              >
                ← Voir TOUS les devis (vous + vos members)
              </button>
            </div>
            <button
              onClick={openNewQuote}
              style={{ fontSize: 13, fontWeight: 700, color: "#fff", background: "#1a1a2e", border: "none", borderRadius: 8, padding: "9px 18px", cursor: "pointer" }}
            >
              + Nouveau devis
            </button>
          </div>
        )}

        {/* Stats */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 22 }}>
          <StatCard label="Devis au total"     value={stats.total}                color="#1a1a2e" />
          <StatCard label="Envoyés"            value={stats.sent}                 color="#3b82f6" />
          <StatCard label="Acceptés"           value={stats.accepted}             color="#10b981" />
          <StatCard label="Taux de conversion" value={`${stats.conversion}%`}     color="#8b5cf6" />
          <StatCard label="Montant total HT"   value={`${fmtNum(stats.totalHT)} €`}  color="#1a1a2e" wide />
          <StatCard label="Montant signé HT"   value={`${fmtNum(stats.signedHT)} €`} color="#10b981" wide />
        </div>

        {/* Filtres */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher (n°, client, société, objet)…"
            style={{ flex: "1 1 260px", padding: "9px 14px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13, boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              onClick={() => setStatusFilter(null)}
              style={pillStyle(statusFilter === null, "#1a1a2e")}
            >
              Tous
            </button>
            {STATUSES.map(s => (
              <button key={s.key} onClick={() => setStatusFilter(s.key)} style={pillStyle(statusFilter === s.key, s.color)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Liste */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8", fontSize: 14 }}>Chargement des devis…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8", fontSize: 14, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12 }}>
            Aucun devis ne correspond à ces critères.
          </div>
        ) : (
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <Th>N° Devis</Th>
                  <Th>Société / Client</Th>
                  <Th>Objet</Th>
                  <Th>Statut</Th>
                  <Th align="right">Montant HT</Th>
                  <Th>Émis le</Th>
                  <Th>Validité</Th>
                  <Th>Signature</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(q => {
                  const statusInfo = STATUSES.find(s => s.key === q.status) ?? STATUSES[0]
                  const client  = single(q.clients)
                  const company = single(q.companies)
                  return (
                    <tr key={q.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={tdStyle}>
                        <a href={`/quotes/${q.id}`} style={{ color: "#1a1a2e", fontWeight: 700, textDecoration: "none" }}>{q.quote_number}</a>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, color: "#1a202c" }}>{company?.company_name ?? "—"}</div>
                        {client?.name && <div style={{ fontSize: 12, color: "#64748b" }}>{client.name}</div>}
                        {q.company_id && companyMeta[q.company_id] && !companyMeta[q.company_id].is_own && (
                          <div style={{ display: "inline-block", marginTop: 4, fontSize: 10, fontWeight: 700, color: "#7c4dab", background: "#faf5ff", border: "1px solid #d4b8f0", borderRadius: 4, padding: "1px 6px" }}>
                            👤 Membre{companyMeta[q.company_id].member_email ? ` — ${companyMeta[q.company_id].member_email}` : ""}
                          </div>
                        )}
                      </td>
                      <td style={{ ...tdStyle, color: "#64748b" }}>{q.title ?? "—"}</td>
                      <td style={tdStyle}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, color: statusInfo.color,
                          background: `${statusInfo.color}1a`, border: `1px solid ${statusInfo.color}44`,
                          borderRadius: 20, padding: "3px 10px", whiteSpace: "nowrap",
                        }}>{statusInfo.label}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: "#1a202c" }}>{fmtNum(q.total_ht)} €</td>
                      <td style={{ ...tdStyle, color: "#64748b" }}>{fmtDate(q.issued_at)}</td>
                      <td style={{ ...tdStyle, color: "#64748b" }}>{fmtDate(q.valid_until)}</td>
                      <td style={tdStyle}>
                        {q.signed_at ? (
                          <div style={{ fontSize: 12, color: "#15803d" }}>
                            ✅ {q.signed_by}<br /><span style={{ color: "#94a3b8" }}>{new Date(q.signed_at).toLocaleDateString("fr-FR")}</span>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: "#cbd5e1" }}>—</span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                        <a href={`/quotes/${q.id}`} style={linkBtnStyle}>Ouvrir</a>
                        {!isWon(q) && (
                          <button
                            onClick={() => handleValidate(q.id)}
                            disabled={validatingId === q.id}
                            style={{ ...linkBtnStyle, marginLeft: 6, background: "#10b981", color: "#fff", border: "none", cursor: validatingId === q.id ? "default" : "pointer", opacity: validatingId === q.id ? 0.6 : 1 }}
                          >
                            {validatingId === q.id ? "Confirmation…" : "✓ Confirmé"}
                          </button>
                        )}
                        {q.public_token && (
                          <a href={`/q/${q.public_token}`} target="_blank" rel="noreferrer" style={{ ...linkBtnStyle, marginLeft: 6, background: "#f1f5f9", color: "#475569" }}>
                            Vue client
                          </a>
                        )}
                        <button
                          onClick={() => handleDuplicate(q.id)}
                          disabled={duplicatingId === q.id}
                          style={{ ...linkBtnStyle, marginLeft: 6, background: "#f1f5f9", color: "#475569", border: "none", cursor: duplicatingId === q.id ? "default" : "pointer", opacity: duplicatingId === q.id ? 0.6 : 1 }}
                        >
                          {duplicatingId === q.id ? "Duplication…" : "Dupliquer"}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Popup création devis ── */}
      {quotePopup && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
          onClick={e => { if (e.target === e.currentTarget) setQuotePopup(false) }}
        >
          <div style={{
            background: "#fff", borderRadius: 16,
            boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            width: "100%", maxWidth: 520, padding: 32, margin: 16,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 11, color: "#5a2d82", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>
                  Nouveau devis
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#1a202c" }}>
                  {filteredCompanyName ?? "Société sélectionnée"}
                </div>
              </div>
              <button onClick={() => setQuotePopup(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 22, lineHeight: 1 }}>×</button>
            </div>

            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 3 }}>Client *</label>
            <input
              autoFocus
              placeholder="Nom du client…"
              value={qForm.client_name}
              onChange={e => setQForm(f => ({ ...f, client_name: e.target.value }))}
              style={{ display: "block", width: "100%", padding: "9px 11px", border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 13, marginBottom: 12, boxSizing: "border-box", outline: "none" }}
            />
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 3 }}>Objet du devis</label>
            <input
              placeholder="Installation vidéosurveillance…"
              value={qForm.title}
              onChange={e => setQForm(f => ({ ...f, title: e.target.value }))}
              style={{ display: "block", width: "100%", padding: "9px 11px", border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 13, marginBottom: 12, boxSizing: "border-box", outline: "none" }}
            />
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 3 }}>Référence affaire</label>
                <input
                  placeholder="AFF-2026-01"
                  value={qForm.reference}
                  onChange={e => setQForm(f => ({ ...f, reference: e.target.value }))}
                  style={{ display: "block", width: "100%", padding: "9px 11px", border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 13, marginBottom: 12, boxSizing: "border-box", outline: "none" }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 3 }}>Commercial</label>
                <input
                  placeholder="Prénom Nom"
                  value={qForm.salesperson}
                  onChange={e => setQForm(f => ({ ...f, salesperson: e.target.value }))}
                  style={{ display: "block", width: "100%", padding: "9px 11px", border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 13, marginBottom: 12, boxSizing: "border-box", outline: "none" }}
                />
              </div>
            </div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 3 }}>Date d&apos;émission</label>
            <input type="date"
              value={qForm.issued_at}
              onChange={e => setQForm(f => ({ ...f, issued_at: e.target.value }))}
              style={{ display: "block", width: "100%", padding: "9px 11px", border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 13, marginBottom: 16, boxSizing: "border-box", outline: "none" }}
            />

            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 10 }}>
              Sélectionne les chapitres à pré-créer (optionnel) :
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              {TRADES.map(t => {
                const active = qTrades.includes(t)
                return (
                  <button key={t} onClick={() => setQTrades(prev => active ? prev.filter(x => x !== t) : [...prev, t])}
                    style={{
                      padding: "7px 14px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                      background: active ? "#1a1a2e" : "#f1f5f9",
                      color: active ? "#fff" : "#374151",
                    }}>
                    {t}
                  </button>
                )
              })}
            </div>

            {qError && (
              <div style={{ marginBottom: 12, padding: "9px 12px", borderRadius: 7, background: "#fef2f2", color: "#b91c1c", fontSize: 12, border: "1px solid #fca5a5" }}>
                {qError}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setQuotePopup(false)} style={{ padding: "9px 20px", background: "#f1f5f9", color: "#374151", border: "none", borderRadius: 7, cursor: "pointer", fontSize: 13 }}>
                Annuler
              </button>
              <button
                onClick={handleCreateQuote}
                disabled={qCreating}
                style={{ padding: "9px 24px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 7, cursor: qCreating ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, opacity: qCreating ? 0.7 : 1 }}
              >
                {qCreating ? "Création…" : "Créer le devis →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function QuotesPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ color: "#94a3b8", fontSize: 14 }}>Chargement…</div>
      </div>
    }>
      <QuotesPageInner />
    </Suspense>
  )
}

function StatCard({ label, value, color, wide }: { label: string; value: string | number; color: string; wide?: boolean }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 18px", flex: wide ? "1 1 200px" : "1 1 130px" }}>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginTop: 2 }}>{label}</div>
    </div>
  )
}

function Th({ children, align }: { children?: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#64748b", textAlign: align ?? "left", whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: 0.5 }}>
      {children}
    </th>
  )
}

const tdStyle: React.CSSProperties = { padding: "12px 14px", verticalAlign: "top" }

const linkBtnStyle: React.CSSProperties = {
  display: "inline-block", padding: "5px 12px", background: "#1a1a2e", color: "#fff",
  borderRadius: 6, fontSize: 12, fontWeight: 600, textDecoration: "none",
}

function pillStyle(active: boolean, color: string): React.CSSProperties {
  return {
    padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
    border: `1px solid ${active ? color : "#e2e8f0"}`,
    background: active ? `${color}1a` : "#fff",
    color: active ? color : "#64748b",
  }
}
