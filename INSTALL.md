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

Lighttpd uses the `mod_proxy` and `mod_redirect` modules to forward requests to the Node.js backend. This works on **any port** (80, 443, 8080, 8443, etc.).

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

#### Step 2: Configure HTTP Subpath Proxy (Any Port, e.g. Port 80 or 8080)
Add the following configuration block (e.g. in `/etc/lighttpd/conf-available/10-proxy-form.conf` or inside your `lighttpd.conf`):

```lighttpd
# Enforce trailing slash so the browser resolves relative assets (./assets/...) to /form/assets/...
url.redirect += (
    "^/form$" => "/form/"
)

# Reverse proxy all /form/ requests to Node.js backend on localhost:3000
$HTTP["url"] =~ "^/form/" {
    proxy.server = ( "" => ( 
        ( "host" => "127.0.0.1", "port" => 3000 ) 
    ) )
    proxy.header = (
        "upgrade" => "enable"
    )
}
```

> [!NOTE]
> If your Lighttpd listens on a custom port (such as 8080, 8443), the configuration is identical. The `url.redirect` rule and `^/form/` proxy block apply regardless of the listening port:
> ```lighttpd
> $SERVER["socket"] == ":8080" {
>     url.redirect += ( "^/form$" => "/form/" )
>     $HTTP["url"] =~ "^/form/" {
>         proxy.server = ( "" => ( ( "host" => "127.0.0.1", "port" => 3000 ) ) )
>     }
> }
> ```

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
```

Restart Lighttpd after modifying the configuration:
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
    redir /form /form/ 301
    handle_path /form/* {
        reverse_proxy 127.0.0.1:3000
    }
}
```

---

## 6. Troubleshooting Reverse Proxies

### Blank Page with Header / Empty Body
**Symptom**: When visiting `http://your-server:<port>/form`, the browser displays the document title in the browser tab, but the body is completely blank or renders only an empty root container.

**Root Causes & Fixes**:

1. **Running Development Mode Behind Proxy without Production Build**:
   - *Problem*: Running `npm run dev` or `node server.ts` starts Vite's on-the-fly compiler. In development mode, Vite previously generated absolute module paths starting at the root (`/src/main.tsx`, `/@vite/client`). Because the reverse proxy only proxies `/form`, module requests outside `/form` returned 404, preventing the script from running.
   - *Fix*: Always run `npm run build` and launch using `npm start` (which executes `NODE_ENV=production node dist/server.cjs`). When `dist/` is present, the server automatically serves the compiled production bundles with relative asset paths. If you must run development mode, Vite's dev server is now configured with `base: '/form/'` so all development script requests stay within `/form/`.

2. **Missing Trailing Slash on the Subpath URL (`/form` vs `/form/`)**:
   - *Problem*: When visiting `http://your-server:port/form` (without a trailing slash), browser relative URL resolution treats `/form` as a filename and resolves `./assets/index.js` against the root domain (`http://your-server:port/assets/index.js`), which the reverse proxy does not forward.
   - *Fix*: The HTML now includes an inline client-side bootstrap script in `<head>` that instantly replaces `/form` with `/form/` before any assets are requested. Additionally, make sure Lighttpd has `url.redirect += ( "^/form$" => "/form/" )`.

3. **Verify Reverse Proxy Connectivity with `curl`**:
   Run these verification commands on your server to confirm every layer is responding:
   ```bash
   # 1. Test backend on port 3000 directly:
   curl -i http://127.0.0.1:3000/form/
   curl -i http://127.0.0.1:3000/form/api/config

   # 2. Test through your reverse proxy (e.g. port 8080):
   curl -i http://127.0.0.1:8080/form/
   curl -i http://127.0.0.1:8080/form/api/config
   ```
   Both calls should return `HTTP/1.1 200 OK` (or `HTTP/1.1 301` if trailing slash is omitted).


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
