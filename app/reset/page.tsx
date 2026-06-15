"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

const supabase = createClient()

// Page d'atterrissage de la réinitialisation : l'utilisateur arrive ici avec une
// session de récupération (ouverte par /auth/confirm type=recovery). Il définit son
// nouveau mot de passe via updateUser.
export default function ResetPage() {
  const [ready, setReady] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [done, setDone] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session)
      setReady(true)
    })
  }, [])

  async function handleSubmit() {
    if (password.length < 8) return setMessage("Le mot de passe doit faire au moins 8 caractères.")
    if (password !== confirm) return setMessage("Les deux mots de passe ne correspondent pas.")
    setLoading(true)
    setMessage("")
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setMessage(error.message)
      setLoading(false)
    } else {
      setDone(true)
      setTimeout(() => { window.location.href = "/dashboard" }, 1500)
    }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logoWrap}>
          <div style={S.logoBox}>S</div>
          <h1 style={S.title}>Nouveau mot de passe</h1>
          <p style={S.subtitle}>Choisissez un nouveau mot de passe pour votre compte</p>
        </div>

        {!ready ? (
          <p style={S.subtitle}>Chargement…</p>
        ) : done ? (
          <div style={S.successBanner}>Mot de passe mis à jour. Redirection…</div>
        ) : !hasSession ? (
          <>
            <p style={S.errorBanner}>
              Lien invalide ou expiré. Relancez une demande de réinitialisation depuis la page de connexion.
            </p>
            <a href="/login" style={{ ...S.btn, display: "block", textAlign: "center", textDecoration: "none", marginTop: 12 }}>
              Retour à la connexion
            </a>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={S.label}>Nouveau mot de passe</label>
              <input type="password" placeholder="••••••••" value={password}
                onChange={e => setPassword(e.target.value)} autoComplete="new-password" style={S.input} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={S.label}>Confirmer le mot de passe</label>
              <input type="password" placeholder="••••••••" value={confirm}
                onChange={e => setConfirm(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSubmit() }}
                autoComplete="new-password" style={S.input} />
            </div>
            <button onClick={handleSubmit} disabled={loading}
              style={{ ...S.btn, opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "Mise à jour…" : "Définir le mot de passe"}
            </button>
            {message && <p style={S.errorBanner}>{message}</p>}
          </>
        )}
      </div>
    </div>
  )
}

const S = {
  page: { minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "system-ui, -apple-system, sans-serif" } as React.CSSProperties,
  card: { background: "#fff", borderRadius: 16, boxShadow: "0 4px 24px rgba(0,0,0,0.08)", border: "1px solid #e2e8f0", padding: "40px 36px", width: "100%", maxWidth: 400 } as React.CSSProperties,
  logoWrap: { textAlign: "center", marginBottom: 32 } as React.CSSProperties,
  logoBox: { width: 48, height: 48, background: "#1a1a2e", borderRadius: 12, margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 22 } as React.CSSProperties,
  title: { margin: 0, fontSize: 22, fontWeight: 700, color: "#1a202c" },
  subtitle: { margin: "6px 0 0", color: "#64748b", fontSize: 14, textAlign: "center" as const },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 4 } as React.CSSProperties,
  input: { display: "block", width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, boxSizing: "border-box" as const, outline: "none" },
  btn: { width: "100%", padding: 12, background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600 } as React.CSSProperties,
  successBanner: { padding: "12px 14px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, fontSize: 13, color: "#166534", textAlign: "center" as const },
  errorBanner: { marginTop: 14, padding: "10px 12px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, fontSize: 13, color: "#b91c1c", textAlign: "center" as const },
}
