"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

const sb = createClient()

type Branding = {
  trade_name: string
  address: string
  postal_code: string
  city: string
  country: string
  phone: string
  email: string
  website: string
  siret: string
  vat_number: string
  logo_url: string
  header_image_url: string
  signature_url: string
  primary_color: string
  default_conditions: string
  default_validity_days: number
  default_tva_rate: number
  quote_prefix: string
  footer_text: string
}

const DEFAULTS: Branding = {
  trade_name: "", address: "", postal_code: "", city: "", country: "FR",
  phone: "", email: "", website: "", siret: "", vat_number: "",
  logo_url: "", header_image_url: "", signature_url: "",
  primary_color: "#1a1a2e",
  default_conditions: "", default_validity_days: 30, default_tva_rate: 20,
  quote_prefix: "DEV", footer_text: "",
}

type OrgInfo = {
  name: string
  siret: string | null
  address: string | null
  postal_code: string | null
  city: string | null
  country: string | null
  phone: string | null
  email: string | null
}

type OrgForm = {
  name: string; siret: string; address: string; postal_code: string
  city: string; country: string; phone: string; email: string
}

const EMPTY_ORG_FORM: OrgForm = {
  name: "", siret: "", address: "", postal_code: "", city: "", country: "France", phone: "", email: "",
}

