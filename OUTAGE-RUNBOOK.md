# OUTAGE RUNBOOK — ny-itshop.com

> **Read this FIRST whenever a site is "down".** Written 2026-08-24 after the 3rd
> identical incident. This project is worked on weekly and the details get forgotten —
> that is exactly what this file is for. Do not re-derive it.

---

## 0. The 30-second triage card

Look at **how many sites are down** and at the **exact wording of the browser error**.

| Symptom | Real cause | Fix |
|---|---|---|
| All 3 down **including** WordPress (`ny-itshop.com`) | server / network is down | `ping 194.233.88.142` → if dead, Contabo panel / support |
| `pos` + `store` down, WordPress fine, error = **timeout / connection refused** | pm2 didn't survive a reboot | `ssh root@194.233.88.142` → `pm2 resurrect` → `pm2 save` |
| `pos` + `store` down, WordPress fine, error = **"DNS address could not be found"** (NXDOMAIN) | **DNS** — the subdomain records are missing from whatever DNS host is live | Cloudflare → re-add the records (§2) |

The **error wording is the whole diagnosis.** "DNS address could not be found" is *never*
a server problem. The server can be perfectly healthy and still show that.

Quick check from Windows PowerShell:

```powershell
nslookup ny-itshop.com 8.8.8.8        # who answers, and what NS
nslookup pos.ny-itshop.com 8.8.8.8    # NXDOMAIN here = DNS problem, not server
nslookup store.ny-itshop.com 8.8.8.8
ping 194.233.88.142                   # server alive?
```

---

## 1. Infrastructure cheat-sheet (the things that keep getting forgotten)

