variable "project_id" {
  description = "The Google Cloud Project ID where the VM will be provisioned."
  type        = string
}

variable "region" {
  description = "GCP Region for the Compute Engine instance."
  type        = string
  default     = "asia-southeast2" # Jakarta
}

variable "zone" {
  description = "GCP Zone for the Compute Engine instance."
  type        = string
  default     = "asia-southeast2-a"
}

variable "instance_name" {
  description = "Name of the Compute Engine VM instance."
  type        = string
  default     = "z2g-migration-engine"
}

variable "machine_type" {
  description = "Machine type for the VM (e2-standard-4 recommended for 6-8 concurrent migration workers)."
  type        = string
  default     = "e2-standard-4"
}

variable "disk_size_gb" {
  description = "Boot disk size in GB."
  type        = number
  default     = 50
}

variable "disk_type" {
  description = "Boot disk type (pd-balanced or pd-ssd)."
  type        = string
  default     = "pd-balanced"
}

variable "network" {
  description = "VPC network name to attach the instance to."
  type        = string
  default     = "default"
}
