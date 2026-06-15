"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"
import ContactAdmin from "@/components/ContactAdmin"

const supabase = createClient()

// Page « Mon compte » — accessible à TOUS les rôles (owner, membre, superadmin).
// Permet de changer son adresse email (avec vérification native Supabase) et son
// mot de passe (après re-saisie du mot de passe actuel).
export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  // Changement d'email
  const [newEmail, setNewEmail] = useState("")
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Changement de mot de passe
  const [currentPwd, setCurrentPwd] = useState("")
  const [newPwd, setNewPwd] = useState("")
  const [confirmPwd, setConfirmPwd] = useState("")
  const [pwdLoading, setPwdLoading] = useState(false)
  const [pwdMsg, setPwdMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setReady(true)
    })
  }, [])

  async function handleChangeEmail() {
    if (!newEmail.trim()) return setEmailMsg({ ok: false, text: "Saisissez la nouvelle adresse." })
    if (newEmail.trim().toLowerCase() === user?.email?.toLowerCase()) {
      return setEmailMsg({ ok: false, text: "C'est déjà votre adresse actuelle." })
    }
    setEmailLoading(true)
    setEmailMsg(null)
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() })
    if (error) {
      setEmailMsg({ ok: false, text: error.message })
    } else {
      setEmailMsg({
        ok: true,
        text: "Demande enregistrée. Un lien de confirmation a été envoyé à votre nouvelle adresse (et, par sécurité, à l'ancienne). Le changement sera effectif après validation.",
      })
      setNewEmail("")
    }
    setEmailLoading(false)
  }

  async function handleChangePassword() {
    if (!currentPwd)            return setPwdMsg({ ok: false, text: "Saisissez votre mot de passe actuel." })
    if (newPwd.length < 8)      return setPwdMsg({ ok: false, text: "Le nouveau mot de passe doit faire au moins 8 caractères." })
    if (newPwd !== confirmPwd)  return setPwdMsg({ ok: false, text: "Les deux mots de passe ne correspondent pas." })
    setPwdLoading(true)
    setPwdMsg(null)

    // Re-vérifie le mot de passe actuel avant de changer (anti-détournement de session).
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user?.email ?? "",
      password: currentPwd,
    })
    if (signInError) {
      setPwdMsg({ ok: false, text: "Mot de passe actuel incorrect." })
      setPwdLoading(false)
      return
    }

    const { error } = await supabase.auth.updateUser({ password: newPwd })
    if (error) {
      setPwdMsg({ ok: false, text: error.message })
    } else {
      setPwdMsg({ ok: true, text: "Mot de passe mis à jour." })
      setCurrentPwd(""); setNewPwd(""); setConfirmPwd("")
    }
    setPwdLoading(false)
  }

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={S.logo}>S</div>
          <div>
            <div style={S.headerName}>Mon compte</div>
            <div style={S.headerEmail}>{user?.email ?? ""}</div>
          </div>
        </div>
        <nav style={S.nav}>
          <button onClick={() => { window.location.href = "/dashboard" }} style={S.navBtn}>← Retour</button>
        </nav>
      </header>

      <div style={S.container}>
        {!ready ? (
          <p style={S.muted}>Chargement…</p>
        ) : !user ? (
          <p style={S.muted}>Vous devez être connecté.</p>
        ) : (
          <>
            {/* ── Adresse email ── */}
            <div style={S.card}>
              <h2 style={S.cardTitle}>Adresse email</h2>
              <p style={S.muted}>Adresse actuelle : <strong>{user.email}</strong></p>
              <label style={S.label}>Nouvelle adresse email</label>
              <input type="email" placeholder="nouvelle@email.com" value={newEmail}
                onChange={e => setNewEmail(e.target.value)} autoComplete="email" style={S.input} />
              <p style={S.hint}>
                Pour ta sécurité, le changement n&apos;est appliqué qu&apos;après confirmation via le lien envoyé par email.
              </p>
              <button onClick={handleChangeEmail} disabled={emailLoading}
                style={{ ...S.btn, opacity: emailLoading ? 0.7 : 1, cursor: emailLoading ? "not-allowed" : "pointer" }}>
                {emailLoading ? "Envoi…" : "Changer mon email"}
              </button>
              {emailMsg && <p style={emailMsg.ok ? S.ok : S.err}>{emailMsg.text}</p>}
              {emailMsg && !emailMsg.ok && <ContactAdmin message="Le changement d'email n'a pas pu aboutir (votre adresse actuelle reste inchangée)." />}
            </div>

            {/* ── Mot de passe ── */}
            <div style={S.card}>
              <h2 style={S.cardTitle}>Mot de passe</h2>
              <label style={S.label}>Mot de passe actuel</label>
              <input type="password" placeholder="••••••••" value={currentPwd}
                onChange={e => setCurrentPwd(e.target.value)} autoComplete="current-password" style={S.input} />
              <label style={S.label}>Nouveau mot de passe</label>
              <input type="password" placeholder="••••••••" value={newPwd}
                onChange={e => setNewPwd(e.target.value)} autoComplete="new-password" style={S.input} />
              <label style={S.label}>Confirmer le nouveau mot de passe</label>
              <input type="password" placeholder="••••••••" value={confirmPwd}
                onChange={e => setConfirmPwd(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleChangePassword() }}
                autoComplete="new-password" style={S.input} />
              <button onClick={handleChangePassword} disabled={pwdLoading}
                style={{ ...S.btn, opacity: pwdLoading ? 0.7 : 1, cursor: pwdLoading ? "not-allowed" : "pointer" }}>
                {pwdLoading ? "Mise à jour…" : "Changer mon mot de passe"}
              </button>
              {pwdMsg && <p style={pwdMsg.ok ? S.ok : S.err}>{pwdMsg.text}</p>}
            </div>
          </>
        )}
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
  container: { maxWidth: 520, margin: "0 auto", padding: "24px 16px" },
  muted: { color: "#64748b", fontSize: 13, margin: "0 0 12px" },
  card: { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", padding: 20, marginBottom: 16 } as React.CSSProperties,
  cardTitle: { margin: "0 0 12px", fontSize: 15, fontWeight: 700, color: "#1a202c" },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#374151", margin: "8px 0 4px" } as React.CSSProperties,
  input: { display: "block", width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, boxSizing: "border-box" as const, outline: "none" },
  hint: { fontSize: 11, color: "#64748b", margin: "6px 0 10px", lineHeight: 1.4 } as React.CSSProperties,
  btn: { marginTop: 12, width: "100%", padding: 11, background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600 } as React.CSSProperties,
  ok: { marginTop: 12, padding: "10px 12px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, fontSize: 13, color: "#166534" } as React.CSSProperties,
  err: { marginTop: 12, padding: "10px 12px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, fontSize: 13, color: "#b91c1c" } as React.CSSProperties,
}
