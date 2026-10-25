# BINGE Kostenlos Veröffentlichen

Geprüft am 25.10.2026. Diese Anleitung ist für eine kleine Portfolio-Demo, nicht für einen kommerziellen Betrieb mit garantierter Verfügbarkeit. Es wurde noch kein öffentliches Deployment angelegt.

## Aufbau

Die vorbereitete `render.yaml` erstellt einen **Free Web Service** für Frontend und Backend sowie eine **Free Key Value**-Instanz für die Rate Limits. MongoDB läuft separat in einem **Atlas Free/M0**-Cluster. Eine eigene Domain ist nicht erforderlich: Render vergibt eine HTTPS-Adresse unter `onrender.com`.

Frontend und API werden aus demselben Node-Prozess ausgeliefert. Dadurch funktionieren Session-Cookies ohne zusätzliche Cross-Domain-Konfiguration. MongoDB speichert die Daten dauerhaft; Redis speichert nur Rate-Limit-Zähler.

## 1. Vor Dem Hochladen

Erneuere das früher in der Beispiel-Konfiguration enthaltene MongoDB-Passwort und die TMDB-/OMDb-Schlüssel, falls noch nicht erledigt. Ein Entfernen aus dem aktuellen Code widerruft alte Schlüssel nicht. Keine `.env`, echten Zugangsdaten oder persönlichen Datenbank-Backups hochladen.

Prüfe lokal:

```sh
npm ci --legacy-peer-deps
npm run check:api
npm run lint
npm run typecheck
npm test
npm run test:integration
```

`test:integration` baut die Anwendung und verwendet standardmäßig eine neue lokale MongoDB-Testinstanz. Beim ersten Lauf wird die offizielle MongoDB-Binärdatei heruntergeladen. Die bestehende `.env`-Datenbank wird nicht verwendet. Für einen eigenen Testserver kann ausdrücklich `TEST_MONGODB_URI` gesetzt werden.

Lade anschließend den geprüften Stand in dein GitHub-Repository. Ein privates Repository ist möglich, wenn du Render gezielt Zugriff darauf gewährst. Das Repository muss für Bewerber nicht öffentlich werden; du kannst Unternehmen bei Bedarf separat Zugriff geben.

## 2. Kostenlose Demo-Datenbank

Erstelle in MongoDB Atlas ein eigenes Portfolio-Projekt mit einem **Free/M0**-Cluster. Keinen Flex- oder kostenpflichtigen Cluster auswählen. Wähle möglichst dieselbe Region wie in `render.yaml`, derzeit Frankfurt.

Lege einen neuen Datenbankbenutzer an, der nur `readWrite` auf `binge_portfolio` besitzt. Verwende nicht die Zugangsdaten deiner privaten Entwicklungsdatenbank. Die Registrierung von Anwendungsnutzern bleibt im Portfolio-Deployment deaktiviert.

Kopiere die Verbindungszeichenfolge aus Atlas. Sie gehört später ausschließlich in das geheime Render-Environment-Feld `MONGODB_URI`. Sonderzeichen im Passwort müssen in der URI korrekt URL-codiert sein.

## 3. Render Einrichten

Erstelle ein Render-Konto und wähle **New → Blueprint**. Verbinde das gewünschte GitHub-Repository und den Branch mit der geprüften Version. Render liest die Datei `render.yaml`.

Kontrolliere vor dem Bestätigen ausdrücklich beide Pläne: **Free** für `binge-portfolio` und **Free** für `binge-portfolio-limits`. Aktiviere keine kostenpflichtigen Upgrades oder kostenpflichtigen Datenbanken. Bei Zahlungs- oder Verifizierungsaufforderungen zuerst die angezeigten Bedingungen prüfen; die Datei selbst schließt keine zahlungspflichtigen Verträge ab.

Trage die abgefragten Secrets ein:

| Variable       | Inhalt                                                |
| -------------- | ----------------------------------------------------- |
| `MONGODB_URI`  | Neue Atlas-Verbindung für die separate Demo-Datenbank |
| `TMDB_API_KEY` | Dein erneuerter TMDB-Schlüssel                        |

`REDIS_URL` wird automatisch mit der internen Key-Value-Verbindung verbunden. Die öffentliche API-Herkunft wird aus Renders `RENDER_EXTERNAL_URL` übernommen. Bei einer späteren eigenen Domain musst du die erlaubten HTTPS-Ursprünge ausdrücklich in `APP_ORIGINS` angeben.

Optional kannst du `OMDB_API_KEY` als weiteres Secret setzen. Ohne diesen Schlüssel funktioniert BINGE weiterhin; die zusätzlichen OMDb-Bewertungen fehlen dann.

