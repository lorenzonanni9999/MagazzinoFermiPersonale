import smtplib
import asyncio
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from backend.db.db import SMTP_CONFIG


def _send_email_sync(to_addr: str, subject: str, body_html: str, body_text: str):
    """Invia una mail via SMTP (sincrono — va chiamato in un executor)."""
    cfg = SMTP_CONFIG
    if not cfg["user"] or not cfg["password"]:
        raise RuntimeError("Configurazione SMTP mancante (SMTP_USER / SMTP_PASSWORD non impostati)")

    from_addr = cfg["from"] or cfg["user"]

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"Magazzino Scolastico <{from_addr}>"
    msg["To"] = to_addr

    msg.attach(MIMEText(body_text, "plain", "utf-8"))
    msg.attach(MIMEText(body_html, "html", "utf-8"))

    with smtplib.SMTP(cfg["host"], cfg["port"], timeout=10) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.login(cfg["user"], cfg["password"])
        smtp.sendmail(from_addr, to_addr, msg.as_string())


async def send_reset_email(to_addr: str, reset_url: str):
    """Invia la mail di reset password in modo asincrono."""
    subject = "Reimposta la tua password — Magazzino Scolastico"

    body_text = (
        f"Ciao,\n\n"
        f"Hai ricevuto questo messaggio perché un amministratore ha richiesto il reset della tua password.\n\n"
        f"Clicca sul link seguente per scegliere una nuova password (valido per 24 ore):\n"
        f"{reset_url}\n\n"
        f"Se non hai richiesto il reset, ignora questa email.\n\n"
        f"— Magazzino Scolastico"
    )

    body_html = f"""
<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 16px">
      <table width="480" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
        <tr>
          <td style="background:#1d4ed8;padding:24px 32px">
            <span style="color:#ffffff;font-size:15px;font-weight:700;letter-spacing:.04em">
              Magazzino Scolastico
            </span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 24px">
            <h2 style="margin:0 0 12px;font-size:20px;color:#111827">Reimposta la tua password</h2>
            <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6">
              Un amministratore ha richiesto il reset della password per il tuo account.<br>
              Clicca sul pulsante qui sotto per sceglierne una nuova.<br>
              Il link è valido per <strong>24 ore</strong> e può essere usato una sola volta.
            </p>
            <a href="{reset_url}"
               style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;
                      padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600">
              Reimposta password
            </a>
            <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.5">
              Se non riesci a cliccare il pulsante, copia e incolla questo link nel browser:<br>
              <span style="color:#1d4ed8;word-break:break-all">{reset_url}</span>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #e5e7eb">
            <p style="margin:0;font-size:11px;color:#9ca3af">
              Se non hai richiesto il reset, ignora questa email. La tua password rimarrà invariata.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _send_email_sync, to_addr, subject, body_html, body_text)
