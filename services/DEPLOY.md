# Deploying Stirling-PDF & API Gateway to Oracle Cloud Free Tier (ARM64)

This guide covers deploying the Aboard PDF processing infrastructure (Stirling-PDF, API Gateway, and Caddy reverse proxy) on an **Oracle Cloud Infrastructure (OCI) Free Tier Ampere A1 (ARM64)** instance.

---

## Architecture Overview

```
                      Internet
                         │
                         ▼
             ┌───────────────────────┐
             │   Caddy (Port 80/443) │ (Public Edge Network)
             └───────────┬───────────┘
                         │ /pdf/*
                         ▼
             ┌───────────────────────┐
             │      API Gateway      │ (Bridge: Edge & Internal)
             │  (Node 22 / Hono:8787)│
             └───────────┬───────────┘
                         │ /api/v1/*
                         ▼
             ┌───────────────────────┐
             │     Stirling-PDF      │ (Internal Network Only:
             │  (Memory Limit: 4 GB) │  Zero published ports)
             └───────────────────────┘
```

- **Frontend:** Next.js on Vercel connecting via `NEXT_PUBLIC_PDF_API_URL`.
- **Compute:** Oracle Cloud Free Tier Ampere A1 instance (`linux/arm64`).
- **Security:** Stirling-PDF has zero public ports (SEC-8). The Gateway authenticates all calls via Supabase JWTs, enforces file magic bytes, and applies per-user rate and concurrency limits.

---

## Step 1: Provision the OCI Ampere Instance

1. In the Oracle Cloud Console, navigate to **Compute** → **Instances** → **Create Instance**.
2. **Image and Shape:**
   - **Image:** Canonical Ubuntu 24.04 Minimal aarch64 (or Oracle Linux 9 aarch64).
   - **Shape:** `VM.Standard.A1.Flex` (Ampere ARM processor).
   - **Allocation:** Up to 4 OCPUs and 24 GB RAM (Free Tier). Recommended for Stirling-PDF: **2 OCPUs, 8–12 GB RAM**.
3. **Networking:**
   - Select your Virtual Cloud Network (VCN) and Public Subnet.
   - Assign a public IPv4 address.
4. **SSH Keys:** Add your public SSH key.
5. Click **Create**.

---

## Step 2: Configure OCI VCN Ingress Rules

By default, OCI VCN security lists drop all incoming web traffic. You must explicitly allow HTTP and HTTPS:

1. Navigate to **Networking** → **Virtual Cloud Networks** → select your VCN.
2. Under **Resources**, click **Security Lists** → click **Default Security List for <VCN>**.
3. Click **Add Ingress Rules** and create two rules:
   - **Rule 1 (HTTP):**
     - Source CIDR: `0.0.0.0/0`
     - IP Protocol: `TCP`
     - Destination Port Range: `80`
     - Description: `Allow HTTP for Caddy Let's Encrypt challenge`
   - **Rule 2 (HTTPS):**
     - Source CIDR: `0.0.0.0/0`
     - IP Protocol: `TCP`
     - Destination Port Range: `443`
     - Description: `Allow HTTPS traffic to Caddy`

---

## Step 3: Open OS Firewall Ports (Crucial Step)

> [!IMPORTANT]
> Oracle Cloud Linux/Ubuntu instance images block ports 80 and 443 by default at the host OS level using `iptables` or `firewalld`, even when the VCN Security List permits them. You must open them on the instance.

Connect to your instance via SSH:
```bash
ssh ubuntu@<YOUR_INSTANCE_PUBLIC_IP>
```

### For Ubuntu:
```bash
# Insert ACCEPT rules before the final REJECT rule in the INPUT chain:
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT

# Persist the firewall rules across reboots:
sudo apt-get update && sudo apt-get install -y iptables-persistent
sudo netfilter-persistent save
sudo netfilter-persistent reload
```

### For Oracle Linux:
```bash
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --reload
```

---

## Step 4: Install Docker and Docker Compose (ARM64)

```bash
# Remove any conflicting packages
sudo apt-get remove -y docker docker-engine docker.io containerd runc

# Add Docker official GPG key and repo
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Allow current user to run docker commands
sudo usermod -aG docker $USER
newgrp docker
```

---

## Step 5: Deploy the Services Stack

1. Clone or copy the `services` directory to your instance (e.g. `/home/ubuntu/aboard-services`):
   ```bash
   mkdir -p ~/aboard-services
   cd ~/aboard-services
   ```

2. Create the production `.env` file:
   ```bash
   cat << 'EOF' > .env
   # Public domain pointing to this server (A record in DNS)
   DOMAIN=api.aboard.example.com

   # Supabase Project URL for JWKS JWT verification
   SUPABASE_URL=https://<your-project-ref>.supabase.co

   # Allowed CORS origins (Next.js app URL on Vercel and local dev)
   ALLOWED_ORIGINS=https://aboard.example.com,https://aboard-app.vercel.app,http://localhost:3000

   # Maximum upload size in megabytes (matches Caddy request_body limit)
   MAX_UPLOAD_MB=50
   EOF
   ```

3. Ensure directory structure:
   ```
   ~/aboard-services/
   ├── Caddyfile
   ├── docker-compose.yml
   ├── .env
   ├── stirling/
   │   └── configs/
   └── gateway/
       ├── Dockerfile
       ├── package.json
       ├── tsconfig.json
       └── src/
   ```

4. Build and start the stack in detached mode:
   ```bash
   docker compose up -d --build
   ```

5. Verify all containers are running and healthy:
   ```bash
   docker compose ps
   ```

---

## Step 6: Verify and Health Check

### 1. Local Container Check (on the instance):
```bash
# Check Caddy proxy to Gateway health:
curl -i http://localhost/pdf/health
# Expected output:
# HTTP/1.1 200 OK
# {"status":"ok","service":"aboard-pdf-gateway","allowedTools":["ocr","compress","office-to-pdf"],...}
```

### 2. Stirling Isolation Check (SEC-8):
Verify that Stirling-PDF is completely unreachable from the outside:
```bash
# From another machine or an external port scanner:
nmap -p 8080 <YOUR_INSTANCE_PUBLIC_IP>
# Must report: 8080/tcp closed or filtered.
```

### 3. Public Domain Check (once DNS propagates):
```bash
curl -i https://api.aboard.example.com/pdf/health
```

---

## Maintenance & Logs

- **View gateway logs:** `docker compose logs -f gateway`
- **View Caddy logs:** `docker compose logs -f caddy`
- **Restart stack:** `docker compose restart`
- **Stop stack:** `docker compose down`
