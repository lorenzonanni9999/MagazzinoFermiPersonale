import tornado.escape
import bcrypt

from backend.handlers.base import BaseHandler
from backend.db.db import db_interface
from backend.utils.email import send_reset_email


class RegisterHandler(BaseHandler):
    """POST /api/register — ADMIN crea utenti; chiunque può auto-registrarsi come DOCENTE (in attesa di approvazione)"""

    async def post(self):
        body = tornado.escape.json_decode(self.request.body)
        email    = body.get("email", "").strip()
        password = body.get("password", "")
        ruolo    = body.get("ruolo", "DOCENTE").strip().upper()
        nome     = body.get("nome", "").strip() or None
        cognome  = body.get("cognome", "").strip() or None

        ruoli_validi = {"ADMIN", "TECNICO", "DOCENTE"}

        if not email or not password or not ruolo:
            return self.write_json({"error": "Email, password e ruolo obbligatori"}, 400)
        if ruolo not in ruoli_validi:
            return self.write_json({"error": "Ruolo non valido"}, 400)

        existing = await db_interface.get_user_by_email(email)
        if existing:
            return self.write_json({"error": "Utente già registrato"}, 400)

        current_user = self.get_current_user()

        # Solo ADMIN può creare ADMIN o TECNICO
        if ruolo in ("ADMIN", "TECNICO"):
            if not current_user or current_user.get("ruolo") != "ADMIN":
                return self.write_json({"error": "Solo ADMIN può creare utenti ADMIN o TECNICO"}, 403)

        # DOCENTE: sempre in attesa di approvazione — l'admin deve approvare esplicitamente
        # ADMIN/TECNICO: approvati subito (solo un ADMIN può crearli, check già fatto sopra)
        approvato = ruolo != "DOCENTE"

        hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt())
        user_id = await db_interface.create_user(email, hashed, ruolo, approvato, nome, cognome)

        log_user = current_user or {"id": None, "email": "auto-registrazione"}
        await db_interface.add_log(
            log_user.get("id"), log_user.get("email"),
            "CREATE_USER",
            f"Creato utente {email} ({ruolo}), approvato={approvato}"
        )

        if approvato:
            return self.write_json({"message": "Registrazione completata"}, 201)
        else:
            return self.write_json({"message": "Registrazione inviata — in attesa di approvazione"}, 201)


class LoginHandler(BaseHandler):

    async def post(self):
        body = tornado.escape.json_decode(self.request.body)
        email = body.get("email", "").strip()
        password = body.get("password", "")

        user = await db_interface.get_user_by_email(email)
        if not user:
            return self.write_json({"error": "Credenziali errate"}, 401)

        if not bcrypt.checkpw(password.encode(), user["password"]):
            return self.write_json({"error": "Credenziali errate"}, 401)

        if not user.get("approvato", True):
            return self.write_json({"error": "Account in attesa di approvazione"}, 403)

        user_data = {
            "id": str(user["id"]),
            "email": user["email"],
            "ruolo": user["ruolo"]
        }

        self.set_secure_cookie("user", tornado.escape.json_encode(user_data))
        await db_interface.add_log(user["id"], user["email"], "LOGIN", "")
        return self.write_json({"message": "Login effettuato", "user": user_data})


class LogoutHandler(BaseHandler):
    async def post(self):
        user = self.get_current_user()
        if user:
            await db_interface.add_log(user["id"], user["email"], "LOGOUT", "")
        self.clear_cookie("user")
        return self.write_json({"message": "Logout effettuato"})


class MeHandler(BaseHandler):
    """GET /api/me"""
    async def get(self):
        user = self.require_auth()
        if not user:
            return
        return self.write_json(user)

    async def put(self):
        """Cambio password del proprio account"""
        user = self.require_auth()
        if not user:
            return
        body = tornado.escape.json_decode(self.request.body)
        old_password = body.get("old_password", "")
        new_password = body.get("new_password", "")

        if not old_password or not new_password:
            return self.write_json({"error": "Vecchia e nuova password obbligatorie"}, 400)

        db_user = await db_interface.get_user_by_email(user["email"])
        if not bcrypt.checkpw(old_password.encode(), db_user["password"]):
            return self.write_json({"error": "Vecchia password errata"}, 401)

        hashed = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt())
        await db_interface.update_user_password(int(user["id"]), hashed)
        await db_interface.add_log(user["id"], user["email"], "CHANGE_PASSWORD", "")
        return self.write_json({"message": "Password aggiornata"})


class UsersHandler(BaseHandler):
    """GET /api/users (ADMIN: tutti; TECNICO: solo DOCENTI) — DELETE /api/users/{id} (ADMIN: tutti; TECNICO: solo DOCENTI)"""

    async def get(self):
        user = self.require_roles("ADMIN", "TECNICO")
        if not user:
            return
        if user["ruolo"] == "ADMIN":
            users = await db_interface.get_all_users()
        else:
            # TECNICO vede solo i DOCENTI
            users = await db_interface.get_users_by_ruolo("DOCENTE")
        return self.write_json({"users": users})

    async def delete(self, user_id):
        user = self.require_roles("ADMIN", "TECNICO")
        if not user:
            return
        target = await db_interface.get_user_by_id(int(user_id))
        if not target:
            return self.write_json({"error": "Utente non trovato"}, 404)
        # TECNICO può eliminare solo DOCENTI
        if user["ruolo"] == "TECNICO" and target["ruolo"] != "DOCENTE":
            return self.write_json({"error": "Permesso negato"}, 403)
        await db_interface.delete_user(int(user_id))
        await db_interface.add_log(user["id"], user["email"], "DELETE_USER", f"Eliminato utente id={user_id}")
        return self.write_json({"message": "Utente eliminato"})


