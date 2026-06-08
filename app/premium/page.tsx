"use client"

import { useState, useEffect, useCallback } from "react"
import Image from "next/image"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

const sb = createClient()

// ─── Types ───────────────────────────────────────────────────────────────────

type PremiumProduct = {
  id: string
  reference: string | null
  designation: string
  brand: string | null
  category: string
  image_url: string | null
  description: string | null
  unit_price_regular: number
  unit_price_group: number
  target_quantity: number
  current_quantity: number
  status: "open" | "triggered" | "closed"
  deadline: string | null
  featured: boolean
  my_order: { id: string; quantity: number; unit_price: number } | null
}

function daysUntil(deadline: string | null, now: number): number | null {
  if (!deadline) return null
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 86400000))
}

// ─── Design system premium ───────────────────────────────────────────────────

const G = {
  bg:           "#07070f",
  bgDeep:       "#04040a",
  card:         "rgba(14,14,28,0.95)",
  cardHover:    "rgba(20,20,40,0.98)",
  border:       "rgba(255,255,255,0.06)",
  borderGold:   "rgba(212,175,55,0.35)",
  borderGoldHi: "rgba(212,175,55,0.7)",
  gold:         "#c9a227",
  goldLight:    "#f0d060",
  goldFade:     "rgba(201,162,39,0.08)",
  goldGrad:     "linear-gradient(135deg, #c9a227 0%, #f5e075 45%, #c9a227 100%)",
  goldText:     "#f0d060",
  purple:       "#7c3aed",
  purpleLight:  "#a78bfa",
  green:        "#10b981",
  greenLight:   "#34d399",
  red:          "#ef4444",
  text:         "#f1f5f9",
  textSub:      "#94a3b8",
  textFaint:    "#475569",
}

const CATEGORIES = [
  { key: "all",                   label: "Tous les produits" },
  { key: "Vidéosurveillance",     label: "Vidéosurveillance" },
  { key: "Contrôle d'accès",      label: "Contrôle d'accès" },
  { key: "Alarme & Intrusion",    label: "Alarme & Intrusion" },
  { key: "Réseau & Infrastructure", label: "Réseau & Infra" },
]

