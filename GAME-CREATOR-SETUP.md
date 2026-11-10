# GAME ENGINE – KI Game Creator Worker

Der Admin-Game-Creator benötigt einen kleinen Cloudflare Worker als sicheren KI-Proxy. Der Gemini-Schlüssel gehört **nur** in Worker-Secrets und niemals in index.html.

## Einrichten
1. In Cloudflare einen Worker erstellen und den Inhalt aus `worker.js` einfügen.
2. Unter Worker → Settings → Variables and Secrets diese Secrets anlegen:
   - `GEMINI_API_KEY`: dein Gemini API-Schlüssel
   - `ADMIN_SECRET`: ein eigenes langes Admin-Geheimnis (nicht das Website-Passwort verwenden)
3. Optional als Variable `GEMINI_MODEL` den gewünschten Gemini-Modellnamen setzen. Standard ist `gemini-2.5-flash`.
4. Worker deployen und seine URL kopieren.
5. In GAME ENGINE im Adminbereich die Worker-URL und das Admin-Geheimnis in den Game-Creator-Einstellungen eintragen.

## Autopilot
Autopilot erstellt höchstens ein neues Spiel pro 24 Stunden, solange der Adminbereich in einem geöffneten Browser-Tab läuft. Der Browser muss geöffnet bleiben. Der Bot veröffentlicht nur nach erfolgreicher HTML-Prüfung. Die KI-Ausgabe wird als HTML im Firestore-Dokument `games` gespeichert.

## Hinweis
Der bestehende Admin-Passwort-Check der Website ist clientseitig und allein keine sichere Autorisierung. Der Worker schützt die kostenpflichtige KI-Anfrage zusätzlich mit `ADMIN_SECRET`. Für eine öffentliche Produktionsseite sollten Admin-Rollen außerdem serverseitig über Firebase Authentication/Firestore Rules geprüft werden.
