"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

const sb = createClient()

type Organization = {
  id:   string
  name: string
  city: string | null
}

type Member = {
  id:        string
  email:     string
  companies: { id: string; company_name: string; city: string | null }[]
}

type Company = {
  id:           string
  company_name: string
  city:         string | null
  country:      string | null
  is_own:       boolean
  member_email: string | null
}

type QuoteSummary = {
  id:         string
  status:     string
  company_id: string | null
  sent_at:    string | null
  signed_at:  string | null
}

export default function Dashboard() {
  const [user,         setUser]         = useState<User | null>(null)
  const [userType,     setUserType]     = useState<string | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [members,      setMembers]      = useState<Member[]>([])
  const [companies,    setCompanies]    = useState<Company[]>([])
  const [quotes,       setQuotes]       = useState<QuoteSummary[]>([])
  const [newEmail,     setNewEmail]     = useState("")
  const [newPassword,  setNewPassword]  = useState("")
  const [message,      setMessage]      = useState("")
  const [loading,      setLoading]      = useState(false)
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    sb.auth.getUser().then(async ({ data }) => {
      const u = data.user
      setUser(u)
      if (u) {
        const { data: p } = await sb
          .from("profiles")
          .select("user_type, organization_id")
          .eq("id", u.id)
          .single()

        setUserType(p?.user_type ?? "integrator")

        if (p?.user_type === "superadmin") {
          window.location.href = "/admin"
          return
        }

        if (p?.organization_id) {
          const { data: org } = await sb
            .from("organizations")
            .select("id, name, city")
            .eq("id", p.organization_id)
            .single()
          if (org) setOrganization(org)
        }
        setInitializing(false)
      } else {
        setInitializing(false)
      }
    })

    const { data: listener } = sb.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (user && userType !== null) fetchData()
  }, [user, userType])

  async function fetchData() {
    const [membersRes, companiesRes, quotesRes] = await Promise.all([
      fetch("/api/members"),
      fetch("/api/companies"),
      fetch("/api/quotes"),
    ])
    if (membersRes.ok)   setMembers(await membersRes.json())
    if (companiesRes.ok) setCompanies(await companiesRes.json())
    if (quotesRes.ok)    setQuotes(await quotesRes.json())
  }

  async function handleCreateMember() {
    if (!newEmail)    return setMessage("Email requis")
    if (!newPassword) return setMessage("Mot de passe requis")
    setLoading(true)
    setMessage("")
    const res = await fetch("/api/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newEmail, password: newPassword }),
    })
    const data = await res.json()
    if (!res.ok) {
      setMessage(data.error ?? `Erreur HTTP ${res.status}`)
    } else if (data.already_member) {
      setMessage(`${data.email} est déjà dans votre équipe.`)
      setNewEmail(""); setNewPassword("")
      fetchData()
    } else {
      setMessage(`Compte créé : ${data.email}`)
      setNewEmail(""); setNewPassword("")
      fetchData()
    }
    setLoading(false)
  }

  async function handleDeleteMember(userId: string) {
    const res = await fetch("/api/members", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    })
    if (res.ok) fetchData()
  }

  if (initializing || userType === null) return (
    <div style={S.page}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ color: "#64748b", fontSize: 14 }}>Chargement...</div>
      </div>
    </div>
  )

  if (!user) return (
    <div style={S.page}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <a href="/login" style={{ color: "#3b82f6", fontWeight: 600 }}>Se connecter</a>
      </div>
    </div>
  )

  const isIntegrator  = userType !== "client"
  const ownCompanies  = companies.filter(c => c.is_own)
  const displayName   = user.email?.split("@")[0] ?? "—"

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={S.logo}>S</div>
          <div>
            <div style={S.headerName}>{displayName}</div>
            <div style={S.headerEmail}>{user.email}</div>
          </div>
          {organization && (
            <div style={S.orgBadge}>
              🏢 {organization.name}{organization.city ? ` · ${organization.city}` : ""}
            </div>
          )}
        </div>
        <nav style={S.nav}>
          <Link href="/quotes" style={S.navLink}>Mes devis</Link>
          <Link href="/companies" style={S.navLink}>Mes clients</Link>
          {isIntegrator && <Link href="/settings" style={S.navLink}>Paramètres</Link>}
          {isIntegrator && (
            <Link href="/premium" style={S.btnPremium}>✦ Premium</Link>
          )}
          <button onClick={() => sb.auth.signOut().then(() => { window.location.href = "/login" })} style={S.btnLogout}>
            Déconnexion
          </button>
        </nav>
      </header>

      <div style={S.container}>
        {isIntegrator ? (
          <>
            {/* ── Bandeau société ── */}
            {organization ? (
              <div style={S.orgCard}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={S.orgIcon}>🏢</div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#1a202c" }}>{organization.name}</div>
                    {organization.city && (
                      <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>{organization.city}</div>
                    )}
                  </div>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 20 }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "#1a1a2e" }}>{members.length}</div>
                      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Membres</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "#3b82f6" }}>{ownCompanies.length}</div>
                      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Clients</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ ...S.orgCard, background: "#fffbeb", borderColor: "#fde68a" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#92400e" }}>
                  <span style={{ fontSize: 18 }}>⚠️</span>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>
                    Votre compte n&apos;est rattaché à aucune société.
                    Contactez l&apos;administrateur pour associer une organisation.
                  </span>
                </div>
              </div>
            )}

            <div style={S.grid}>
              {/* Formulaire ajout membre */}
              <div style={{ flex: "0 0 280px" }}>
                <div style={S.card}>
                  <h2 style={S.cardTitle}>Ajouter un membre</h2>
                  {organization && (
                    <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 14px", background: "#f0f9ff", padding: "8px 10px", borderRadius: 7, border: "1px solid #bae6fd" }}>
                      Ce membre rejoindra <strong>{organization.name}</strong>
                    </p>
                  )}
                  <form onSubmit={e => { e.preventDefault(); handleCreateMember() }}>
                    <label style={S.label}>Email</label>
                    <input type="email" placeholder="membre@email.com" value={newEmail}
                      onChange={e => setNewEmail(e.target.value)}
                      style={S.input} autoComplete="username" />
                    <label style={S.label}>Mot de passe temporaire</label>
                    <input type="password" placeholder="••••••••" value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      style={S.input} autoComplete="new-password" />
                    <button type="submit" disabled={loading}
                      style={{ ...S.btnPrimary, opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
                      {loading ? "Création..." : "Créer le compte"}
                    </button>
                  </form>
                  {message && <p style={memberMsgStyle(message)}>{message}</p>}
                </div>

                <div style={{ ...S.card, padding: "14px 20px" }}>
                  <Link href="/companies" style={{ color: "#3b82f6", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                    Gérer les clients →
                  </Link>
                </div>
              </div>

              {/* Liste membres */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={S.sectionHeader}>
                  Équipe — {members.length} membre{members.length !== 1 ? "s" : ""}
                </div>
                {members.length === 0 ? (
                  <div style={S.emptyCard}>Aucun membre pour l&apos;instant</div>
                ) : (
                  members.map((m, i) => (
                    <div key={m.id} style={{ ...S.memberRow, borderRadius: i === members.length - 1 ? "0 0 8px 8px" : 0 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={S.memberEmail}>{m.email}</div>
                        {organization && (
                          <div style={{ fontSize: 11, color: "#3b82f6", fontWeight: 600, marginBottom: 4 }}>
                            {organization.name}
                          </div>
                        )}
                        {m.companies.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {m.companies.map(c => (
                              <span key={c.id} style={S.companyTag}>
                                {c.company_name}{c.city ? ` · ${c.city}` : ""}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <button onClick={() => handleDeleteMember(m.id)} style={S.btnDelete} title="Retirer ce membre">×</button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        ) : (
          // Vue membre (client)
          <>
            {organization && (
              <div style={{ ...S.orgCard, marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={S.orgIcon}>🏢</div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#1a202c" }}>Votre société</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#1d4ed8" }}>{organization.name}</div>
                    {organization.city && <div style={{ fontSize: 13, color: "#64748b" }}>{organization.city}</div>}
                  </div>
                </div>
              </div>
            )}
            <div style={S.statsRow}>
              <StatCard value={ownCompanies.length} label="Mes clients" color="#3b82f6" />
            </div>
            {ownCompanies.length === 0 ? (
              <div style={S.card}>
                <p style={{ color: "#64748b", margin: 0, fontSize: 14 }}>
                  Aucun client pour l&apos;instant.{" "}
                  <Link href="/companies" style={{ color: "#3b82f6", fontWeight: 600 }}>Créer un client →</Link>
                </p>
              </div>
            ) : (
              <div style={S.companyGrid}>
                {ownCompanies.map(c => {
                  const companyQuotes = quotes.filter(q => q.company_id === c.id)
                  const sentCount     = companyQuotes.filter(q => q.sent_at).length
                  const acceptedCount = companyQuotes.filter(q => q.status === "accepted").length
                  return (
                    <Link key={c.id} href={`/quotes?company=${c.id}`} style={{ ...S.companyCard, textDecoration: "none", display: "block", cursor: "pointer" }}>
                      <div style={{ fontWeight: 700, color: "#1a202c", fontSize: 15 }}>{c.company_name}</div>
                      {c.city && <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{c.city}{c.country ? `, ${c.country}` : ""}</div>}
                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#3b82f6", background: "#dbeafe", borderRadius: 20, padding: "3px 10px" }}>
                          ✉ {sentCount} envoyé{sentCount > 1 ? "s" : ""}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#10b981", background: "#d1fae5", borderRadius: 20, padding: "3px 10px" }}>
                          ✅ {acceptedCount} accepté{acceptedCount > 1 ? "s" : ""}
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
            <Link href="/companies" style={{ display: "inline-block", marginTop: 16, color: "#3b82f6", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
              Gérer mes clients →
            </Link>
          </>
        )}
      </div>
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

function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0",
      borderTop: `3px solid ${color}`, padding: "16px 20px", minWidth: 120, flex: "1 1 120px",
    }}>
      <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 13, color: "#64748b", marginTop: 6 }}>{label}</div>
    </div>
  )
}

const S = {
  page: { minHeight: "100vh", background: "#f8fafc", fontFamily: "system-ui, -apple-system, sans-serif" } as React.CSSProperties,
  header: {
    background: "#1a1a2e", padding: "14px 24px", display: "flex",
    justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" as const, gap: 12,
  },
  logo: {
    width: 36, height: 36, borderRadius: 8, background: "#3b82f6",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#fff", fontWeight: 800, fontSize: 18, flexShrink: 0,
  } as React.CSSProperties,
  headerName:  { fontWeight: 700, color: "#fff", fontSize: 14 },
  headerEmail: { fontSize: 12, color: "#94a3b8" },
  orgBadge: {
    fontSize: 12, fontWeight: 700, color: "#93c5fd",
    background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)",
    borderRadius: 6, padding: "4px 12px", display: "flex", alignItems: "center", gap: 6,
  } as React.CSSProperties,
  nav: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" as const },
  navLink: { color: "#93c5fd", fontSize: 13, textDecoration: "none", fontWeight: 500 },
  btnPremium: {
    padding: "6px 14px", background: "linear-gradient(135deg, #c9a227, #f5e075, #c9a227)",
    color: "#07070f", border: "none", borderRadius: 6, cursor: "pointer",
    fontSize: 13, fontWeight: 800, textDecoration: "none", letterSpacing: 0.3,
  } as React.CSSProperties,
  btnLogout: {
    padding: "6px 14px", background: "transparent", color: "#94a3b8",
    border: "1px solid #334155", borderRadius: 6, cursor: "pointer", fontSize: 13,
  } as React.CSSProperties,
  container: { maxWidth: 1100, margin: "0 auto", padding: "28px 16px" },
  orgCard: {
    background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0",
    boxShadow: "0 2px 8px rgba(0,0,0,0.05)", padding: "18px 24px", marginBottom: 24,
  } as React.CSSProperties,
  orgIcon: {
    width: 44, height: 44, borderRadius: 10, background: "#eff6ff",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 22, flexShrink: 0,
  } as React.CSSProperties,
  statsRow:    { display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" as const },
  grid:        { display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" as const },
  card: {
    background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)", padding: 24, marginBottom: 16,
  } as React.CSSProperties,
  cardTitle: { margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#1a202c" },
  label:     { display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 4 } as React.CSSProperties,
  input: {
    display: "block", width: "100%", padding: "10px 12px", borderRadius: 8,
    border: "1px solid #e2e8f0", fontSize: 14, boxSizing: "border-box" as const,
    marginBottom: 12, outline: "none",
  },
  btnPrimary: {
    display: "block", width: "100%", padding: "10px 24px",
    background: "#1a1a2e", color: "#fff", border: "none",
    borderRadius: 8, fontSize: 14, fontWeight: 600,
  } as React.CSSProperties,
  sectionHeader: {
    background: "#1a1a2e", color: "#fff", padding: "10px 16px",
    borderRadius: "8px 8px 0 0", fontWeight: 700, fontSize: 14,
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
  emptyCard: {
    background: "#fff", padding: "16px", border: "1px solid #e2e8f0",
    borderTop: "none", borderRadius: "0 0 8px 8px", color: "#94a3b8", fontSize: 13,
  } as React.CSSProperties,
  companyGrid: { display: "flex", flexWrap: "wrap" as const, gap: 12 },
  companyCard: {
    background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0",
    padding: "14px 18px", flex: "1 1 200px",
  } as React.CSSProperties,
}
