"use client"

import { useEffect, useState, use } from "react"

type Branding = {
  trade_name: string | null
  address: string | null
  postal_code: string | null
  city: string | null
  country: string | null
  phone: string | null
  email: string | null
  website: string | null
  siret: string | null
  vat_number: string | null
  logo_url: string | null
  primary_color: string | null
  footer_text: string | null
}

type Client = {
  id: string
  name: string
  address: string | null
  postal_code: string | null
  city: string | null
  country: string | null
  phone: string | null
  email: string | null
  siret: string | null
}

type Item = {
  id: string
  row_type: string
  designation: string | null
  reference: string | null
  brand: string | null
  unit: string | null
  quantity: number
  sell_price: number
  discount: number
  is_labor: boolean | null
  note_text: string | null
}

type Chapter = {
  id: string
  title: string | null
  items: Item[]
}

type QuoteData = {
  id: string
  quote_number: string
  status: string
  title: string | null
  reference: string | null
  site_address: string | null
  issued_at: string | null
  valid_until: string | null
  conditions: string | null
  tva_rate: number | null
  show_references: boolean
  show_brands: boolean
  show_unit_prices: boolean
  show_quantities: boolean
  signed_at: string | null
  signed_by: string | null
  total_ht: number
  client: Client | null
  branding: Branding | null
  chapters: Chapter[]
}

function fmtNum(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("fr-FR")
}

function lineTotal(it: Item) {
  if (it.row_type !== "item") return 0
  return it.quantity * it.sell_price * (1 - it.discount / 100)
}

