"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

const supabase = createClient()

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session ? session.user : null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function handleLogin() {
    setLoading(true)
    setMessage("")
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setMessage(error.message); setLoading(false) }
    else window.location.href = "/dashboard"
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logoWrap}>
          <div style={S.logoBox}>S</div>
          <h1 style={S.title}>SecureQuote</h1>
          <p style={S.subtitle}>Connectez-vous à votre espace</p>
        </div>

        {user && (
          <div style={S.successBanner}>
            Connecté : <strong>{user.email}</strong>
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <label style={S.label}>Email</label>
          <input
            type="email"
            placeholder="votre@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleLogin() }}
            autoComplete="username"
            style={S.input}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={S.label}>Mot de passe</label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleLogin() }}
            autoComplete="current-password"
            style={S.input}
          />
        </div>

        <button onClick={handleLogin} disabled={loading} style={{ ...S.btn, opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
          {loading ? "Connexion..." : "Se connecter"}
        </button>

        {message && (
          <p style={S.errorBanner}>{message}</p>
        )}
      </div>
    </div>
  )
}

const S = {
  page: {
    minHeight: "100vh",
    background: "#f8fafc",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    fontFamily: "system-ui, -apple-system, sans-serif",
  } as React.CSSProperties,
  card: {
    background: "#fff",
    borderRadius: 16,
    boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
    border: "1px solid #e2e8f0",
    padding: "40px 36px",
    width: "100%",
    maxWidth: 400,
  } as React.CSSProperties,
  logoWrap: { textAlign: "center", marginBottom: 32 } as React.CSSProperties,
  logoBox: {
    width: 48,
    height: 48,
    background: "#1a1a2e",
    borderRadius: 12,
    margin: "0 auto 12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontWeight: 800,
    fontSize: 22,
  } as React.CSSProperties,
  title: { margin: 0, fontSize: 22, fontWeight: 700, color: "#1a202c" },
  subtitle: { margin: "6px 0 0", color: "#64748b", fontSize: 14 },
  successBanner: {
    marginBottom: 20,
    padding: "10px 14px",
    background: "#f0fdf4",
    border: "1px solid #86efac",
    borderRadius: 8,
    fontSize: 13,
    color: "#166534",
  } as React.CSSProperties,
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 4 } as React.CSSProperties,
  input: {
    display: "block",
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    fontSize: 14,
    boxSizing: "border-box" as const,
    outline: "none",
  },
  btn: {
    display: "block",
    width: "100%",
    padding: 12,
    background: "#1a1a2e",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
  } as React.CSSProperties,
  errorBanner: {
    marginTop: 14,
    padding: "10px 12px",
    background: "#fef2f2",
    border: "1px solid #fca5a5",
    borderRadius: 8,
    fontSize: 13,
    color: "#b91c1c",
    textAlign: "center" as const,
  },
}