class PendingUsersHandler(BaseHandler):
    """GET /api/users/pending — ADMIN e TECNICO"""

    async def get(self):
        if not self.require_roles("ADMIN", "TECNICO"):
            return
        users = await db_interface.get_pending_users()
        return self.write_json({"users": users})


class ApproveUserHandler(BaseHandler):
    """POST /api/users/{id}/approva — ADMIN e TECNICO"""

    async def post(self, user_id):
        approver = self.require_roles("ADMIN", "TECNICO")
        if not approver:
            return
        body = {}
        if self.request.body:
            try:
                body = tornado.escape.json_decode(self.request.body)
            except Exception:
                pass
        ruolo = body.get("ruolo", "").strip().upper() or None
        if ruolo and ruolo not in {"ADMIN", "TECNICO", "DOCENTE"}:
            return self.write_json({"error": "Ruolo non valido"}, 400)
        # Solo ADMIN può promuovere ad ADMIN o TECNICO
        if ruolo in ("ADMIN", "TECNICO") and approver.get("ruolo") != "ADMIN":
            return self.write_json({"error": "Solo ADMIN può assegnare questo ruolo"}, 403)
        await db_interface.approve_user(int(user_id), ruolo)
        await db_interface.add_log(
            approver["id"], approver["email"],
            "APPROVE_USER", f"Approvato utente id={user_id}" + (f" con ruolo {ruolo}" if ruolo else "")
        )
        return self.write_json({"message": "Utente approvato"})


class UserRuoloHandler(BaseHandler):
    """PUT /api/users/{id}/ruolo — ADMIN: modifica il ruolo di un utente"""

    async def put(self, user_id):
        admin = self.require_roles("ADMIN")
        if not admin:
            return
        if str(user_id) == str(admin["id"]):
            return self.write_json({"error": "Non puoi modificare il tuo stesso ruolo"}, 400)
        body = tornado.escape.json_decode(self.request.body)
        ruolo = body.get("ruolo", "").strip().upper()
        if ruolo not in {"ADMIN", "TECNICO", "DOCENTE"}:
            return self.write_json({"error": "Ruolo non valido"}, 400)
        await db_interface.update_user_ruolo(int(user_id), ruolo)
        await db_interface.add_log(
            admin["id"], admin["email"],
            "CHANGE_ROLE", f"Ruolo utente id={user_id} → {ruolo}"
        )
        return self.write_json({"message": "Ruolo aggiornato"})


class RejectUserHandler(BaseHandler):
    """POST /api/users/{id}/rifiuta — ADMIN: rifiuta una richiesta di registrazione"""

    async def post(self, user_id):
        admin = self.require_roles("ADMIN", "TECNICO")
        if not admin:
            return
        await db_interface.reject_user(int(user_id))
        await db_interface.add_log(
            admin["id"], admin["email"],
            "REJECT_USER", f"Rifiutato utente id={user_id}"
        )
        return self.write_json({"message": "Richiesta rifiutata"})


class ResetTokenHandler(BaseHandler):
    """POST /api/users/{id}/reset-token — ADMIN only: invia mail di reset password"""

    async def post(self, user_id):
        admin = self.require_roles("ADMIN")
        if not admin:
            return

        target = await db_interface.get_user_by_id(int(user_id))
        if not target:
            return self.write_json({"error": "Utente non trovato"}, 404)

        token = await db_interface.create_reset_token(int(user_id))
        scheme = self.request.protocol
        host = self.request.host
        reset_url = f"{scheme}://{host}/static/reset_password.html?token={token}"

        email_sent = False
        email_error = None
        try:
            await send_reset_email(target["email"], reset_url)
            email_sent = True
        except Exception as e:
            email_error = str(e)

        await db_interface.add_log(
            admin["id"], admin["email"],
            "RESET_TOKEN",
            f"Generato link reset per {target['email']} (user_id={user_id}), email_sent={email_sent}"
            + (f", errore: {email_error}" if email_error else "")
        )

        if email_sent:
            message = f"Link di reset inviato a {target['email']}"
        else:
            message = f"Email non inviata ({email_error}) — copia il link manualmente"

        return self.write_json({
            "message": message,
            "reset_url": reset_url,
            "email_sent": email_sent
        })


class ResetPasswordHandler(BaseHandler):
    """POST /api/reset-password — pubblico: valida token e imposta nuova password"""

    async def post(self):
        body = tornado.escape.json_decode(self.request.body)
        token = body.get("token", "").strip()
        new_password = body.get("new_password", "")

        if not token or not new_password:
            return self.write_json({"error": "Token e nuova password obbligatori"}, 400)
        if len(new_password) < 6:
            return self.write_json({"error": "La password deve essere di almeno 6 caratteri"}, 400)

        token_data = await db_interface.get_reset_token(token)
        if not token_data:
            return self.write_json({"error": "Link non valido o scaduto"}, 400)

        hashed = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt())
        success = await db_interface.consume_reset_token(token, hashed)
        if not success:
            return self.write_json({"error": "Errore durante il reset"}, 500)

        await db_interface.add_log(
            token_data["user_id"], token_data["email"],
            "RESET_PASSWORD", "Password reimpostata tramite link"
        )
        return self.write_json({"message": "Password aggiornata con successo"})
