# Installation and Deployment Guide

This guide provides step-by-step instructions for deploying the **Intranet Forms & Task Reporting System** across production environments using the **Node.js & TypeScript** runtime.

---

## 1. Prerequisites & System Requirements

### System Requirements
- **Operating System**: Linux (Ubuntu/Debian, RHEL/Rocky, Alpine), macOS, or Windows.
- **Disk Space**: ~150 MB for dependencies and build artifacts.
- **Memory**: Minimum 512 MB RAM (1 GB recommended).
- **Network**: Port `3000` (or your configured `PORT`) open on the local loopback (`127.0.0.1`) or network interface.

### Runtime Requirements
- **Node.js**: v18.0.0 or higher (Node.js 20 LTS or 22 LTS recommended).
- **Package Manager**: `npm` (v9+), `pnpm`, or `bun`.

Check your Node.js installation:
```bash
node -v
npm -v
```

---

## 2. Environment Configuration

The application reads configuration from environment variables or a `.env` file located in the root directory.

Create your `.env` file:
```bash
cp .env.example .env
```

### Supported Environment Variables

| Variable | Default Value | Description |
|---|---|---|
| `PORT` | `3000` | Port on which the HTTP server listens. |
| `BASE_PATH` | `/form` | Leading path prefix for reverse proxy mounting (e.g., `/form` or empty string `""` for root domain). |
| `ADMIN_PASSPHRASE` | `admin-secret-passphrase` | Secret passphrase used to forcefully claim or recover administrative rights via `/api/admin/claim-force`. |
| `NODE_ENV` | `production` | Environment mode (`production` or `development`). |

> [!IMPORTANT]
> Always change `ADMIN_PASSPHRASE` to a strong, confidential passphrase before deploying to production.

---

## 3. Building and Running

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Build for Production
Run the production build script:
```bash
npm run build
```

This single command:
1. Compiles and minifies the React 19 frontend into static assets in `dist/` with relative asset links (`./assets/...`), allowing it to be served from any subpath.
2. Bundles `server.ts` into a self-contained CommonJS file at `dist/server.cjs` using `esbuild`.

### Step 3: Run the Production Server
```bash
NODE_ENV=production PORT=3000 npm start
```

Or execute Node directly:
```bash
NODE_ENV=production PORT=3000 node dist/server.cjs
```

The application starts on `http://127.0.0.1:3000/form/` (or `http://127.0.0.1:3000/` if `BASE_PATH=""`).

---

## 4. Production Process Management

### Option A: Linux systemd Service (Recommended)

1. Create a service file at `/etc/systemd/system/intranet-forms.service`:

```ini
[Unit]
Description=Intranet Forms and Task Reporting Service
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/intranet-forms
ExecStart=/usr/bin/node dist/server.cjs
Restart=always
RestartSec=5

# Environment Configuration
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=BASE_PATH=/form
Environment=ADMIN_PASSPHRASE=your-strong-production-passphrase

# Security Hardening
ProtectSystem=full
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

2. Reload systemd, enable, and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable intranet-forms
sudo systemctl start intranet-forms
sudo systemctl status intranet-forms
```

---

### Option B: PM2 Process Manager

1. Install PM2:
```bash
npm install -g pm2
```

2. Create `ecosystem.config.cjs` in the project root:
```javascript
module.exports = {
  apps: [
    {
      name: "intranet-forms",
      script: "dist/server.cjs",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        BASE_PATH: "/form",
        ADMIN_PASSPHRASE: "your-strong-production-passphrase"
      }
    }
  ]
};
```

3. Launch and save:
```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

---

### Option C: Docker Deployment

Create a `Dockerfile` in the project root:
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV BASE_PATH=/form

COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/data ./data

EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "dist/server.cjs"]
```

Build and run:
```bash
docker build -t intranet-forms .
docker run -d \
  --name intranet-forms \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e ADMIN_PASSPHRASE="your-strong-passphrase" \
  intranet-forms
```

---

## 5. Reverse Proxy Setup Examples

When deploying behind a corporate web server or reverse proxy on ports **80** (HTTP) or **443** (HTTPS), follow these configuration guidelines.

### Understanding Reverse Proxy Subpath Mounting

When proxying `/form` to the backend on `localhost:3000`:
- The client requests assets such as `https://intranet.company.local/form/assets/index.js` and API routes like `https://intranet.company.local/form/api/form`.
- **Trailing Slash Requirement**: When a user accesses `http://server/form` without the trailing slash, the server issues an automatic `301 Moved Permanently` redirect to `http://server/form/`. This ensures the browser evaluates relative HTML links (`./assets/...`) relative to `/form/` rather than the domain root `/`.
- The application registers routes and static asset handlers on both `${BASE_PATH}` (`/form`) and `/`, guaranteeing seamless compatibility whether your proxy preserves the `/form` prefix or strips it.

---

