"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

const sb = createClient()

type OrgDetails = {
  name: string
  siret: string | null
  address: string | null
  postal_code: string | null
  city: string | null
  country: string | null
  phone: string | null
  email: string | null
}

type Owner = {
  id:                string
  email:             string
  created_at:        string
  organization_id:   string | null
  organization_name: string | null
  organization_city: string | null
  organization:      OrgDetails | null
  company_count:     number
  member_count:      number
}

const EMPTY_ORG_FORM = {
  company_name: "", siret: "", address: "", postal_code: "",
  city: "", country: "France", phone: "", company_email: "",
}

export default function AdminPage() {
  const [user,          setUser]          = useState<User | null>(null)
  const [isSuperAdmin,  setIsSuperAdmin]  = useState<boolean | null>(null)
  const [owners,        setOwners]        = useState<Owner[]>([])
  const [loading,       setLoading]       = useState(false)
  const [message,       setMessage]       = useState("")

  // Formulaire
  const [email,         setEmail]         = useState("")
  const [password,      setPassword]      = useState("")
  const [companyName,   setCompanyName]   = useState("")
  const [siret,         setSiret]         = useState("")
  const [address,       setAddress]       = useState("")
  const [postalCode,    setPostalCode]    = useState("")
  const [city,          setCity]          = useState("")
  const [country,       setCountry]       = useState("France")
  const [phone,         setPhone]         = useState("")
  const [companyEmail,  setCompanyEmail]  = useState("")

  // Modale d'édition de société
  const [orgEditTarget, setOrgEditTarget] = useState<Owner | null>(null)
  const [orgForm,       setOrgForm]       = useState(EMPTY_ORG_FORM)
  const [orgSaving,     setOrgSaving]     = useState(false)
  const [orgError,      setOrgError]      = useState("")

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => {
      const u = data.user
      setUser(u)
      if (u) {
        sb.from("profiles").select("user_type").eq("id", u.id).single()
          .then(({ data: p }) => {
            const isAdmin = p?.user_type === "superadmin"
            setIsSuperAdmin(isAdmin)
            if (isAdmin) fetchOwners()
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

  async function fetchOwners() {
    const res = await fetch("/api/admin/owners")
    if (res.ok) setOwners(await res.json())
  }

  function resetForm() {
    setEmail(""); setPassword(""); setCompanyName(""); setSiret("")
    setAddress(""); setPostalCode(""); setCity(""); setCountry("France")
    setPhone(""); setCompanyEmail("")
  }

  async function handleCreate() {
    if (!email)       return setMessage("Email requis")
    if (!password)    return setMessage("Mot de passe requis")
    if (!companyName) return setMessage("La raison sociale est obligatoire")
    setLoading(true)
    setMessage("")
    const res = await fetch("/api/admin/owners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email, password,
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
    const data = await res.json()
    if (!res.ok) {
      setMessage(data.error ?? `Erreur HTTP ${res.status}`)
    } else if (data.upgraded) {
      setMessage(`Compte existant promu owner — ${data.email} (${data.organization_name})`)
      resetForm()
      fetchOwners()
    } else {
      setMessage(`Owner créé — ${data.email} · ${data.organization_name}`)
      resetForm()
      fetchOwners()
    }
    setLoading(false)
  }

  async function handleDelete(userId: string, ownerEmail: string, orgName: string | null) {
    const label = orgName ? `"${ownerEmail}" (${orgName})` : `"${ownerEmail}"`
    if (!confirm(`Supprimer le compte owner ${label} ? Cette action est irréversible.`)) return
    const res = await fetch("/api/admin/owners", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    })
    if (res.ok) fetchOwners()
    else {
      const data = await res.json()
      setMessage("Erreur : " + (data.error ?? "inconnue"))
    }
  }

  function openOrgEdit(owner: Owner) {
    const org = owner.organization
    setOrgForm({
      company_name:  org?.name        ?? "",
      siret:         org?.siret       ?? "",
      address:       org?.address     ?? "",
      postal_code:   org?.postal_code ?? "",
      city:          org?.city        ?? "",
      country:       org?.country     ?? "France",
      phone:         org?.phone       ?? "",
      company_email: org?.email       ?? "",
    })
    setOrgError("")
    setOrgEditTarget(owner)
  }

  async function handleSaveOrg() {
    if (!orgEditTarget) return
    if (!orgForm.company_name.trim()) { setOrgError("La raison sociale est obligatoire"); return }
    setOrgError("")
    setOrgSaving(true)
    try {
      const res = await fetch("/api/admin/owners", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id:       orgEditTarget.id,
          company_name:  orgForm.company_name,
          siret:         orgForm.siret         || null,
          address:       orgForm.address       || null,
          postal_code:   orgForm.postal_code   || null,
          city:          orgForm.city          || null,
          country:       orgForm.country       || "France",
          phone:         orgForm.phone         || null,
          company_email: orgForm.company_email || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de l'enregistrement")
      setOrgEditTarget(null)
      setMessage(`Société mise à jour pour ${orgEditTarget.email} — ${data.organization_name}`)
      fetchOwners()
    } catch (e) {
      setOrgError(e instanceof Error ? e.message : "Erreur lors de l'enregistrement")
    } finally {
      setOrgSaving(false)
    }
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
          <button onClick={() => sb.auth.signOut().then(() => { window.location.href = "/login" })} style={S.btnLogout}>
            Déconnexion
          </button>
        </nav>
      </header>

      <div style={S.container}>
        <h1 style={S.pageTitle}>Administration — Comptes owners</h1>

        <div style={S.grid}>

          {/* ── Formulaire création ── */}
          <div style={{ flex: "0 0 320px" }}>
            <div style={S.card}>
              <h2 style={S.cardTitle}>Créer un owner</h2>

              {/* Accès */}
              <div style={S.sectionLabel}>Accès</div>
              <label style={S.label}>Email <span style={S.required}>*</span></label>
              <input type="email" placeholder="owner@exemple.com" value={email} onChange={e => setEmail(e.target.value)}
                style={S.input} autoComplete="username" />
              <label style={S.label}>Mot de passe temporaire <span style={S.required}>*</span></label>
              <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)}
                style={S.input} autoComplete="new-password" />

              {/* Société */}
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
                  <input type="text" placeholder="12 rue de la Paix" value={address} onChange={e => setAddress(e.target.value)}
                    style={S.input} />
                </div>
                <div>
                  <label style={S.label}>Code postal</label>
                  <input type="text" placeholder="75001" value={postalCode} onChange={e => setPostalCode(e.target.value)}
                    style={S.input} />
                </div>
                <div>
                  <label style={S.label}>Ville</label>
                  <input type="text" placeholder="Paris" value={city} onChange={e => setCity(e.target.value)}
                    style={S.input} />
                </div>
                <div>
                  <label style={S.label}>Pays</label>
                  <input type="text" placeholder="France" value={country} onChange={e => setCountry(e.target.value)}
                    style={S.input} />
                </div>
              </div>

              <label style={S.label}>Téléphone</label>
              <input type="tel" placeholder="+33 1 23 45 67 89" value={phone} onChange={e => setPhone(e.target.value)}
                style={S.input} />
              <label style={S.label}>Email société</label>
              <input type="email" placeholder="contact@exemple.com" value={companyEmail} onChange={e => setCompanyEmail(e.target.value)}
                style={S.input} />

              <button onClick={handleCreate} disabled={loading}
                style={{ ...S.btnCreate, opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
                {loading ? "Création..." : "Créer le compte"}
              </button>
              {message && <p style={msgStyle(message)}>{message}</p>}
            </div>
          </div>

          {/* ── Liste des owners ── */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={S.sectionHeader}>
              Owners actifs — {owners.length} compte{owners.length !== 1 ? "s" : ""}
            </div>

            {owners.length === 0 ? (
              <div style={S.emptyCard}>Aucun owner pour l&apos;instant</div>
            ) : (
              owners.map((o, i) => (
                <div key={o.id} style={{ ...S.ownerRow, borderRadius: i === owners.length - 1 ? "0 0 8px 8px" : 0 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={S.ownerEmail}>{o.email}</div>
                    {o.organization_name && (
                      <div style={S.orgName}>
                        🏢 {o.organization_name}{o.organization_city ? ` · ${o.organization_city}` : ""}
                      </div>
                    )}
                    {!o.organization_name && (
                      <div style={{ fontSize: 11, color: "#f59e0b", fontStyle: "italic", marginBottom: 4 }}>
                        Société non renseignée
                      </div>
                    )}
                    <div style={S.ownerMeta}>
                      <span style={S.statChip}>{o.company_count} client{o.company_count !== 1 ? "s" : ""}</span>
                      <span style={S.statChip}>{o.member_count} membre{o.member_count !== 1 ? "s" : ""}</span>
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>
                        Créé le {new Date(o.created_at).toLocaleDateString("fr-FR")}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => openOrgEdit(o)} style={S.btnOrgEdit}>
                    {o.organization_name ? "✎ Modifier société" : "🏢 Renseigner société"}
                  </button>
                  <button onClick={() => handleDelete(o.id, o.email, o.organization_name)}
                    style={S.btnDelete} title="Supprimer ce owner">×</button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modale édition / attachement de société */}
      {orgEditTarget && (
        <div
          onClick={() => !orgSaving && setOrgEditTarget(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: "26px 28px", width: 460, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#1a202c", marginBottom: 4 }}>
              {orgEditTarget.organization_name ? "✎ Modifier la société" : "🏢 Renseigner la société"}
            </div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 18 }}>
              Compte : <strong>{orgEditTarget.email}</strong>
            </div>

            <label style={S.label}>Raison sociale <span style={S.required}>*</span></label>
            <input type="text" placeholder="SARL Example Sécurité" value={orgForm.company_name}
              onChange={e => setOrgForm(f => ({ ...f, company_name: e.target.value }))}
              style={{ ...S.input, borderColor: !orgForm.company_name ? "#fca5a5" : "#e2e8f0" }} />

            <label style={S.label}>SIRET</label>
            <input type="text" placeholder="123 456 789 00012" value={orgForm.siret}
              onChange={e => setOrgForm(f => ({ ...f, siret: e.target.value }))} style={S.input} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 10px" }}>
              <div>
                <label style={S.label}>Adresse</label>
                <input type="text" placeholder="12 rue de la Paix" value={orgForm.address}
                  onChange={e => setOrgForm(f => ({ ...f, address: e.target.value }))} style={S.input} />
              </div>
              <div>
                <label style={S.label}>Code postal</label>
                <input type="text" placeholder="75001" value={orgForm.postal_code}
                  onChange={e => setOrgForm(f => ({ ...f, postal_code: e.target.value }))} style={S.input} />
              </div>
              <div>
                <label style={S.label}>Ville</label>
                <input type="text" placeholder="Paris" value={orgForm.city}
                  onChange={e => setOrgForm(f => ({ ...f, city: e.target.value }))} style={S.input} />
              </div>
              <div>
                <label style={S.label}>Pays</label>
                <input type="text" placeholder="France" value={orgForm.country}
                  onChange={e => setOrgForm(f => ({ ...f, country: e.target.value }))} style={S.input} />
              </div>
            </div>

            <label style={S.label}>Téléphone</label>
            <input type="tel" placeholder="+33 1 23 45 67 89" value={orgForm.phone}
              onChange={e => setOrgForm(f => ({ ...f, phone: e.target.value }))} style={S.input} />

            <label style={S.label}>Email société</label>
            <input type="email" placeholder="contact@exemple.com" value={orgForm.company_email}
              onChange={e => setOrgForm(f => ({ ...f, company_email: e.target.value }))} style={S.input} />

            {orgError && <div style={{ fontSize: 12, color: "#dc2626", margin: "4px 0 10px" }}>{orgError}</div>}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <button onClick={() => setOrgEditTarget(null)} disabled={orgSaving}
                style={{ padding: "10px 18px", background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                Annuler
              </button>
              <button onClick={handleSaveOrg} disabled={orgSaving}
                style={{ padding: "10px 22px", background: orgSaving ? "#94a3b8" : "#dc2626", color: "#fff", border: "none", borderRadius: 8, cursor: orgSaving ? "default" : "pointer", fontSize: 13, fontWeight: 700 }}>
                {orgSaving ? "Enregistrement…" : "Enregistrer →"}
              </button>
            </div>
          </div>
        </div>
      )}
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
  navLink: { color: "#93c5fd", fontSize: 13, textDecoration: "none", fontWeight: 500 },
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
  ownerRow: {
    background: "#fff", padding: "14px 16px", display: "flex",
    alignItems: "flex-start", gap: 12, border: "1px solid #e2e8f0", borderTop: "none",
  } as React.CSSProperties,
  ownerEmail: { fontSize: 14, color: "#1a202c", fontWeight: 600, marginBottom: 3 },
  orgName:    { fontSize: 13, color: "#1d4ed8", fontWeight: 600, marginBottom: 5 },
  ownerMeta: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const },
  statChip: {
    fontSize: 11, color: "#374151", background: "#f1f5f9",
    border: "1px solid #e2e8f0", borderRadius: 4, padding: "2px 8px",
  } as React.CSSProperties,
  btnDelete: {
    background: "none", border: "none", cursor: "pointer",
    color: "#ef4444", fontWeight: 700, fontSize: 20, lineHeight: 1,
    padding: "0 4px", flexShrink: 0,
  } as React.CSSProperties,
  btnOrgEdit: {
    background: "#eff6ff", border: "1px solid #bfdbfe", cursor: "pointer",
    color: "#1d4ed8", fontWeight: 600, fontSize: 12, lineHeight: 1,
    padding: "6px 12px", borderRadius: 6, flexShrink: 0, whiteSpace: "nowrap",
  } as React.CSSProperties,
  emptyCard: {
    background: "#fff", padding: "16px", border: "1px solid #e2e8f0",
    borderTop: "none", borderRadius: "0 0 8px 8px", color: "#94a3b8", fontSize: 13,
  } as React.CSSProperties,
}
