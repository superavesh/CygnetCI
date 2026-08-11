# CygnetCI — Kubernetes Deployment Guide (FastAPI + Next.js + Fresh DB)

This guide deploys the **API** (FastAPI), the **Web UI** (Next.js static export),
and a **fresh PostgreSQL** database to Kubernetes, and seeds the reference data the
app needs to work.

All referenced files live in this repo:

| File | Purpose |
|------|---------|
| `CygnetCI.Api/Dockerfile` | API container image |
| `CygnetCI.Api/seed_fresh_db.py` | **Seeder** for a fresh DB (roles, customer, admin, environments) |
| `CygnetCI.Web/cygnetci-web/Dockerfile` + `nginx.conf` | Web container image (nginx serving the static export) |
| `k8s/00..05-*.yaml` | Kubernetes manifests |

---

## 0. How the pieces fit

- **Database schema is created automatically.** On startup the API calls
  `Base.metadata.create_all()` ([main.py](CygnetCI.Api/main.py#L29)), which creates
  **all 40+ tables** from the SQLAlchemy models. You do **not** need to run the SQL
  files in `CygnetCI.Database/` against a fresh DB.
- **Seed data is NOT automatic.** A fresh DB has empty tables. The app needs a small
  amount of reference data before you can log in and use it — see Part A.
- **The Web UI is a static export** (`output: 'export'`). It's served by nginx, and
  the API URL is injected at runtime via `system.config.js` (a ConfigMap) — so you can
  repoint the API without rebuilding the image.

---

## Part A — Database schema & the seeder tables (the important part)

### Which tables need seed data?

After the tables are auto-created, only these need to be **seeded** for the app to work:

| Table | Why it's required | Seeded value |
|-------|-------------------|--------------|
| `roles` | RBAC / "assign role" won't work without at least one role | Administrator (full), Developer, Viewer |
| `customers` | Agents and users are scoped to a customer/tenant | one `default` customer |
| `environments` | Releases require target environments | Development, QA, Staging, Production |
| `users` | You need an account to log in | one `admin` superuser (bcrypt) |
| `user_roles` | Links the admin to the Administrator role | admin → Administrator |
| `user_customers` | Gives the admin access to the default customer | admin → default (is_default) |

**Not required** (these are demo rows in `CygnetCI.Database/db_schema.sql` — skip them for
a fresh install): sample `agents`, `pipelines`, `tasks`, `services`, `statistics`, and the
sample pipeline in `update_pipline_schema.sql`.

All of the above is handled by **[`seed_fresh_db.py`](CygnetCI.Api/seed_fresh_db.py)**,
which is idempotent (safe to re-run). You run it as a Kubernetes Job in Part D.

### (Optional) If you'd rather dump the schema from the existing DB

You don't need this — `create_all` builds the schema — but if you want a SQL snapshot:

```bash
pg_dump --schema-only --no-owner --no-privileges \
  -h 103.158.108.15 -p 7432 -U CygGSPDBA -d CygnetCI > cygnetci_schema.sql
```

To also capture just the reference/seed rows (not the operational data):

```bash
pg_dump --data-only --no-owner \
  -t roles -t environments \
  -h 103.158.108.15 -p 7432 -U CygGSPDBA -d CygnetCI > cygnetci_seed.sql
```

---

## Part B — Build & push the Docker images

Replace `REGISTRY` with your registry (Docker Hub, GHCR, ACR, ECR, GCR…).

```bash
# API
cd CygnetCI.Api
docker build -t REGISTRY/cygnetci-api:latest .
docker push REGISTRY/cygnetci-api:latest

# Web
cd ../CygnetCI.Web/cygnetci-web
docker build -t REGISTRY/cygnetci-web:latest .
docker push REGISTRY/cygnetci-web:latest
```

> The API image does **not** contain `config.ini` (credentials stay out of the image);
> it's mounted from a Secret at runtime. The Web image serves the static export and reads
> `system.config.js` from a mounted ConfigMap.

---

## Part C — Configure the manifests

Edit the placeholders in `k8s/`:

1. **`01-postgres.yaml`** — set `POSTGRES_PASSWORD` (keep it alphanumeric/underscore).
   Set `storageClassName` if your cluster needs it.
2. **`02-api.yaml`** —
   - In the `config.ini` Secret: set `password` to match the DB password, set
     `[cors] allowed_origins` to your Web URL, and set the Claude `api_key` (or leave the
     placeholder if you don't use AI rollback analysis).
   - Set `image: REGISTRY/cygnetci-api:latest`.
   - In `cygnetci-api-secrets`: set `EMAIL_ENCRYPTION_KEY` and `ADMIN_PASSWORD`.
   - `> ` **configparser note:** any literal `%` in the DB password must be doubled (`%%`).
3. **`03-seed-job.yaml`** — set `image: REGISTRY/cygnetci-api:latest`.
4. **`04-web.yaml`** — set `image: REGISTRY/cygnetci-web:latest` and the `baseUrl` in the
   ConfigMap to the **public API URL** (e.g. `https://api.cygnetci.example.com`).
5. **`05-ingress.yaml`** — set your hostnames and TLS.

---

## Part D — Deploy

Apply in order:

```bash
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/01-postgres.yaml
# wait for postgres to be Ready
kubectl -n cygnetci rollout status statefulset/cygnetci-postgres

kubectl apply -f k8s/02-api.yaml
kubectl -n cygnetci rollout status deployment/cygnetci-api   # API creates the tables here

# Seed the fresh DB (roles, default customer, environments, admin user)
kubectl apply -f k8s/03-seed-job.yaml
kubectl -n cygnetci wait --for=condition=complete job/cygnetci-seed --timeout=120s
kubectl -n cygnetci logs job/cygnetci-seed          # should show [+] Created ... [SUCCESS]

kubectl apply -f k8s/04-web.yaml
kubectl apply -f k8s/05-ingress.yaml
```

> Alternative to the seed Job — run it manually inside the API pod:
> ```bash
> kubectl -n cygnetci exec deploy/cygnetci-api -- python seed_fresh_db.py
> ```

---

## Part E — DNS, verify & log in

1. Point your DNS records (`cygnetci.example.com`, `api.cygnetci.example.com`) at the
   ingress controller's external IP.
2. Verify:
   ```bash
   kubectl -n cygnetci get pods,svc,ingress
   curl -k https://api.cygnetci.example.com/monitoring/api/ping     # -> ok
   ```
3. Open `https://cygnetci.example.com` and log in with the admin credentials you set in
   `ADMIN_PASSWORD` (default username `admin`).

---

## Post-deployment notes

- **Agents** (`.NET`) point their `appsettings.json` `ApiUrl` at
  `https://api.cygnetci.example.com`. Communication stays outbound-only.
- **Scaling the API to >1 replica** requires the shared PVC (`cygnetci-shared`) to be
  **ReadWriteMany** (NFS / EFS / Azure Files / CephFS). With ReadWriteOnce, keep
  `replicas: 1`. The Web tier scales freely (it's stateless).
- **Ticket attachments** are written under the app's `uploads/` dir (ephemeral). If you
  use ticket attachments in production, add a volume mount for `/app/uploads` too.
- **Rotate secrets**: change `POSTGRES_PASSWORD`, `EMAIL_ENCRYPTION_KEY`, `ADMIN_PASSWORD`,
  and the Claude `api_key` from the defaults in this repo before going live.
- **Managed DB**: for production you can drop `01-postgres.yaml` and point the API's
  `config.ini` at a managed PostgreSQL 15 instance instead.
