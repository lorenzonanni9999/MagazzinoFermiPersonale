import tornado.web
import tornado.escape


class BaseHandler(tornado.web.RequestHandler):

    def get_current_user(self):
        user_cookie = self.get_secure_cookie("user")
        if not user_cookie:
            return None
        return tornado.escape.json_decode(user_cookie)

    def require_auth(self):
        """Verifica che l'utente sia autenticato. Ritorna l'utente o None."""
        user = self.get_current_user()
        if not user:
            self.write_json({"error": "Non autenticato"}, 401)
            return None
        return user

    def require_roles(self, *roles):
        """Verifica autenticazione e ruolo. Ritorna l'utente o None."""
        user = self.get_current_user()
        if not user:
            self.write_json({"error": "Non autenticato"}, 401)
            return None
        if user.get("ruolo") not in roles:
            self.write_json({"error": "Permesso negato"}, 403)
            return None
        return user

    def write_json(self, data, status=200):
        self.set_status(status)
        self.set_header("Content-Type", "application/json")
        self.write(tornado.escape.json_encode(data))
