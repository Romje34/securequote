import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

// Le tableau de bord unifié vit sur /companies (KPI + sociétés + équipe).
// Cette route ne fait que router selon le type de compte, côté serveur :
// pas de bundle JS, pas de rechargement dur — un simple 307 avant tout rendu.
export default async function DashboardRedirect() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect("/login")

  const { data: p } = await sb
    .from("profiles")
    .select("user_type")
    .eq("id", user.id)
    .single()

  redirect(p?.user_type === "superadmin" ? "/admin" : "/companies")
}
