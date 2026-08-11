# CygnetCI — Native Ubuntu Deployment (no Docker / no Kubernetes)

Deploy the **API** as a **systemd service** and the **Next.js UI** as **static files on
nginx**, using embedded bundles you build on your laptop.

| Component | Built as | Runs as |
|-----------|----------|---------|
| API (FastAPI) | `dist-linux/` — embedded standalone Python + deps + code | `systemd` service on `127.0.0.1:8000` |
| Web (Next.js) | `out/` — static export | files served by `nginx` |
| Database | PostgreSQL 15 | native `postgresql` service |

Files used from this repo: [build_linux_bundle.sh](CygnetCI.Api/build_linux_bundle.sh),
[seed_fresh_db.py](CygnetCI.Api/seed_fresh_db.py),
[deploy/cygnetci-api.service](deploy/cygnetci-api.service),
[deploy/cygnetci.nginx.conf](deploy/cygnetci.nginx.conf).

> **Hostnames:** the UI and API share paths (`/users`, `/agents`, …), so they must be on
> **separate hostnames** — e.g. `cygnetci.example.com` (UI) and
> `api.cygnetci.example.com` (API). Adjust to your domain throughout.

---

## Part 1 — Build the embedded bundles on your laptop

### 1A. API Linux bundle (via WSL — Linux binaries can't be built by Windows tooling)

One-time: install WSL Ubuntu on Windows (PowerShell as admin):
```powershell
wsl --install -d Ubuntu
```

Then, inside the **Ubuntu (WSL)** shell — build on the Linux filesystem (not `/mnt`, to
avoid permission/exec issues):
```bash
# copy the API source into WSL, then build
cp -r /mnt/d/Avesh/CygnetCI/SourceCode/CygnetCI/CygnetCI.Api ~/api-build
cd ~/api-build

# Edit PBS_TAG / PYVER to a real release from
# https://github.com/astral-sh/python-build-standalone/releases  (use the amd64 gnu build)
bash build_linux_bundle.sh
```
Result: `~/api-build/dist-linux/` — a self-contained folder (`python/`, all `.py`, deps).

> **Simplest alternative:** skip WSL and run `build_linux_bundle.sh` **directly on the
> Ubuntu server** instead. Same result; no cross-machine copy of the bundle needed.

### 1B. Next.js static site (native on Windows — no Linux needed)

Point the UI at the API URL, then build:
```powershell
cd CygnetCI.Web\cygnetci-web
# edit public\system.config.js -> api.baseUrl = 'https://api.cygnetci.example.com'
npm ci
npm run build          # produces .\out
```
(You can also edit `out\system.config.js` after the build instead of before.)

---

## Part 2 — Prepare the Ubuntu server

```bash
sudo apt update
sudo apt install -y nginx postgresql

# dedicated service user + app dir
sudo useradd --system --home /opt/cygnetci --shell /usr/sbin/nologin cygnetci
sudo mkdir -p /opt/cygnetci

# PostgreSQL: role + FRESH database (name is case-sensitive -> keep the quotes)
sudo -u postgres psql -c "CREATE ROLE cygnetci LOGIN PASSWORD 'Cygnet_Srv_2026';"
sudo -u postgres psql -c "CREATE DATABASE \"CygnetCI\" OWNER cygnetci;"
```

---

## Part 3 — Deploy the API as a systemd service

**Copy the bundle + deploy files to the server** (from the laptop/WSL):
```bash
# from WSL:
rsync -a ~/api-build/dist-linux/  cyguser@SERVER:/tmp/dist-linux/
scp -r /mnt/d/Avesh/CygnetCI/SourceCode/CygnetCI/deploy  cyguser@SERVER:/tmp/deploy
# on the server:
sudo mv /tmp/dist-linux /opt/cygnetci/api
```

