"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

const sb = createClient()

type UserRow = {
  user_id: string
  email: string | null
  role: "owner" | "member"
  created_at: string | null
  email_confirmed_at: string | null
  last_sign_in_at: string | null
}
type OrgGroup = {
  organization_id: string | null
  organization_name: string | null
  users: UserRow[]
}

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleString("fr-FR") : "—"
}

export default function AdminAccountsPage() {
  const [user, setUser] = useState<User | null>(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null)
  const [orgs, setOrgs] = useState<OrgGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")

  useEffect(() => {
    sb.auth.getUser().then(async ({ data }) => {
      const u = data.user
      setUser(u)
      if (!u) { setIsSuperAdmin(false); setLoading(false); return }
      const { data: p } = await sb.from("profiles").select("user_type").eq("id", u.id).single()
      const admin = p?.user_type === "superadmin"
      setIsSuperAdmin(admin)
      if (!admin) { setLoading(false); return }
      const res = await fetch("/api/admin/account-log")
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setMessage(json.error ?? `Erreur HTTP ${res.status}`)
      else setOrgs(json.organizations ?? [])
      setLoading(false)
    })
  }, [])

  if (loading) return <div style={S.page}><div style={S.container}><p style={S.muted}>Chargement…</p></div></div>
  if (!user || !isSuperAdmin) return <div style={S.page}><div style={S.container}><p style={S.muted}>Accès réservé au super-administrateur.</p></div></div>

  const totalUsers = orgs.reduce((s, g) => s + g.users.length, 0)

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={S.logo}>S</div>
          <div>
            <div style={S.headerName}>Journal des utilisateurs</div>
            <div style={S.headerEmail}>Comptes (owners &amp; membres) dont l&apos;email a été validé</div>
          </div>
        </div>
        <nav style={S.nav}>
          <Link href="/admin" style={{ ...S.navBtn, textDecoration: "none", display: "inline-block" }}>← Administration</Link>
        </nav>
      </header>

      <div style={S.container}>
        <p style={S.muted}>{totalUsers} utilisateur(s) · {orgs.length} organisation(s)</p>
        {message && <p style={S.error}>{message}</p>}

        {orgs.map(g => (
          <div key={g.organization_id ?? "none"} style={S.card}>
            <div style={S.orgTitle}>{g.organization_name ?? "— Sans organisation —"}</div>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Email</th>
                  <th style={S.th}>Rôle</th>
                  <th style={S.th}>Inscrit le</th>
                  <th style={S.th}>Email confirmé</th>
                  <th style={S.th}>Dernière connexion</th>
                  <th style={S.th}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {g.users.map(o => {
                  const authed = !!o.last_sign_in_at
                  return (
                    <tr key={o.user_id}>
                      <td style={S.td}>{o.email ?? "—"}</td>
                      <td style={S.td}>
                        <span style={o.role === "owner" ? S.roleOwner : S.roleMember}>
                          {o.role === "owner" ? "Owner" : "Membre"}
                        </span>
                      </td>
                      <td style={S.td}>{fmt(o.created_at)}</td>
                      <td style={S.td}>{fmt(o.email_confirmed_at)}</td>
                      <td style={S.td}>{fmt(o.last_sign_in_at)}</td>
                      <td style={S.td}>
                        {authed
                          ? <span style={S.badgeOk}>actif</span>
                          : <span style={S.badgeNeutral}>confirmé, jamais connecté</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}

        {orgs.length === 0 && !message && <p style={S.muted}>Aucun utilisateur avec email validé pour le moment.</p>}
      </div>
    </div>
  )
}

const S = {
  page: { minHeight: "100vh", background: "#f8fafc", fontFamily: "system-ui, -apple-system, sans-serif" } as React.CSSProperties,
  header: { background: "#1a1a2e", padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" as const, gap: 12 },
  logo: { width: 36, height: 36, borderRadius: 8, background: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 18 } as React.CSSProperties,
  headerName: { fontWeight: 700, color: "#fff", fontSize: 14 },
  headerEmail: { fontSize: 12, color: "#94a3b8" },
  nav: { display: "flex", gap: 12, alignItems: "center" },
  navBtn: { padding: "8px 14px", background: "transparent", color: "#93c5fd", border: "1px solid #334155", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 } as React.CSSProperties,
  container: { maxWidth: 1100, margin: "0 auto", padding: "24px 16px" },
  muted: { color: "#64748b", fontSize: 13, margin: "0 0 14px" },
  error: { padding: "10px 12px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, fontSize: 13, color: "#b91c1c" } as React.CSSProperties,
  card: { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", padding: 18, marginBottom: 16 } as React.CSSProperties,
  orgTitle: { fontSize: 15, fontWeight: 800, color: "#1a1a2e", marginBottom: 12 },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 },
  th: { textAlign: "left" as const, padding: "8px 10px", color: "#64748b", fontSize: 11, textTransform: "uppercase" as const, letterSpacing: 0.4, borderBottom: "1px solid #e2e8f0" },
  td: { padding: "9px 10px", color: "#1a202c", borderBottom: "1px solid #f1f5f9" },
  roleOwner: { display: "inline-block", padding: "2px 8px", borderRadius: 999, background: "#ede9fe", color: "#5a2d82", border: "1px solid #ddd6fe", fontSize: 11, fontWeight: 700 } as React.CSSProperties,
  roleMember: { display: "inline-block", padding: "2px 8px", borderRadius: 999, background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0", fontSize: 11, fontWeight: 700 } as React.CSSProperties,
  badgeOk: { display: "inline-block", padding: "2px 8px", borderRadius: 999, background: "#f0fdf4", color: "#166534", border: "1px solid #86efac", fontSize: 11, fontWeight: 700 } as React.CSSProperties,
  badgeNeutral: { display: "inline-block", padding: "2px 8px", borderRadius: 999, background: "#eff6ff", color: "#1e40af", border: "1px solid #bfdbfe", fontSize: 11, fontWeight: 700 } as React.CSSProperties,
}
