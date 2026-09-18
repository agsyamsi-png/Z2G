# ☁️ Deploying Z2G on Google Cloud Compute Engine (GCE)

This guide provides step-by-step instructions to deploy and run the **Z2G Migration Platform** on a 24/7 dedicated Google Compute Engine (GCE) VM instance.

Running on Compute Engine ensures:
- **Zero Sleep/Interruption**: Runs continuously in Google data centers regardless of whether your laptop is open, closed, or offline.
- **Ultra-Fast Network**: Direct high-bandwidth peering to Google Workspace APIs and stable gigabit egress to Zoho IMAP servers.
- **Automatic Process Supervision**: Managed by `systemd` (`z2g.service`) with auto-restart on any failure and auto-start on boot.
- **Deduplication Ledger Integrity**: Persistent disk preservation of `data/migration.db` and all 119,000+ migrated message hashes.

---

## ⚡ Option 1: 1-Click Deployment via Google Cloud Shell (Recommended)

Google Cloud Shell already has `gcloud`, `git`, and authentication pre-configured. No local tools are needed.

1. Open **Google Cloud Shell** in your browser:  
   👉 **[https://shell.cloud.google.com](https://shell.cloud.google.com)**

2. Paste and run this command:
   ```bash
   git clone https://github.com/agsyamsi-png/Z2G.git && cd Z2G && ./deploy/gce/deploy-vm.sh
   ```

3. **What happens automatically:**
   - Detects your GCP Project ID.
   - Creates the firewall rule `allow-z2g-web` (ports 80 and 3000).
   - Provisions an `e2-standard-4` VM (4 vCPUs, 16 GB RAM, Debian 12, 50 GB SSD).
   - Syncs the codebase, `.env.local`, and your 119k+ message database (`z2g-migration-data.tar.gz`).
   - Builds the production Next.js application.
   - Starts the `z2g.service` under `systemd` supervision.
   - Configures Nginx reverse proxy so port 80 maps directly to the dashboard.
   - Outputs your live dashboard URL: **`http://<VM_EXTERNAL_IP>`**.

4. Open **`http://<VM_EXTERNAL_IP>`** in your browser, go to **Bulk Migration**, and hit **"🔥 Run in YOLO Mode"**!

---

## 🛠️ Option 2: Deploying via Local `gcloud` CLI

If you have `gcloud` installed locally:

```bash
cd /path/to/Z2G
./deploy/gce/deploy-vm.sh
```

You can customize parameters by exporting environment variables before running:
```bash
export GCP_PROJECT="your-project-id"
export ZONE="asia-southeast2-a"      # Jakarta (or us-central1-a)
export MACHINE_TYPE="e2-standard-4"  # 4 vCPUs, 16 GB RAM
export INSTANCE_NAME="z2g-migration-engine"

./deploy/gce/deploy-vm.sh
```

---

## 🏗️ Option 3: Enterprise Infrastructure as Code (Terraform)

For organizations following Infrastructure-as-Code standards:

1. Navigate to the Terraform directory:
   ```bash
   cd deploy/gce/terraform
   ```

2. Copy the sample variables:
   ```bash
   cp terraform.tfvars.example terraform.tfvars
   ```
   Edit `terraform.tfvars` with your `project_id` and desired `region` / `zone`.

3. Initialize and provision:
   ```bash
   terraform init
   terraform apply
   ```

4. Terraform will provision the VM, firewall rules, and service account, and display the external IP and dashboard URL.

---

## 🐳 Option 4: Docker / Container-Optimized OS

If you prefer running inside a container on GCE or locally:

1. Build and start the container in detached mode:
   ```bash
   docker compose up -d --build
   ```

2. Check container logs:
   ```bash
   docker compose logs -f
   ```

3. Open `http://localhost:3000` or `http://<VM_EXTERNAL_IP>:3000`.

---

## 📡 Live Monitoring & Management on GCE

### 1. View Live Migration Logs via SSH
To stream live worker logs in real time from anywhere:
```bash
gcloud compute ssh z2g-migration-engine --zone=asia-southeast2-a --command="sudo journalctl -u z2g -f"
```

### 2. Check Service Health
```bash
gcloud compute ssh z2g-migration-engine --zone=asia-southeast2-a --command="sudo systemctl status z2g"
```

### 3. Restart the Service
```bash
gcloud compute ssh z2g-migration-engine --zone=asia-southeast2-a --command="sudo systemctl restart z2g"
```

### 4. Stop the VM after Migration Finishes
Once all mailboxes are migrated and reconciled, stop the VM to pause billing:
```bash
gcloud compute instances stop z2g-migration-engine --zone=asia-southeast2-a
```
*(When stopped, disk and state are preserved, and you only pay pennies per month for storage).*

---

## 🔒 Security Architecture
- **VPC Isolation**: The instance runs within your GCP VPC.
- **Least Privilege Service Account**: The VM uses a dedicated service account (`z2g-migration-sa`) with only Cloud Logging and Cloud Monitoring permissions.
- **Firewall Rules**: Restricted to HTTP (80) and App (3000) tagged specifically to `z2g-server`.
- **Identity-Aware Proxy (Optional)**: For zero-trust enterprise access without public IPs, run `gcloud compute start-iap-tunnel` to access the dashboard securely over IAP.