Die Vorlage setzt bereits `SERVE_WEB=true`, `DEMO_ENABLED=true`, `REGISTRATION_ENABLED=false` und `RUN_MIGRATIONS=true`. Beim Start werden die benötigten Indizes einschließlich Demo-TTL und Staffel-Eindeutigkeit vorbereitet. Es werden dabei keine Bewertungen gelöscht. Ein Datenbank- oder Indexfehler stoppt den Produktionsstart.

Demo-Starts sind zusätzlich pro IP und insgesamt pro Tag begrenzt. Die Vorgaben lassen sich über `DEMO_RATE_LIMIT` und `DEMO_DAILY_LIMIT` anpassen; sie dienen auch dazu, die kleine Demo-Datenbank nicht durch unbegrenzte neue Sitzungen zu füllen.

## 4. Datenbank-Netzwerk Freigeben

Öffne beim Render-Webservice **Connect → Outbound** und kopiere die dort aufgeführten ausgehenden IP-Bereiche. Füge genau diese unter **Atlas → Network Access** hinzu. Nicht pauschal das gesamte Internet über `0.0.0.0/0` freigeben.

Der erste Deploy kann vorher an der Datenbankverbindung scheitern. Nach dem Eintragen der IP-Bereiche erneut deployen. Verwende die aktuellen Bereiche aus deinem Dashboard, keine kopierten alten IP-Adressen.

## 5. Link Prüfen Und Verschicken

Nach einem erfolgreichen Deploy zeigt Render die tatsächliche Adresse an, beispielsweise `https://DEIN-SERVICE.onrender.com`. Der Platzhalter hier ist kein bereits veröffentlichter Link.

Teste in einem privaten Browserfenster:

1. Homepage und `/demo` öffnen.
2. Auf **Demo starten** klicken, ohne E-Mail oder Passwort.
3. Eine Bewertung ändern und die Seite neu laden.
4. In einem zweiten privaten Browserprofil eine weitere Demo starten: Änderungen dürfen dort nicht auftauchen.
5. Bei Breaking Bad den nächsten ungesehenen Teil prüfen und eine Folge markieren.
6. Mobile Ansicht, Suche, Watchlist, Bewertungen, TasteDNA und Credits kontrollieren.
7. `/ready` muss HTTP 200 und `{"ready":true}` zurückgeben. Die Admin-Funktionen dürfen für Demo-Besucher nicht zugänglich sein.

In die Bewerbung gehört anschließend **die echte Render-Adresse mit `/demo`**, ergänzt um den Repository-Link, falls du den Code zeigen möchtest. Dein Rechner muss dafür nicht eingeschaltet bleiben.

## Kostenlos Heißt Hier

- Render Free schläft nach 15 Minuten ohne Anfragen ein; der nächste Aufruf kann ungefähr eine Minute benötigen. Das ist eine Tarifgrenze, kein Ladefehler der Anwendung. Keine künstlichen Dauer-Pings zur Umgehung einrichten.
- Free-Instanzen haben Nutzungsgrenzen und keine Produktions-Verfügbarkeitsgarantie. Bei hinterlegten Zahlungsdaten können zusätzliche Nutzungsgebühren relevant werden: Limits/Billing prüfen und nicht stillschweigend auf bezahlte Pläne wechseln.
- Der Atlas-Free-Cluster ist auf 512 MB einschließlich Indizes begrenzt. Die Demo-Sitzung endet standardmäßig nach 24 Stunden. MongoDB entfernt abgelaufene Demo-Dokumente anschließend über TTL-Indizes; das erfolgt nicht sekundengenau.
- Das kostenlose Render Key Value speichert nur flüchtig. Ein Neustart kann Rate-Limit-Zähler zurücksetzen; Bewertungen und Sessions liegen weiterhin in MongoDB.
- Prüfe vor einer späteren kommerziellen Nutzung insbesondere die aktuellen TMDB-/OMDb-Bedingungen sowie Datenschutz, Kontoverwaltung, Backups und Lastverhalten.

## Quellen

- [Render Free: Grenzen, Ruhemodus und Abrechnung](https://render.com/docs/free)
- [Render: Node/Express veröffentlichen](https://render.com/docs/deploy-node-express-app)
- [Render Blueprint-Spezifikation](https://render.com/docs/blueprint-spec)
- [Render: Standard-Umgebungsvariablen](https://render.com/docs/environment-variables)
- [Render mit MongoDB Atlas verbinden](https://render.com/docs/connect-to-mongodb-atlas)
- [Aktuelle ausgehende IP-Bereiche ermitteln](https://render.com/docs/outbound-ip-addresses)
- [MongoDB Atlas Free einrichten](https://www.mongodb.com/docs/atlas/tutorial/deploy-free-tier-cluster/)
- [Atlas-Free-Grenzen](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/)
