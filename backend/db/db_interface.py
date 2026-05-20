import secrets
import aiomysql
from datetime import datetime, timedelta


class DatabaseInterface:
    def __init__(self):
        self._pool = None

    def set_pool(self, pool):
        self._pool = pool

    async def _add_column_if_missing(self, cur, table, column, definition):
        """Aggiunge una colonna solo se non esiste già (compatibile con MySQL)."""
        await cur.execute("""
            SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND COLUMN_NAME = %s
        """, (table, column))
        row = await cur.fetchone()
        if row[0] == 0:
            await cur.execute(f"ALTER TABLE `{table}` ADD COLUMN `{column}` {definition}")

    async def create_tables(self):
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                # USERS
                await cur.execute("""
                    CREATE TABLE IF NOT EXISTS users (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        email VARCHAR(255) UNIQUE NOT NULL,
                        password VARBINARY(255) NOT NULL,
                        ruolo ENUM('ADMIN','TECNICO','DOCENTE') NOT NULL,
                        approvato BOOLEAN NOT NULL DEFAULT TRUE
                    )
                """)
                await self._add_column_if_missing(cur, "users", "approvato", "BOOLEAN NOT NULL DEFAULT TRUE")
                await self._add_column_if_missing(cur, "users", "nome",     "VARCHAR(100) DEFAULT NULL")
                await self._add_column_if_missing(cur, "users", "cognome",  "VARCHAR(100) DEFAULT NULL")

                # PASSWORD RESET TOKENS
                await cur.execute("""
                    CREATE TABLE IF NOT EXISTS password_reset_tokens (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        token VARCHAR(64) UNIQUE NOT NULL,
                        user_id INT NOT NULL,
                        expires_at DATETIME NOT NULL,
                        used BOOLEAN NOT NULL DEFAULT FALSE,
                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                    )
                """)

                # MAGAZZINI con struttura ASC
                await cur.execute("""
                    CREATE TABLE IF NOT EXISTS magazzini (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        nome VARCHAR(255) NOT NULL,
                        descrizione TEXT,
                        ambiente VARCHAR(100),
                        sezione VARCHAR(100),
                        cassetto VARCHAR(100)
                    )
                """)
                for col, defn in [("ambiente","VARCHAR(100)"), ("sezione","VARCHAR(100)"), ("cassetto","VARCHAR(100)")]:
                    await self._add_column_if_missing(cur, "magazzini", col, defn)

                # COMPONENTI con classificazione 4 livelli
                await cur.execute("""
                    CREATE TABLE IF NOT EXISTS componenti (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        nome VARCHAR(255) NOT NULL,
                        descrizione TEXT,
                        famiglia VARCHAR(100),
                        tipo VARCHAR(100),
                        ambito VARCHAR(100),
                        sottotipo VARCHAR(100),
                        unita_misura VARCHAR(50) DEFAULT 'pz',
                        datasheet_url TEXT
                    )
                """)
                for col, defn in [
                    ("famiglia","VARCHAR(100)"), ("tipo","VARCHAR(100)"),
                    ("ambito","VARCHAR(100)"), ("sottotipo","VARCHAR(100)"),
                    ("datasheet_url","TEXT")
                ]:
                    await self._add_column_if_missing(cur, "componenti", col, defn)

                # STOCK magazzino x componente con flag scorta
                await cur.execute("""
                    CREATE TABLE IF NOT EXISTS magazzino_componenti (
                        magazzino_id INT NOT NULL,
                        componente_id INT NOT NULL,
                        quantita INT NOT NULL DEFAULT 0,
                        quantita_minima INT NOT NULL DEFAULT 0,
                        is_scorta BOOLEAN NOT NULL DEFAULT FALSE,
                        PRIMARY KEY (magazzino_id, componente_id),
                        FOREIGN KEY (magazzino_id) REFERENCES magazzini(id) ON DELETE CASCADE,
                        FOREIGN KEY (componente_id) REFERENCES componenti(id) ON DELETE CASCADE
                    )
                """)
                await self._add_column_if_missing(cur, "magazzino_componenti", "is_scorta", "BOOLEAN NOT NULL DEFAULT FALSE")

                # TAGS: etichette personalizzabili con colore
                await cur.execute("""
                    CREATE TABLE IF NOT EXISTS tags (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        nome VARCHAR(100) NOT NULL,
                        colore VARCHAR(7) NOT NULL DEFAULT '#3b82f6',
                        created_by INT,
                        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
                    )
                """)

                # COMPONENTE_TAGS: associazione tag <-> componente
                await cur.execute("""
                    CREATE TABLE IF NOT EXISTS componente_tags (
                        componente_id INT NOT NULL,
                        tag_id INT NOT NULL,
                        PRIMARY KEY (componente_id, tag_id),
                        FOREIGN KEY (componente_id) REFERENCES componenti(id) ON DELETE CASCADE,
                        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
                    )
                """)

                # ESPERIENZE
                await cur.execute("""
                    CREATE TABLE IF NOT EXISTS esperienze (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        nome VARCHAR(255) NOT NULL,
                        descrizione TEXT,
                        docente_id INT,
                        data_creazione TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (docente_id) REFERENCES users(id) ON DELETE SET NULL
                    )
                """)

                # ESPERIENZA_COMPONENTI
                await cur.execute("""
                    CREATE TABLE IF NOT EXISTS esperienza_componenti (
                        esperienza_id INT NOT NULL,
                        componente_id INT NOT NULL,
                        quantita_necessaria INT NOT NULL DEFAULT 1,
                        PRIMARY KEY (esperienza_id, componente_id),
                        FOREIGN KEY (esperienza_id) REFERENCES esperienze(id) ON DELETE CASCADE,
                        FOREIGN KEY (componente_id) REFERENCES componenti(id) ON DELETE CASCADE
                    )
                """)
                await self._add_column_if_missing(cur, "esperienza_componenti", "consumabile", "BOOLEAN NOT NULL DEFAULT FALSE")

                # LOGS: registro attività
                await cur.execute("""
                    CREATE TABLE IF NOT EXISTS logs (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        user_id INT,
                        user_email VARCHAR(255),
                        azione VARCHAR(255) NOT NULL,
                        dettagli TEXT,
                        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
                    )
                """)

    # ------------------------------------------------------------------ LOGS

    async def add_log(self, user_id, user_email, azione, dettagli=""):
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                try:
                    await cur.execute(
                        "INSERT INTO logs (user_id, user_email, azione, dettagli) VALUES (%s, %s, %s, %s)",
                        (user_id, user_email, azione, dettagli)
                    )
                except Exception:
                    # user_id stale o non esistente → log senza FK
                    await cur.execute(
                        "INSERT INTO logs (user_id, user_email, azione, dettagli) VALUES (NULL, %s, %s, %s)",
                        (user_email, azione, dettagli)
                    )

    async def get_logs(self, limit=2000):
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute("""
                    SELECT * FROM logs ORDER BY timestamp DESC LIMIT %s
                """, (limit,))
                rows = await cur.fetchall()
                for r in rows:
                    if r["timestamp"]:
                        # ISO format so JS can sort/filter by date string
                        r["timestamp"] = r["timestamp"].strftime("%Y-%m-%d %H:%M:%S")
                return rows

    async def get_stock_item(self, magazzino_id: int, componente_id: int):
        """Legge la riga corrente di stock (utile per loggare i valori precedenti)."""
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(
                    "SELECT quantita, quantita_minima, is_scorta FROM magazzino_componenti "
                    "WHERE magazzino_id = %s AND componente_id = %s",
                    (magazzino_id, componente_id)
                )
                return await cur.fetchone()

    # ------------------------------------------------------------------ USERS

    async def get_user_by_email(self, email: str):
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute("SELECT * FROM users WHERE email = %s", (email,))
                return await cur.fetchone()

    async def get_user_by_id(self, user_id: int):
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute("SELECT id, email, ruolo, approvato, nome, cognome FROM users WHERE id = %s", (user_id,))
                return await cur.fetchone()

    async def get_all_users(self):
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute("SELECT id, email, ruolo, approvato, nome, cognome FROM users ORDER BY ruolo, email")
                return await cur.fetchall()

    async def get_users_by_ruolo(self, ruolo: str):
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(
                    "SELECT id, email, ruolo, approvato, nome, cognome FROM users WHERE ruolo = %s ORDER BY email",
                    (ruolo,)
                )
                return await cur.fetchall()

    async def get_pending_users(self):
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(
                    "SELECT id, email, ruolo, nome, cognome FROM users WHERE approvato = FALSE ORDER BY email"
                )
                return await cur.fetchall()

    async def create_user(self, email: str, hashed_password: bytes, ruolo: str, approvato: bool = True,
                          nome: str = None, cognome: str = None):
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "INSERT INTO users (email, password, ruolo, approvato, nome, cognome) VALUES (%s, %s, %s, %s, %s, %s)",
                    (email, hashed_password, ruolo, approvato, nome, cognome)
                )
                return cur.lastrowid

    async def approve_user(self, user_id: int, ruolo: str = None):
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                if ruolo:
                    await cur.execute(
                        "UPDATE users SET approvato = TRUE, ruolo = %s WHERE id = %s", (ruolo, user_id)
                    )
                else:
                    await cur.execute("UPDATE users SET approvato = TRUE WHERE id = %s", (user_id,))

    async def update_user_ruolo(self, user_id: int, ruolo: str):
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("UPDATE users SET ruolo = %s WHERE id = %s", (ruolo, user_id))

    async def reject_user(self, user_id: int):
        """Elimina un utente in attesa di approvazione."""
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("DELETE FROM users WHERE id = %s AND approvato = FALSE", (user_id,))

    async def update_user_password(self, user_id: int, hashed_password: bytes):
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "UPDATE users SET password = %s WHERE id = %s",
                    (hashed_password, user_id)
                )

    async def delete_user(self, user_id: int):
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("DELETE FROM users WHERE id = %s", (user_id,))

    async def create_reset_token(self, user_id: int) -> str:
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now() + timedelta(hours=24)
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                # Invalida eventuali token precedenti non ancora usati
                await cur.execute(
                    "UPDATE password_reset_tokens SET used = TRUE WHERE user_id = %s AND used = FALSE",
                    (user_id,)
                )
                await cur.execute(
                    "INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES (%s, %s, %s)",
                    (token, user_id, expires_at)
                )
        return token

    async def get_reset_token(self, token: str):
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute("""
                    SELECT prt.*, u.email FROM password_reset_tokens prt
                    JOIN users u ON u.id = prt.user_id
                    WHERE prt.token = %s AND prt.used = FALSE AND prt.expires_at > NOW()
                """, (token,))
                return await cur.fetchone()

    async def consume_reset_token(self, token: str, new_hashed_password: bytes) -> bool:
        token_data = await self.get_reset_token(token)
        if not token_data:
            return False
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "UPDATE password_reset_tokens SET used = TRUE WHERE token = %s", (token,)
                )
                await cur.execute(
                    "UPDATE users SET password = %s WHERE id = %s",
                    (new_hashed_password, token_data["user_id"])
                )
        return True

    # --------------------------------------------------------------- MAGAZZINI

    async def get_all_magazzini(self):
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute("SELECT * FROM magazzini ORDER BY nome")
                return await cur.fetchall()

    async def get_magazzino(self, magazzino_id: int):
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute("SELECT * FROM magazzini WHERE id = %s", (magazzino_id,))
                return await cur.fetchone()

    async def create_magazzino(self, nome: str, descrizione: str, ambiente: str, sezione: str, cassetto: str):
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "INSERT INTO magazzini (nome, descrizione, ambiente, sezione, cassetto) VALUES (%s, %s, %s, %s, %s)",
                    (nome, descrizione, ambiente, sezione, cassetto)
                )
                return cur.lastrowid

    async def update_magazzino(self, magazzino_id: int, nome: str, descrizione: str, ambiente: str, sezione: str, cassetto: str):
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "UPDATE magazzini SET nome=%s, descrizione=%s, ambiente=%s, sezione=%s, cassetto=%s WHERE id=%s",
                    (nome, descrizione, ambiente, sezione, cassetto, magazzino_id)
                )

    async def delete_magazzino(self, magazzino_id: int):
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("DELETE FROM magazzini WHERE id = %s", (magazzino_id,))

    # ----------------------------------------- STOCK (magazzino x componente)

    async def get_stock_magazzino(self, magazzino_id: int):
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute("""
                    SELECT c.id, c.nome, c.descrizione, c.famiglia, c.tipo, c.ambito, c.sottotipo,
                           c.unita_misura, mc.quantita, mc.quantita_minima, mc.is_scorta
                    FROM magazzino_componenti mc
                    JOIN componenti c ON c.id = mc.componente_id
                    WHERE mc.magazzino_id = %s
                    ORDER BY c.nome
                """, (magazzino_id,))
                return await cur.fetchall()

    async def get_stock_componente(self, componente_id: int):
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute("""
                    SELECT m.id, m.nome, m.ambiente, m.sezione, m.cassetto,
                           mc.quantita, mc.quantita_minima, mc.is_scorta
                    FROM magazzino_componenti mc
                    JOIN magazzini m ON m.id = mc.magazzino_id
                    WHERE mc.componente_id = %s
                    ORDER BY m.nome
                """, (componente_id,))
                return await cur.fetchall()

    async def set_stock(self, magazzino_id: int, componente_id: int, quantita: int, quantita_minima: int = 0, is_scorta: bool = False):
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    INSERT INTO magazzino_componenti (magazzino_id, componente_id, quantita, quantita_minima, is_scorta)
                    VALUES (%s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE quantita = %s, quantita_minima = %s, is_scorta = %s
                """, (magazzino_id, componente_id, quantita, quantita_minima, is_scorta,
                      quantita, quantita_minima, is_scorta))

    async def remove_from_magazzino(self, magazzino_id: int, componente_id: int):
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "DELETE FROM magazzino_componenti WHERE magazzino_id=%s AND componente_id=%s",
                    (magazzino_id, componente_id)
                )

    # ------------------------------------------------------------- COMPONENTI

    async def get_all_componenti(self):
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute("SELECT * FROM componenti ORDER BY nome")
                return await cur.fetchall()

    async def get_componente(self, componente_id: int):
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute("SELECT * FROM componenti WHERE id = %s", (componente_id,))
                return await cur.fetchone()

    async def create_componente(self, nome: str, descrizione: str, famiglia: str, tipo: str,
                                 ambito: str, sottotipo: str, unita_misura: str, datasheet_url: str):
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """INSERT INTO componenti
                       (nome, descrizione, famiglia, tipo, ambito, sottotipo, unita_misura, datasheet_url)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                    (nome, descrizione, famiglia, tipo, ambito, sottotipo, unita_misura, datasheet_url)
                )
                return cur.lastrowid

    async def update_componente(self, componente_id: int, nome: str, descrizione: str,
                                 famiglia: str, tipo: str, ambito: str, sottotipo: str,
                                 unita_misura: str, datasheet_url: str):
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """UPDATE componenti SET nome=%s, descrizione=%s, famiglia=%s, tipo=%s,
                       ambito=%s, sottotipo=%s, unita_misura=%s, datasheet_url=%s WHERE id=%s""",
                    (nome, descrizione, famiglia, tipo, ambito, sottotipo, unita_misura, datasheet_url, componente_id)
                )

    async def delete_componente(self, componente_id: int):
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("DELETE FROM componenti WHERE id = %s", (componente_id,))

    # ------------------------------------------------------------------- TAGS

    async def get_all_tags(self):
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute("""
                    SELECT t.*, u.email AS created_by_email
                    FROM tags t
                    LEFT JOIN users u ON u.id = t.created_by
                    ORDER BY t.nome
                """)
                return await cur.fetchall()

    async def get_tag(self, tag_id: int):
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute("SELECT * FROM tags WHERE id = %s", (tag_id,))
                return await cur.fetchone()

    async def create_tag(self, nome: str, colore: str, created_by: int):
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "INSERT INTO tags (nome, colore, created_by) VALUES (%s, %s, %s)",
                    (nome, colore, created_by)
                )
                return cur.lastrowid

    async def update_tag(self, tag_id: int, nome: str, colore: str):
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "UPDATE tags SET nome=%s, colore=%s WHERE id=%s",
                    (nome, colore, tag_id)
                )

    async def delete_tag(self, tag_id: int):
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("DELETE FROM tags WHERE id = %s", (tag_id,))

    async def get_tags_componente(self, componente_id: int):
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute("""
                    SELECT t.id, t.nome, t.colore
                    FROM componente_tags ct
                    JOIN tags t ON t.id = ct.tag_id
                    WHERE ct.componente_id = %s
                    ORDER BY t.nome
                """, (componente_id,))
                return await cur.fetchall()

    async def add_tag_to_componente(self, componente_id: int, tag_id: int):
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    INSERT IGNORE INTO componente_tags (componente_id, tag_id) VALUES (%s, %s)
                """, (componente_id, tag_id))

    async def remove_tag_from_componente(self, componente_id: int, tag_id: int):
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "DELETE FROM componente_tags WHERE componente_id=%s AND tag_id=%s",
                    (componente_id, tag_id)
                )

    # ------------------------------------------------------- RICERCA

    async def search_componenti(self, q="", famiglia="", tipo="", ambito="", sottotipo="", tag_id=None):
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                conditions = []
                params = []

                if q:
                    conditions.append("(c.nome LIKE %s OR c.descrizione LIKE %s)")
                    params += [f"%{q}%", f"%{q}%"]
                if famiglia:
                    conditions.append("c.famiglia LIKE %s")
                    params.append(f"%{famiglia}%")
                if tipo:
                    conditions.append("c.tipo LIKE %s")
                    params.append(f"%{tipo}%")
                if ambito:
                    conditions.append("c.ambito LIKE %s")
                    params.append(f"%{ambito}%")
                if sottotipo:
                    conditions.append("c.sottotipo LIKE %s")
                    params.append(f"%{sottotipo}%")

                where = ""
                if tag_id:
                    join = "JOIN componente_tags ct ON ct.componente_id = c.id AND ct.tag_id = %s"
                    params_pre = [int(tag_id)] + params
                    where = "WHERE " + " AND ".join(conditions) if conditions else ""
                    sql = f"SELECT DISTINCT c.* FROM componenti c {join} {where} ORDER BY c.nome"
                    await cur.execute(sql, params_pre)
                else:
                    where = "WHERE " + " AND ".join(conditions) if conditions else ""
                    sql = f"SELECT * FROM componenti c {where} ORDER BY c.nome"
                    await cur.execute(sql, params)

                return await cur.fetchall()

    # -------------------------------------------- LISTA ACQUISTI

    async def get_lista_acquisti(self):
        """Componenti la cui quantità totale è sotto la quantità minima in almeno un magazzino."""
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute("""
                    SELECT c.id AS componente_id, c.nome, c.famiglia, c.tipo, c.unita_misura,
                           m.id AS magazzino_id, m.nome AS magazzino_nome, m.ambiente, m.sezione, m.cassetto,
                           mc.quantita, mc.quantita_minima, mc.is_scorta,
                           (mc.quantita_minima - mc.quantita) AS da_acquistare
                    FROM magazzino_componenti mc
                    JOIN componenti c ON c.id = mc.componente_id
                    JOIN magazzini m ON m.id = mc.magazzino_id
                    WHERE mc.quantita < mc.quantita_minima
                    ORDER BY c.nome, m.nome
                """)
                return await cur.fetchall()

    # ------------------------------------------------------------- ESPERIENZE

    async def get_all_esperienze(self):
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute("""
                    SELECT e.*, u.email AS docente_email
                    FROM esperienze e
                    LEFT JOIN users u ON u.id = e.docente_id
                    ORDER BY e.nome
                """)
                rows = await cur.fetchall()
                for r in rows:
                    if r["data_creazione"]:
                        r["data_creazione"] = r["data_creazione"].strftime("%d/%m/%Y %H:%M")
                return rows

    async def get_esperienza(self, esperienza_id: int):
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute("""
                    SELECT e.*, u.email AS docente_email
                    FROM esperienze e
                    LEFT JOIN users u ON u.id = e.docente_id
                    WHERE e.id = %s
                """, (esperienza_id,))
                row = await cur.fetchone()
                if row and row["data_creazione"]:
                    row["data_creazione"] = row["data_creazione"].strftime("%d/%m/%Y %H:%M")
                return row

    async def create_esperienza(self, nome: str, descrizione: str, docente_id: int):
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "INSERT INTO esperienze (nome, descrizione, docente_id) VALUES (%s, %s, %s)",
                    (nome, descrizione, docente_id)
                )
                return cur.lastrowid

    async def update_esperienza(self, esperienza_id: int, nome: str, descrizione: str):
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "UPDATE esperienze SET nome=%s, descrizione=%s WHERE id=%s",
                    (nome, descrizione, esperienza_id)
                )

    async def delete_esperienza(self, esperienza_id: int):
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("DELETE FROM esperienze WHERE id = %s", (esperienza_id,))

    async def get_componenti_esperienza(self, esperienza_id: int):
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute("""
                    SELECT c.id, c.nome, c.famiglia, c.tipo, c.unita_misura,
                           ec.quantita_necessaria, ec.consumabile
                    FROM esperienza_componenti ec
                    JOIN componenti c ON c.id = ec.componente_id
                    WHERE ec.esperienza_id = %s
                    ORDER BY c.nome
                """, (esperienza_id,))
                return await cur.fetchall()

    async def add_componente_esperienza(self, esperienza_id: int, componente_id: int, quantita_necessaria: int, consumabile: bool = False):
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    INSERT INTO esperienza_componenti (esperienza_id, componente_id, quantita_necessaria, consumabile)
                    VALUES (%s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE quantita_necessaria = %s, consumabile = %s
                """, (esperienza_id, componente_id, quantita_necessaria, consumabile, quantita_necessaria, consumabile))

    async def remove_componente_esperienza(self, esperienza_id: int, componente_id: int):
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "DELETE FROM esperienza_componenti WHERE esperienza_id=%s AND componente_id=%s",
                    (esperienza_id, componente_id)
                )

    async def get_esperienze_componente(self, componente_id: int):
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute("""
                    SELECT e.id, e.nome, e.descrizione
                    FROM esperienza_componenti ec
                    JOIN esperienze e ON e.id = ec.esperienza_id
                    WHERE ec.componente_id = %s
                    ORDER BY e.nome
                """, (componente_id,))
                return await cur.fetchall()

    async def check_disponibilita_esperienza(self, esperienza_id: int):
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute("""
                    SELECT c.id, c.nome, c.unita_misura,
                           ec.quantita_necessaria,
                           COALESCE(SUM(mc.quantita), 0) AS quantita_disponibile
                    FROM esperienza_componenti ec
                    JOIN componenti c ON c.id = ec.componente_id
                    LEFT JOIN magazzino_componenti mc ON mc.componente_id = ec.componente_id
                    WHERE ec.esperienza_id = %s
                    GROUP BY c.id, c.nome, c.unita_misura, ec.quantita_necessaria
                    ORDER BY c.nome
                """, (esperienza_id,))
                rows = await cur.fetchall()
                for r in rows:
                    r["quantita_disponibile"] = int(r["quantita_disponibile"])
                    r["disponibile"] = r["quantita_disponibile"] >= r["quantita_necessaria"]
                return rows
