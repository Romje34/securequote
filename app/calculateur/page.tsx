"use client"

import { useMemo, useState } from "react"
import Link from "next/link"

// ── Calculateur d'espace disque — vidéosurveillance ──────────────────────────
// On renseigne EN PREMIER le type d'équipement (NVR ou serveur Nx), car il
// change la logique : un NVR raisonne en baies de disques, un serveur Nx en
// multi-flux (dual-stream), RAID et copie de sauvegarde.

type DeviceType = "nvr" | "nx"
type Mode = "continu" | "mouvement"

// Débit indicatif (Mbps) à 30 fps, codec H.264, bonne qualité. Sert de base ;
// l'utilisateur peut toujours passer en "Personnalisé" pour saisir le débit exact.
const RESOLUTIONS: { label: string; mp: string; base: number }[] = [
  { label: "1 MP — 720p",   mp: "1MP",  base: 4 },
  { label: "2 MP — 1080p",  mp: "2MP",  base: 8 },
  { label: "3 MP",          mp: "3MP",  base: 10 },
  { label: "4 MP — 1440p",  mp: "4MP",  base: 12 },
  { label: "5 MP",          mp: "5MP",  base: 16 },
  { label: "6 MP",          mp: "6MP",  base: 20 },
  { label: "8 MP — 4K",     mp: "8MP",  base: 25 },
  { label: "12 MP",         mp: "12MP", base: 32 },
  { label: "Personnalisé",  mp: "custom", base: 0 },
]

const CODECS: { label: string; key: string; factor: number }[] = [
  { label: "H.264",        key: "h264", factor: 1.0 },
  { label: "H.265",        key: "h265", factor: 0.55 },
  { label: "H.265+ / Smart", key: "h265p", factor: 0.4 },
]

type Group = {
  id: number
  name: string
  qty: number
  res: string          // mp key
  customBitrate: number // utilisé si res === "custom"
  codec: string
  fps: number
  mode: Mode
  motionPct: number    // % d'activité si mode mouvement
  hoursPerDay: number
}

let GID = 1
function newGroup(partial: Partial<Group> = {}): Group {
  return {
    id: GID++,
    name: "Caméras",
    qty: 0,
    res: "2MP",
    customBitrate: 8,
    codec: "h265",
    fps: 15,
    mode: "continu",
    motionPct: 30,
    hoursPerDay: 24,
    ...partial,
  }
}

// Débit effectif d'une caméra du groupe (Mbps), avant facteur d'enregistrement.
function groupBitrate(g: Group): number {
  if (g.res === "custom") return Math.max(0, g.customBitrate)
  const base = RESOLUTIONS.find(r => r.mp === g.res)?.base ?? 8
  const codec = CODECS.find(c => c.key === g.codec)?.factor ?? 1
  const fpsFactor = Math.max(0.2, g.fps / 30)
  return base * codec * fpsFactor
}

// Octets/jour pour tout le groupe (toutes caméras confondues).
function groupBytesPerDay(g: Group): number {
  const modeFactor = g.mode === "continu" ? 1 : Math.max(0, Math.min(1, g.motionPct / 100))
  const bytesPerSecPerCam = (groupBitrate(g) * 1_000_000) / 8
  return bytesPerSecPerCam * 3600 * g.hoursPerDay * modeFactor * g.qty
}

const RAID_OPTS = [
  { key: "none", label: "Aucun (JBOD)", factor: 1.0 },
  { key: "raid5", label: "RAID 5 (~+25 %)", factor: 1.25 },
  { key: "raid6", label: "RAID 6 (~+50 %)", factor: 1.5 },
  { key: "raid1", label: "RAID 1 / miroir (×2)", factor: 2.0 },
]

