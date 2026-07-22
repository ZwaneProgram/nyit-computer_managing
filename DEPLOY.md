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
git pull
npm install                 # only if package.json changed
npm run build               # only if the frontend changed
cd server && npm install    # only if server deps changed
npm run migrate             # only if the DB schema changed (safe/idempotent)
pm2 restart nyit-app
```
Your database, uploaded images (`server/uploads/`), and `.env` are never touched
by `git pull` — they live outside git.

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

### Storefront subdomain (later)
Same recipe: A record `shop` → same IP, copy the vhost with
`ServerName shop.ny-itshop.com` and port **`3001`**, then
`certbot --apache -d shop.ny-itshop.com`.

---

## Bundle poster rendering (Chromium)

The bundle-poster feature renders HTML to PNG with headless Chromium via
`playwright-core`. Install a Chromium binary once and point `CHROMIUM_PATH` at it.

On the Ubuntu VPS:

    sudo apt-get update && sudo apt-get install -y chromium-browser fonts-thai-tlwg

Then set in `server/.env`:

    CHROMIUM_PATH=/usr/bin/chromium-browser

(`fonts-thai-tlwg` ensures Thai text renders. Restart the app after changing .env.)