type Plan = { id: string; name: string; monthly_credits: number; price: number }
type Credits = {
  organization: { id: string; name: string } | null
  plan: Plan | null
  monthly_credits: number
  consumed: number
  remaining: number
  period_start: string
  free_devis_used: number
  free_devis_limit: number
  plans: Plan[]
}

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null)
  const [branding, setBranding] = useState<Branding>(DEFAULTS)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [uploading, setUploading] = useState<string | null>(null)

  const [org, setOrg]               = useState<OrgInfo | null>(null)
  const [canEditOrg, setCanEditOrg] = useState(false)
  const [orgLoaded, setOrgLoaded]   = useState(false)
  const [orgForm, setOrgForm]       = useState<OrgForm>(EMPTY_ORG_FORM)
  const [orgSaving, setOrgSaving]   = useState(false)
  const [orgMessage, setOrgMessage] = useState("")

  const [credits, setCredits]       = useState<Credits | null>(null)
  const [creditsLoaded, setCreditsLoaded] = useState(false)
  const logoRef = useRef<HTMLInputElement>(null)
  const headerRef = useRef<HTMLInputElement>(null)
  const signatureRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => {
      if (!data.user) { window.location.href = "/login"; return }
      setUser(data.user)
      fetch("/api/settings")
        .then(r => r.json())
        .then(d => {
          if (d && !d.error) setBranding(b => ({ ...b, ...d }))
        })
      fetch("/api/organization")
        .then(r => r.json())
        .then(d => {
          if (d?.error) return
          setOrg(d.organization ?? null)
          setCanEditOrg(!!d.can_edit)
          if (d.organization) {
            setOrgForm({
              name:        d.organization.name        ?? "",
              siret:       d.organization.siret       ?? "",
              address:     d.organization.address     ?? "",
              postal_code: d.organization.postal_code ?? "",
              city:        d.organization.city        ?? "",
              country:     d.organization.country     ?? "France",
              phone:       d.organization.phone       ?? "",
              email:       d.organization.email       ?? "",
            })
          }
        })
        .finally(() => setOrgLoaded(true))
      fetch("/api/ai/credits")
        .then(r => r.json())
        .then(d => { if (d && !d.error) setCredits(d) })
        .finally(() => setCreditsLoaded(true))
    })
  }, [])

  function setOrgField(key: keyof OrgForm, value: string) {
    setOrgForm(f => ({ ...f, [key]: value }))
  }

  async function handleSaveOrg() {
    if (!orgForm.name.trim()) { setOrgMessage("La raison sociale est obligatoire"); return }
    setOrgSaving(true)
    setOrgMessage("")
    try {
      const res = await fetch("/api/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orgForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de l'enregistrement")
      setOrgMessage("Société mise à jour.")
      setOrg(o => o ? { ...o, ...orgForm } : o)
    } catch (e) {
      setOrgMessage(e instanceof Error ? e.message : "Erreur lors de l'enregistrement")
    } finally {
      setOrgSaving(false)
    }
  }

  function set(key: keyof Branding, value: string | number) {
    setBranding(b => ({ ...b, [key]: value }))
  }

  async function uploadFile(file: File, field: "logo_url" | "header_image_url" | "signature_url") {
    if (!user) return
    setUploading(field)
    const ext = file.name.split(".").pop()
    const path = `${user.id}/${field}_${Date.now()}.${ext}`
    const { error } = await sb.storage.from("logos").upload(path, file, { upsert: true })
    if (error) {
      setMessage("Erreur upload : " + error.message)
      setUploading(null)
      return
    }
    const { data: urlData } = sb.storage.from("logos").getPublicUrl(path)
    set(field, urlData.publicUrl)
    setUploading(null)
  }

  async function handleSave() {
    setSaving(true)
    setMessage("")
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(branding),
    })
    if (res.ok) {
      setMessage("Paramètres enregistrés.")
    } else {
      const d = await res.json()
      setMessage("Erreur : " + (d.error ?? "inconnue"))
    }
    setSaving(false)
  }

  if (!user) return (
    <div style={S.page}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <span style={{ color: "#64748b", fontSize: 14 }}>Chargement...</span>
      </div>
    </div>
  )

  const displayName = user.email?.split("@")[0] ?? "—"

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ ...S.logo, background: branding.primary_color || "#1a1a2e" }}>S</div>
          <div>
            <div style={S.headerName}>{displayName}</div>
            <div style={S.headerEmail}>{user.email}</div>
          </div>
        </div>
        <nav style={S.nav}>
          <a href="/dashboard" style={S.navLink}>Tableau de bord</a>
          <a href="/companies" style={S.navLink}>Mes sociétés</a>
          <button
            onClick={() => sb.auth.signOut().then(() => { window.location.href = "/login" })}
            style={S.btnLogout}
          >
            Déconnexion
          </button>
        </nav>
      </header>

      <div style={S.container}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h1 style={S.pageTitle}>Paramètres — Mon entreprise</h1>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ ...S.btnSave, opacity: saving ? 0.7 : 1 }}
          >
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>

        {message && (
          <div style={msgStyle(message)}>{message}</div>
        )}

        {/* Mon organisation (société rattachée — gérée par le superadmin) */}
        {orgLoaded && (
          <div style={S.card}>
            <h2 style={S.cardTitle}>Mon organisation</h2>

            {!org && (
              <div style={{ fontSize: 13, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "12px 14px" }}>
                Votre compte n&apos;est rattaché à aucune société pour le moment. Contactez l&apos;administrateur pour faire rattacher votre compte à une organisation.
              </div>
            )}

            {org && !canEditOrg && (
              <div>
                <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
                  Votre compte est rattaché à la société suivante. Seul le titulaire du compte (owner) peut modifier ces informations.
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1a202c" }}>{org.name}</div>
                {org.address && <div style={{ fontSize: 13, color: "#64748b" }}>{org.address}</div>}
                {(org.postal_code || org.city) && (
                  <div style={{ fontSize: 13, color: "#64748b" }}>{[org.postal_code, org.city].filter(Boolean).join(" ")}</div>
                )}
                {org.phone && <div style={{ fontSize: 13, color: "#64748b" }}>Tél : {org.phone}</div>}
                {org.email && <div style={{ fontSize: 13, color: "#64748b" }}>{org.email}</div>}
                {org.siret && <div style={{ fontSize: 12, color: "#94a3b8" }}>SIRET : {org.siret}</div>}
              </div>
            )}

            {org && canEditOrg && (
              <div>
                <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
                  Informations de la société à laquelle votre compte est rattaché (organisation).
                </div>

                <Field label="Raison sociale *" value={orgForm.name} onChange={v => setOrgField("name", v)} placeholder="SARL XYZ Sécurité" />
                <Field label="SIRET" value={orgForm.siret} onChange={v => setOrgField("siret", v)} placeholder="123 456 789 00012" />
                <Field label="Adresse" value={orgForm.address} onChange={v => setOrgField("address", v)} placeholder="12 rue de la Paix" />

                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: "0 0 120px" }}>
                    <Field label="Code postal" value={orgForm.postal_code} onChange={v => setOrgField("postal_code", v)} placeholder="75001" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Field label="Ville" value={orgForm.city} onChange={v => setOrgField("city", v)} placeholder="Paris" />
                  </div>
                </div>

                <Field label="Pays" value={orgForm.country} onChange={v => setOrgField("country", v)} placeholder="France" />
                <Field label="Téléphone" value={orgForm.phone} onChange={v => setOrgField("phone", v)} placeholder="01 23 45 67 89" type="tel" />
                <Field label="Email société" value={orgForm.email} onChange={v => setOrgField("email", v)} placeholder="contact@votresociete.fr" type="email" />

                {orgMessage && (
                  <div style={{
                    marginTop: 4, marginBottom: 12, padding: "10px 14px", borderRadius: 8, fontSize: 13,
                    background: orgMessage === "Société mise à jour." ? "#f0fdf4" : "#fef2f2",
                    color:      orgMessage === "Société mise à jour." ? "#166534" : "#b91c1c",
                    border: `1px solid ${orgMessage === "Société mise à jour." ? "#86efac" : "#fca5a5"}`,
                  }}>
                    {orgMessage}
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button onClick={handleSaveOrg} disabled={orgSaving} style={{ ...S.btnSave, opacity: orgSaving ? 0.7 : 1 }}>
                    {orgSaving ? "Enregistrement..." : "Enregistrer la société"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Crédits IA */}
        {creditsLoaded && credits?.organization && (
          <CreditsCard credits={credits} primaryColor={branding.primary_color} />
        )}

        <div style={S.cols}>

          {/* Colonne gauche */}
          <div style={{ flex: "0 0 320px" }}>

            {/* Visuels */}
            <div style={S.card}>
              <h2 style={S.cardTitle}>Identité visuelle</h2>

              <ImageUpload
                label="Logo (apparaît en haut des devis)"
                value={branding.logo_url}
                uploading={uploading === "logo_url"}
                inputRef={logoRef}
                onPick={() => logoRef.current?.click()}
                onChange={f => uploadFile(f, "logo_url")}
                onClear={() => set("logo_url", "")}
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
              />

              <ImageUpload
                label="Image d'en-tête (bandeau devis)"
                value={branding.header_image_url}
                uploading={uploading === "header_image_url"}
                inputRef={headerRef}
                onPick={() => headerRef.current?.click()}
                onChange={f => uploadFile(f, "header_image_url")}
                onClear={() => set("header_image_url", "")}
                accept="image/*"
              />

              <ImageUpload
                label="Signature"
                value={branding.signature_url}
                uploading={uploading === "signature_url"}
                inputRef={signatureRef}
                onPick={() => signatureRef.current?.click()}
                onChange={f => uploadFile(f, "signature_url")}
                onClear={() => set("signature_url", "")}
                accept="image/*"
              />

              <label style={S.label}>Couleur principale</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
                <input
                  type="color"
                  value={branding.primary_color}
                  onChange={e => set("primary_color", e.target.value)}
                  style={{ width: 44, height: 36, borderRadius: 8, border: "1px solid #e2e8f0", cursor: "pointer", padding: 2 }}
                />
                <input
                  type="text"
                  value={branding.primary_color}
                  onChange={e => set("primary_color", e.target.value)}
                  placeholder="#1a1a2e"
                  style={{ ...S.input, marginBottom: 0, width: 110, flex: "none" }}
                />
                <div style={{
                  flex: 1, height: 36, borderRadius: 8,
                  background: branding.primary_color || "#1a1a2e",
                  border: "1px solid #e2e8f0",
                }} />
              </div>
            </div>

            {/* Paramètres devis */}
            <div style={S.card}>
              <h2 style={S.cardTitle}>Paramètres devis par défaut</h2>

              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={S.label}>Préfixe devis</label>
                  <input
                    value={branding.quote_prefix}
                    onChange={e => set("quote_prefix", e.target.value)}
                    placeholder="DEV"
                    style={S.input}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={S.label}>Taux TVA (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={branding.default_tva_rate}
                    onChange={e => set("default_tva_rate", parseFloat(e.target.value) || 0)}
                    style={S.input}
                  />
                </div>
              </div>

              <label style={S.label}>Validité devis (jours)</label>
              <input
                type="number"
                min={1}
                value={branding.default_validity_days}
                onChange={e => set("default_validity_days", parseInt(e.target.value) || 30)}
                style={S.input}
              />

              <label style={S.label}>Conditions générales (CGV)</label>
              <textarea
                value={branding.default_conditions}
                onChange={e => set("default_conditions", e.target.value)}
                placeholder="Texte de vos conditions générales de vente..."
                rows={6}
                style={{ ...S.input, height: "auto", resize: "vertical", fontFamily: "inherit" }}
              />

              <label style={S.label}>Pied de page</label>
              <textarea
                value={branding.footer_text}
                onChange={e => set("footer_text", e.target.value)}
                placeholder="Ex : SARL XYZ Sécurité — Capital 10 000€ — RCS Paris..."
                rows={3}
                style={{ ...S.input, height: "auto", resize: "vertical", fontFamily: "inherit" }}
              />
            </div>
          </div>

          {/* Colonne droite */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={S.card}>
              <h2 style={S.cardTitle}>Informations société</h2>

              <Field label="Nom commercial *" value={branding.trade_name} onChange={v => set("trade_name", v)} placeholder="SARL XYZ Sécurité" />
              <Field label="Adresse" value={branding.address} onChange={v => set("address", v)} placeholder="12 rue de la Paix" />

              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: "0 0 120px" }}>
                  <Field label="Code postal" value={branding.postal_code} onChange={v => set("postal_code", v)} placeholder="75001" />
                </div>
                <div style={{ flex: 1 }}>
                  <Field label="Ville" value={branding.city} onChange={v => set("city", v)} placeholder="Paris" />
                </div>
              </div>

              <Field label="Pays" value={branding.country} onChange={v => set("country", v)} placeholder="FR" />
              <Field label="Téléphone" value={branding.phone} onChange={v => set("phone", v)} placeholder="01 23 45 67 89" type="tel" />
              <Field label="Email commercial" value={branding.email} onChange={v => set("email", v)} placeholder="contact@votresociete.fr" type="email" />
              <Field label="Site web" value={branding.website} onChange={v => set("website", v)} placeholder="https://votresociete.fr" />
              <Field label="SIRET" value={branding.siret} onChange={v => set("siret", v)} placeholder="123 456 789 00012" />
              <Field label="N° TVA intracommunautaire" value={branding.vat_number} onChange={v => set("vat_number", v)} placeholder="FR12 345678901" />
            </div>

            {/* Aperçu devis */}
            <div style={S.card}>
              <h2 style={S.cardTitle}>Aperçu en-tête devis</h2>
              <div style={{
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                overflow: "hidden",
              }}>
                {/* Barre couleur */}
                <div style={{ height: 6, background: branding.primary_color || "#1a1a2e" }} />
                {/* Header devis */}
                <div style={{ padding: "16px 20px", display: "flex", gap: 16, alignItems: "flex-start" }}>
                  {/* Logo */}
                  <div style={{ flex: "0 0 80px" }}>
                    {branding.logo_url ? (
                      <Image src={branding.logo_url} alt="Logo" width={80} height={60} style={{ width: "auto", maxWidth: 80, maxHeight: 60, objectFit: "contain" }} />
                    ) : (
                      <div style={{
                        width: 80, height: 60, borderRadius: 6, background: "#f1f5f9",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, color: "#94a3b8", textAlign: "center",
                      }}>
                        Logo
                      </div>
                    )}
                  </div>
                  {/* Infos */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 16, color: branding.primary_color || "#1a1a2e" }}>
                      {branding.trade_name || "Nom de votre société"}
                    </div>
                    {branding.address && <div style={{ fontSize: 11, color: "#64748b" }}>{branding.address}</div>}
                    {(branding.postal_code || branding.city) && (
                      <div style={{ fontSize: 11, color: "#64748b" }}>
                        {[branding.postal_code, branding.city].filter(Boolean).join(" ")}
                      </div>
                    )}
                    {branding.phone && <div style={{ fontSize: 11, color: "#64748b" }}>Tél : {branding.phone}</div>}
                    {branding.email && <div style={{ fontSize: 11, color: "#64748b" }}>{branding.email}</div>}
                    {branding.siret && <div style={{ fontSize: 10, color: "#94a3b8" }}>SIRET : {branding.siret}</div>}
                  </div>
                  {/* Devis label */}
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: branding.primary_color || "#1a1a2e" }}>
                      {branding.quote_prefix || "DEV"}-2026-0001
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>Validité : {branding.default_validity_days} jours</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>TVA : {branding.default_tva_rate}%</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bouton bas de page */}
        <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ ...S.btnSave, opacity: saving ? 0.7 : 1 }}
          >
            {saving ? "Enregistrement..." : "Enregistrer les paramètres"}
          </button>
        </div>
      </div>
    </div>
  )
}

