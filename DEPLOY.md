# Deploy — Nyit Computer (new app) on the Contabo VPS

This deploys the **new** React/Node/Postgres app **alongside** the existing
Apache + MySQL sites, on its own port. It does **NOT** touch Apache, MySQL,
`nyit.one`, or the old `stock.nyit` system.

**Target box (confirmed by recon 2026-06-03):** Ubuntu 24.04, root login,
Apache on 80/443, MySQL on 3306. Node/Postgres **not** installed yet. Port 3000
is free.

**Architecture (single port):**
```
Internet ──> http://<VPS-IP>:3000 ──> Node/Fastify (serves the app + /api + /uploads)
                                          └─> PostgreSQL on localhost:5432
```
Apache (80/443) and MySQL (3306) keep running, separately and untouched.

---

## One-time setup (run as root on the VPS)

### 1. Install Node 20 LTS + pm2
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
node -v && npm -v          # expect v20.x
npm install -g pm2
```

### 2. Install PostgreSQL (coexists with MySQL on a different port)
```bash
apt-get install -y postgresql
systemctl enable --now postgresql
sudo -u postgres psql -c "SELECT version();"   # sanity check
```

### 3. Create the database + a dedicated DB user
Pick a strong DB password and use it consistently below (replace `CHANGE_DB_PASS`):
```bash
sudo -u postgres psql <<'SQL'
CREATE USER nyit WITH PASSWORD 'CHANGE_DB_PASS';
CREATE DATABASE nyit OWNER nyit;
GRANT ALL PRIVILEGES ON DATABASE nyit TO nyit;
SQL
```

### 4. Get the code
The repo is on GitHub and is **private**, so cloning needs a token.

**Option A — clone with a Personal Access Token (recommended):**
1. On GitHub (your PC): **Settings → Developer settings → Personal access tokens
   → Tokens (classic) → Generate new token**, tick the **`repo`** scope, copy it.
2. On the VPS (paste the token in place of `YOUR_TOKEN`):
```bash
mkdir -p /opt && cd /opt
git clone https://YOUR_TOKEN@github.com/ZwaneProgram/nyit-computer_managing.git nyit-app
cd nyit-app
```
> Using the token in the URL means `git pull` later just works with no prompts.

**Option B — make the repo public** (simpler, but the source becomes visible to
anyone; no secrets are in the repo since `.env` is gitignored). Then:
```bash
mkdir -p /opt && cd /opt
git clone https://github.com/ZwaneProgram/nyit-computer_managing.git nyit-app
cd nyit-app
```

### 5. Configure the backend `.env` (prod secrets)
Generate two long random secrets and write the env file:
```bash
cd /opt/nyit-app/server
JWT=$(openssl rand -hex 32)
COOKIE=$(openssl rand -hex 32)
cat > .env <<EOF
DATABASE_URL=postgres://nyit:CHANGE_DB_PASS@localhost:5432/nyit
JWT_SECRET=$JWT
COOKIE_SECRET=$COOKIE
PORT=3000
COOKIE_SECURE=false
# AI features — optional
GEMINI_API_KEY=your-gemini-key-here
# Image generation via MaxPlus (required for "สร้างรูปภาพ AI" button)
IMAGE_API_KEY=ccsk-your-maxplus-key-here
IMAGE_API_BASE_URL=https://api.maxplus-ai.cc
# OPENAI_IMAGE_MODEL defaults to gpt-image-2 — change only if needed
EOF
chmod 600 .env
```
(Keep `COOKIE_SECURE=false` while on http. Flip to `true` after you add HTTPS.)

### 6. Install deps, build the frontend, create the tables
```bash
cd /opt/nyit-app
npm install              # frontend deps (incl. vite/tsc for the build)
npm run build            # produces /opt/nyit-app/dist

