"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

const sb = createClient()

type Company = {
  id: string
  company_name: string
  city: string | null
  country: string | null
  is_own: boolean
  member_email: string | null
}

type QuoteSummary = {
  id:         string
  status:     string
  company_id: string | null
  sent_at:    string | null
  signed_at:  string | null
}

const TRADES = [
  "Vidéosurveillance", "Contrôle d'accès", "Alarme & Intrusion",
  "Réseau & Infrastructure", "Interphonie", "Cybersécurité", "Maintenance",
]

const FORM_FIELDS = [
  { key: "company_name", label: "Nom *", placeholder: "Nom de la société" },
  { key: "city", label: "Ville", placeholder: "Paris" },
  { key: "address_line_1", label: "Adresse", placeholder: "12 rue de la Paix" },
  { key: "postal_code", label: "Code postal", placeholder: "75001" },
] as const

const EMPTY_FORM = { company_name: "", city: "", address_line_1: "", postal_code: "", country: "FR" }

export default function CompaniesPage() {
  const [user, setUser] = useState<User | null>(null)
  const [userType, setUserType] = useState<string | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [quotes, setQuotes] = useState<QuoteSummary[]>([])
  const [quotePopup, setQuotePopup] = useState<{ company: Company; step: 1 | 2 } | null>(null)
  const [qForm, setQForm] = useState({
    client_name: "", title: "", reference: "", salesperson: "",
    issued_at: new Date().toISOString().split("T")[0],
  })
  const [qTrades, setQTrades] = useState<string[]>([])
  const [qCreating, setQCreating] = useState(false)
  const [qError, setQError] = useState("")
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => {
      const u = data.user
      setUser(u)
      if (u) {
        sb.from("profiles").select("user_type").eq("id", u.id).single()
          .then(({ data: p }) => setUserType(p?.user_type ?? "integrator"))
        fetchCompanies()
        fetchQuotes()
      }
    })
    const { data: listener } = sb.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function fetchCompanies() {
    const res = await fetch("/api/companies")
    if (res.ok) setCompanies(await res.json())
  }

  async function fetchQuotes() {
    const res = await fetch("/api/quotes")
    if (res.ok) setQuotes(await res.json())
  }

  function quoteCounts(companyId: string) {
    const companyQuotes = quotes.filter(q => q.company_id === companyId)
    return {
      sent:     companyQuotes.filter(q => q.sent_at).length,
      accepted: companyQuotes.filter(q => q.status === "accepted").length,
    }
  }

  async function handleCreate() {
    if (!form.company_name.trim()) return setMessage("Le nom de la société est requis")
    setLoading(true)
    setMessage("")
    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (res.ok) {
      setMessage("Société créée avec succès !")
      setForm(EMPTY_FORM)
      fetchCompanies()
    } else {
      setMessage("Erreur : " + (data.error ?? "inconnue"))
    }
    setLoading(false)
  }

  async function handleCreateQuote() {
    if (!quotePopup) return
    setQCreating(true)
    setQError("")
    const res = await fetch("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_id: quotePopup.company.id,
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
      window.location.href = `/quotes/${data.id}`
    } else {
      setQError(data.error ?? "Erreur lors de la création du devis")
      setQCreating(false)
    }
  }

  if (!user) return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <a href="/login" style={{ color: "#3b82f6", fontWeight: 600 }}>Se connecter</a>
    </div>
  )

  const isIntegrator = userType !== "client"
  const ownCompanies = companies.filter(c => c.is_own)
  const memberCompanies = companies.filter(c => !c.is_own)
  const displayName = user.email?.split("@")[0] ?? "—"

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={S.logo}>S</div>
          <div>
            <div style={S.headerName}>{displayName}</div>
            <div style={S.headerEmail}>{user.email}</div>
          </div>
        </div>
        <nav style={S.nav}>
          <a href="/dashboard" style={S.navLink}>Tableau de bord</a>
          {isIntegrator && <a href="/settings" style={S.navLink}>Paramètres</a>}
          <button
            onClick={() => sb.auth.signOut().then(() => { window.location.href = "/login" })}
            style={S.btnLogout}
          >
            Déconnexion
          </button>
        </nav>
      </header>

      <div style={S.container}>
        <h1 style={S.pageTitle}>Mes sociétés</h1>

        <div style={S.grid}>
          <div style={{ flex: "0 0 280px" }}>
            <div style={S.card}>
              <h2 style={S.cardTitle}>Créer une société</h2>
              {FORM_FIELDS.map(f => (
                <div key={f.key}>
                  <label style={S.label}>{f.label}</label>
                  <input
                    placeholder={f.placeholder}
                    value={form[f.key]}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    onKeyDown={e => { if (e.key === "Enter" && f.key === "postal_code") handleCreate() }}
                    style={S.input}
                  />
                </div>
              ))}
              <button
                onClick={handleCreate}
                disabled={loading}
                style={{ ...S.btnPrimary, opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}
              >
                {loading ? "Création..." : "Créer"}
              </button>
              {message && <p style={companyMessageStyle(message)}>{message}</p>}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
            {/* Mes sociétés */}
            <div style={{ flex: "1 1 220px", minWidth: 0 }}>
              <div style={{ ...S.sectionHeader, background: "#1a1a2e" }}>
                Mes sociétés ({ownCompanies.length})
              </div>
              {ownCompanies.length === 0 ? (
                <div style={S.emptyCard}>Aucune société créée</div>
              ) : (
                ownCompanies.map((c, i) => {
                  const { sent, accepted } = quoteCounts(c.id)
                  return (
                  <div
                    key={c.id}
                    style={{
                      ...S.companyRow,
                      borderRadius: i === ownCompanies.length - 1 ? "0 0 8px 8px" : 0,
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={S.companyName}>{c.company_name}</div>
                      {c.city && (
                        <div style={S.companyCity}>{c.city}{c.country ? `, ${c.country}` : ""}</div>
                      )}
                      {sent > 0 && (
                        <a href={`/quotes?company=${c.id}`} style={{ display: "flex", gap: 6, marginTop: 6, textDecoration: "none" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#3b82f6", background: "#dbeafe", borderRadius: 20, padding: "3px 10px", cursor: "pointer" }}>
                            ✉ {sent} envoyé{sent > 1 ? "s" : ""}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#10b981", background: "#d1fae5", borderRadius: 20, padding: "3px 10px", cursor: "pointer" }}>
                            ✅ {accepted} accepté{accepted > 1 ? "s" : ""}
                          </span>
                        </a>
                      )}
                    </div>
                    {isIntegrator && (
                      <button
                        onClick={() => {
                          setQuotePopup({ company: c, step: 1 })
                          setQForm({ client_name: "", title: "", reference: "", salesperson: "", issued_at: new Date().toISOString().split("T")[0] })
                          setQTrades([])
                          setQError("")
                        }}
                        style={{
                          padding: "5px 12px", background: "#1a1a2e", color: "#fff",
                          border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600, flexShrink: 0,
                        }}
                      >
                        + Devis
                      </button>
                    )}
                  </div>
                  )
                })
              )}
            </div>

            {/* Sociétés de mes membres */}
            {isIntegrator && (
              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                <div style={{ ...S.sectionHeader, background: "#5a2d82" }}>
                  Sociétés membres ({memberCompanies.length})
                </div>
                {memberCompanies.length === 0 ? (
                  <div style={S.emptyCard}>Aucune société créée par vos membres</div>
                ) : (
                  memberCompanies.map((c, i) => (
                    <div
                      key={c.id}
                      style={{
                        ...S.companyRow,
                        borderLeft: "3px solid #d4b8f0",
                        borderRadius: i === memberCompanies.length - 1 ? "0 0 8px 8px" : 0,
                      }}
                    >
                      <div style={S.companyName}>{c.company_name}</div>
                      {c.city && (
                        <div style={S.companyCity}>{c.city}{c.country ? `, ${c.country}` : ""}</div>
                      )}
                      {c.member_email && (
                        <div style={{ fontSize: 11, color: "#7c4dab", marginTop: 4 }}>
                          Par {c.member_email}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Popup création devis ── */}
      {quotePopup && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
          onClick={e => { if (e.target === e.currentTarget) setQuotePopup(null) }}
        >
          <div style={{
            background: "#fff", borderRadius: 16,
            boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            width: "100%", maxWidth: 520, padding: 32, margin: 16,
          }}>
            {/* Titre popup */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 11, color: "#5a2d82", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>
                  Nouveau devis — {quotePopup.step === 1 ? "Étape 1/2" : "Étape 2/2"}
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#1a202c" }}>
                  {quotePopup.company.company_name}
                </div>
              </div>
              <button onClick={() => setQuotePopup(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 22, lineHeight: 1 }}>×</button>
            </div>

            {quotePopup.step === 1 ? (
              <>
                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 3 }}>Client *</label>
                    <input
                      autoFocus
                      placeholder="Nom du client…"
                      value={qForm.client_name}
                      onChange={e => setQForm(f => ({ ...f, client_name: e.target.value }))}
                      style={{ display: "block", width: "100%", padding: "9px 11px", border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 13, marginBottom: 12, boxSizing: "border-box", outline: "none" }}
                    />
                  </div>
                </div>
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
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 3 }}>Date d&apos;émission</label>
                  <input type="date"
                    value={qForm.issued_at}
                    onChange={e => setQForm(f => ({ ...f, issued_at: e.target.value }))}
                    style={{ display: "block", width: "100%", padding: "9px 11px", border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 13, marginBottom: 20, boxSizing: "border-box", outline: "none" }}
                  />
                </div>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button onClick={() => setQuotePopup(null)} style={{ padding: "9px 20px", background: "#f1f5f9", color: "#374151", border: "none", borderRadius: 7, cursor: "pointer", fontSize: 13 }}>
                    Annuler
                  </button>
                  <button
                    onClick={() => setQuotePopup(p => p ? { ...p, step: 2 } : p)}
                    style={{ padding: "9px 24px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 700 }}
                  >
                    Suivant →
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 13, color: "#64748b", marginBottom: 14 }}>
                  Sélectionne les chapitres à pré-créer (optionnel) :
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
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
                  <button onClick={() => setQuotePopup(p => p ? { ...p, step: 1 } : p)} style={{ padding: "9px 20px", background: "#f1f5f9", color: "#374151", border: "none", borderRadius: 7, cursor: "pointer", fontSize: 13 }}>
                    ← Retour
                  </button>
                  <button
                    onClick={handleCreateQuote}
                    disabled={qCreating}
                    style={{ padding: "9px 24px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 7, cursor: qCreating ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, opacity: qCreating ? 0.7 : 1 }}
                  >
                    {qCreating ? "Création…" : "Créer le devis →"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function companyMessageStyle(msg: string): React.CSSProperties {
  const isSuccess = msg.startsWith("Société créée")
  return {
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 8,
    fontSize: 13,
    background: isSuccess ? "#f0fdf4" : "#fef2f2",
    color: isSuccess ? "#166534" : "#b91c1c",
    border: `1px solid ${isSuccess ? "#86efac" : "#fca5a5"}`,
  }
}

const S = {
  page: {
    minHeight: "100vh",
    background: "#f8fafc",
    fontFamily: "system-ui, -apple-system, sans-serif",
  } as React.CSSProperties,
  header: {
    background: "#1a1a2e",
    padding: "14px 24px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap" as const,
    gap: 12,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 8,
    background: "#3b82f6",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontWeight: 800,
    fontSize: 18,
    flexShrink: 0,
  } as React.CSSProperties,
  headerName: { fontWeight: 700, color: "#fff", fontSize: 14 },
  headerEmail: { fontSize: 12, color: "#94a3b8" },
  nav: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" as const },
  navLink: { color: "#93c5fd", fontSize: 13, textDecoration: "none", fontWeight: 500 },
  btnLogout: {
    padding: "6px 14px",
    background: "transparent",
    color: "#94a3b8",
    border: "1px solid #334155",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
  } as React.CSSProperties,
  container: { maxWidth: 1100, margin: "0 auto", padding: "28px 16px" },
  pageTitle: { margin: "0 0 24px", fontSize: 22, fontWeight: 700, color: "#1a202c" },
  grid: { display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" as const },
  card: {
    background: "#fff",
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    padding: 24,
    marginBottom: 16,
  } as React.CSSProperties,
  cardTitle: { margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#1a202c" },
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: "#374151",
    marginBottom: 4,
  } as React.CSSProperties,
  input: {
    display: "block",
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    fontSize: 14,
    boxSizing: "border-box" as const,
    marginBottom: 12,
    outline: "none",
  },
  btnPrimary: {
    display: "block",
    width: "100%",
    padding: "10px 24px",
    background: "#1a1a2e",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
  } as React.CSSProperties,
  sectionHeader: {
    color: "#fff",
    padding: "10px 16px",
    fontWeight: 700,
    fontSize: 14,
    borderRadius: "8px 8px 0 0",
  } as React.CSSProperties,
  companyRow: {
    background: "#fff",
    padding: "14px 16px",
    border: "1px solid #e2e8f0",
    borderTop: "none",
  } as React.CSSProperties,
  emptyCard: {
    background: "#fff",
    padding: "16px",
    border: "1px solid #e2e8f0",
    borderTop: "none",
    borderRadius: "0 0 8px 8px",
    color: "#94a3b8",
    fontSize: 13,
  } as React.CSSProperties,
  companyName: { fontWeight: 700, color: "#1a202c", fontSize: 14 },
  companyCity: { fontSize: 12, color: "#64748b", marginTop: 3 },
}