export default function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)

  const [quote, setQuote] = useState<QuoteData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const loading = !quote && !error

  const [signerName, setSignerName] = useState("")
  const [accepted, setAccepted] = useState(false)
  const [signing, setSigning] = useState(false)
  const [signError, setSignError] = useState<string | null>(null)
  const [justSigned, setJustSigned] = useState<{ signed_by: string; signed_at: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/q/${token}`)
      .then(async r => {
        const json = await r.json()
        if (!r.ok) throw new Error(json.error ?? "Erreur de chargement")
        return json as QuoteData
      })
      .then(data => { if (!cancelled) setQuote(data) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "Erreur") })
    return () => { cancelled = true }
  }, [token])

  async function handleSign() {
    if (!signerName.trim()) {
      setSignError("Merci de saisir votre nom complet")
      return
    }
    if (!accepted) {
      setSignError("Merci de cocher la case d'acceptation pour valider la signature")
      return
    }
    setSignError(null)
    setSigning(true)
    try {
      const res = await fetch(`/api/q/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signed_by: signerName.trim() }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (json.already_signed) {
          setJustSigned({ signed_by: quote?.signed_by ?? "", signed_at: json.signed_at })
        } else {
          throw new Error(json.error ?? "Erreur lors de la signature")
        }
      } else {
        setJustSigned({ signed_by: json.signed_by, signed_at: json.signed_at })
      }
    } catch (e) {
      setSignError(e instanceof Error ? e.message : "Erreur lors de la signature")
    } finally {
      setSigning(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f1f5f9", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ color: "#64748b", fontSize: 14 }}>Chargement du devis…</div>
      </div>
    )
  }

  if (error || !quote) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f1f5f9", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ background: "#fff", border: "1px solid #fecaca", borderRadius: 12, padding: "32px 40px", textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#991b1b", marginBottom: 6 }}>Lien invalide ou expiré</div>
          <div style={{ fontSize: 13, color: "#64748b" }}>{error ?? "Ce devis est introuvable."}</div>
        </div>
      </div>
    )
  }

  const b = quote.branding
  const signedAt = justSigned?.signed_at ?? quote.signed_at
  const signedBy = justSigned?.signed_by ?? quote.signed_by
  const isSigned = !!signedAt

  const accentColor = b?.primary_color || "#1a1a2e"

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: "system-ui, -apple-system, sans-serif", padding: "32px 16px" }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>

        {/* En-tête */}
        <div style={{ background: accentColor, borderRadius: "14px 14px 0 0", padding: "28px 36px", color: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
            <div>
              {b?.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.logo_url} alt={b.trade_name ?? ""} style={{ maxHeight: 48, marginBottom: 12, borderRadius: 6 }} />
              )}
              <div style={{ fontSize: 20, fontWeight: 800 }}>{b?.trade_name ?? "Devis"}</div>
              {b?.address && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 4 }}>{b.address}, {b.postal_code} {b.city}</div>}
              {(b?.phone || b?.email) && (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 2 }}>
                  {b?.phone}{b?.phone && b?.email ? " · " : ""}{b?.email}
                </div>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", letterSpacing: 1.5, textTransform: "uppercase" }}>Devis</div>
              <div style={{ fontSize: 26, fontWeight: 800 }}>N° {quote.quote_number}</div>
              {quote.title && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 4 }}>{quote.title}</div>}
            </div>
          </div>
        </div>

        {/* Statut signé */}
        {isSigned && (
          <div style={{ background: "#f0fdf4", borderLeft: "1px solid #86efac", borderRight: "1px solid #86efac", padding: "16px 36px", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 22 }}>✅</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#166534" }}>Devis signé électroniquement</div>
              <div style={{ fontSize: 12, color: "#15803d" }}>Par {signedBy} le {signedAt ? new Date(signedAt).toLocaleString("fr-FR") : ""}</div>
            </div>
          </div>
        )}

        {/* Corps */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderTop: isSigned ? "none" : "none", padding: "32px 36px" }}>

          {/* Infos client / devis */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 28 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Destinataire</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1a202c" }}>{quote.client?.name ?? "—"}</div>
              {quote.client?.address && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{quote.client.address}, {quote.client.postal_code} {quote.client.city}</div>}
              {quote.client?.email && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{quote.client.email}</div>}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Détails</div>
              <table style={{ fontSize: 13, color: "#475569" }}>
                <tbody>
                  <tr><td style={{ paddingRight: 16, color: "#94a3b8" }}>Émis le</td><td style={{ fontWeight: 600, color: "#1a202c" }}>{fmtDate(quote.issued_at)}</td></tr>
                  <tr><td style={{ paddingRight: 16, color: "#94a3b8" }}>Valable jusqu&apos;au</td><td style={{ fontWeight: 600, color: "#1a202c" }}>{fmtDate(quote.valid_until)}</td></tr>
                  {quote.reference && <tr><td style={{ paddingRight: 16, color: "#94a3b8" }}>Référence</td><td style={{ fontWeight: 600, color: "#1a202c" }}>{quote.reference}</td></tr>}
                  {quote.site_address && <tr><td style={{ paddingRight: 16, color: "#94a3b8" }}>Adresse chantier</td><td style={{ fontWeight: 600, color: "#1a202c" }}>{quote.site_address}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Chapitres / lignes */}
          {quote.chapters.map(ch => (
            <div key={ch.id} style={{ marginBottom: 24 }}>
              {ch.title && (
                <div style={{ fontSize: 13, fontWeight: 800, color: "#1a202c", background: "#f8fafc", padding: "10px 14px", borderRadius: 8, marginBottom: 10 }}>
                  {ch.title}
                </div>
              )}
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e2e8f0", color: "#94a3b8", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Désignation</th>
                    {quote.show_references && <th style={{ textAlign: "left", padding: "6px 8px" }}>Réf.</th>}
                    {quote.show_brands && <th style={{ textAlign: "left", padding: "6px 8px" }}>Marque</th>}
                    {quote.show_quantities && <th style={{ textAlign: "right", padding: "6px 8px" }}>Qté</th>}
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Unité</th>
                    {quote.show_unit_prices && <th style={{ textAlign: "right", padding: "6px 8px" }}>P.U. HT</th>}
                    <th style={{ textAlign: "right", padding: "6px 8px" }}>Total HT</th>
                  </tr>
                </thead>
                <tbody>
                  {ch.items.map(it => {
                    if (it.row_type === "separator") {
                      return (
                        <tr key={it.id}>
                          <td colSpan={7} style={{ padding: "10px 8px 4px", fontWeight: 700, color: "#475569", fontSize: 12 }}>
                            {it.note_text}
                          </td>
                        </tr>
                      )
                    }
                    if (it.row_type === "note") {
                      return (
                        <tr key={it.id}>
                          <td colSpan={7} style={{ padding: "4px 8px", color: "#94a3b8", fontStyle: "italic", fontSize: 12 }}>
                            {it.note_text}
                          </td>
                        </tr>
                      )
                    }
                    return (
                      <tr key={it.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "8px", color: "#1a202c" }}>{it.designation}</td>
                        {quote.show_references && <td style={{ padding: "8px", color: "#64748b" }}>{it.reference}</td>}
                        {quote.show_brands && <td style={{ padding: "8px", color: "#64748b" }}>{it.brand}</td>}
                        {quote.show_quantities && <td style={{ padding: "8px", textAlign: "right", color: "#475569" }}>{it.quantity}</td>}
                        <td style={{ padding: "8px", color: "#64748b" }}>{it.unit}</td>
                        {quote.show_unit_prices && <td style={{ padding: "8px", textAlign: "right", color: "#475569" }}>{fmtNum(it.sell_price)} €</td>}
                        <td style={{ padding: "8px", textAlign: "right", fontWeight: 700, color: "#1a202c" }}>{fmtNum(lineTotal(it))} €</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}

          {/* Total */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 28px", minWidth: 240 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#64748b", marginBottom: 6 }}>
                <span>Total HT</span><span style={{ fontWeight: 700, color: "#1a202c" }}>{fmtNum(quote.total_ht)} €</span>
              </div>
              {quote.tva_rate != null && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#64748b", marginBottom: 6 }}>
                    <span>TVA ({quote.tva_rate}%)</span><span style={{ fontWeight: 700, color: "#1a202c" }}>{fmtNum(quote.total_ht * quote.tva_rate / 100)} €</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 800, color: accentColor, paddingTop: 8, borderTop: "1px solid #e2e8f0" }}>
                    <span>Total TTC</span><span>{fmtNum(quote.total_ht * (1 + quote.tva_rate / 100))} €</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {quote.conditions && (
            <div style={{ marginTop: 28, fontSize: 12, color: "#64748b", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              <div style={{ fontWeight: 700, color: "#1a202c", marginBottom: 6, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Conditions</div>
              {quote.conditions}
            </div>
          )}

          {/* Bloc signature */}
          <div style={{ marginTop: 36, paddingTop: 28, borderTop: "1px solid #e2e8f0" }}>
            {isSigned ? (
              <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 12, padding: "24px 28px", textAlign: "center" }}>
                <div style={{ fontSize: 30, marginBottom: 8 }}>✅</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#166534", marginBottom: 4 }}>Bon de commande signé électroniquement</div>
                <div style={{ fontSize: 13, color: "#15803d" }}>
                  Par <strong>{signedBy}</strong> le {signedAt ? new Date(signedAt).toLocaleString("fr-FR") : ""}
                </div>
                <div style={{ fontSize: 11, color: "#65a30d", marginTop: 10 }}>
                  Cette signature électronique a valeur de bon de commande conformément aux conditions générales du devis.
                </div>
              </div>
            ) : (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: "24px 28px" }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#1a202c", marginBottom: 4 }}>Signer ce devis électroniquement</div>
                <div style={{ fontSize: 12, color: "#92400e", marginBottom: 18 }}>
                  En signant, vous acceptez ce devis comme bon de commande ferme et définitif.
                </div>

                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 6 }}>Nom complet du signataire</label>
                <input
                  value={signerName}
                  onChange={e => setSignerName(e.target.value)}
                  placeholder="Prénom et nom"
                  style={{ width: "100%", maxWidth: 360, padding: "10px 14px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14, marginBottom: 14, boxSizing: "border-box" }}
                />

                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "#475569", marginBottom: 18, cursor: "pointer" }}>
                  <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} style={{ marginTop: 2 }} />
                  <span>Je reconnais avoir pris connaissance du contenu de ce devis et l&apos;accepte sans réserve, valant bon de commande.</span>
                </label>

                {signError && <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 12 }}>{signError}</div>}

                <button
                  onClick={handleSign}
                  disabled={signing}
                  style={{
                    background: signing ? "#94a3b8" : accentColor,
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    padding: "12px 28px",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: signing ? "default" : "pointer",
                  }}
                >
                  {signing ? "Signature en cours…" : "Signer et valider la commande →"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Pied de page */}
        <div style={{ background: "#e2e8f0", borderRadius: "0 0 14px 14px", padding: "14px 36px", textAlign: "center" }}>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            {b?.footer_text || `${b?.trade_name ?? "SecureQuote"} · ${b?.siret ? `SIRET ${b.siret}` : ""}`}
          </span>
        </div>
      </div>
    </div>
  )
}