// Grille des forfaits disponibles, réutilisée pour l'essai gratuit et un forfait actif.
function PlansGrid({ plans, currentId, accent }: { plans: Plan[]; currentId: string | null; accent: string }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 10 }}>Forfaits disponibles</div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {plans.map(p => {
          const current = p.id === currentId
          return (
            <div key={p.id} style={{
              flex: "1 1 160px", minWidth: 150, borderRadius: 10, padding: "14px 16px",
              border: `1.5px solid ${current ? accent : "#e2e8f0"}`,
              background: current ? "#f8fafc" : "#fff",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#1a202c" }}>{p.name}</span>
                {current && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: accent, borderRadius: 999, padding: "2px 8px" }}>
                    ACTUEL
                  </span>
                )}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#1a202c", marginTop: 6 }}>
                {p.price.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
                <span style={{ fontSize: 12, fontWeight: 500, color: "#94a3b8" }}> / mois</span>
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                {p.monthly_credits.toLocaleString("fr-FR")} crédits / mois
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 10 }}>
        Pour changer de forfait, contactez votre administrateur.
      </div>
    </div>
  )
}

function CreditsCard({ credits, primaryColor }: { credits: Credits; primaryColor: string }) {
  const { plan, monthly_credits, consumed, remaining, plans } = credits
  const accent = primaryColor || "#1a1a2e"

  // Essai gratuit : organisation sans forfait → jauge sur les 5 devis offerts.
  if (!plan) {
    const used = credits.free_devis_used ?? 0
    const limit = credits.free_devis_limit ?? 5
    const exhausted = used >= limit
    const freePct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100))
    return (
      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <h2 style={S.cardTitle}>Crédits IA</h2>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 999, padding: "2px 10px" }}>
            Essai gratuit
          </span>
        </div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 14 }}>
          Profitez de <strong>{limit} devis générés par IA offerts</strong>. Souscrivez un forfait pour continuer ensuite.
        </div>
        <div style={{ height: 12, borderRadius: 999, background: "#f1f5f9", overflow: "hidden", marginBottom: 10 }}>
          <div style={{ height: "100%", width: `${freePct}%`, background: exhausted ? "#dc2626" : accent, borderRadius: 999, transition: "width .3s" }} />
        </div>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: exhausted ? 14 : 0 }}>
          <Stat label="Devis IA utilisés" value={`${used} / ${limit}`} />
          <Stat label="Restants" value={`${Math.max(0, limit - used)}`} color={exhausted ? "#dc2626" : "#166534"} />
        </div>
        {exhausted && (
          <div style={{ fontSize: 13, borderRadius: 8, padding: "10px 14px", background: "#fef2f2", color: "#b91c1c", border: "1px solid #fca5a5" }}>
            Vous avez utilisé vos {limit} devis offerts. Choisissez un forfait ci-dessous pour continuer à générer par IA.
          </div>
        )}
        {plans.length > 0 && <PlansGrid plans={plans} currentId={null} accent={accent} />}
      </div>
    )
  }

  const pct = monthly_credits > 0 ? Math.min(100, Math.round((consumed / monthly_credits) * 100)) : 0
  const low = remaining <= 0
  const warn = !low && pct >= 80
  const barColor = low ? "#dc2626" : warn ? "#f59e0b" : accent

  const periodLabel = new Date(credits.period_start).toLocaleDateString("fr-FR", {
    month: "long", year: "numeric",
  })

  return (
    <div style={S.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <h2 style={S.cardTitle}>Crédits IA</h2>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>
          Forfait actuel : <strong style={{ color: "#1a202c" }}>{plan?.name ?? "—"}</strong>
          {plan ? ` · ${plan.price.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} € / mois` : ""}
        </span>
      </div>

      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 14 }}>
        Période en cours : <strong>{periodLabel}</strong>. 1 crédit = 1 000 tokens. Le compteur est remis à zéro le 1er de chaque mois.
      </div>

      {/* Jauge */}
      <div style={{ height: 12, borderRadius: 999, background: "#f1f5f9", overflow: "hidden", marginBottom: 10 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 999, transition: "width .3s" }} />
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: low || warn ? 14 : 0 }}>
        <Stat label="Consommés" value={`${consumed.toLocaleString("fr-FR")} / ${monthly_credits.toLocaleString("fr-FR")}`} />
        <Stat label="Restants" value={remaining.toLocaleString("fr-FR")} color={low ? "#dc2626" : "#166534"} />
        <Stat label="Utilisation" value={`${pct} %`} />
      </div>

      {(low || warn) && (
        <div style={{
          fontSize: 13, borderRadius: 8, padding: "10px 14px",
          background: low ? "#fef2f2" : "#fffbeb",
          color:      low ? "#b91c1c" : "#92400e",
          border: `1px solid ${low ? "#fca5a5" : "#fde68a"}`,
        }}>
          {low
            ? "Vous avez épuisé vos crédits IA pour ce mois. Passez à un forfait supérieur pour continuer à générer des devis par IA."
            : "Vous approchez de la limite mensuelle de votre forfait."}
        </div>
      )}

      {plans.length > 0 && <PlansGrid plans={plans} currentId={plan?.id ?? null} accent={accent} />}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color ?? "#1a202c" }}>{value}</div>
    </div>
  )
}

