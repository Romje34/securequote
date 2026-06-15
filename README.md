# SecureQuote

SaaS B2B de devis pour intégrateurs de sûreté / sécurité électronique
(vidéosurveillance, contrôle d'accès, détection intrusion, réseau, interphonie,
supervision, cybersécurité, maintenance).

## Stack

- **Next.js 16** (App Router) + **TypeScript** + **React 19**
- **Supabase** (Postgres, Auth SSR via `@supabase/ssr`)
- **Tailwind CSS 4**
- **Anthropic SDK** — suggestions de devis par IA
- **@react-pdf/renderer** — génération des PDF de devis
- **Resend** — emails transactionnels
- Cloudflare **Turnstile** — anti-bot à l'inscription

## Démarrage

```bash
npm install
npm run dev
```

App sur http://localhost:3000.

### Variables d'environnement (`.env.local`)

| Variable | Usage |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Client admin (server-only) |
| `ANTHROPIC_API_KEY` | Suggestions IA |
| `RESEND_API_KEY` | Envoi d'emails |
| `TURNSTILE_SECRET_KEY` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Vérification Turnstile |

## Architecture

- `app/` — pages (App Router) et routes API (`app/api/**`)
- `lib/` — code partagé : `auth.ts` (auth/autorisation centralisées),
  `rate-limit.ts`, `turnstile.ts`, `email.ts`, `supabase/{client,server,admin}.ts`,
  `pdf/QuotePDF.tsx`
- `components/` — composants UI partagés
- `supabase/migrations/` — migrations SQL versionnées
- `proxy.ts` — middleware (auth + redirections)

### Modèle de données

Multi-tenant : `organizations` (le tenant de l'intégrateur) → `profiles`
(comptes, rôles owner/membre) → `companies` (sociétés clientes) → devis
(chapitres → lignes). Voir `supabase/migrations/`.

## Scripts

```bash
npm run dev     # serveur de développement
npm run build   # build production
npm run start   # serveur production
npm run lint    # ESLint
```
