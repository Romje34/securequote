// Fallback affiché instantanément pendant les transitions de route (client-side
// transitions de <Link>). Donne un retour visuel immédiat au lieu d'une page figée.
export default function Loading() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: "3px solid #e2e8f0",
            borderTopColor: "#1a1a2e",
            animation: "sq-spin 0.7s linear infinite",
          }}
        />
        <span style={{ color: "#64748b", fontSize: 13 }}>Chargement…</span>
      </div>
      <style>{`@keyframes sq-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
