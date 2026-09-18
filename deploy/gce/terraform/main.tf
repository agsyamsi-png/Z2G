terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

# Dedicated Service Account with Least Privilege
resource "google_service_account" "z2g_sa" {
  account_id   = "z2g-migration-sa"
  display_name = "Z2G Migration Engine Service Account"
  project      = var.project_id
}

resource "google_project_iam_member" "logging" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.z2g_sa.email}"
}

resource "google_project_iam_member" "monitoring" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.z2g_sa.email}"
}

# Firewall Rule allowing HTTP (:80), HTTPS (:443), and App (:3000)
resource "google_compute_firewall" "z2g_firewall" {
  name    = "allow-z2g-web"
  network = var.network
  project = var.project_id

  allow {
    protocol = "tcp"
    ports    = ["80", "443", "3000"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["z2g-server"]
}

# Compute Engine VM Instance
resource "google_compute_instance" "z2g_vm" {
  name         = var.instance_name
  machine_type = var.machine_type
  zone         = var.zone
  project      = var.project_id

  tags = ["http-server", "https-server", "z2g-server"]

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
      size  = var.disk_size_gb
      type  = var.disk_type
    }
  }

  network_interface {
    network = var.network
    access_config {
      // Ephemeral public IP
    }
  }

  metadata_startup_script = file("${path.module}/../startup-script.sh")

  service_account {
    email  = google_service_account.z2g_sa.email
    scopes = ["cloud-platform"]
  }

  lifecycle {
    ignore_changes = [attached_disk]
  }
}