function Field({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <>
      <label style={S.label}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={S.input}
        autoComplete="off"
      />
    </>
  )
}

function ImageUpload({
  label, value, uploading, inputRef, onPick, onChange, onClear, accept,
}: {
  label: string
  value: string
  uploading: boolean
  inputRef: React.RefObject<HTMLInputElement | null>
  onPick: () => void
  onChange: (file: File) => void
  onClear: () => void
  accept: string
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={S.label}>{label}</label>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) { onChange(f); e.target.value = "" }
        }}
      />
      {value ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Image
            src={value}
            alt=""
            width={120}
            height={48}
            style={{ width: "auto", maxHeight: 48, maxWidth: 120, objectFit: "contain", borderRadius: 4, border: "1px solid #e2e8f0" }}
          />
          <div style={{ flex: 1, fontSize: 11, color: "#64748b", wordBreak: "break-all" }}>
            {value.split("/").pop()?.slice(0, 30)}...
          </div>
          <button onClick={onClear} style={S.btnClear} title="Supprimer">×</button>
        </div>
      ) : (
        <button onClick={onPick} disabled={uploading} style={S.btnUpload}>
          {uploading ? "Upload..." : "+ Choisir un fichier"}
        </button>
      )}
    </div>
  )
}

function msgStyle(msg: string): React.CSSProperties {
  const ok = msg.startsWith("Paramètres")
  return {
    marginBottom: 16, padding: "12px 16px", borderRadius: 8, fontSize: 13,
    background: ok ? "#f0fdf4" : "#fef2f2",
    color: ok ? "#166534" : "#b91c1c",
    border: `1px solid ${ok ? "#86efac" : "#fca5a5"}`,
  }
}

