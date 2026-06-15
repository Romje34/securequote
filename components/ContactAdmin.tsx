"use client"

import { ADMIN_CONTACT_EMAIL } from "@/lib/contact"

// Bloc d'aide affiché quand une opération critique échoue côté serveur :
// on rassure (rien n'a abouti) et on invite à contacter directement l'admin.
export default function ContactAdmin({ message }: { message?: string }) {
  return (
    <div style={{
      marginTop: 12, padding: "12px 14px", background: "#fffbeb",
      border: "1px solid #fde68a", borderRadius: 8, fontSize: 13, color: "#854d0e", lineHeight: 1.5,
    }}>
      {message ?? "Une erreur technique est survenue et votre demande n'a pas pu aboutir."}{" "}
      Si le problème persiste, contactez directement l&apos;administrateur :{" "}
      <a href={`mailto:${ADMIN_CONTACT_EMAIL}`} style={{ color: "#854d0e", fontWeight: 800 }}>
        {ADMIN_CONTACT_EMAIL}
      </a>
    </div>
  )
}
