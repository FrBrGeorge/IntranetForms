# Installation and Deployment Guide

This guide provides step-by-step instructions for deploying the **Intranet Forms & Task Reporting System** across environments. You can run the application using either the **JavaScript / Node.js runtime** (recommended for full-stack integration and production bundling) or the standalone **Python runtime** (ideal for lightweight or dependency-constrained environments).

---

## 1. Prerequisites & System Requirements

### General Requirements
- **Operating System**: Linux (Ubuntu/Debian, RHEL/Rocky, Alpine), macOS, or Windows.
- **Disk Space**: ~250 MB for dependencies and build artifacts.
- **Memory**: Minimum 512 MB RAM (1 GB recommended).
- **Network**: Port `3000` (or your configured `PORT`) open for incoming traffic.

### Runtime Requirements
- **For Node.js Deployment**:
  - Node.js 18+ (Node.js 20 LTS or 22 LTS recommended)
  - npm 9+, bun, or pnpm
- **For Python Deployment**:
  - Python 3.8+ (Python 3.10+ recommended)
  - Optional: `bottle` package (`pip install bottle`)
  - Note: If `bottle` is not installed, the Python server automatically falls back to the Python standard library's built-in `http.server`.

---

## 2. Environment Configuration

The application reads configuration from environment variables or a `.env` file located in the root directory.

Create your `.env` file by copying the template:

```bash
cp .env.example .env
```

### Supported Environment Variables

| Variable | Default Value | Description |
|---|---|---|
| `PORT` | `3000` | Port on which the HTTP server listens. |
| `BASE_PATH` | `/form` | Leading path prefix for reverse proxy mounting (e.g., `/form` or empty string `""` for root path). |
| `ADMIN_PASSPHRASE` | `admin-secret-passphrase` | Secret passphrase used to forcefully claim or recover administrative rights via `/api/admin/claim-force`. |
| `NODE_ENV` | `development` | Environment mode (`development` or `production`). |

> [!IMPORTANT]
> Always change `ADMIN_PASSPHRASE` to a strong, confidential string before deploying to production.

---

## 3. Variant A: Node.js & TypeScript Deployment

The Node.js deployment compiles the TypeScript server (`server.ts`) and the React frontend into an optimized, self-contained bundle.

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Local Development Mode

To run with live TypeScript execution and Vite middleware:

```bash
npm run dev
```

The application will be accessible at: `http://localhost:3000/form` (or `http://localhost:3000/` depending on `BASE_PATH`).

### Step 3: Production Build

Run the combined build script:

```bash
npm run build
```

This single command executes two steps:
1. `vite build`: Compiles and minifies the React 19 frontend into static assets in `dist/`.
2. `esbuild`: Bundles `server.ts` into a self-contained CommonJS file at `dist/server.cjs`.

### Step 4: Run the Production Server

```bash
NODE_ENV=production PORT=3000 npm start
```

Alternatively, invoke Node directly:

```bash
NODE_ENV=production PORT=3000 node dist/server.cjs
```

---

### Step 5: Process Management for Node.js

#### Option 1: PM2 (Recommended for Production)

1. Install PM2 globally:
   ```bash
   npm install -g pm2
   ```

2. Create an `ecosystem.config.cjs` file in the project root:
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
           ADMIN_PASSPHRASE: "replace-with-a-strong-passphrase"
         }
       }
     ]
   };
   ```

3. Start and persist the process:
   ```bash
   pm2 start ecosystem.config.cjs
   pm2 save
   pm2 startup
   ```

#### Option 2: Linux systemd Service

1. Create a systemd unit file `/etc/systemd/system/intranet-forms.service`:
   ```ini
   [Unit]
   Description=Intranet Forms Application (Node.js)
   After=network.target

   [Service]
   Type=simple
   User=www-data
   WorkingDirectory=/var/www/intranet-forms
   ExecStart=/usr/bin/node dist/server.cjs
   Restart=always
   RestartSec=5
   Environment=NODE_ENV=production
   Environment=PORT=3000
   Environment=BASE_PATH=/form
   Environment=ADMIN_PASSPHRASE=your-strong-production-passphrase

   [Install]
   WantedBy=multi-user.target
   ```

2. Enable and start the service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable intranet-forms
   sudo systemctl start intranet-forms
   sudo systemctl status intranet-forms
   ```

---

### Step 6: Docker Deployment (Node.js)

Create a `Dockerfile` in the project root:

```dockerfile
# Multi-stage build
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production runtime stage
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

Build and run the container:

```bash
docker build -t intranet-forms:node .
docker run -d \
  --name intranet-forms \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e ADMIN_PASSPHRASE="your-strong-passphrase" \
  intranet-forms:node
```

---

## 4. Variant B: Python Deployment

The Python backend (`server.py`) is designed as a portable service. It supports the lightweight **Bottle** WSGI micro-framework, and automatically falls back to Python's built-in standard library (`http.server`) if Bottle is not installed.

### Step 1: Build Frontend Assets

The Python server serves the compiled frontend assets from the `dist/` directory. You must first build the frontend:

```bash
npm install
npm run build
```

This populates the `dist/` directory with `index.html` and static bundles.

### Step 2: Configure Python Environment

#### Option 1: Using Bottle (Recommended for Python)

Bottle offers faster routing and request handling:

```bash
pip install bottle
```

#### Option 2: Zero-Dependency Fallback

No packages need to be installed. `server.py` automatically detects when Bottle is absent and runs using Python's built-in `http.server` and standard library modules (`urllib`, `json`, `uuid`).

### Step 3: Run the Python Server

```bash
export PORT=3000
export BASE_PATH="/form"
export ADMIN_PASSPHRASE="your-strong-passphrase"

