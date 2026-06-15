// Email de contact de l'administrateur, affiché à l'utilisateur quand une
// opération critique (inscription, changement d'email…) échoue côté serveur.
// Surchargeable via NEXT_PUBLIC_ADMIN_CONTACT_EMAIL.
export const ADMIN_CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_ADMIN_CONTACT_EMAIL || "jerome.merter@gmail.com"
