"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

const supabase = createClient()

const EMPTY_SIGNUP = {
  email: "", password: "", company_name: "", siret: "", address: "",
  postal_code: "", city: "", country: "France", phone: "", company_email: "",
}

export default function LoginPage() {
  const [view, setView] = useState<"login" | "signup">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [signup, setSignup] = useState(EMPTY_SIGNUP)
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

  function setField(key: keyof typeof EMPTY_SIGNUP, value: string) {
    setSignup(s => ({ ...s, [key]: value }))
  }

  async function handleSignup() {
    if (!signup.email.trim())        return setMessage("Email requis")
    if (!signup.password)            return setMessage("Mot de passe requis")
    if (!signup.company_name.trim()) return setMessage("La raison sociale est obligatoire")
    setLoading(true)
    setMessage("")
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signup),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setMessage(data.error ?? `Erreur HTTP ${res.status}`)
      setLoading(false)
      return
    }
    // Compte actif immédiatement → connexion automatique.
    const { error } = await supabase.auth.signInWithPassword({ email: signup.email, password: signup.password })
    if (error) {
      setMessage("Compte créé. Connectez-vous avec vos identifiants.")
      setView("login")
      setEmail(signup.email)
      setLoading(false)
    } else {
      window.location.href = "/dashboard"
    }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logoWrap}>
          <div style={S.logoBox}>S</div>
          <h1 style={S.title}>SecureQuote</h1>
          <p style={S.subtitle}>
            {view === "login" ? "Connectez-vous à votre espace" : "Créez votre compte et votre société"}
          </p>
        </div>

        {user && (
          <div style={S.successBanner}>
            Connecté : <strong>{user.email}</strong>
          </div>
        )}

        {view === "login" ? (
          <>
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

            {message && <p style={S.errorBanner}>{message}</p>}

            <p style={S.switchLine}>
              Pas encore de compte ?{" "}
              <button type="button" onClick={() => { setMessage(""); setView("signup") }} style={S.switchLink}>
                S&apos;inscrire
              </button>
            </p>
          </>
        ) : (
          <>
            <div style={S.sectionLabel}>Identifiants</div>
            <Field label="Email" required>
              <input type="email" placeholder="vous@societe.com" value={signup.email}
                onChange={e => setField("email", e.target.value)} autoComplete="username" style={S.input} />
            </Field>
            <Field label="Mot de passe" required>
              <input type="password" placeholder="••••••••" value={signup.password}
                onChange={e => setField("password", e.target.value)} autoComplete="new-password" style={S.input} />
            </Field>

            <div style={{ ...S.sectionLabel, marginTop: 16 }}>Société</div>
            <Field label="Raison sociale" required>
              <input type="text" placeholder="SARL Example Sécurité" value={signup.company_name}
                onChange={e => setField("company_name", e.target.value)}
                style={{ ...S.input, borderColor: !signup.company_name ? "#fca5a5" : "#e2e8f0" }} />
            </Field>
            <Field label="SIRET">
              <input type="text" placeholder="123 456 789 00012" value={signup.siret}
                onChange={e => setField("siret", e.target.value)} style={S.input} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 10px" }}>
              <Field label="Adresse">
                <input type="text" placeholder="12 rue de la Paix" value={signup.address}
                  onChange={e => setField("address", e.target.value)} style={S.input} />
              </Field>
              <Field label="Code postal">
                <input type="text" placeholder="75001" value={signup.postal_code}
                  onChange={e => setField("postal_code", e.target.value)} style={S.input} />
              </Field>
              <Field label="Ville">
                <input type="text" placeholder="Paris" value={signup.city}
                  onChange={e => setField("city", e.target.value)} style={S.input} />
              </Field>
              <Field label="Pays">
                <input type="text" placeholder="France" value={signup.country}
                  onChange={e => setField("country", e.target.value)} style={S.input} />
              </Field>
            </div>
            <Field label="Téléphone">
              <input type="tel" placeholder="+33 1 23 45 67 89" value={signup.phone}
                onChange={e => setField("phone", e.target.value)} style={S.input} />
            </Field>
            <Field label="Email société">
              <input type="email" placeholder="contact@societe.com" value={signup.company_email}
                onChange={e => setField("company_email", e.target.value)} style={S.input} />
            </Field>

            <button onClick={handleSignup} disabled={loading}
              style={{ ...S.btn, marginTop: 6, opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "Création..." : "Créer mon compte"}
            </button>

            {message && <p style={S.errorBanner}>{message}</p>}

            <p style={S.switchLine}>
              Déjà un compte ?{" "}
              <button type="button" onClick={() => { setMessage(""); setView("login") }} style={S.switchLink}>
                Se connecter
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={S.label}>{label}{required && <span style={{ color: "#ef4444" }}> *</span>}</label>
      {children}
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
  sectionLabel: { fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 8 } as React.CSSProperties,
  switchLine: { marginTop: 18, textAlign: "center" as const, fontSize: 13, color: "#64748b" },
  switchLink: { background: "none", border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0, textDecoration: "underline" } as React.CSSProperties,
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