const BRAND_COLORS: Record<string, string> = {
  Hikvision:      "#dc2626",
  Dahua:          "#2563eb",
  Uniview:        "#7c3aed",
  "Hanwha Vision":"#ea580c",
  Axis:           "#059669",
  Bosch:          "#dc2626",
  "2N":           "#0891b2",
  HID:            "#d97706",
  Suprema:        "#be185d",
  Ajax:           "#dc2626",
  Texecom:        "#1d4ed8",
  Cisco:          "#0ea5e9",
  Ubiquiti:       "#0284c7",
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function PremiumPage() {
  const [user,       setUser]       = useState<User | null>(null)
  const [products,   setProducts]   = useState<PremiumProduct[]>([])
  const [category,   setCategory]   = useState("all")
  const [joiningId,  setJoiningId]  = useState<string | null>(null)
  const [qty,        setQty]        = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null)
  const [now]                       = useState(() => Date.now())

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  const fetchProducts = useCallback(async () => {
    const res = await fetch("/api/premium/products")
    if (res.ok) setProducts(await res.json())
  }, [])

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => {
      if (!data.user) { window.location.href = "/login"; return }
      setUser(data.user)
      fetchProducts()
    })
  }, [fetchProducts])

  async function handleJoin(productId: string, maxQty: number) {
    setSubmitting(true)
    const res = await fetch("/api/premium/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId, quantity: Math.min(qty, maxQty) }),
    })
    if (res.ok) {
      setJoiningId(null)
      setQty(1)
      await fetchProducts()
      showToast("Engagement enregistré — bienvenue dans l'achat groupé !")
    } else {
      const d = await res.json()
      showToast(d.error ?? "Erreur lors de l'enregistrement", false)
    }
    setSubmitting(false)
  }

  async function handleCancel(orderId: string) {
    const res = await fetch("/api/premium/orders", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: orderId }),
    })
    if (res.ok) {
      await fetchProducts()
      showToast("Engagement annulé.")
    } else {
      showToast("Impossible d'annuler.", false)
    }
  }

  if (!user) return (
    <div style={{ minHeight: "100vh", background: G.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Spinner />
    </div>
  )

  const filtered = category === "all" ? products : products.filter(p => p.category === category)
  const featured  = products.filter(p => p.featured && p.status === "open")
  const myOrders  = products.filter(p => p.my_order)

  const totalSavings = myOrders.reduce((acc, p) =>
    acc + (p.unit_price_regular - p.unit_price_group) * (p.my_order?.quantity ?? 0), 0)
  const totalEngaged = myOrders.reduce((acc, p) =>
    acc + p.unit_price_group * (p.my_order?.quantity ?? 0), 0)
  const activeCount    = products.filter(p => p.status === "open").length
  const triggeredCount = products.filter(p => p.status === "triggered").length

  return (
    <div style={{ minHeight: "100vh", background: G.bg, fontFamily: "system-ui, -apple-system, sans-serif", color: G.text }}>

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: "fixed", top: 24, right: 24, zIndex: 999,
          background: toast.ok ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
          border: `1px solid ${toast.ok ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"}`,
          backdropFilter: "blur(12px)",
          borderRadius: 12, padding: "14px 20px",
          color: toast.ok ? G.greenLight : "#fca5a5",
          fontSize: 13, fontWeight: 600,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          maxWidth: 360,
        }}>
          {toast.ok ? "✓ " : "✕ "}{toast.msg}
        </div>
      )}

      {/* ── Header ── */}
      <header style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(7,7,15,0.85)",
        backdropFilter: "blur(16px)",
        borderBottom: `1px solid ${G.border}`,
        padding: "0 24px",
        height: 60,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <a href="/dashboard" style={{
            color: G.textFaint, fontSize: 12, textDecoration: "none",
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 10px",
            border: `1px solid ${G.border}`,
            borderRadius: 8,
            transition: "color 0.2s",
          }}>
            ← Dashboard
          </a>
          <div style={{ width: 1, height: 20, background: G.border }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6,
              background: G.goldGrad,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 900, color: "#07070f",
            }}>P</div>
            <span style={{
              fontWeight: 800, fontSize: 15, letterSpacing: "-0.3px",
              background: G.goldGrad,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
              SecureQuote Premium
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {myOrders.length > 0 && (
            <a href="#my-orders" style={{
              fontSize: 12, color: G.goldText, textDecoration: "none",
              fontWeight: 600, padding: "6px 12px",
              background: G.goldFade,
              border: `1px solid ${G.borderGold}`,
              borderRadius: 8,
            }}>
              {myOrders.length} engagement{myOrders.length > 1 ? "s" : ""}
            </a>
          )}
          <span style={{ fontSize: 12, color: G.textFaint }}>{user.email}</span>
        </div>
      </header>

      {/* ── Hero ── */}
      <div style={{
        background: `radial-gradient(ellipse 80% 60% at 50% -10%, rgba(201,162,39,0.12) 0%, transparent 70%),
                     radial-gradient(ellipse 60% 40% at 80% 50%, rgba(124,58,237,0.08) 0%, transparent 60%),
                     ${G.bg}`,
        padding: "72px 24px 56px",
        textAlign: "center",
      }}>
        {/* Badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "rgba(201,162,39,0.08)",
          border: `1px solid ${G.borderGold}`,
          borderRadius: 20, padding: "5px 14px",
          fontSize: 10, fontWeight: 700, color: G.goldText,
          letterSpacing: 2, textTransform: "uppercase",
          marginBottom: 24,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: G.gold, display: "inline-block" }} />
          Club Achats Groupés Exclusifs
        </div>

        {/* Title */}
        <h1 style={{
          margin: "0 auto 20px",
          maxWidth: 680,
          fontSize: "clamp(30px, 5vw, 52px)",
          fontWeight: 900, lineHeight: 1.08, letterSpacing: "-1.5px",
          background: `linear-gradient(160deg, ${G.text} 0%, ${G.goldLight} 40%, ${G.text} 80%)`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}>
          Commandez ensemble.<br />Économisez vraiment.
        </h1>

        <p style={{
          color: G.textSub, fontSize: 16, margin: "0 auto 48px",
          maxWidth: 520, lineHeight: 1.6,
        }}>
          Rejoignez vos confrères intégrateurs sur des achats groupés de matériel premium.
          Plus on est nombreux, plus les prix baissent.
        </p>

        {/* Stats */}
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          {[
            { value: String(activeCount),      label: "Achats en cours",     icon: "◈" },
            { value: String(triggeredCount),   label: "Achats déclenchés",   icon: "⚡" },
            { value: String(myOrders.length),  label: "Mes engagements",     icon: "◎" },
            {
              value: myOrders.length > 0 ? `${totalSavings.toFixed(0)} €` : "—",
              label: "Économies potentielles", icon: "✦"
            },
          ].map(s => (
            <div key={s.label} style={{
              background: "rgba(255,255,255,0.02)",
              border: `1px solid ${G.border}`,
              borderRadius: 14, padding: "18px 24px",
              minWidth: 140, textAlign: "center",
              backdropFilter: "blur(8px)",
            }}>
              <div style={{ fontSize: 11, color: G.gold, marginBottom: 6 }}>{s.icon}</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: G.goldLight, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: G.textSub, marginTop: 5, letterSpacing: 0.3 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Featured banner ── */}
      {featured.length > 0 && (
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px 8px" }}>
          <div style={{
            background: "rgba(201,162,39,0.04)",
            border: `1px solid ${G.borderGold}`,
            borderRadius: 16, padding: "16px 20px",
            display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: G.gold,
              letterSpacing: 1.5, textTransform: "uppercase",
              borderRight: `1px solid ${G.borderGold}`,
              paddingRight: 12,
            }}>
              ✦ En vedette
            </div>
            {featured.map(p => {
              const pct = Math.round(((p.unit_price_regular - p.unit_price_group) / p.unit_price_regular) * 100)
              const days = daysUntil(p.deadline, now)
              return (
                <div key={p.id} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 14px",
                  background: "rgba(255,255,255,0.02)",
                  border: `1px solid ${G.border}`,
                  borderRadius: 8, cursor: "pointer",
                }}
                  onClick={() => setCategory(p.category)}
                >
                  <span style={{
                    fontSize: 11, fontWeight: 800,
                    background: G.goldGrad,
                    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                  }}>-{pct}%</span>
                  <span style={{ fontSize: 12, color: G.text }}>{p.designation.slice(0, 40)}</span>
                  {days !== null && days <= 7 && (
                    <span style={{ fontSize: 10, color: "#fbbf24" }}>⏱ {days}j</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Category filter ── */}
      <div style={{ maxWidth: 1240, margin: "24px auto 0", padding: "0 24px" }}>
        <div style={{
          display: "flex", gap: 6, flexWrap: "wrap",
        }}>
          {CATEGORIES.map(cat => {
            const active = category === cat.key
            const count = cat.key === "all"
              ? products.length
              : products.filter(p => p.category === cat.key).length
            return (
              <button key={cat.key} onClick={() => setCategory(cat.key)} style={{
                padding: "8px 18px",
                borderRadius: 8, cursor: "pointer",
                fontSize: 13, fontWeight: active ? 700 : 500,
                background: active ? G.goldGrad : "rgba(255,255,255,0.03)",
                color: active ? "#07070f" : G.textSub,
                border: active ? "none" : `1px solid ${G.border}`,
                transition: "all 0.15s",
                display: "flex", alignItems: "center", gap: 6,
              } as React.CSSProperties}>
                {cat.label}
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  background: active ? "rgba(0,0,0,0.15)" : G.goldFade,
                  color: active ? "#07070f" : G.textFaint,
                  borderRadius: 4, padding: "1px 6px",
                }}>{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Product grid ── */}
      <div style={{ maxWidth: 1240, margin: "28px auto 0", padding: "0 24px 80px" }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: G.textFaint, fontSize: 14 }}>
            Aucun produit dans cette catégorie.
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: 20,
          }}>
            {filtered.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                now={now}
                isJoining={joiningId === product.id}
                qty={qty}
                submitting={submitting}
                onStartJoin={() => { setJoiningId(product.id); setQty(1) }}
                onCancelJoin={() => { setJoiningId(null); setQty(1) }}
                onQtyChange={setQty}
                onConfirmJoin={handleJoin}
                onCancelOrder={handleCancel}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── My orders recap ── */}
      {myOrders.length > 0 && (
        <div id="my-orders" style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px 80px" }}>
          <div style={{
            background: "rgba(201,162,39,0.03)",
            border: `1px solid ${G.borderGold}`,
            borderRadius: 20, overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{
              padding: "20px 28px",
              borderBottom: `1px solid ${G.border}`,
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: G.goldFade, border: `1px solid ${G.borderGold}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, color: G.gold,
              }}>✦</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: G.goldLight }}>
                  Récapitulatif de mes engagements
                </div>
                <div style={{ fontSize: 12, color: G.textSub }}>
                  {myOrders.length} produit{myOrders.length > 1 ? "s" : ""} — sous réserve de déclenchement
                </div>
              </div>
            </div>

            {/* Rows */}
            {myOrders.map((p, i) => {
              const saving = (p.unit_price_regular - p.unit_price_group) * (p.my_order?.quantity ?? 0)
              const pct    = Math.round(((p.unit_price_regular - p.unit_price_group) / p.unit_price_regular) * 100)
              return (
                <div key={p.id} style={{
                  padding: "16px 28px",
                  borderBottom: i < myOrders.length - 1 ? `1px solid ${G.border}` : "none",
                  display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
                }}>
                  {/* Brand pill */}
                  <div style={{
                    width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                    background: `${BRAND_COLORS[p.brand ?? ""] ?? "#1e1e3a"}33`,
                    border: `1px solid ${BRAND_COLORS[p.brand ?? ""] ?? "#444"}33`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 900,
                    color: BRAND_COLORS[p.brand ?? ""] ?? G.textSub,
                  }}>
                    {p.brand?.slice(0, 2).toUpperCase() ?? "??"}
                  </div>

                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: G.text }}>{p.designation}</div>
                    <div style={{ fontSize: 11, color: G.textFaint, marginTop: 2 }}>
                      {p.brand} {p.reference ? `· ${p.reference}` : ""}
                    </div>
                  </div>

                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: G.goldText }}>
                      {p.my_order!.quantity} × {p.unit_price_group.toFixed(2)} € = {(p.my_order!.quantity * p.unit_price_group).toFixed(2)} €
                    </div>
                    <div style={{ fontSize: 11, color: G.greenLight, marginTop: 2 }}>
                      Économie : {saving.toFixed(2)} € ({pct}%)
                    </div>
                  </div>

                  <StatusPill status={p.status} />
                </div>
              )
            })}

            {/* Totals */}
            <div style={{
              padding: "20px 28px",
              borderTop: `1px solid ${G.borderGold}`,
              display: "flex", justifyContent: "flex-end", gap: 40, flexWrap: "wrap",
            }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: G.textSub, marginBottom: 4 }}>Total engagé</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: G.goldLight }}>
                  {totalEngaged.toFixed(2)} €
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: G.textSub, marginBottom: 4 }}>Économies potentielles</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: G.greenLight }}>
                  {totalSavings.toFixed(2)} €
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{
        borderTop: `1px solid ${G.border}`,
        padding: "24px",
        textAlign: "center",
        color: G.textFaint,
        fontSize: 12,
      }}>
        SecureQuote Premium · Les prix groupés s&apos;activent à l&apos;atteinte du quota · Engagements sans obligation jusqu&apos;au déclenchement
      </div>
    </div>
  )
}

// ─── ProductCard ─────────────────────────────────────────────────────────────

function ProductCard({
  product, now, isJoining, qty, submitting,
  onStartJoin, onCancelJoin, onQtyChange, onConfirmJoin, onCancelOrder,
}: {
  product:        PremiumProduct
  now:            number
  isJoining:      boolean
  qty:            number
  submitting:     boolean
  onStartJoin:    () => void
  onCancelJoin:   () => void
  onQtyChange:    (n: number) => void
  onConfirmJoin:  (id: string, max: number) => void
  onCancelOrder:  (orderId: string) => void
}) {
  const progress   = Math.min(100, Math.round((product.current_quantity / product.target_quantity) * 100))
  const remaining  = Math.max(0, product.target_quantity - product.current_quantity)
  const savingsPct = Math.round(((product.unit_price_regular - product.unit_price_group) / product.unit_price_regular) * 100)
  const isTriggered = product.status === "triggered"
  const hasOrder    = !!product.my_order
  const urgency     = remaining <= Math.ceil(product.target_quantity * 0.15) && remaining > 0
  const brandColor  = BRAND_COLORS[product.brand ?? ""] ?? "#6366f1"

  const daysLeft = daysUntil(product.deadline, now)

  return (
    <div style={{
      background: G.card,
      border: hasOrder ? `1px solid ${G.borderGoldHi}` : `1px solid ${G.border}`,
      borderRadius: 18,
      overflow: "hidden",
      boxShadow: hasOrder
        ? `0 0 0 1px rgba(201,162,39,0.15), 0 12px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)`
        : `0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.03)`,
    }}>

      {/* ── Image zone ── */}
      <div style={{
        height: 200, position: "relative",
        background: `linear-gradient(160deg, ${brandColor}2a 0%, rgba(14,14,28,0.9) 70%)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden",
      }}>
        {/* Décor */}
        <div style={{
          position: "absolute", inset: 0,
          background: `radial-gradient(circle at 20% 80%, ${brandColor}15, transparent 50%)`,
        }} />

        {product.image_url ? (
          <div style={{ position: "relative", height: 140, width: "75%" }}>
            <Image
              src={product.image_url}
              alt={product.designation}
              fill
              unoptimized
              style={{ objectFit: "contain" }}
            />
          </div>
        ) : (
          <div style={{ textAlign: "center", position: "relative" }}>
            <div style={{
              fontSize: 64, fontWeight: 900, lineHeight: 1,
              color: `${brandColor}30`, letterSpacing: -3,
            }}>
              {product.brand?.slice(0, 2).toUpperCase() ?? "??"}
            </div>
            <div style={{ fontSize: 11, color: G.textFaint, marginTop: 6 }}>
              {product.reference ?? ""}
            </div>
          </div>
        )}

        {/* Top badges */}
        <div style={{ position: "absolute", top: 12, left: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{
            fontSize: 9, fontWeight: 800,
            background: "rgba(0,0,0,0.7)", color: G.textSub,
            borderRadius: 6, padding: "3px 8px",
            backdropFilter: "blur(8px)",
            textTransform: "uppercase", letterSpacing: 0.8,
          }}>
            {product.category}
          </span>
          {isTriggered && (
            <span style={{
              fontSize: 9, fontWeight: 800,
              background: "rgba(16,185,129,0.85)", color: "#fff",
              borderRadius: 6, padding: "3px 8px",
              letterSpacing: 0.5,
            }}>
              ⚡ Achat déclenché
            </span>
          )}
          {product.featured && !isTriggered && (
            <span style={{
              fontSize: 9, fontWeight: 800,
              background: G.goldGrad, color: "#07070f",
              borderRadius: 6, padding: "3px 8px",
            }}>
              ✦ En vedette
            </span>
          )}
        </div>

        {/* Savings badge */}
        <div style={{ position: "absolute", top: 12, right: 12 }}>
          <div style={{
            background: G.goldGrad,
            borderRadius: 10, padding: "5px 12px",
            fontSize: 16, fontWeight: 900, color: "#07070f",
            lineHeight: 1,
          }}>
            -{savingsPct}%
          </div>
        </div>

        {/* Urgency / deadline ribbon */}
        {(urgency || (daysLeft !== null && daysLeft <= 7)) && (
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            background: daysLeft !== null && daysLeft <= 2
              ? "rgba(239,68,68,0.9)"
              : urgency
                ? "rgba(234,88,12,0.9)"
                : "rgba(202,138,4,0.9)",
            padding: "7px 14px",
            fontSize: 11, fontWeight: 700, color: "#fff",
            textAlign: "center",
            backdropFilter: "blur(4px)",
          }}>
            {urgency
              ? `⚠ Plus que ${remaining} place${remaining > 1 ? "s" : ""} !`
              : daysLeft === 0
                ? "⚡ Dernier jour !"
                : `⏱ ${daysLeft} jour${daysLeft! > 1 ? "s" : ""} restant${daysLeft! > 1 ? "s" : ""}`
            }
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div style={{ padding: "20px 20px 20px" }}>

        {/* Brand + designation */}
        <div style={{
          fontSize: 10, fontWeight: 800, color: brandColor,
          letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 5,
        }}>
          {product.brand ?? ""}
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: G.text, marginBottom: 3, lineHeight: 1.35 }}>
          {product.designation}
        </div>
        {product.reference && (
          <div style={{ fontSize: 11, color: G.textFaint, marginBottom: 10 }}>
            Réf : {product.reference}
          </div>
        )}
        {product.description && (
          <div style={{ fontSize: 12, color: G.textSub, lineHeight: 1.55, marginBottom: 16 }}>
            {product.description.length > 110
              ? product.description.slice(0, 110) + "…"
              : product.description}
          </div>
        )}

        {/* ── Pricing ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 0,
          background: G.goldFade,
          border: `1px solid rgba(201,162,39,0.12)`,
          borderRadius: 10, overflow: "hidden",
          marginBottom: 16,
        }}>
          <div style={{ flex: 1, padding: "10px 14px", borderRight: `1px solid rgba(255,255,255,0.05)` }}>
            <div style={{ fontSize: 9, color: G.textFaint, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>
              Prix catalogue
            </div>
            <div style={{ fontSize: 14, color: G.textFaint, textDecoration: "line-through" }}>
              {product.unit_price_regular.toFixed(2)} €
            </div>
          </div>
          <div style={{ flex: 1, padding: "10px 14px" }}>
            <div style={{ fontSize: 9, color: G.gold, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700, marginBottom: 3 }}>
              Prix Premium
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: G.goldLight, lineHeight: 1 }}>
              {product.unit_price_group.toFixed(2)} €
            </div>
          </div>
          <div style={{
            padding: "10px 14px",
            display: "flex", alignItems: "center",
            borderLeft: `1px solid rgba(255,255,255,0.05)`,
          }}>
            <div style={{
              background: "rgba(16,185,129,0.12)",
              border: "1px solid rgba(16,185,129,0.25)",
              borderRadius: 8, padding: "4px 8px",
              fontSize: 13, fontWeight: 800, color: G.greenLight,
            }}>
              -{savingsPct}%
            </div>
          </div>
        </div>

        {/* ── Progress ── */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
            <span style={{ fontSize: 12, color: G.textSub }}>
              <span style={{ fontWeight: 700, color: G.goldLight }}>{product.current_quantity}</span>
              <span style={{ color: G.textFaint }}> / {product.target_quantity} unités engagées</span>
            </span>
            <span style={{
              fontSize: 11, fontWeight: 600,
              color: isTriggered ? G.greenLight : urgency ? "#fbbf24" : G.textFaint,
            }}>
              {isTriggered ? "✓ Objectif atteint" : `${remaining} restante${remaining > 1 ? "s" : ""}`}
            </span>
          </div>
          {/* Bar */}
          <div style={{
            height: 5, borderRadius: 3,
            background: "rgba(255,255,255,0.05)",
            overflow: "hidden",
          }}>
            <div style={{
              height: "100%",
              width: `${progress}%`,
              borderRadius: 3,
              background: isTriggered
                ? "linear-gradient(90deg, #059669, #34d399)"
                : progress >= 70
                  ? "linear-gradient(90deg, #c9a227, #f0d060)"
                  : "linear-gradient(90deg, #c9a227aa, #f0d060aa)",
              transition: "width 0.6s cubic-bezier(0.34,1.56,0.64,1)",
            }} />
          </div>
          <div style={{ fontSize: 10, color: G.textFaint, marginTop: 5 }}>
            {progress}% vers le déclenchement
          </div>
        </div>

        {/* ── Action ── */}
        {hasOrder ? (
          // Already joined
          <div>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: "rgba(201,162,39,0.06)",
              border: `1px solid ${G.borderGold}`,
              borderRadius: 10, padding: "10px 14px",
              marginBottom: 8,
            }}>
              <div>
                <div style={{ fontSize: 9, color: G.gold, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 }}>
                  Mon engagement
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: G.text }}>
                  {product.my_order!.quantity} unité{product.my_order!.quantity > 1 ? "s" : ""} — {(product.my_order!.quantity * product.unit_price_group).toFixed(2)} €
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 9, color: G.textFaint, marginBottom: 2 }}>Économie</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: G.greenLight }}>
                  +{((product.unit_price_regular - product.unit_price_group) * product.my_order!.quantity).toFixed(2)} €
                </div>
              </div>
            </div>
            {!isTriggered && (
              <button
                onClick={() => onCancelOrder(product.my_order!.id)}
                style={{
                  width: "100%", padding: "8px 0",
                  background: "transparent",
                  border: "1px solid rgba(239,68,68,0.2)",
                  borderRadius: 8, color: "rgba(239,68,68,0.6)",
                  fontSize: 12, cursor: "pointer",
                }}
              >
                Annuler mon engagement
              </button>
            )}
          </div>
        ) : isJoining ? (
          // Joining form
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: G.textSub, marginBottom: 5 }}>Quantité souhaitée</div>
                <input
                  type="number" min={1} max={remaining}
                  value={qty}
                  onChange={e => onQtyChange(Math.max(1, Math.min(remaining, parseInt(e.target.value) || 1)))}
                  autoFocus
                  style={{
                    width: "100%", padding: "10px 12px",
                    background: "rgba(255,255,255,0.04)",
                    border: `1px solid ${G.border}`,
                    borderRadius: 8, color: G.text,
                    fontSize: 15, fontWeight: 700,
                    outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: G.goldText, marginBottom: 5, fontWeight: 700 }}>Montant total</div>
                <div style={{
                  padding: "10px 12px",
                  background: G.goldFade,
                  border: `1px solid ${G.borderGold}`,
                  borderRadius: 8,
                  fontSize: 18, fontWeight: 900, color: G.goldLight,
                  lineHeight: 1.4,
                }}>
                  {(qty * product.unit_price_group).toFixed(2)} €
                </div>
              </div>
            </div>
            <div style={{ fontSize: 10, color: G.greenLight, marginBottom: 10 }}>
              Économie : {((product.unit_price_regular - product.unit_price_group) * qty).toFixed(2)} € vs prix catalogue
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={onCancelJoin}
                style={{
                  flex: 1, padding: "10px",
                  background: "transparent",
                  border: `1px solid ${G.border}`,
                  borderRadius: 8, color: G.textSub,
                  fontSize: 13, cursor: "pointer",
                }}
              >
                Annuler
              </button>
              <button
                onClick={() => onConfirmJoin(product.id, remaining)}
                disabled={submitting}
                style={{
                  flex: 2, padding: "10px",
                  background: G.goldGrad,
                  border: "none", borderRadius: 8,
                  color: "#07070f", fontSize: 13, fontWeight: 800,
                  cursor: submitting ? "not-allowed" : "pointer",
                  opacity: submitting ? 0.7 : 1,
                  letterSpacing: 0.3,
                }}
              >
                {submitting ? "Enregistrement…" : "Confirmer mon engagement"}
              </button>
            </div>
          </div>
        ) : (
          // Default CTA
          <button
            onClick={onStartJoin}
            disabled={isTriggered}
            style={{
              width: "100%", padding: "13px 0",
              background: isTriggered
                ? "rgba(16,185,129,0.08)"
                : G.goldGrad,
              border: isTriggered
                ? "1px solid rgba(16,185,129,0.25)"
                : "none",
              borderRadius: 10,
              color: isTriggered ? G.greenLight : "#07070f",
              fontSize: 14, fontWeight: 800,
              cursor: isTriggered ? "default" : "pointer",
              letterSpacing: 0.3,
            }}
          >
            {isTriggered ? "⚡ Achat déclenché — en cours de traitement" : "Rejoindre l'achat groupé"}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Small components ─────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    open:      { bg: "rgba(201,162,39,0.1)",   color: G.goldText,    label: "En cours" },
    triggered: { bg: "rgba(16,185,129,0.1)",   color: G.greenLight,  label: "⚡ Déclenché" },
    closed:    { bg: "rgba(148,163,184,0.08)", color: G.textFaint,   label: "Clôturé" },
  }
  const s = map[status] ?? map.open
  return (
    <div style={{
      padding: "4px 10px", borderRadius: 6,
      background: s.bg, color: s.color,
      fontSize: 11, fontWeight: 700, flexShrink: 0,
    }}>
      {s.label}
    </div>
  )
}

function Spinner() {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: "50%",
      border: `3px solid ${G.border}`,
      borderTopColor: G.gold,
      animation: "spin 0.8s linear infinite",
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
