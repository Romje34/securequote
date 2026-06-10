"use client"

import { useEffect } from "react"
import { createClient } from "@/lib/supabase/client"

const sb = createClient()

// Le tableau de bord unifié vit désormais sur /companies (KPI + sociétés + équipe).
// Cette route ne fait plus que rediriger selon le type de compte.
export default function DashboardRedirect() {
  useEffect(() => {
    sb.auth.getUser().then(async ({ data }) => {
      const u = data.user
      if (!u) { window.location.href = "/login"; return }
      const { data: p } = await sb
        .from("profiles")
        .select("user_type")
        .eq("id", u.id)
        .single()
      window.location.href = p?.user_type === "superadmin" ? "/admin" : "/companies"
    })
  }, [])

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ color: "#64748b", fontSize: 14 }}>Redirection…</div>
    </div>
  )
}
