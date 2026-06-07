import { Resend } from 'resend'

const FROM    = process.env.RESEND_FROM_EMAIL   ?? 'SecureQuote <onboarding@resend.dev>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

let _resend: Resend | null = null
function getResend(): Resend {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY manquante — envoi d\'email impossible')
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}

function fmtNum(n: number) {
  const [int, dec] = Math.abs(n).toFixed(2).split('.')
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${dec}`
}

// ── Envoyer le devis au client ───────────────────────────────────────────────

export async function sendQuoteEmail(opts: {
  to:           string
  quote_number: string
  title:        string | null
  client_name:  string | null
  company_name: string
  total_ht:     number
  valid_until:  string | null
  token:        string
}) {
  const signUrl   = `${APP_URL}/q/${opts.token}`
  const validDate = opts.valid_until
    ? new Date(opts.valid_until).toLocaleDateString('fr-FR')
    : null

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:system-ui,-apple-system,sans-serif">
<div style="max-width:600px;margin:32px auto;padding:0 16px">

  <div style="background:#1a1a2e;padding:30px 36px;border-radius:14px 14px 0 0;text-align:center">
    <div style="font-size:11px;font-weight:700;color:#93c5fd;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px">Devis commercial</div>
    <div style="font-size:28px;font-weight:800;color:#fff;margin-bottom:4px">N° ${opts.quote_number}</div>
    ${opts.title ? `<div style="font-size:14px;color:#94a3b8;margin-top:4px">${opts.title}</div>` : ''}
  </div>

  <div style="background:#fff;padding:32px 36px;border:1px solid #e2e8f0;border-top:none">
    <p style="margin:0 0 14px;font-size:15px;color:#1a202c">
      Bonjour ${opts.client_name ? `<strong>${opts.client_name}</strong>` : 'Madame, Monsieur'},
    </p>
    <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.7">
      <strong>${opts.company_name}</strong> vous a transmis un devis. Vous pouvez le consulter et le signer électroniquement en cliquant sur le bouton ci-dessous.
    </p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px 24px;margin-bottom:28px">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr>
          <td style="padding:6px 0;color:#64748b;width:150px">Référence devis</td>
          <td style="font-weight:700;color:#1a202c">N° ${opts.quote_number}</td>
        </tr>
        ${opts.title ? `<tr><td style="padding:6px 0;color:#64748b">Objet</td><td style="color:#1a202c">${opts.title}</td></tr>` : ''}
        <tr>
          <td style="padding:6px 0;color:#64748b">Montant HT</td>
          <td style="font-weight:800;font-size:18px;color:#1a1a2e">${fmtNum(opts.total_ht)} €</td>
        </tr>
        ${validDate ? `<tr><td style="padding:6px 0;color:#64748b">Valable jusqu'au</td><td style="color:#1a202c;font-weight:600">${validDate}</td></tr>` : ''}
      </table>
    </div>

    <div style="text-align:center;margin:32px 0 24px">
      <a href="${signUrl}"
        style="display:inline-block;background:#1a1a2e;color:#fff;padding:15px 40px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.3px">
        Consulter et signer le devis →
      </a>
    </div>

    <p style="font-size:12px;color:#94a3b8;text-align:center;line-height:1.6;margin:0">
      Ce lien est personnel et sécurisé. Il reste valide jusqu'à la date limite du devis.<br>
      <a href="${signUrl}" style="color:#3b82f6;word-break:break-all">${signUrl}</a>
    </p>
  </div>

  <div style="background:#e2e8f0;padding:14px 36px;border-radius:0 0 14px 14px;text-align:center">
    <span style="font-size:11px;color:#94a3b8">Propulsé par SecureQuote · Ce message a été envoyé par ${opts.company_name}</span>
  </div>

</div>
</body></html>`

  const { error } = await getResend().emails.send({
    from:    FROM,
    to:      [opts.to],
    subject: `Devis N° ${opts.quote_number} — ${opts.company_name}`,
    html,
  })

  if (error) throw new Error(error.message)
}

// ── Confirmation de signature ─────────────────────────────────────────────────

export async function sendSignatureConfirmation(opts: {
  to_owner:     string
  to_client:    string
  quote_number: string
  title:        string | null
  signed_by:    string
  signed_at:    string
  company_name: string
}) {
  const dateStr  = new Date(opts.signed_at).toLocaleString('fr-FR')
  const subject  = `✅ Devis N° ${opts.quote_number} signé par ${opts.signed_by}`
  const titleStr = opts.title ? ` "${opts.title}"` : ''

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:system-ui,-apple-system,sans-serif">
<div style="max-width:560px;margin:32px auto;padding:0 16px">
  <div style="background:#10b981;padding:24px 32px;border-radius:14px 14px 0 0;text-align:center">
    <div style="font-size:36px;margin-bottom:8px">✅</div>
    <div style="font-size:20px;font-weight:800;color:#fff">Devis signé</div>
  </div>
  <div style="background:#fff;padding:28px 32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 14px 14px">
    <p style="font-size:14px;color:#475569;margin:0 0 16px">
      Le devis <strong>N° ${opts.quote_number}</strong>${titleStr} a été signé électroniquement.
    </p>
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:18px 22px;font-size:13px;color:#166534">
      <div style="margin-bottom:6px"><strong>Signé par :</strong> ${opts.signed_by}</div>
      <div><strong>Date et heure :</strong> ${dateStr}</div>
    </div>
    <p style="font-size:12px;color:#94a3b8;margin:16px 0 0">
      Cette signature électronique a valeur de bon de commande conformément aux conditions générales du devis.
    </p>
  </div>
</div>
</body></html>`

  const client = getResend()
  await Promise.all([
    client.emails.send({ from: FROM, to: [opts.to_owner],  subject, html }),
    client.emails.send({ from: FROM, to: [opts.to_client], subject: `Confirmation — Devis N° ${opts.quote_number} signé`, html }),
  ])
}
