"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"
import Turnstile from "@/components/Turnstile"
import ContactAdmin from "@/components/ContactAdmin"

const supabase = createClient()

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

const EMPTY_SIGNUP = {
  email: "", password: "", company_name: "", siret: "", address: "",
  postal_code: "", city: "", country: "France", phone: "", company_email: "",
}

type View = "login" | "signup" | "forgot"

export default function LoginPage() {
  const [view, setView] = useState<View>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [signup, setSignup] = useState(EMPTY_SIGNUP)
  const [forgotEmail, setForgotEmail] = useState("")
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [notice, setNotice] = useState("")          // bandeau d'information (succès)
  const [needsAdmin, setNeedsAdmin] = useState(false) // erreur serveur → contacter l'admin
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      // Bannières issues des redirections email (/auth/confirm) — dans ce callback
      // async pour éviter un setState synchrone dans le corps de l'effet.
      const params = new URLSearchParams(window.location.search)
      if (params.get("confirmed")) setNotice("Votre email est confirmé. Vous pouvez vous connecter.")
      if (params.get("error") === "lien_invalide") setMessage("Lien invalide. Relancez l'opération.")
      if (params.get("error") === "lien_expire") setMessage("Lien expiré. Relancez l'opération.")
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session ? session.user : null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  // Turnstile requis seulement si une site key est configurée.
  const turnstileOk = !SITE_KEY || !!turnstileToken

  async function handleLogin() {
    setLoading(true)
    setMessage("")
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      const msg = error.message.toLowerCase()
      if (msg.includes("not confirmed") || msg.includes("confirm")) {
        setMessage("Votre email n'est pas encore confirmé. Cliquez sur le lien reçu par email pour activer votre compte.")
      } else {
        setMessage(error.message)
      }
      setLoading(false)
    } else {
      window.location.href = "/dashboard"
    }
  }

  function setField(key: keyof typeof EMPTY_SIGNUP, value: string) {
    setSignup(s => ({ ...s, [key]: value }))
  }

  async function handleSignup() {
    if (!signup.email.trim())        return setMessage("Email requis")
    if (!signup.password)            return setMessage("Mot de passe requis")
    if (!signup.company_name.trim()) return setMessage("La raison sociale est obligatoire")
    if (!turnstileOk)                return setMessage("Veuillez valider le test anti-robot.")
    setLoading(true)
    setMessage("")
    setNeedsAdmin(false)
    let res: Response
    try {
      res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...signup, turnstile_token: turnstileToken }),
      })
    } catch {
      setMessage("Erreur réseau pendant la création du compte.")
      setNeedsAdmin(true)
      setLoading(false)
      return
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setMessage(data.error ?? `Erreur HTTP ${res.status}`)
      // Échec serveur (création/email) → mode verbeux : contacter l'admin.
      if (res.status >= 500) setNeedsAdmin(true)
      setLoading(false)
      return
    }
    // Compte créé NON confirmé : pas de connexion automatique. On invite à vérifier l'email.
    setSignup(EMPTY_SIGNUP)
    setTurnstileToken(null)
    setView("login")
    setEmail(data.email ?? signup.email)
    setNotice("Compte créé. Un email de confirmation vous a été envoyé : cliquez sur le lien pour activer votre compte avant de vous connecter.")
    setLoading(false)
  }

  async function handleForgot() {
    if (!forgotEmail.trim()) return setMessage("Email requis")
    if (!turnstileOk)        return setMessage("Veuillez valider le test anti-robot.")
    setLoading(true)
    setMessage("")
    await fetch("/api/auth/reset-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: forgotEmail, turnstile_token: turnstileToken }),
    }).catch(() => {})
    // Réponse volontairement neutre (anti-énumération).
    setTurnstileToken(null)
    setView("login")
    setNotice("Si un compte existe pour cette adresse, un email de réinitialisation vient d'être envoyé.")
    setLoading(false)
  }

  function goTo(v: View) {
    setMessage("")
    setNotice("")
    setNeedsAdmin(false)
    setTurnstileToken(null)
    setView(v)
  }

  const subtitle =
    view === "login"  ? "Connectez-vous à votre espace" :
    view === "signup" ? "Créez votre compte et votre société" :
                        "Réinitialisez votre mot de passe"

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logoWrap}>
          <div style={S.logoBox}>S</div>
          <h1 style={S.title}>SecureQuote</h1>
          <p style={S.subtitle}>{subtitle}</p>
        </div>

        {user && (
          <div style={S.successBanner}>
            Connecté : <strong>{user.email}</strong>
          </div>
        )}

        {notice && <p style={S.successBanner}>{notice}</p>}

        {view === "login" && (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={S.label}>Email</label>
              <input type="email" placeholder="votre@email.com" value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleLogin() }}
                autoComplete="username" style={S.input} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={S.label}>Mot de passe</label>
              <input type="password" placeholder="••••••••" value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleLogin() }}
                autoComplete="current-password" style={S.input} />
            </div>
            <div style={{ textAlign: "right", marginBottom: 18 }}>
              <button type="button" onClick={() => goTo("forgot")} style={S.linkSm}>Mot de passe oublié ?</button>
            </div>

            <button onClick={handleLogin} disabled={loading}
              style={{ ...S.btn, opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "Connexion..." : "Se connecter"}
            </button>

            {message && <p style={S.errorBanner}>{message}</p>}

            <p style={S.switchLine}>
              Pas encore de compte ?{" "}
              <button type="button" onClick={() => goTo("signup")} style={S.switchLink}>S&apos;inscrire</button>
            </p>
          </>
        )}

        {view === "signup" && (
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

            <div style={{ marginTop: 14 }}>
              <Turnstile onToken={setTurnstileToken} />
            </div>

            <button onClick={handleSignup} disabled={loading || !turnstileOk}
              style={{ ...S.btn, marginTop: 6, opacity: (loading || !turnstileOk) ? 0.7 : 1, cursor: (loading || !turnstileOk) ? "not-allowed" : "pointer" }}>
              {loading ? "Création..." : "Créer mon compte"}
            </button>

            {message && <p style={S.errorBanner}>{message}</p>}
            {needsAdmin && <ContactAdmin message="Votre compte n'a pas pu être créé (aucune donnée enregistrée)." />}

            <p style={S.switchLine}>
              Déjà un compte ?{" "}
              <button type="button" onClick={() => goTo("login")} style={S.switchLink}>Se connecter</button>
            </p>
          </>
        )}

        {view === "forgot" && (
          <>
            <Field label="Email" required>
              <input type="email" placeholder="votre@email.com" value={forgotEmail}
                onChange={e => setForgotEmail(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && turnstileOk) handleForgot() }}
                autoComplete="username" style={S.input} />
            </Field>

            <div style={{ marginTop: 8 }}>
              <Turnstile onToken={setTurnstileToken} />
            </div>

            <button onClick={handleForgot} disabled={loading || !turnstileOk}
              style={{ ...S.btn, marginTop: 6, opacity: (loading || !turnstileOk) ? 0.7 : 1, cursor: (loading || !turnstileOk) ? "not-allowed" : "pointer" }}>
              {loading ? "Envoi..." : "Recevoir le lien de réinitialisation"}
            </button>

            {message && <p style={S.errorBanner}>{message}</p>}

            <p style={S.switchLine}>
              <button type="button" onClick={() => goTo("login")} style={S.switchLink}>← Retour à la connexion</button>
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
  linkSm: { background: "none", border: "none", color: "#3b82f6", fontWeight: 600, fontSize: 12, cursor: "pointer", padding: 0, textDecoration: "underline" } as React.CSSProperties,
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
