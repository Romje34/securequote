import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

// Client Supabase navigateur, à instanciation PARESSEUSE.
//
// Plusieurs pages font `const sb = createClient()` au niveau module. Or au build,
// Next.js prérend ces pages côté serveur : ce code module s'exécute alors que les
// NEXT_PUBLIC_SUPABASE_* peuvent être absentes (ex. environnement Preview Vercel),
// et createBrowserClient() lèverait, faisant échouer tout le build.
//
// On retourne donc un proxy qui ne construit le vrai client qu'au PREMIER accès à
// une propriété. Le rendu SSR ne touche jamais au client (il n'est utilisé que dans
// des effets/handlers, donc côté navigateur) → aucune construction au build, aucun
// crash. Le vrai client reste un singleton (mémoïsé) côté navigateur.
let real: SupabaseClient | undefined

function getReal(): SupabaseClient {
  if (!real) {
    real = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
  }
  return real
}

export function createClient(): SupabaseClient {
  return new Proxy({} as SupabaseClient, {
    get(_target, prop, receiver) {
      const value = Reflect.get(getReal(), prop, receiver)
      return typeof value === "function" ? value.bind(getReal()) : value
    },
  })
}
