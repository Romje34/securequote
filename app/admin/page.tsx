"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

const sb = createClient()

// Grille tarifaire des forfaits IA (figée — reflète le seed public.plans).
const AI_PLANS = [
  { name: "Essentiel", credits: 100,  price: 17 },
  { name: "Pro",       credits: 400,  price: 47 },
  { name: "Business",  credits: 1500, price: 127 },
]

type Plan = { id: string; name: string; monthly_credits: number; price: number }
type Member = { id: string; email: string; role: "owner" | "member"; created_at: string; consumed_credits: number }
type OwnerNode = Member & { members: Member[] }
type Org = {
  id: string
  name: string
  city: string | null
  plan: Plan | null
  plan_id: string | null
  free_devis_used: number
  free_devis_limit: number
  owners: OwnerNode[]
  unassigned_members: Member[]
}
type OrgData = { organizations: Org[]; orphan_members: Member[]; plans: Plan[] }

export default function AdminPage() {
  const [user,         setUser]         = useState<User | null>(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null)
  const [data,         setData]         = useState<OrgData>({ organizations: [], orphan_members: [], plans: [] })
  const [loading,      setLoading]      = useState(false)
  const [message,      setMessage]      = useState("")
  const [busyId,       setBusyId]       = useState<string | null>(null)

  // Formulaire création owner
  const [email,        setEmail]        = useState("")
  const [companyName,  setCompanyName]  = useState("")
  const [siret,        setSiret]        = useState("")
  const [address,      setAddress]      = useState("")
  const [postalCode,   setPostalCode]   = useState("")
  const [city,         setCity]         = useState("")
  const [country,      setCountry]      = useState("France")
  const [phone,        setPhone]        = useState("")
  const [companyEmail, setCompanyEmail] = useState("")

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => {
      const u = data.user
      setUser(u)
      if (u) {
        sb.from("profiles").select("user_type").eq("id", u.id).single()
          .then(({ data: p }) => {
            const isAdmin = p?.user_type === "superadmin"
            setIsSuperAdmin(isAdmin)
            if (isAdmin) fetchOrgs()
          })
      } else {
        setIsSuperAdmin(false)
      }
    })
    const { data: listener } = sb.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function fetchOrgs() {
    const res = await fetch("/api/admin/organizations")
    if (res.ok) setData(await res.json())
  }

  function resetForm() {
    setEmail(""); setCompanyName(""); setSiret("")
    setAddress(""); setPostalCode(""); setCity(""); setCountry("France")
    setPhone(""); setCompanyEmail("")
  }

  async function handleCreate() {
    if (!email)       return setMessage("Email requis")
    if (!companyName) return setMessage("La raison sociale est obligatoire")
    setLoading(true)
    setMessage("")
    const res = await fetch("/api/admin/owners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        company_name:  companyName,
        siret:         siret        || null,
        address:       address      || null,
        postal_code:   postalCode   || null,
        city:          city         || null,
        country:       country      || "France",
        phone:         phone        || null,
        company_email: companyEmail || null,
      }),
    })
    const d = await res.json()
    if (!res.ok) {
      setMessage(d.error ?? `Erreur HTTP ${res.status}`)
    } else if (d.upgraded) {
      setMessage(`Compte existant promu owner — ${d.email} (${d.organization_name})`)
      resetForm(); fetchOrgs()
    } else {
      setMessage(`Invitation envoyée à ${d.email} · ${d.organization_name} — il définira son mot de passe via l'email reçu.`)
      resetForm(); fetchOrgs()
    }
    setLoading(false)
  }

  async function changeRole(m: Member) {
    const nextRole = m.role === "owner" ? "member" : "owner"
    const verb = nextRole === "owner" ? "passer owner" : "passer membre"
    if (!confirm(`Voulez-vous ${verb} le compte « ${m.email} » ?`)) return
    setBusyId(m.id)
    const res = await fetch("/api/admin/role", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: m.id, role: nextRole }),
    })
    if (res.ok) await fetchOrgs()
    else setMessage("Erreur : " + ((await res.json().catch(() => ({}))).error ?? "inconnue"))
    setBusyId(null)
  }

  async function changePlan(org: Org, planId: string) {
    setBusyId(org.id)
    const res = await fetch("/api/admin/plan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organization_id: org.id, plan_id: planId || null }),
    })
    if (res.ok) await fetchOrgs()
    else setMessage("Erreur : " + ((await res.json().catch(() => ({}))).error ?? "inconnue"))
    setBusyId(null)
  }

  async function deleteAccount(m: Member) {
    const label = m.role === "owner" ? "owner" : "membre"
    if (!confirm(`Supprimer le compte ${label} « ${m.email} » ? Cette action est irréversible.`)) return
    setBusyId(m.id)
    const res = await fetch("/api/admin/owners", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: m.id }),
    })
    if (res.ok) await fetchOrgs()
    else setMessage("Erreur : " + ((await res.json().catch(() => ({}))).error ?? "inconnue"))
    setBusyId(null)
  }

  if (isSuperAdmin === null) return (
    <div style={S.page}><div style={S.center}><span style={{ color: "#64748b", fontSize: 14 }}>Chargement...</span></div></div>
  )

  if (!user || isSuperAdmin === false) return (
    <div style={S.page}>
      <div style={S.center}>
        <div style={S.accessDenied}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
          <div style={{ fontWeight: 700, color: "#1a202c", marginBottom: 6 }}>Accès refusé</div>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>Cette page est réservée aux super-administrateurs.</div>
          <a href="/dashboard" style={S.backLink}>← Retour au tableau de bord</a>
        </div>
      </div>
    </div>
  )

  const displayName = user.email?.split("@")[0] ?? "—"
  const orgCount = data.organizations.length

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={S.logo}>S</div>
          <div>
            <div style={S.headerName}>{displayName}</div>
            <div style={S.headerEmail}>{user.email}</div>
          </div>
          <span style={S.adminBadge}>Super Admin</span>
        </div>
        <nav style={S.nav}>
          <button onClick={() => { window.location.href = "/account" }} style={S.btnLogout}>
            Mon compte
          </button>
          <button onClick={() => { window.location.href = "/admin/accounts" }} style={S.btnLogout}>
            Journal des utilisateurs
          </button>
          <button onClick={() => sb.auth.signOut().then(() => { window.location.href = "/login" })} style={S.btnLogout}>
            Déconnexion
          </button>
        </nav>
      </header>

      <div style={S.container}>
        <h1 style={S.pageTitle}>Administration — Organisations</h1>

        <div style={S.grid}>

          {/* ── Colonne gauche : création + tarifs ── */}
          <div style={{ flex: "0 0 320px" }}>
            <div style={S.card}>
              <h2 style={S.cardTitle}>Créer un owner</h2>

              <div style={S.sectionLabel}>Accès</div>
              <label style={S.label}>Email <span style={S.required}>*</span></label>
              <input type="email" placeholder="owner@exemple.com" value={email} onChange={e => setEmail(e.target.value)}
                style={S.input} autoComplete="username" />
              <p style={S.hint}>Un email d&apos;invitation lui sera envoyé : il confirmera son adresse et choisira lui-même son mot de passe.</p>

              <div style={{ ...S.sectionLabel, marginTop: 16 }}>Société <span style={S.required}>*</span></div>
              <label style={S.label}>Raison sociale <span style={S.required}>*</span></label>
              <input type="text" placeholder="SARL Example Sécurité" value={companyName} onChange={e => setCompanyName(e.target.value)}
                style={{ ...S.input, borderColor: !companyName ? "#fca5a5" : "#e2e8f0" }} />
              <label style={S.label}>SIRET</label>
              <input type="text" placeholder="123 456 789 00012" value={siret} onChange={e => setSiret(e.target.value)}
                style={S.input} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 10px" }}>
                <div>
                  <label style={S.label}>Adresse</label>
                  <input type="text" placeholder="12 rue de la Paix" value={address} onChange={e => setAddress(e.target.value)} style={S.input} />
                </div>
                <div>
                  <label style={S.label}>Code postal</label>
                  <input type="text" placeholder="75001" value={postalCode} onChange={e => setPostalCode(e.target.value)} style={S.input} />
                </div>
                <div>
                  <label style={S.label}>Ville</label>
                  <input type="text" placeholder="Paris" value={city} onChange={e => setCity(e.target.value)} style={S.input} />
                </div>
                <div>
                  <label style={S.label}>Pays</label>
                  <input type="text" placeholder="France" value={country} onChange={e => setCountry(e.target.value)} style={S.input} />
                </div>
              </div>

              <label style={S.label}>Téléphone</label>
              <input type="tel" placeholder="+33 1 23 45 67 89" value={phone} onChange={e => setPhone(e.target.value)} style={S.input} />
              <label style={S.label}>Email société</label>
              <input type="email" placeholder="contact@exemple.com" value={companyEmail} onChange={e => setCompanyEmail(e.target.value)} style={S.input} />

              <button onClick={handleCreate} disabled={loading}
                style={{ ...S.btnCreate, opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
                {loading ? "Création..." : "Créer le compte"}
              </button>
              {message && <p style={msgStyle(message)}>{message}</p>}
            </div>

            {/* ── Forfaits IA (tarifs figés, à titre informatif) ── */}
            <div style={S.card}>
              <h2 style={S.cardTitle}>Forfaits IA</h2>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>
                Tarifs appliqués · 1 crédit = 1 000 tokens · à titre informatif
              </div>
              <table style={S.planTable}>
                <thead>
                  <tr>
                    <th style={{ ...S.planTh, textAlign: "left" }}>Forfait</th>
                    <th style={S.planTh}>Crédits / mois</th>
                    <th style={{ ...S.planTh, textAlign: "right" }}>Prix / mois</th>
                  </tr>
                </thead>
                <tbody>
                  {AI_PLANS.map(p => (
                    <tr key={p.name}>
                      <td style={{ ...S.planTd, fontWeight: 700, color: "#1a202c" }}>{p.name}</td>
                      <td style={{ ...S.planTd, textAlign: "center" }}>{p.credits.toLocaleString("fr-FR")}</td>
                      <td style={{ ...S.planTd, textAlign: "right", fontWeight: 600 }}>
                        {p.price.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Colonne droite : organisations actives ── */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={S.sectionHeader}>
              Organisations actives — {orgCount} organisation{orgCount !== 1 ? "s" : ""}
            </div>

            {orgCount === 0 ? (
              <div style={S.emptyCard}>Aucune organisation pour l&apos;instant</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
                {data.organizations.map(org => (
                  <OrgCard
                    key={org.id}
                    org={org}
                    plans={data.plans}
                    busyId={busyId}
                    onChangeRole={changeRole}
                    onChangePlan={changePlan}
                    onDelete={deleteAccount}
                  />
                ))}
              </div>
            )}

            {data.orphan_members.length > 0 && (
              <div style={{ marginTop: 22 }}>
                <div style={{ ...S.sectionHeader, background: "#475569" }}>
                  Comptes sans organisation — {data.orphan_members.length}
                </div>
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderTop: "none", borderRadius: "0 0 8px 8px" }}>
                  {data.orphan_members.map(m => (
                    <MemberRow key={m.id} m={m} plan={null} busyId={busyId}
                      onChangeRole={changeRole} onDelete={deleteAccount} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function OrgCard({ org, plans, busyId, onChangeRole, onChangePlan, onDelete }: {
  org: Org
  plans: Plan[]
  busyId: string | null
  onChangeRole: (m: Member) => void
  onChangePlan: (org: Org, planId: string) => void
  onDelete: (m: Member) => void
}) {
  const trialPct = Math.min(100, Math.round((org.free_devis_used / Math.max(1, org.free_devis_limit)) * 100))
  const allMembers = [...org.owners.flatMap(o => o.members), ...org.unassigned_members]
  const accountCount = org.owners.length + allMembers.length

  return (
    <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", overflow: "hidden" }}>
      {/* En-tête organisation (= raison sociale) */}
      <div style={{ background: "#1a1a2e", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>
            🏢 {org.name}{org.city ? <span style={{ color: "#94a3b8", fontWeight: 500 }}> · {org.city}</span> : null}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>
            {org.owners.length} owner{org.owners.length !== 1 ? "s" : ""} · {accountCount} compte{accountCount !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Forfait / essai gratuit */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {org.plan ? (
            <span style={S.planBadge}>{org.plan.name} · {org.plan.monthly_credits.toLocaleString("fr-FR")} cr.</span>
          ) : (
            <span style={S.trialBadge} title={`${trialPct}% de l'essai utilisé`}>
              Essai gratuit · {org.free_devis_used}/{org.free_devis_limit} devis
            </span>
          )}
          {plans.length > 0 && (
            <select
              value={org.plan_id ?? ""}
              disabled={busyId === org.id}
              onChange={e => onChangePlan(org, e.target.value)}
              style={S.planSelect}
              title="Attribuer / changer le forfait"
            >
              <option value="">Essai gratuit (aucun)</option>
              {plans.map(p => (
                <option key={p.id} value={p.id}>{p.name} — {p.monthly_credits} cr.</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Une ligne par owner : owner à GAUCHE, ses membres rattachés à DROITE */}
      <div>
        {org.owners.length === 0 && allMembers.length === 0 ? (
          <div style={{ padding: "14px 16px", color: "#94a3b8", fontSize: 13 }}>Aucun compte rattaché.</div>
        ) : (
          <>
            <div style={S.orgRow}>
              <div style={{ ...S.colHead, ...S.ownerCell }}>Owner</div>
              <div style={S.colHead}>Membres rattachés</div>
            </div>

            {org.owners.map(owner => (
              <div key={owner.id} style={S.orgRow}>
                <div style={S.ownerCell}>
                  <MemberRow m={owner} plan={org.plan} busyId={busyId}
                    onChangeRole={onChangeRole} onDelete={onDelete} />
                </div>
                <div>
                  {owner.members.length === 0 ? (
                    <div style={S.colEmpty}>—</div>
                  ) : (
                    owner.members.map(m => (
                      <MemberRow key={m.id} m={m} plan={org.plan} busyId={busyId}
                        onChangeRole={onChangeRole} onDelete={onDelete} />
                    ))
                  )}
                </div>
              </div>
            ))}

            {org.unassigned_members.length > 0 && (
              <div style={S.orgRow}>
                <div style={{ ...S.colEmpty, ...S.ownerCell, fontStyle: "italic" }}>Sans owner</div>
                <div>
                  {org.unassigned_members.map(m => (
                    <MemberRow key={m.id} m={m} plan={org.plan} busyId={busyId}
                      onChangeRole={onChangeRole} onDelete={onDelete} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function MemberRow({ m, plan, busyId, nested, onChangeRole, onDelete }: {
  m: Member
  plan: Plan | null
  busyId: string | null
  nested?: boolean
  onChangeRole: (m: Member) => void
  onDelete: (m: Member) => void
}) {
  const isOwner = m.role === "owner"
  const busy = busyId === m.id
  return (
    <div style={{ ...S.accRow, ...(nested ? { background: "#fafbfc" } : {}) }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, color: "#1a202c", fontWeight: 600 }}>{m.email}</span>
          <span style={isOwner ? S.roleOwner : S.roleMember}>{isOwner ? "Owner" : "Membre"}</span>
        </div>
        <div style={S.accMeta}>
          <span style={S.chip}>Forfait : {plan?.name ?? "Essai gratuit"}</span>
          <span style={S.chip}>Conso : {m.consumed_credits.toLocaleString("fr-FR")} cr.</span>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>Créé le {new Date(m.created_at).toLocaleDateString("fr-FR")}</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button onClick={() => onChangeRole(m)} disabled={busy}
          style={isOwner ? S.btnToMember : S.btnToOwner} title={isOwner ? "Retirer les droits owner" : "Donner les droits owner"}>
          {busy ? "…" : isOwner ? "↓ Passer membre" : "↑ Passer owner"}
        </button>
        <button onClick={() => onDelete(m)} disabled={busy} style={S.btnDelete} title="Supprimer ce compte">×</button>
      </div>
    </div>
  )
}

function msgStyle(msg: string): React.CSSProperties {
  const isSuccess = msg.includes("créé") || msg.includes("promu")
  return {
    marginTop: 12, padding: "10px 12px", borderRadius: 8, fontSize: 13,
    background: isSuccess ? "#f0fdf4" : "#fef2f2",
    color:      isSuccess ? "#166534" : "#b91c1c",
    border:     `1px solid ${isSuccess ? "#86efac" : "#fca5a5"}`,
  }
}

const S = {
  page: { minHeight: "100vh", background: "#f8fafc", fontFamily: "system-ui, -apple-system, sans-serif" } as React.CSSProperties,
  center: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" } as React.CSSProperties,
  accessDenied: { textAlign: "center" as const, background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "40px 48px" },
  backLink: { color: "#3b82f6", fontSize: 13, fontWeight: 600, textDecoration: "none" },
  header: {
    background: "#1a1a2e", padding: "14px 24px", display: "flex",
    justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" as const, gap: 12,
  },
  logo: {
    width: 36, height: 36, borderRadius: 8, background: "#dc2626",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#fff", fontWeight: 800, fontSize: 18, flexShrink: 0,
  } as React.CSSProperties,
  headerName:  { fontWeight: 700, color: "#fff", fontSize: 14 },
  headerEmail: { fontSize: 12, color: "#94a3b8" },
  adminBadge: {
    fontSize: 11, fontWeight: 700, color: "#dc2626",
    background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)",
    borderRadius: 4, padding: "2px 8px",
  } as React.CSSProperties,
  nav: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" as const },
  btnLogout: {
    padding: "6px 14px", background: "transparent", color: "#94a3b8",
    border: "1px solid #334155", borderRadius: 6, cursor: "pointer", fontSize: 13,
  } as React.CSSProperties,
  container: { maxWidth: 1100, margin: "0 auto", padding: "28px 16px" },
  pageTitle:  { margin: "0 0 24px", fontSize: 22, fontWeight: 700, color: "#1a202c" },
  grid: { display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" as const },
  card: {
    background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)", padding: 24, marginBottom: 16,
  } as React.CSSProperties,
  cardTitle:    { margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#1a202c" },
  sectionLabel: { fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 8 },
  required:     { color: "#ef4444" },
  hint:         { fontSize: 11, color: "#64748b", margin: "4px 0 0", lineHeight: 1.4 } as React.CSSProperties,
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 4 } as React.CSSProperties,
  input: {
    display: "block", width: "100%", padding: "9px 12px", borderRadius: 8,
    border: "1px solid #e2e8f0", fontSize: 13, boxSizing: "border-box" as const,
    marginBottom: 10, outline: "none",
  },
  btnCreate: {
    display: "block", width: "100%", padding: "10px 24px",
    background: "#dc2626", color: "#fff", border: "none",
    borderRadius: 8, fontSize: 14, fontWeight: 600, marginTop: 4,
  } as React.CSSProperties,
  sectionHeader: {
    background: "#1a1a2e", color: "#fff", padding: "10px 16px",
    borderRadius: "8px 8px 0 0", fontWeight: 700, fontSize: 14,
  } as React.CSSProperties,
  emptyCard: {
    background: "#fff", padding: "16px", border: "1px solid #e2e8f0",
    borderTop: "none", borderRadius: "0 0 8px 8px", color: "#94a3b8", fontSize: 13,
  } as React.CSSProperties,
  // Lignes de compte
  accRow: {
    padding: "12px 16px", display: "flex", alignItems: "flex-start", gap: 12,
    borderTop: "1px solid #f1f5f9",
  } as React.CSSProperties,
  memberGroup: { borderLeft: "3px solid #e3d4f5", marginLeft: 16 } as React.CSSProperties,
  orgRow:    { display: "grid", gridTemplateColumns: "1fr 1fr", alignItems: "stretch", borderTop: "1px solid #e2e8f0" } as React.CSSProperties,
  ownerCell: { borderRight: "1px solid #e2e8f0", minWidth: 0 } as React.CSSProperties,
  colHead:   { padding: "8px 16px", fontSize: 11, fontWeight: 800, color: "#5a2d82", textTransform: "uppercase" as const, letterSpacing: 0.5, background: "#f8fafc" } as React.CSSProperties,
  colEmpty:  { padding: "14px 16px", color: "#94a3b8", fontSize: 13 } as React.CSSProperties,
  accMeta: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const, marginTop: 5 },
  chip: {
    fontSize: 11, color: "#374151", background: "#f1f5f9",
    border: "1px solid #e2e8f0", borderRadius: 4, padding: "2px 8px",
  } as React.CSSProperties,
  roleOwner: {
    fontSize: 10, fontWeight: 800, color: "#1d4ed8", background: "#eff6ff",
    border: "1px solid #bfdbfe", borderRadius: 4, padding: "1px 7px", textTransform: "uppercase" as const, letterSpacing: 0.4,
  } as React.CSSProperties,
  roleMember: {
    fontSize: 10, fontWeight: 800, color: "#7c4dab", background: "#f7f1fc",
    border: "1px solid #e3d4f5", borderRadius: 4, padding: "1px 7px", textTransform: "uppercase" as const, letterSpacing: 0.4,
  } as React.CSSProperties,
  planBadge: {
    fontSize: 11, fontWeight: 700, color: "#a7f3d0", background: "rgba(16,185,129,0.15)",
    border: "1px solid rgba(16,185,129,0.4)", borderRadius: 4, padding: "3px 9px", whiteSpace: "nowrap" as const,
  } as React.CSSProperties,
  trialBadge: {
    fontSize: 11, fontWeight: 700, color: "#fcd34d", background: "rgba(245,158,11,0.15)",
    border: "1px solid rgba(245,158,11,0.4)", borderRadius: 4, padding: "3px 9px", whiteSpace: "nowrap" as const,
  } as React.CSSProperties,
  planSelect: {
    fontSize: 12, padding: "5px 8px", borderRadius: 6, border: "1px solid #334155",
    background: "#0f172a", color: "#e2e8f0", outline: "none", cursor: "pointer", maxWidth: 200,
  } as React.CSSProperties,
  btnToOwner: {
    background: "#eff6ff", border: "1px solid #bfdbfe", cursor: "pointer",
    color: "#1d4ed8", fontWeight: 700, fontSize: 12, padding: "6px 11px", borderRadius: 6, whiteSpace: "nowrap" as const,
  } as React.CSSProperties,
  btnToMember: {
    background: "#fef9f3", border: "1px solid #f5d4b8", cursor: "pointer",
    color: "#b45309", fontWeight: 700, fontSize: 12, padding: "6px 11px", borderRadius: 6, whiteSpace: "nowrap" as const,
  } as React.CSSProperties,
  btnDelete: {
    background: "none", border: "none", cursor: "pointer",
    color: "#ef4444", fontWeight: 700, fontSize: 20, lineHeight: 1, padding: "0 4px",
  } as React.CSSProperties,
  planTable: { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 } as React.CSSProperties,
  planTh: {
    fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" as const,
    letterSpacing: 0.4, textAlign: "center" as const, padding: "0 0 8px", borderBottom: "1px solid #e2e8f0",
  } as React.CSSProperties,
  planTd: { padding: "10px 0", color: "#374151", borderBottom: "1px solid #f1f5f9" } as React.CSSProperties,
}