cd /opt/nyit-app/server
npm install              # backend deps
npm run migrate          # creates all tables in the nyit database
```

### 7. Start the app under pm2 (auto-restarts, survives reboot)
```bash
cd /opt/nyit-app/server
pm2 start npm --name nyit-app -- start
pm2 save
pm2 startup systemd -u root --hp /root   # run the command it prints, then:
pm2 save
pm2 logs nyit-app --lines 20             # should show "Nyit API listening on :3000"
```

### 8. Open port 3000 in the firewall (only if ufw is active)
```bash
ufw status        # if "Status: active":
ufw allow 3000/tcp
```
> Contabo may also have a **cloud firewall** in their web panel. If the site
> isn't reachable from your browser even with ufw allowing 3000, check that.

### 9. Test it
From your own PC, open the live URL: **`https://pos.ny-itshop.com`**
(or the raw `http://<VPS-IP>:3000` if bypassing the proxy).
You should see the login screen → "create first account" (this becomes the
**owner**). Done. 🎉

---

## Updating later (the routine — NO delete/redeploy)

On your PC: commit + `git push`. Then on the VPS:
```bash
cd /opt/nyit-app
git fetch origin && git reset --hard origin/main
npm ci                      # only if package.json changed (ci, NOT install)
npm run build               # only if the frontend changed
cd server && npm ci         # only if server deps changed
npm run migrate             # only if the DB schema changed (safe/idempotent)
pm2 restart nyit-app
```
Your database, uploaded images (`server/uploads/`), and `.env` are never touched —
they live outside git.

### Why `reset --hard` and not `git pull`

**Always force.** The VPS accumulates changes to tracked auto-generated files
(`package-lock.json` from `npm install`, `next-env.d.ts` from `next build`,
`*.tsbuildinfo`), so `git pull` aborts with *"local changes would be overwritten
by merge"*. The failure is silent in practice: you don't read the abort, the
build then **rebuilds the old commit**, `pm2 restart` relaunches it, and the site
looks deployed but isn't. This has bitten us three times (2026-07-07, 2026-07-22,
2026-08-12 — the storefront sat 4 commits behind for weeks).

Forcing is safe here: nobody authors code on the VPS, and `.env` / `.env.local` /
`server/uploads/` are gitignored, so `reset --hard` cannot touch them.

Two rules that go with it:
- **`npm ci`, never `npm install`,** on the VPS — `ci` installs straight from the
  lockfile and never rewrites it, which removes the main source of churn.
- **Chain build and restart with `&&`** (`npm run build && pm2 restart nyit-app`).
  A failed build leaves the previous `dist/` in place, so an unconditional restart
  silently re-ships stale code.
- `git fetch` **must** precede `reset --hard origin/main` — without it you reset to
  a stale local `origin/main` and rebuild old code anyway (that was the 2026-07-07 bug).

### Storefront (`nyitfront` — separate repo)

`store.ny-itshop.com` is a **different app in a different repo**
(`github.com/CheerRock7/nyitfront`), so the commands above do nothing for it:
```bash
cd /var/www/nyitfront
git fetch origin && git reset --hard origin/main
npm ci
npm run build && pm2 reload nyitfront
```

**Verifying a deploy actually landed:** grep the live HTML for a string that exists
*only* in the new code and compare with the local repo. Pick carefully — testing a
string that also exists in older commits gives a false pass.

---

## Backups (do this once the shop relies on it)
```bash
# manual backup
sudo -u postgres pg_dump nyit > /root/nyit-backup-$(date +%F).sql

# nightly cron at 02:00
( crontab -l 2>/dev/null; echo "0 2 * * * sudo -u postgres pg_dump nyit > /root/nyit-backup-\$(date +\%F).sql" ) | crontab -
```

---

## Clean URL + HTTPS — DONE (admin app on https://pos.ny-itshop.com)
The admin app is served through an Apache reverse-proxy with a Let's Encrypt
cert, coexisting with the WordPress site `ny-itshop.com` on the **same** Apache
(name-based vhosts — safe). Recorded here so it can be rebuilt if needed.

