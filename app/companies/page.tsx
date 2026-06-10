"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
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
  id:           string
  quote_number: string
  title:        string | null
  status:       string
  company_id:   string | null
  sent_at:      string | null
  signed_at:    string | null
  total_ht:     number
}

type Member = {
  id:        string
  email:     string
  companies: { id: string; company_name: string; city: string | null }[]
}

type Organization = { id: string; name: string; city: string | null }

const TRADES = [
  "Vidéosurveillance", "Contrôle d'accès", "Alarme & Intrusion",
  "Réseau & Infrastructure", "Interphonie", "Cybersécurité", "Maintenance",
]

const FORM_FIELDS = [
  { key: "company_name",   label: "Nom",         placeholder: "Nom de la société",   required: true,  type: "text" },
  { key: "email",          label: "Email",       placeholder: "contact@societe.fr",  required: true,  type: "email" },
  { key: "phone",          label: "Téléphone",   placeholder: "01 23 45 67 89",      required: true,  type: "tel" },
  { key: "siret",          label: "SIRET",       placeholder: "123 456 789 00012",   required: true,  type: "text" },
  { key: "vat_number",     label: "N° TVA",      placeholder: "FR12345678901",       required: true,  type: "text" },
  { key: "city",           label: "Ville",       placeholder: "Paris",               required: false, type: "text" },
  { key: "address_line_1", label: "Adresse",     placeholder: "12 rue de la Paix",   required: false, type: "text" },
  { key: "postal_code",    label: "Code postal", placeholder: "75001",               required: false, type: "text" },
] as const

const EMPTY_FORM = {
  company_name: "", email: "", phone: "", siret: "", vat_number: "",
  city: "", address_line_1: "", postal_code: "", country: "FR",
}

// Un devis est "gagné" s'il est signé électroniquement OU marqué accepté manuellement
function isWon(q: { status: string; signed_at: string | null }) {
  return q.status === "accepted" || !!q.signed_at
}