### Lighttpd Reverse Proxy Configuration

Lighttpd uses the `mod_proxy` and `mod_redirect` modules to forward requests to the Node.js backend.

#### Step 1: Enable required modules
In Debian/Ubuntu:
```bash
sudo lighty-enable-mod proxy
sudo lighty-enable-mod redirect
```
Or directly add them to `server.modules` in `/etc/lighttpd/lighttpd.conf`:
```lighttpd
server.modules += (
    "mod_proxy",
    "mod_redirect"
)
```

#### Step 2: Configure HTTP (Port 80) Subpath Proxy
Add the following configuration block (e.g. in `/etc/lighttpd/conf-available/10-proxy-form.conf` or inside your `lighttpd.conf`):

```lighttpd
# Redirect /form (without trailing slash) to /form/
url.redirect += (
    "^/form$" => "/form/"
)

# Reverse proxy all /form/ requests to localhost:3000
$HTTP["url"] =~ "^/form/" {
    proxy.server = ( "" => ( 
        ( "host" => "127.0.0.1", "port" => 3000 ) 
    ) )
    proxy.header = (
        "upgrade" => "enable"
    )
}
```

#### Step 3: Configure HTTPS (Port 443 with SSL/TLS)
For an SSL/TLS enabled virtual host:

```lighttpd
$SERVER["socket"] == ":443" {
    ssl.engine = "enable"
    ssl.pemfile = "/etc/lighttpd/certs/combined.pem"

    # Enforce trailing slash on subpath
    url.redirect += (
        "^/form$" => "/form/"
    )

    # Reverse proxy /form/ to localhost:3000
    $HTTP["url"] =~ "^/form/" {
        proxy.server = ( "" => ( 
            ( "host" => "127.0.0.1", "port" => 3000 ) 
        ) )
        proxy.header = (
            "upgrade" => "enable"
        )
    }
}

# Optional: Redirect all port 80 HTTP traffic to HTTPS
$SERVER["socket"] == ":80" {
    $HTTP["host"] =~ ".*" {
        url.redirect = ( "^/(.*)" => "https://%0/$1" )
    }
}
```

Restart Lighttpd:
```bash
sudo systemctl restart lighttpd
```

---

### NGINX Reverse Proxy Configuration

```nginx
server {
    listen 80;
    server_name intranet.company.local;

    # Enforce trailing slash on subpath
    location = /form {
        return 301 /form/;
    }

    # Proxy both assets and API calls under /form/
    location /form/ {
        proxy_pass http://127.0.0.1:3000/form/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

### Apache HTTP Server (`mod_proxy`)

Ensure `proxy` and `proxy_http` modules are active (`sudo a2enmod proxy proxy_http`):

```apache
<VirtualHost *:80>
    ServerName intranet.company.local

    # Enforce trailing slash
    RedirectMatch 301 ^/form$ /form/

    ProxyPreserveHost On
    ProxyPass /form/ http://127.0.0.1:3000/form/
    ProxyPassReverse /form/ http://127.0.0.1:3000/form/
</VirtualHost>
```

---

### Caddy Reverse Proxy

```caddy
intranet.company.local {
    # Caddy handles trailing slash and websocket upgrades automatically
    redir /form /form/ 301
    handle_path /form/* {
        reverse_proxy 127.0.0.1:3000
    }
}
```

---

## 6. Troubleshooting Reverse Proxies

### Blank Page with Header / Empty Body
**Symptom**: When visiting `http://your-server/form`, the page displays the title in the browser tab, but the main body is completely blank.
- **Cause**: The browser loaded `index.html`, but the JavaScript bundles were requested at root `/assets/...` instead of `/form/assets/...` (or the URL lacked a trailing slash, causing relative `./assets/...` to be resolved against root `/`).
- **Solution**:
  1. Ensure you have run `npm run build` so that the latest bundle with relative asset links (`base: './'`) is generated in `dist/`.
  2. Confirm your reverse proxy configuration contains a redirect from `/form` to `/form/` (or rely on the application's built-in redirect).
  3. Verify that `BASE_PATH` in `.env` matches the proxy subpath (e.g. `BASE_PATH=/form`).

---

## 7. Data Storage & Backups

All application state is stored locally in `data/db.json`:
- Form structure (title, instructions, tasks)
- Administrator authentication token & status
- User responses, session mappings, and validity timestamps

### Backup Command
Create an automated tarball backup:
```bash
tar -czf /backups/forms-backup-$(date +%Y%m%d%H%M%S).tar.gz -C /var/www/intranet-forms/data db.json
```

### Factory Reset
To wipe all submissions and reset the form to initial defaults:
```bash
sudo systemctl stop intranet-forms
rm -f /var/www/intranet-forms/data/db.json
sudo systemctl start intranet-forms
```
The server will automatically generate a new default `data/db.json` and permit the first visitor to claim administrative rights.