| Thing | Value |
|---|---|
| VPS provider | **Contabo** |
| VPS IP | **194.233.88.142** (hostname `vmi2765302`, Ubuntu 24.04, 7.8 GB RAM) |
| Registrar | **Namecheap** (owns the domain — always, no matter what) |
| DNS host *right now* | **Cloudflare** (`sergi.ns.cloudflare.com`, `stevie.ns.cloudflare.com`) — the **shop owner** moved it there |
| WordPress (shop owner's site) | `https://ny-itshop.com` — served **directly by Apache** on the VPS |
| POS / admin | `https://pos.ny-itshop.com` → Apache reverse-proxy → `127.0.0.1:3000` (pm2 `nyit-app`) |
| Storefront | `https://store.ny-itshop.com` → Apache reverse-proxy → `127.0.0.1:3001` (pm2 `nyitfront`) |
| Old PHP stock system | `stock.ny-itshop.com` |
| TLS | Let's Encrypt certs live **on the VPS** (valid to 2026-10-20) |

**Registrar ≠ DNS host.** Namecheap always owns the domain. Whoever the *nameservers*
point at is who answers DNS queries. Only one can be live at a time — last one set wins.

- Namecheap **BasicDNS** = Namecheap answers, Host Records panel is editable.
- Namecheap **Custom DNS** = delegate to someone else's nameservers (Cloudflare).
  Host Records go grey but are **not deleted** — they sit dormant.

So: "Custom DNS" is the setting that sends DNS *away*. Adding it does **not** bring the
site back. The panel is grey right now because the domain is delegated to Cloudflare.

---

## 2. THE FIX — add the subdomains inside Cloudflare

**This is the durable fix. Do NOT flip nameservers back to BasicDNS.**

Flipping back "works" for a week, then the shop owner points them at Cloudflare again,
and we're back here. That ping-pong *is* the recurring outage. Instead: leave the zone
on Cloudflare and put our records **in** it.

Cloudflare → `ny-itshop.com` → **DNS → Records → Add record**, twice:

| Type | Name | Content | Proxy status | TTL |
|---|---|---|---|---|
| A | `pos` | `194.233.88.142` | **DNS only** (grey cloud) | Auto |
| A | `store` | `194.233.88.142` | **DNS only** (grey cloud) | Auto |

**Grey cloud, not orange.** Orange = Cloudflare proxies the traffic and terminates TLS
itself, which fights the Let's Encrypt certs on the origin and can break the POS session
cookie. Grey = plain DNS, origin stays authoritative. Keep it grey.

**Also restore the missing email record** — the Cloudflare zone was hand-built, so the
SPF/TXT record from the old Namecheap zone is gone. Mail from `@ny-itshop.com` will
quietly land in spam until it's re-added.

Verify after ~2 minutes:

```powershell
nslookup pos.ny-itshop.com 8.8.8.8
nslookup store.ny-itshop.com 8.8.8.8
ipconfig /flushdns
```

Google (8.8.8.8) picks it up first. **1.1.1.1 holds the stale zone the longest** — if
Chrome still says NXDOMAIN but 8.8.8.8 answers, it's just cache. Wait / flush.

---

## 3. Message to send the shop owner (Thai)

Blame-free. Also asks for a **Cloudflare Administrator invite** (Manage Account →
Members → Invite) so next time this is a 2-minute self-serve fix instead of a 2-day wait.

```
สวัสดีครับ พอดีเช็คให้แล้วนะครับ

เซิร์ฟเวอร์ปกติดีทุกอย่างครับ เปิดมา 36 วันไม่เคยดับเลย เว็บ WordPress
ก็ยังอยู่ครบ ปัญหาอยู่ที่ "ทะเบียนชื่อเว็บ" (DNS) ครับ

ตอนนี้โดเมนย้ายมาอยู่ที่ Cloudflare แล้ว แต่ใน Cloudflare มีแค่ชื่อ
@ , www , stock ครับ — ยังไม่มี pos กับ store เลยทำให้ 2 ตัวนี้เปิดไม่ได้
(ขึ้นว่า "DNS address could not be found")

รบกวนเพิ่ม 2 บรรทัดนี้ใน Cloudflare → DNS → Add record ครับ

  Type: A   Name: pos     Content: 194.233.88.142   Proxy: DNS only (เมฆสีเทา)
  Type: A   Name: store   Content: 194.233.88.142   Proxy: DNS only (เมฆสีเทา)

** สำคัญ: ต้องเลือกเป็น "DNS only" เมฆสีเทา นะครับ ถ้าเป็นเมฆสีส้มจะชนกับ
ใบรับรอง HTTPS ของเซิร์ฟเวอร์ แล้วจะเข้าไม่ได้เหมือนกัน **

และรบกวนอย่าเปลี่ยน nameserver กลับไปกลับมานะครับ ทุกครั้งที่เปลี่ยน
ระบบหลังร้านจะดับประมาณครึ่งวัน

ถ้าสะดวก รบกวนเชิญผมเข้า Cloudflare เป็น Administrator ด้วยได้ไหมครับ
(Manage Account → Members → Invite) จะได้แก้ได้ทันทีไม่ต้องรบกวนพี่ทุกครั้ง

ป.ล. ตอนย้ายมา Cloudflare ค่า SPF/TXT ของอีเมลหายไปด้วยครับ อีเมลที่ส่งจาก
@ny-itshop.com อาจเข้าไปอยู่ใน junk — ผมช่วยใส่กลับให้ได้ถ้าเข้าไปแก้ได้ครับ
```

---

## 4. Confirmed timeline (why we believe the above)

| When | What happened | Actual cause |
|---|---|---|
| 19 Jul (Sun) 03:20 | Contabo rebooted the VPS | the only real *server* event on record |
| 21–22 Jul | pos + store down | pm2 didn't come back after that reboot |
| 22 Jul | subdomains + HTTPS built, Namecheap BasicDNS | fixed |
| **12 Aug (Wed)** | pos + store NXDOMAIN | NS had been moved to Cloudflare → we flipped back to BasicDNS |
| **24 Aug (Mon)** | pos + store NXDOMAIN **again** | NS on Cloudflare again, zone missing `pos`/`store` |

Note `stock` **is** in the Cloudflare zone now but wasn't on 12 Aug → someone is
hand-adding records over time. The zone was built by hand, not imported (no MX, no TXT,
no SPF, no `mail`/`ftp`/`cpanel` records survived the move).

### The server was NOT the problem on 24 Aug — measured, not assumed

| Check | Result |
|---|---|
| Uptime | last reboot Sun 19 Jul 03:20, **still running** (~36 days) |
| `systemctl is-enabled pm2-root` | `enabled` |
| `pm2 list` | `nyit-app` restarts 0, online · `nyitfront` restarts 4, online |
| `ny-itshop.com` via public DNS | 200 |
| pos/store → origin `194.233.88.142:443` with SNI | 200 / 200 |
| `:3000` / `:3001` direct | 200 / 200 |
| Origin cert | valid → **2026-10-20**, SAN `ny-itshop.com` + `www` |
| `Last login` on the VPS | Wed 12 Aug — *our own* previous session |

That last row matters: **nobody else has SSH.** The shop owner only touches DNS.

---

## 5. AFTER the site is back up — settle "is it the VPS or is it DNS?"

Everything above explains the *DNS* incidents. What it does **not** explain is the
feeling that it goes down "weekly". That is not established — "every Tuesday" was just
when it happened to get checked, not when it failed. So: **measure, don't theorize.**

### Block A — backward-looking evidence (run once, paste the output)

```bash
# 1. Anything scheduled that could be knocking things over?
crontab -l 2>/dev/null; ls -la /etc/cron.d/ /etc/cron.weekly/ 2>/dev/null
systemctl list-timers --all | head -20

# 2. Has the OOM killer been eating the apps?   <-- TOP SUSPECT
#    7.8 GB box running Postgres + MySQL + Apache + 2 Node apps + headless Chromium
dmesg -T | grep -iE "out of memory|killed process" | tail -20
grep -icE "out of memory|killed process" /var/log/syslog 2>/dev/null

# 3. When did nyitfront actually restart, and why?  (it shows 4 restarts)
pm2 describe nyitfront | grep -iE "uptime|restarts|unstable|script|memory"
pm2 logs nyitfront --lines 40 --nostream --err

# 4. Resources
free -h
df -h /
swapon --show
```

### Block B — forward-looking watchdog (install once, then wait for the next failure)

Logs every 5 minutes what is alive. **A gap in the log means the server itself was
down.** No gap + NXDOMAIN in the log means it was DNS. That one distinction is the
entire point of this script.

```bash
apt-get install -y dnsutils >/dev/null 2>&1

cat > /root/nyit-watch.sh <<'WATCH'
#!/bin/bash
# Logs what is alive every run. Gaps in the log = the SERVER itself was down.
LOG=/var/log/nyit-watch.log
TS=$(date '+%F %T')

dns_pos=$(dig +short +time=3 +tries=1 @8.8.8.8 pos.ny-itshop.com A 2>/dev/null | tail -1)
dns_store=$(dig +short +time=3 +tries=1 @8.8.8.8 store.ny-itshop.com A 2>/dev/null | tail -1)
dns_ns=$(dig +short +time=3 +tries=1 @8.8.8.8 ny-itshop.com NS 2>/dev/null | sort | tr '\n' ',' | sed 's/,$//')

a3000=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000/ 2>/dev/null)
a3001=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3001/ 2>/dev/null)
apach=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1/ 2>/dev/null)

mem=$(free -m | awk '/^Mem:/{print $3"/"$2"M"}')
swap=$(free -m | awk '/^Swap:/{print $3"/"$2"M"}')
load=$(cut -d' ' -f1 /proc/loadavg)
disk=$(df -h / | awk 'NR==2{print $5}')
up=$(cut -d. -f1 /proc/uptime)

printf '%s ns=%s dns_pos=%s dns_store=%s app3000=%s app3001=%s apache=%s mem=%s swap=%s load=%s disk=%s uptime=%ss\n' \
  "$TS" "${dns_ns:-FAIL}" "${dns_pos:-NXDOMAIN}" "${dns_store:-NXDOMAIN}" \
  "$a3000" "$a3001" "$apach" "$mem" "$swap" "$load" "$disk" "$up" >> "$LOG"
WATCH

chmod +x /root/nyit-watch.sh
/root/nyit-watch.sh && cat /var/log/nyit-watch.log        # test it once
(crontab -l 2>/dev/null; echo "*/5 * * * * /root/nyit-watch.sh") | crontab -
```

### How to read the log next time it breaks

```bash
tail -50 /var/log/nyit-watch.log
grep -E 'NXDOMAIN|app3000=000|app3001=000' /var/log/nyit-watch.log | tail -30
```

| What the log shows | Verdict | What to do |
|---|---|---|
| **Gap in timestamps** (no lines for N minutes) | the **VPS** went down / rebooted | check `uptime`, Contabo panel; if uptime reset → pm2 boot-persistence |
| No gap, but `dns_pos=NXDOMAIN` and/or `ns=` changed | **DNS** — nameservers or records changed | §2, re-add records in Cloudflare |
| No gap, `app3000=000` or `app3001=000`, `apache=200` | **the Node app crashed** | `pm2 logs`, plus Block A #2 (OOM) |
| `uptime=` suddenly small | server rebooted | pm2 boot-persistence |
| `mem=` near max / `swap=` climbing right before a failure | **OOM is the root cause** | add swap, cap Node memory, stop headless Chromium leaking |

---

## 6. Rules to stop the loop

1. **Never flip nameservers back and forth.** Pick one DNS host and put *all* records
   there. Current answer: **Cloudflare**, because the shop owner controls it and will
   keep moving it back regardless.
2. **Grey cloud (DNS only)** for `pos` and `store`. Always.
3. Get **Administrator access to Cloudflare** so this is a 2-minute fix.
4. Read the **browser error wording** before touching the server (§0).
5. When in doubt → `tail /var/log/nyit-watch.log` (§5) before forming any theory.