const S = {
  page: { minHeight: "100vh", background: "#f8fafc", fontFamily: "system-ui, -apple-system, sans-serif" } as React.CSSProperties,
  header: {
    background: "#1a1a2e", padding: "14px 24px",
    display: "flex", justifyContent: "space-between", alignItems: "center",
    flexWrap: "wrap" as const, gap: 12,
  },
  logo: {
    width: 36, height: 36, borderRadius: 8,
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#fff", fontWeight: 800, fontSize: 18, flexShrink: 0,
  } as React.CSSProperties,
  headerName: { fontWeight: 700, color: "#fff", fontSize: 14 },
  headerEmail: { fontSize: 12, color: "#94a3b8" },
  nav: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" as const },
  navLink: { color: "#93c5fd", fontSize: 13, textDecoration: "none", fontWeight: 500 },
  btnLogout: {
    padding: "6px 14px", background: "transparent", color: "#94a3b8",
    border: "1px solid #334155", borderRadius: 6, cursor: "pointer", fontSize: 13,
  } as React.CSSProperties,
  container: { maxWidth: 1100, margin: "0 auto", padding: "28px 16px" },
  pageTitle: { margin: 0, fontSize: 22, fontWeight: 700, color: "#1a202c" },
  cols: { display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" as const },
  card: {
    background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)", padding: 24, marginBottom: 20,
  } as React.CSSProperties,
  cardTitle: { margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#1a202c" },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 4 } as React.CSSProperties,
  input: {
    display: "block", width: "100%", padding: "9px 12px", borderRadius: 8,
    border: "1px solid #e2e8f0", fontSize: 14, boxSizing: "border-box" as const,
    marginBottom: 12, outline: "none", background: "#fff",
  },
  btnSave: {
    padding: "10px 28px", background: "#1a1a2e", color: "#fff",
    border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer",
  } as React.CSSProperties,
  btnUpload: {
    padding: "8px 14px", background: "#f8fafc", color: "#374151",
    border: "1px dashed #cbd5e1", borderRadius: 8, fontSize: 13, cursor: "pointer", width: "100%",
  } as React.CSSProperties,
  btnClear: {
    background: "none", border: "none", cursor: "pointer",
    color: "#ef4444", fontWeight: 700, fontSize: 18, lineHeight: 1, padding: "0 4px",
  } as React.CSSProperties,
}
