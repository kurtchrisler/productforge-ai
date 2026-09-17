# Deploying ProductGenie AI to your VPS

This gets the app running live on your server via Docker, reachable at
`http://YOUR_SERVER_IP:3001`, without touching your existing WordPress
sites (they stay on ports 80/443 as-is).

## 1. Push the code to GitHub (on your Windows machine)

In the `aiproductfactory` folder (PowerShell):

```powershell
git init
git add .
git commit -m "Initial commit"
```

Then create an empty repo on GitHub (github.com → New repository — don't
initialize it with a README), and push:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/productforge-ai.git
git branch -M main
git push -u origin main
```

## 2. On the VPS: check for Docker

SSH in, then:

```bash
docker --version
docker compose version
```

If either command isn't found, install Docker:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Log out and back in (or run `newgrp docker`) for the group change to take
effect, then re-check `docker --version`.

## 3. Clone and configure

```bash
git clone https://github.com/YOUR_USERNAME/productforge-ai.git
cd productforge-ai
cp .env.example .env
nano .env   # optional: add OPENAI_API_KEY for real AI content instead of demo mode
```

## 4. Build and start

```bash
docker compose up -d --build
```

First build takes a few minutes (it downloads Chromium for PDF rendering
inside the image). Watch progress / check for errors with:

```bash
docker compose logs -f
```

Ctrl+C to stop following logs — the container keeps running in the
background.

## 5. Open the port

The app listens on port 3001 by default (edit the left side of the
`ports:` line in `docker-compose.yml` if that's taken).

```bash
sudo ufw status
sudo ufw allow 3001/tcp   # only if ufw shows as active
```

If your VPS is on a cloud provider with its own firewall/security-group
console (DigitalOcean, AWS, Linode, etc.), open port 3001 there too — a
server-level `ufw` rule alone won't help if the provider's firewall blocks
it upstream.

## 6. Test it

Visit `http://YOUR_SERVER_IP:3001` in a browser. Sign up, create a
product, download the PDF — same flow you already tested locally.

## Updating later

```bash
cd productforge-ai
git pull
docker compose up -d --build
```

Your data (`data/app.db` and generated PDFs) lives in the `data/` folder
next to `docker-compose.yml` and isn't touched by rebuilds.

## Adding a real domain + HTTPS later

When you're ready to put this on a subdomain (e.g.
`productforge.wpmarketertools.com`) instead of the bare IP:port, that's an
Nginx reverse-proxy vhost pointing at `localhost:3001` plus a Let's
Encrypt certificate via `certbot` — happy to walk through that whenever
you're ready; it's a separate step from what's above and doesn't require
re-touching this Docker setup.