export default function CalculateurPage() {
  const [device, setDevice] = useState<DeviceType>("nvr")
  const [groups, setGroups] = useState<Group[]>([newGroup()])
  const [retentionDays, setRetentionDays] = useState(30)

  // Spécifique serveur Nx
  const [dualStream, setDualStream] = useState(true)
  const [secondaryPct, setSecondaryPct] = useState(12) // flux secondaire en % du primaire
  const [raid, setRaid] = useState("raid5")
  const [backup, setBackup] = useState(false)
  const [systemMarginPct, setSystemMarginPct] = useState(5)

  function updateGroup(id: number, patch: Partial<Group>) {
    setGroups(prev => prev.map(g => (g.id === id ? { ...g, ...patch } : g)))
  }
  function removeGroup(id: number) {
    setGroups(prev => (prev.length > 1 ? prev.filter(g => g.id !== id) : prev))
  }

  const calc = useMemo(() => {
    const totalCams = groups.reduce((s, g) => s + (g.qty || 0), 0)
    let bitrateMbps = groups.reduce((s, g) => s + groupBitrate(g) * (g.qty || 0), 0)
    let bytesPerDay = groups.reduce((s, g) => s + groupBytesPerDay(g), 0)

    // Facteurs propres au serveur Nx
    let raidFactor = 1, backupFactor = 1, marginFactor = 1, dualFactor = 1
    if (device === "nx") {
      dualFactor = dualStream ? 1 + Math.max(0, secondaryPct) / 100 : 1
      raidFactor = RAID_OPTS.find(r => r.key === raid)?.factor ?? 1
      backupFactor = backup ? 2 : 1
      marginFactor = 1 / (1 - Math.max(0, Math.min(90, systemMarginPct)) / 100)
      bitrateMbps *= dualFactor
      bytesPerDay *= dualFactor
    }

    const retainedBytes = bytesPerDay * retentionDays
    const requiredBytes = retainedBytes * raidFactor * backupFactor * marginFactor
    const requiredTB = requiredBytes / 1e12
    const perDayGB = (bytesPerDay * (device === "nx" ? 1 : 1)) / 1e9 // dual déjà appliqué

    return {
      totalCams, bitrateMbps, perDayGB, requiredTB,
      dualFactor, raidFactor, backupFactor, marginFactor,
    }
  }, [groups, retentionDays, device, dualStream, secondaryPct, raid, backup, systemMarginPct])

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={S.logo}>S</div>
          <div>
            <div style={S.headerName}>Calculateur de stockage</div>
            <div style={S.headerEmail}>Dimensionnement NVR / serveur Nx</div>
          </div>
        </div>
        <nav style={S.nav}>
          <Link href="/companies" style={S.navLink}>← Tableau de bord</Link>
          <Link href="/quotes" style={S.navLink}>Devis</Link>
        </nav>
      </header>

      <div style={S.container}>
        {/* ── Étape 1 : type d'équipement ── */}
        <div style={S.card}>
          <div style={S.step}>Étape 1 — Type d&apos;équipement</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <DeviceCard
              active={device === "nvr"} onClick={() => setDevice("nvr")}
              icon="📦" title="Enregistreur NVR"
              desc="Boîtier avec baies de disques. On vérifie que le besoin tient dans les disques."
            />
            <DeviceCard
              active={device === "nx"} onClick={() => setDevice("nx")}
              icon="🖥️" title="Serveur Nx Witness"
              desc="VMS logiciel. Multi-flux (dual-stream), RAID et copie de sauvegarde pris en compte."
            />
          </div>
        </div>

        <div style={S.grid}>
          {/* ── Colonne gauche : configuration ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Groupes de caméras */}
            <div style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={S.step}>Étape 2 — Caméras</div>
                <button onClick={() => setGroups(p => [...p, newGroup()])} style={S.btnSm}>+ Groupe</button>
              </div>

              {groups.map(g => {
                const isCustom = g.res === "custom"
                return (
                  <div key={g.id} style={S.groupCard}>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <input value={g.name} onChange={e => updateGroup(g.id, { name: e.target.value })}
                        style={{ ...S.input, flex: 1, marginBottom: 0 }} placeholder="Nom du groupe" />
                      <div style={{ width: 90 }}>
                        <NumField label="Nombre" value={g.qty} min={0}
                          onChange={v => updateGroup(g.id, { qty: v })} />
                      </div>
                      {groups.length > 1 && (
                        <button onClick={() => removeGroup(g.id)} style={S.btnDel} title="Supprimer le groupe">×</button>
                      )}
                    </div>

                    <div style={S.row3}>
                      <Field label="Résolution">
                        <select value={g.res} onChange={e => updateGroup(g.id, { res: e.target.value })} style={S.select}>
                          {RESOLUTIONS.map(r => <option key={r.mp} value={r.mp}>{r.label}</option>)}
                        </select>
                      </Field>
                      {isCustom ? (
                        <NumField label="Débit (Mbps)" value={g.customBitrate} min={0} step={0.5}
                          onChange={v => updateGroup(g.id, { customBitrate: v })} />
                      ) : (
                        <Field label="Codec">
                          <select value={g.codec} onChange={e => updateGroup(g.id, { codec: e.target.value })} style={S.select}>
                            {CODECS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                          </select>
                        </Field>
                      )}
                      <NumField label="FPS" value={g.fps} min={1} max={60} disabled={isCustom}
                        onChange={v => updateGroup(g.id, { fps: v })} />
                    </div>

                    <div style={S.row3}>
                      <Field label="Enregistrement">
                        <select value={g.mode} onChange={e => updateGroup(g.id, { mode: e.target.value as Mode })} style={S.select}>
                          <option value="continu">Continu (24h)</option>
                          <option value="mouvement">Sur détection</option>
                        </select>
                      </Field>
                      <NumField label="% activité" value={g.motionPct} min={1} max={100}
                        disabled={g.mode === "continu"} onChange={v => updateGroup(g.id, { motionPct: v })} />
                      <NumField label="Heures/jour" value={g.hoursPerDay} min={1} max={24}
                        onChange={v => updateGroup(g.id, { hoursPerDay: v })} />
                    </div>

                    <div style={S.groupFoot}>
                      Débit estimé : <strong>{groupBitrate(g).toFixed(1)} Mbps</strong>/caméra
                      {" · "}{fmtGB(groupBytesPerDay(g))}/jour pour {g.qty} caméra{g.qty > 1 ? "s" : ""}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Rétention + spécifique équipement */}
            <div style={S.card}>
              <div style={S.step}>Étape 3 — Conservation{device === "nx" ? " & serveur" : ""}</div>
              <div style={S.row3}>
                <NumField label="Rétention (jours)" value={retentionDays} min={1} max={365}
                  onChange={setRetentionDays} />
                {device === "nx" && (
                  <>
                    <Field label="Redondance RAID">
                      <select value={raid} onChange={e => setRaid(e.target.value)} style={S.select}>
                        {RAID_OPTS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                      </select>
                    </Field>
                    <NumField label="Marge système (%)" value={systemMarginPct} min={0} max={50}
                      onChange={setSystemMarginPct} />
                  </>
                )}
              </div>

              {device === "nx" && (
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                  <label style={S.check}>
                    <input type="checkbox" checked={dualStream} onChange={e => setDualStream(e.target.checked)} />
                    <span>Double flux (dual-stream)</span>
                    {dualStream && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
                        — flux secondaire
                        <input type="number" value={secondaryPct} min={0} max={50}
                          onChange={e => setSecondaryPct(Number(e.target.value))}
                          style={{ ...S.input, width: 64, marginBottom: 0, padding: "4px 8px" }} />
                        % du primaire
                      </span>
                    )}
                  </label>
                  <label style={S.check}>
                    <input type="checkbox" checked={backup} onChange={e => setBackup(e.target.checked)} />
                    <span>Copie de sauvegarde (×2 du stockage)</span>
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* ── Colonne droite : résultat ── */}
          <div style={S.resultWrap}>
            <div style={S.resultCard}>
              <div style={S.resultLabel}>Stockage total requis</div>
              <div style={S.resultBig}>{calc.requiredTB.toFixed(2)} To</div>
              <div style={S.resultSub}>capacité brute utile à prévoir</div>

              <div style={S.resultRows}>
                <ResRow label="Caméras" value={`${calc.totalCams}`} />
                <ResRow label="Débit total" value={`${calc.bitrateMbps.toFixed(1)} Mbps`} />
                <ResRow label="Volume / jour" value={fmtGB(calc.perDayGB * 1e9)} />
                <ResRow label="Rétention" value={`${retentionDays} j`} />
                {device === "nx" && calc.dualFactor > 1 && <ResRow label="Double flux" value={`×${calc.dualFactor.toFixed(2)}`} />}
                {device === "nx" && calc.raidFactor > 1 && <ResRow label="RAID" value={`×${calc.raidFactor.toFixed(2)}`} />}
                {device === "nx" && calc.backupFactor > 1 && <ResRow label="Sauvegarde" value={`×${calc.backupFactor}`} />}
                {device === "nx" && calc.marginFactor > 1 && <ResRow label="Marge système" value={`×${calc.marginFactor.toFixed(2)}`} />}
              </div>
            </div>

            {/* Repère Nx uniquement : pas de verdict de suffisance hors contexte projet */}
            {device === "nx" && (
              <div style={{ ...S.verdict, background: "#eff6ff", borderColor: "#bfdbfe" }}>
                <div style={{ fontWeight: 800, color: "#1e40af", marginBottom: 4 }}>Capacité brute à prévoir</div>
                <div style={{ fontSize: 12, color: "#475569" }}>
                  Prévoir au moins <strong>{Math.ceil(calc.requiredTB)} To</strong> de stockage brut utile, incluant
                  redondance et marge système. Pour de la haute dispo, répartir sur plusieurs disques/serveurs.
                </div>
              </div>
            )}

            <div style={S.disclaimer}>
              Estimation indicative. Les débits réels dépendent de la scène, de la compression et du paramétrage caméra.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sous-composants ───────────────────────────────────────────────────────────
function DeviceCard({ active, onClick, icon, title, desc }: {
  active: boolean; onClick: () => void; icon: string; title: string; desc: string
}) {
  return (
    <button onClick={onClick} style={{
      flex: "1 1 240px", textAlign: "left", cursor: "pointer", padding: 16, borderRadius: 12,
      border: active ? "2px solid #3b82f6" : "1px solid #e2e8f0",
      background: active ? "#eff6ff" : "#fff", transition: "all .15s",
    }}>
      <div style={{ fontSize: 24, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontWeight: 800, color: "#1a202c", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.4 }}>{desc}</div>
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <label style={S.label}>{label}</label>
      {children}
    </div>
  )
}

function NumField({ label, value, onChange, min, max, step, disabled }: {
  label: string; value: number; onChange: (v: number) => void
  min?: number; max?: number; step?: number; disabled?: boolean
}) {
  return (
    <Field label={label}>
      <input
        type="number" value={value} min={min} max={max} step={step ?? 1} disabled={disabled}
        onChange={e => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        style={{ ...S.input, marginBottom: 0, opacity: disabled ? 0.5 : 1 }}
      />
    </Field>
  )
}

function ResRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.12)", fontSize: 13 }}>
      <span style={{ color: "#94a3b8" }}>{label}</span>
      <span style={{ color: "#fff", fontWeight: 700 }}>{value}</span>
    </div>
  )
}

function fmtGB(bytes: number): string {
  const gb = bytes / 1e9
  if (gb >= 1000) return `${(gb / 1000).toFixed(2)} To`
  if (gb >= 1) return `${gb.toFixed(1)} Go`
  return `${(bytes / 1e6).toFixed(0)} Mo`
}

const S = {
  page: { minHeight: "100vh", background: "#f8fafc", fontFamily: "system-ui, -apple-system, sans-serif" } as React.CSSProperties,
  header: { background: "#1a1a2e", padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" as const, gap: 12 },
  logo: { width: 36, height: 36, borderRadius: 8, background: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 18, flexShrink: 0 } as React.CSSProperties,
  headerName: { fontWeight: 700, color: "#fff", fontSize: 14 },
  headerEmail: { fontSize: 12, color: "#94a3b8" },
  nav: { display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" as const },
  navLink: { color: "#93c5fd", fontSize: 13, textDecoration: "none", fontWeight: 600 },
  container: { maxWidth: 1200, margin: "0 auto", padding: "20px 16px" },
  grid: { display: "grid", gridTemplateColumns: "minmax(0, 1.7fr) minmax(280px, 1fr)", gap: 16, alignItems: "start" } as React.CSSProperties,
  card: { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", padding: 18, marginBottom: 16 } as React.CSSProperties,
  step: { fontSize: 11, fontWeight: 800, color: "#5a2d82", textTransform: "uppercase" as const, letterSpacing: 0.6, marginBottom: 12 },
  groupCard: { border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, marginBottom: 10, background: "#fafbfc" } as React.CSSProperties,
  groupFoot: { marginTop: 8, fontSize: 12, color: "#64748b", borderTop: "1px dashed #e2e8f0", paddingTop: 8 },
  row3: { display: "flex", gap: 10, marginBottom: 8 } as React.CSSProperties,
  label: { display: "block", fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 3 } as React.CSSProperties,
  input: { display: "block", width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid #e2e8f0", fontSize: 13, boxSizing: "border-box" as const, marginBottom: 12, outline: "none" },
  select: { display: "block", width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid #e2e8f0", fontSize: 13, boxSizing: "border-box" as const, outline: "none", background: "#fff" } as React.CSSProperties,
  check: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#374151", flexWrap: "wrap" as const },
  btnSm: { padding: "6px 12px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 700 } as React.CSSProperties,
  btnDel: { background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontWeight: 700, fontSize: 20, lineHeight: 1, alignSelf: "center", padding: "0 4px" } as React.CSSProperties,
  resultWrap: { position: "sticky" as const, top: 16, display: "flex", flexDirection: "column" as const, gap: 12 },
  resultCard: { background: "#1a1a2e", borderRadius: 14, padding: 20, color: "#fff" } as React.CSSProperties,
  resultLabel: { fontSize: 12, color: "#94a3b8", fontWeight: 600 },
  resultBig: { fontSize: 38, fontWeight: 800, color: "#fff", lineHeight: 1.1, margin: "2px 0 2px" },
  resultSub: { fontSize: 12, color: "#94a3b8", marginBottom: 14 },
  resultRows: { display: "flex", flexDirection: "column" as const },
  verdict: { borderRadius: 12, border: "1px solid", padding: 14 } as React.CSSProperties,
  disclaimer: { fontSize: 11, color: "#94a3b8", lineHeight: 1.4, padding: "0 4px" },
}