// Agrège les KPI d'un ensemble de sociétés (par leurs ids)
function aggregateKpis(quotes: QuoteSummary[], companyIds: string[]) {
  const set = new Set(companyIds)
  const scoped = quotes.filter(q => q.company_id && set.has(q.company_id))
  const won = scoped.filter(isWon)
  return {
    sent:     scoped.filter(q => q.sent_at).length,
    accepted: won.length,
    revenue:  won.reduce((s, q) => s + (q.total_ht ?? 0), 0),
  }
}

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
  const [confirmOpen, setConfirmOpen] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  // Gestion d'équipe (owner)
  const [members, setMembers] = useState<Member[]>([])
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [newEmail, setNewEmail] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [memberMsg, setMemberMsg] = useState("")
  const [memberLoading, setMemberLoading] = useState(false)
  const [showCompanyModal, setShowCompanyModal] = useState(false)
  const [showMemberModal, setShowMemberModal] = useState(false)

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => {
      const u = data.user
      setUser(u)
      if (u) {
        sb.from("profiles").select("user_type, organization_id").eq("id", u.id).single()
          .then(({ data: p }) => {
            setUserType(p?.user_type ?? "integrator")
            if (p?.organization_id) {
              sb.from("organizations").select("id, name, city").eq("id", p.organization_id).single()
                .then(({ data: org }) => { if (org) setOrganization(org) })
            }
          })
        fetchCompanies()
        fetchQuotes()
        fetchMembers()
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

  async function fetchMembers() {
    const res = await fetch("/api/members")
    if (res.ok) setMembers(await res.json())
  }

  async function handleCreateMember() {
    if (!newEmail)    return setMemberMsg("Email requis")
    if (!newPassword) return setMemberMsg("Mot de passe requis")
    setMemberLoading(true)
    setMemberMsg("")
    const res = await fetch("/api/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newEmail, password: newPassword }),
    })
    const data = await res.json()
    if (!res.ok) {
      setMemberMsg(data.error ?? `Erreur HTTP ${res.status}`)
    } else {
      setMemberMsg(data.already_member ? `${data.email} est déjà dans votre équipe.` : `Compte créé : ${data.email}`)
      setNewEmail(""); setNewPassword("")
      setShowMemberModal(false)
      fetchMembers()
    }
    setMemberLoading(false)
  }

  async function handleDeleteMember(userId: string) {
    const res = await fetch("/api/members", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    })
    if (res.ok) fetchMembers()
  }

  function quoteCounts(companyId: string) {
    const companyQuotes = quotes.filter(q => q.company_id === companyId)
    const sent     = companyQuotes.filter(q => q.sent_at).length
    const accepted = companyQuotes.filter(isWon)
    return {
      sent,
      accepted:  accepted.length,
      revenue:   accepted.reduce((s, q) => s + (q.total_ht ?? 0), 0),
      signedPct: sent > 0 ? Math.round((accepted.length / sent) * 100) : 0,
    }
  }

  async function handleConfirmQuote(quoteId: string) {
    setConfirmingId(quoteId)
    const res = await fetch(`/api/quotes/${quoteId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "accepted" }),
    })
    if (res.ok) {
      setQuotes(prev => prev.map(q => q.id === quoteId ? { ...q, status: "accepted" } : q))
    } else {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? "Erreur lors de la confirmation du devis")
    }
    setConfirmingId(null)
  }

  async function handleCreate() {
    for (const f of FORM_FIELDS) {
      if (f.required && !form[f.key].trim()) return setMessage(`Le champ « ${f.label} » est requis`)
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setMessage("Email invalide")
    setLoading(true)
    setMessage("")
    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (res.ok) {
      setMessage("")
      setForm(EMPTY_FORM)
      setShowCompanyModal(false)
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

  function openQuoteFor(c: Company) {
    setQuotePopup({ company: c, step: 1 })
    setQForm({ client_name: "", title: "", reference: "", salesperson: "", issued_at: new Date().toISOString().split("T")[0] })
    setQTrades([])
    setQError("")
  }

  function renderCompanyCard(c: Company, isMember: boolean) {
    const { sent, accepted, revenue, signedPct } = quoteCounts(c.id)
    const companyQuotes = quotes.filter(q => q.company_id === c.id)
    const isOpen = confirmOpen === c.id
    return (
      <div key={c.id} style={{ ...S.itemCard, ...(isMember ? { borderLeft: "3px solid #d4b8f0" } : {}) }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={S.companyName}>{c.company_name}</div>
            {c.city && <div style={S.companyCity}>{c.city}{c.country ? `, ${c.country}` : ""}</div>}
            {isMember && c.member_email && (
              <div style={{ fontSize: 11, color: "#7c4dab", marginTop: 2 }}>Par {c.member_email}</div>
            )}
            <a href={`/quotes?company=${c.id}`} style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6, textDecoration: "none" }}>
              <span style={S.badgeBlue} title="Devis envoyés">✉ {sent}</span>
              <span style={S.badgeGreen} title="Devis gagnés">✅ {accepted}</span>
              <span style={S.badgePurple} title="% gagné">📊 {signedPct}%</span>
              <span style={S.badgeDark} title="Total signé (CA)">💶 {fmtEur(revenue)} €</span>
            </a>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
            <button
              onClick={() => setConfirmOpen(prev => prev === c.id ? null : c.id)}
              style={{ padding: "4px 10px", background: isOpen ? "#059669" : "#10b981", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}
            >
              ✓ Confirmer {isOpen ? "▴" : "▾"}
            </button>
            <button onClick={() => openQuoteFor(c)} style={S.btnDevisSm}>+ Devis</button>
          </div>
        </div>

        {isOpen && (
          <div style={{ marginTop: 10, borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
            <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>
              Valider le paiement d&apos;un devis
            </div>
            {companyQuotes.length === 0 ? (
              <div style={{ fontSize: 12, color: "#94a3b8" }}>Aucun devis.</div>
            ) : (
              companyQuotes.map(q => {
                const won = isWon(q)
                return (
                  <div key={q.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "5px 0", borderBottom: "1px solid #f1f5f9" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#1a202c" }}>{q.quote_number}</div>
                      {q.title && <div style={{ fontSize: 11, color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140 }}>{q.title}</div>}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#1a202c", whiteSpace: "nowrap" }}>{fmtEur(q.total_ht)} €</div>
                    {won ? (
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#10b981", whiteSpace: "nowrap" }}>✅</span>
                    ) : (
                      <button
                        onClick={() => handleConfirmQuote(q.id)}
                        disabled={confirmingId === q.id}
                        style={{ padding: "4px 9px", background: "#10b981", color: "#fff", border: "none", borderRadius: 6, cursor: confirmingId === q.id ? "default" : "pointer", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", opacity: confirmingId === q.id ? 0.6 : 1 }}
                      >
                        {confirmingId === q.id ? "…" : "✓ Payé"}
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    )
  }

  function renderMemberCard(m: Member) {
    const mk = aggregateKpis(quotes, m.companies.map(c => c.id))
    return (
      <div key={m.id} style={S.itemCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={S.memberEmail}>{m.email}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, margin: "4px 0" }}>
              <span style={S.badgeBlue}>✉ {mk.sent}</span>
              <span style={S.badgeGreen}>✅ {mk.accepted}</span>
              <span style={S.badgeDark}>💶 {fmtEur(mk.revenue)} €</span>
            </div>
            {m.companies.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {m.companies.map(c => (
                  <span key={c.id} style={S.companyTag}>{c.company_name}{c.city ? ` · ${c.city}` : ""}</span>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => handleDeleteMember(m.id)} style={S.btnDelete} title="Retirer ce membre">×</button>
        </div>
      </div>
    )
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

  // KPIs tableau de bord : envoyés / confirmés / % gagné / montant total / total signé
  const acceptedQuotes = quotes.filter(isWon)
  const dash = {
    sent:       quotes.filter(q => q.sent_at).length,
    accepted:   acceptedQuotes.length,
    revenue:    acceptedQuotes.reduce((sum, q) => sum + (q.total_ht ?? 0), 0), // total signé
    totalHT:    quotes.reduce((sum, q) => sum + (q.total_ht ?? 0), 0),         // montant de tous les devis
    conversion: 0,
  }
  dash.conversion = dash.sent > 0 ? Math.round((dash.accepted / dash.sent) * 100) : 0

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
          <Link href="/quotes" style={S.navLink}>Devis</Link>
          {isIntegrator && <Link href="/settings" style={S.navLink}>Paramètres</Link>}
          {isIntegrator && <Link href="/premium" style={S.btnPremium}>✦ Premium</Link>}
          <button
            onClick={() => sb.auth.signOut().then(() => { window.location.href = "/login" })}
            style={S.btnLogout}
          >
            Déconnexion
          </button>
        </nav>
      </header>

      <div style={S.container}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>Bonjour {displayName} 👋</div>
            <h1 style={S.pageTitle}>{isIntegrator ? "Tableau de bord" : "Mon tableau de bord"}</h1>
            {isIntegrator && (
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                {organization ? `${organization.name} — ` : ""}Activité de l&apos;organisation : vous et vos members
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => { setMessage(""); setForm(EMPTY_FORM); setShowCompanyModal(true) }} style={S.btnAction}>+ Société</button>
            {isIntegrator && (
              <button onClick={() => { setMemberMsg(""); setNewEmail(""); setNewPassword(""); setShowMemberModal(true) }} style={{ ...S.btnAction, background: "#5a2d82" }}>+ Membre</button>
            )}
          </div>
        </div>
        <div style={S.dashGrid}>
          <DashCard
            label="Devis envoyés"
            value={String(dash.sent)}
            hint={isIntegrator ? "Organisation entière" : "Adressés à vos clients"}
            accent="#3b82f6"
            icon="✉"
          />
          <DashCard
            label="Devis gagnés"
            value={String(dash.accepted)}
            hint="Signés ou confirmés"
            accent="#10b981"
            icon="✅"
          />
          <DashCard
            label="% gagné"
            value={`${dash.conversion}%`}
            hint="Gagnés / envoyés"
            accent="#8b5cf6"
            icon="📊"
          />
          <DashCard
            label="Montant total des devis"
            value={`${fmtEur(dash.totalHT)} €`}
            hint="HT — tous les devis"
            accent="#0ea5e9"
            icon="🧾"
            wide
          />
          <DashCard
            label="Total signé"
            value={`${fmtEur(dash.revenue)} €`}
            hint="HT — devis gagnés (CA)"
            accent="#1a1a2e"
            icon="💶"
            wide
          />
        </div>

        <div style={S.panelsGrid}>
          {/* Panneau : Mes sociétés */}
          <div style={S.panel}>
            <div style={{ ...S.sectionHeader, background: "#1a1a2e", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Mes sociétés ({ownCompanies.length})</span>
              <button onClick={() => { setMessage(""); setForm(EMPTY_FORM); setShowCompanyModal(true) }} style={S.panelAdd} title="Créer une société">+</button>
            </div>
            <div style={S.panelBody}>
              {ownCompanies.length === 0
                ? <div style={S.emptyInline}>Aucune société. Clique « + Société ».</div>
                : ownCompanies.map(c => renderCompanyCard(c, false))}
            </div>
          </div>

          {/* Panneau : Sociétés membres (owner) */}
          {isIntegrator && (
            <div style={S.panel}>
              <div style={{ ...S.sectionHeader, background: "#5a2d82" }}>Sociétés membres ({memberCompanies.length})</div>
              <div style={S.panelBody}>
                {memberCompanies.length === 0
                  ? <div style={S.emptyInline}>Aucune société créée par vos members.</div>
                  : memberCompanies.map(c => renderCompanyCard(c, true))}
              </div>
            </div>
          )}

          {/* Panneau : Mon équipe (owner) */}
          {isIntegrator && (
            <div style={S.panel}>
              <div style={{ ...S.sectionHeader, background: "#0f766e", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Mon équipe ({members.length})</span>
                <button onClick={() => { setMemberMsg(""); setNewEmail(""); setNewPassword(""); setShowMemberModal(true) }} style={S.panelAdd} title="Ajouter un membre">+</button>
              </div>
              <div style={S.panelBody}>
                {members.length === 0
                  ? <div style={S.emptyInline}>Aucun membre. Clique « + Membre ».</div>
                  : members.map(m => renderMemberCard(m))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modale : créer une société ── */}
      {showCompanyModal && (
        <div style={S.modalOverlay} onClick={e => { if (e.target === e.currentTarget) setShowCompanyModal(false) }}>
          <div style={{ ...S.modalCard, maxWidth: 560 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 style={{ ...S.cardTitle, margin: 0 }}>Créer une société</h2>
              <button onClick={() => setShowCompanyModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 22, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 12px" }}>
              {FORM_FIELDS.map(f => (
                <div key={f.key} style={f.key === "company_name" ? { gridColumn: "1 / -1" } : undefined}>
                  <label style={{ ...S.label, marginBottom: 3 }}>{f.label}{f.required ? " *" : ""}</label>
                  <input
                    type={f.type}
                    placeholder={f.placeholder}
                    value={form[f.key]}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    onKeyDown={e => { if (e.key === "Enter") handleCreate() }}
                    style={{ ...S.input, marginBottom: 0, padding: "8px 11px" }}
                  />
                </div>
              ))}
            </div>
            <button
              onClick={handleCreate}
              disabled={loading}
              style={{ ...S.btnPrimary, marginTop: 16, opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}
            >
              {loading ? "Création..." : "Créer la société"}
            </button>
            {message && <p style={companyMessageStyle(message)}>{message}</p>}
          </div>
        </div>
      )}

      {/* ── Modale : ajouter un membre ── */}
      {showMemberModal && (
        <div style={S.modalOverlay} onClick={e => { if (e.target === e.currentTarget) setShowMemberModal(false) }}>
          <div style={S.modalCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 style={{ ...S.cardTitle, margin: 0 }}>Ajouter un membre</h2>
              <button onClick={() => setShowMemberModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 22, lineHeight: 1 }}>×</button>
            </div>
            {organization && (
              <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 14px", background: "#f0f9ff", padding: "8px 10px", borderRadius: 7, border: "1px solid #bae6fd" }}>
                Ce membre rejoindra <strong>{organization.name}</strong>
              </p>
            )}
            <form onSubmit={e => { e.preventDefault(); handleCreateMember() }}>
              <label style={S.label}>Email</label>
              <input type="email" placeholder="membre@email.com" value={newEmail}
                onChange={e => setNewEmail(e.target.value)} style={S.input} autoComplete="username" />
              <label style={S.label}>Mot de passe temporaire</label>
              <input type="password" placeholder="••••••••" value={newPassword}
                onChange={e => setNewPassword(e.target.value)} style={S.input} autoComplete="new-password" />
              <button type="submit" disabled={memberLoading}
                style={{ ...S.btnPrimary, opacity: memberLoading ? 0.7 : 1, cursor: memberLoading ? "not-allowed" : "pointer" }}>
                {memberLoading ? "Création..." : "Créer le compte"}
              </button>
            </form>
            {memberMsg && <p style={memberMsgStyle(memberMsg)}>{memberMsg}</p>}
          </div>
        </div>
      )}

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

function fmtEur(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function DashCard({ label, value, hint, accent, icon, wide }: {
  label: string; value: string; hint: string; accent: string; icon: string; wide?: boolean
}) {
  return (
    <div style={{
      background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0",
      borderTop: `3px solid ${accent}`, boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      padding: "12px 14px", flex: wide ? "1.3 1 160px" : "1 1 120px", minWidth: 0,
      display: "flex", flexDirection: "column", gap: 3,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>{label}</div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11, color: "#94a3b8" }}>{hint}</div>
    </div>
  )
}

function memberMsgStyle(msg: string): React.CSSProperties {
  const isSuccess = msg.startsWith("Compte")
  const isWarning = msg.includes("déjà")
  return {
    marginTop: 12, padding: "10px 12px", borderRadius: 8, fontSize: 13,
    background: isSuccess ? "#f0fdf4" : isWarning ? "#fffbeb" : "#fef2f2",
    color:      isSuccess ? "#166534" : isWarning ? "#92400e" : "#b91c1c",
    border:     `1px solid ${isSuccess ? "#86efac" : isWarning ? "#fcd34d" : "#fca5a5"}`,
  }
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
  container: { maxWidth: 1360, margin: "0 auto", padding: "18px 16px" },
  pageTitle: { margin: 0, fontSize: 20, fontWeight: 700, color: "#1a202c" },
  dashGrid: { display: "flex", gap: 12, flexWrap: "wrap" as const, margin: "14px 0 18px" },
  panelsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: 16, alignItems: "start",
  } as React.CSSProperties,
  panel: {
    display: "flex", flexDirection: "column" as const,
    border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden",
    maxHeight: "calc(100vh - 270px)",
  } as React.CSSProperties,
  panelBody: { overflowY: "auto" as const, flex: 1, minHeight: 0 },
  panelAdd: {
    background: "rgba(255,255,255,0.18)", color: "#fff", border: "none",
    borderRadius: 6, width: 24, height: 24, cursor: "pointer", fontSize: 16, fontWeight: 700, lineHeight: 1,
  } as React.CSSProperties,
  itemCard: { padding: "12px 14px", borderBottom: "1px solid #f1f5f9" } as React.CSSProperties,
  emptyInline: { padding: "18px 14px", color: "#94a3b8", fontSize: 13 } as React.CSSProperties,
  btnAction: {
    padding: "8px 14px", background: "#1a1a2e", color: "#fff", border: "none",
    borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700,
  } as React.CSSProperties,
  badgeBlue:   { fontSize: 11, fontWeight: 700, color: "#3b82f6", background: "#dbeafe", borderRadius: 20, padding: "2px 9px", cursor: "pointer" } as React.CSSProperties,
  badgeGreen:  { fontSize: 11, fontWeight: 700, color: "#10b981", background: "#d1fae5", borderRadius: 20, padding: "2px 9px", cursor: "pointer" } as React.CSSProperties,
  badgePurple: { fontSize: 11, fontWeight: 700, color: "#8b5cf6", background: "#ede9fe", borderRadius: 20, padding: "2px 9px", cursor: "pointer" } as React.CSSProperties,
  badgeDark:   { fontSize: 11, fontWeight: 700, color: "#1a1a2e", background: "#e2e8f0", borderRadius: 20, padding: "2px 9px", cursor: "pointer" } as React.CSSProperties,
  btnDevisSm:  { padding: "4px 10px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" as const } as React.CSSProperties,
  modalOverlay: {
    position: "fixed" as const, inset: 0, zIndex: 200,
    background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
    display: "flex", alignItems: "center", justifyContent: "center",
  } as React.CSSProperties,
  modalCard: {
    background: "#fff", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
    width: "100%", maxWidth: 460, padding: 28, margin: 16, maxHeight: "90vh", overflowY: "auto" as const,
  } as React.CSSProperties,
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
  btnPremium: {
    padding: "6px 14px", background: "linear-gradient(135deg, #c9a227, #f5e075, #c9a227)",
    color: "#07070f", border: "none", borderRadius: 6, cursor: "pointer",
    fontSize: 13, fontWeight: 800, textDecoration: "none", letterSpacing: 0.3,
  } as React.CSSProperties,
  memberRow: {
    background: "#fff", padding: "12px 16px", display: "flex",
    alignItems: "flex-start", gap: 12, border: "1px solid #e2e8f0", borderTop: "none",
  } as React.CSSProperties,
  memberEmail: { fontSize: 14, color: "#1a202c", fontWeight: 600, marginBottom: 2 },
  companyTag: {
    fontSize: 11, color: "#5a2d82", background: "#faf5ff",
    border: "1px solid #d4b8f0", borderRadius: 4, padding: "2px 8px",
  } as React.CSSProperties,
  btnDelete: {
    background: "none", border: "none", cursor: "pointer",
    color: "#ef4444", fontWeight: 700, fontSize: 20, lineHeight: 1,
    padding: "0 4px", flexShrink: 0,
  } as React.CSSProperties,
}
