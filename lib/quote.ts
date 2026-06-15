// Un devis est "gagné" s'il est signé électroniquement OU marqué accepté manuellement.
export function isWon(q: { status: string; signed_at: string | null }) {
  return q.status === "accepted" || !!q.signed_at
}