Steps that were run (2026-07-22):
1. **Namecheap** ny-itshop.com → Advanced DNS → add **A record**: Host `pos`,
   Value `194.233.88.142` (IP only, **no port**), TTL Automatic. Left the other
   site's `@`/`www`/URL-redirect records untouched.
2. Enable Apache proxy modules:
   `sudo a2enmod proxy proxy_http proxy_wstunnel && sudo systemctl reload apache2`
3. Create `/etc/apache2/sites-available/pos.ny-itshop.com.conf`:
   ```apache
   <VirtualHost *:80>
       ServerName pos.ny-itshop.com
       ProxyPreserveHost On
       ProxyPass        / http://127.0.0.1:3000/
       ProxyPassReverse / http://127.0.0.1:3000/
       ErrorLog  ${APACHE_LOG_DIR}/pos-error.log
       CustomLog ${APACHE_LOG_DIR}/pos-access.log combined
   </VirtualHost>
   ```
   Then: `sudo a2ensite pos.ny-itshop.com.conf && sudo apache2ctl configtest && sudo systemctl reload apache2`
4. HTTPS with certbot (auto-renews, adds HTTP→HTTPS redirect):
   `sudo apt install certbot python3-certbot-apache -y`
   `sudo certbot --apache -d pos.ny-itshop.com`  (choose "Redirect")
5. Set `COOKIE_SECURE=true` in `server/.env` and `pm2 restart nyit-app`
   (required now that cookies go over HTTPS).

### Storefront subdomain — DONE (https://store.ny-itshop.com)
The `nyitfront` storefront (`/var/www/nyitfront`, pm2 `nyitfront` on `:3001`) got
its own subdomain the same way (2026-07-22):
1. **Namecheap** A record: Host `store` → `194.233.88.142`.
2. `/etc/apache2/sites-available/store.ny-itshop.com.conf` with
   `ServerName store.ny-itshop.com` and `ProxyPass / http://127.0.0.1:3001/`
   (+ `ProxyPassReverse`), then `a2ensite` + `configtest` + reload.
3. `sudo certbot --apache -d store.ny-itshop.com` (choose "Redirect").
4. **Mixed-content fix (important for the storefront):** its product images came
   from `NEXT_PUBLIC_UPLOADS_BASE_URL` = `http://194.233.88.142:3000`, which the
   browser blocks on an HTTPS page. Set it to `https://pos.ny-itshop.com` in
   `/var/www/nyitfront/.env.local`, then **`npm run build && pm2 reload nyitfront`**
   (NEXT_PUBLIC vars are baked in at build time — a rebuild is required, not just
   `--update-env`). Images then load via the pos vhost's `/uploads` proxy over HTTPS.

> **Gotcha:** the Namecheap host name must match the vhost `ServerName` and the
> certbot `-d` value, and the subdomain must resolve publicly *before* running
> certbot — otherwise certbot fails with `NXDOMAIN`.

> **Namecheap BasicDNS note:** on BasicDNS the root domain follows the Advanced-DNS
> host records. If those are the default parking/redirect records, `ny-itshop.com`
> resolves to Namecheap's parking page instead of the VPS (WordPress looks "down").
> Fix = A records `@` and `www` → `194.233.88.142`. Don't switch nameservers back
> to Custom DNS — that would also break the `pos`/`store` subdomains.

---

## Bundle poster rendering (Chromium)

The bundle-poster feature renders HTML to PNG with headless Chromium via
`playwright-core`. Install a Chromium binary once and point `CHROMIUM_PATH` at it.

On the Ubuntu VPS:

    sudo apt-get update && sudo apt-get install -y chromium-browser fonts-thai-tlwg

Then set in `server/.env`:

    CHROMIUM_PATH=/usr/bin/chromium-browser

(`fonts-thai-tlwg` ensures Thai text renders. Restart the app after changing .env.)