python3 server.py
```

Console output will confirm the engine in use:
- With Bottle: `[Python Bottle Server] Running on port 3000 with prefix '/form'`
- Standard library: `[Python Standalone Server] Listening on 0.0.0.0:3000, BASE_PATH='/form'`

---

### Step 4: Process Management for Python

#### Linux systemd Service for Python

1. Create `/etc/systemd/system/intranet-forms-py.service`:
   ```ini
   [Unit]
   Description=Intranet Forms Application (Python)
   After=network.target

   [Service]
   Type=simple
   User=www-data
   WorkingDirectory=/var/www/intranet-forms
   ExecStart=/usr/bin/python3 server.py
   Restart=always
   RestartSec=5
   Environment=PORT=3000
   Environment=BASE_PATH=/form
   Environment=ADMIN_PASSPHRASE=your-strong-production-passphrase

   [Install]
   WantedBy=multi-user.target
   ```

2. Enable and start:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable intranet-forms-py
   sudo systemctl start intranet-forms-py
   sudo systemctl status intranet-forms-py
   ```

---

### Step 5: Docker Deployment (Python)

Create a `Dockerfile.python` in the project root:

```dockerfile
# Stage 1: Build the frontend with Node.js
FROM node:20-alpine AS frontend-builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx vite build

# Stage 2: Python runtime
FROM python:3.11-alpine

WORKDIR /app

RUN pip install --no-cache-dir bottle

COPY server.py ./
COPY --from=frontend-builder /app/dist ./dist
RUN mkdir -p /app/data

ENV PORT=3000
ENV BASE_PATH=/form

EXPOSE 3000
VOLUME ["/app/data"]

CMD ["python3", "server.py"]
```

Build and run:

```bash
docker build -f Dockerfile.python -t intranet-forms:python .
docker run -d \
  --name intranet-forms-py \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e ADMIN_PASSPHRASE="your-strong-passphrase" \
  intranet-forms:python
```

---

## 5. Reverse Proxy Setup Examples

In intranet environments, the application is frequently hosted behind a reverse proxy (e.g. NGINX, Apache, Traefik, or Caddy) under a subpath like `/form` or at root `/`.

### NGINX Reverse Proxy

#### Scenario A: Subpath Deployment (`BASE_PATH="/form"`)

Ensure `.env` has `BASE_PATH="/form"` and add the following location block to your NGINX configuration:

```nginx
server {
    listen 80;
    server_name intranet.company.local;

    # Redirect root to form if desired
    location = / {
        return 301 /form/;
    }

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

    # Proxy direct API calls
    location /form/api/ {
        proxy_pass http://127.0.0.1:3000/form/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

#### Scenario B: Root Domain Deployment (`BASE_PATH=""`)

Set `BASE_PATH=""` in `.env`:

```nginx
server {
    listen 80;
    server_name forms.company.local;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Caddy Reverse Proxy

```caddy
intranet.company.local {
    handle_path /form/* {
        reverse_proxy localhost:3000
    }
}
```

### Apache HTTP Server (`mod_proxy`)

```apache
<VirtualHost *:80>
    ServerName intranet.company.local

    ProxyPreserveHost On
    ProxyPass /form http://127.0.0.1:3000/form
    ProxyPassReverse /form http://127.0.0.1:3000/form
</VirtualHost>
```

---

## 6. Data Storage & Backups

All state is persisted in `data/db.json`:
- Form structure configuration
- Administrator authentication token
- User responses, session mappings, and validity timestamps

### Recommended Backup Command

Use a simple file copy or tarball in a cron job:

```bash
# Periodic hourly backup
tar -czf /backups/forms-db-$(date +%Y%m%d%H%M%S).tar.gz -C /var/www/intranet-forms/data db.json
```

### Resetting to Factory Defaults

To completely reset the form and all stored responses:

1. Stop the application service.
2. Delete or rename `data/db.json`:
   ```bash
   mv data/db.json data/db.json.bak
   ```
3. Restart the service. The server will reinitialize `data/db.json` with standard defaults and permit a new first-time admin claim.

---

## 7. Security & Hardening Recommendations

1. **Change the Default Passphrase**: Update `ADMIN_PASSPHRASE` in your environment or `.env` file immediately.
2. **File Permissions**: Restrict write access to the `data/` folder to the service user only:
   ```bash
   chown -R www-data:www-data /var/www/intranet-forms/data
   chmod 700 /var/www/intranet-forms/data
   chmod 600 /var/www/intranet-forms/data/db.json
   ```
3. **Internal Network Access**: Bind the application to internal interfaces (e.g. `127.0.0.1` or internal subnet) when running behind a dedicated reverse proxy.
4. **Enforce HTTPS / TLS**: Always terminate SSL/TLS at your reverse proxy layer when transmitting sensitive incident logs or employee responses.
