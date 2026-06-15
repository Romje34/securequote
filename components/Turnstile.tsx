"use client"

import { useEffect, useRef } from "react"

// Widget Cloudflare Turnstile (rendu explicite). Émet le token via onToken ;
// null quand il expire ou échoue. Si la site key n'est pas configurée (dev local),
// le widget ne s'affiche pas et aucun token n'est requis côté serveur (fail-open).

type TurnstileAPI = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  remove: (id: string) => void
}
declare global {
  interface Window { turnstile?: TurnstileAPI }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
const SCRIPT_ID = "cf-turnstile-script"

export default function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)

  // onToken est attendu stable (ex. setState dispatch) → l'effet ne se relance pas.
  useEffect(() => {
    if (!SITE_KEY) return

    function render() {
      if (!window.turnstile || !containerRef.current || widgetId.current) return
      widgetId.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        callback: (t: string) => onToken(t),
        "error-callback": () => onToken(null),
        "expired-callback": () => onToken(null),
      })
    }

    if (window.turnstile) {
      render()
    } else if (!document.getElementById(SCRIPT_ID)) {
      const s = document.createElement("script")
      s.id = SCRIPT_ID
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
      s.async = true
      s.defer = true
      s.onload = render
      document.head.appendChild(s)
    } else {
      const timer = setInterval(() => {
        if (window.turnstile) { clearInterval(timer); render() }
      }, 200)
      return () => clearInterval(timer)
    }

    return () => {
      if (widgetId.current && window.turnstile) {
        try { window.turnstile.remove(widgetId.current) } catch { /* déjà retiré */ }
        widgetId.current = null
      }
    }
  }, [onToken])

  if (!SITE_KEY) return null
  return <div ref={containerRef} style={{ marginBottom: 12 }} />
}