**Create the runtime config** `/opt/cygnetci/api/config.ini` (server values):
```ini
[database]
host = localhost
port = 5432
database = CygnetCI
username = cygnetci
password = Cygnet_Srv_2026        ; NOTE: double any literal '%' as '%%'

[paths]
nfs_shared_root = /opt/cygnetci/shared
scripts_folder = scripts
artifacts_folder = artifacts
rollback_scripts_folder = rollback

[server]
host = 127.0.0.1
port = 8000
reload = false
debug = false

[cors]
allowed_origins = https://cygnetci.example.com
allow_credentials = true

[file_transfer]
max_file_size_mb = 5000
allowed_script_extensions = .sh,.ps1,.py,.bat,.cmd
allowed_artifact_extensions = .zip,.tar,.gz,.jar,.war,.exe,.msi
calculate_checksum = true

[claude_ai]
api_url = https://api.anthropic.com/v1/messages
api_key = YOUR_ANTHROPIC_API_KEY
model = claude-3-5-sonnet-20241022
max_tokens = 4096
temperature = 0
```

**Ownership + shared dirs:**
```bash
sudo mkdir -p /opt/cygnetci/shared
sudo chown -R cygnetci:cygnetci /opt/cygnetci
```

**Create the schema + seed the fresh DB** (the seeder builds the tables via `create_all`
and inserts roles / default customer / environments / admin user):
```bash
cd /opt/cygnetci/api
sudo -u cygnetci ADMIN_PASSWORD='ChangeMeAdmin123' ./python/bin/python seed_fresh_db.py
# -> [+] Created role ...  [SUCCESS] Fresh database seeded.
```

**Install & start the service:**
```bash
sudo nano /tmp/deploy/cygnetci-api.service    # set a strong EMAIL_ENCRYPTION_KEY
sudo cp /tmp/deploy/cygnetci-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cygnetci-api
systemctl status cygnetci-api
journalctl -u cygnetci-api -f          # watch logs

# quick check
curl http://127.0.0.1:8000/monitoring/api/ping     # -> ok
```

---

## Part 4 — Deploy the Web UI on nginx

**Copy the static export:**
```bash
# from laptop (PowerShell): scp -r .\out\* cyguser@SERVER:/tmp/web/
sudo mkdir -p /var/www/cygnetci
sudo cp -r /tmp/web/* /var/www/cygnetci/
sudo chown -R www-data:www-data /var/www/cygnetci
```

**Install the nginx site** (edit the two `server_name`s first):
```bash
sudo nano /tmp/deploy/cygnetci.nginx.conf      # set your server_name hostnames
sudo cp /tmp/deploy/cygnetci.nginx.conf /etc/nginx/sites-available/cygnetci
sudo ln -s /etc/nginx/sites-available/cygnetci /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

---

## Part 5 — TLS (recommended)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d cygnetci.example.com -d api.cygnetci.example.com
```
certbot rewrites the nginx config for HTTPS and sets up auto-renewal. Make sure your
`system.config.js` `baseUrl` uses `https://`.

---

## Part 6 — Verify & log in

```bash
curl -k https://api.cygnetci.example.com/monitoring/api/ping     # -> ok
```
Open `https://cygnetci.example.com` and log in with `admin` / the `ADMIN_PASSWORD` you set.

---

## Updating later

- **API:** rebuild `dist-linux/` (Part 1A), `rsync` it over `/opt/cygnetci/api`
  (keep your `config.ini`), then `sudo systemctl restart cygnetci-api`.
  If models changed, re-run `seed_fresh_db.py` (idempotent) — it also runs `create_all`
  to add any new tables. (`create_all` does **not** alter existing columns; for column
  changes apply the matching migration script from `CygnetCI.Database/`.)
- **Web:** rebuild `out/`, copy over `/var/www/cygnetci`, no reload needed (static).
  Repoint the API anytime by editing `/var/www/cygnetci/system.config.js`.

## Notes

- **IP allowlisting behind nginx:** the API sees `127.0.0.1` as the client IP unless it
  honors `X-Forwarded-For`. nginx already sends that header (see the site config); if you
  use per-customer IP restrictions, confirm the API reads the forwarded IP.
- **Firewall:** expose only 80/443 publicly (`ufw allow 'Nginx Full'`). The API
  (`8000`) and PostgreSQL (`5432`) stay on localhost.
- **Workers:** the unit runs `uvicorn --workers 2`. Increase for more CPU; because the
  service writes to the shared `nfs_shared_root`, keep that path on a real disk the
  `cygnetci` user owns.
- **Rotate** `EMAIL_ENCRYPTION_KEY`, the DB password, and the admin password from the
  sample values before going live.
