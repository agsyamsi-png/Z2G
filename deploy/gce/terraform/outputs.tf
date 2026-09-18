output "external_ip" {
  description = "The public external IP address of the Z2G VM instance."
  value       = google_compute_instance.z2g_vm.network_interface[0].access_config[0].nat_ip
}

output "dashboard_url" {
  description = "URL to access the Z2G Migration Dashboard."
  value       = "http://${google_compute_instance.z2g_vm.network_interface[0].access_config[0].nat_ip}"
}

output "ssh_command" {
  description = "Command to SSH into the Z2G VM instance."
  value       = "gcloud compute ssh ${google_compute_instance.z2g_vm.name} --zone=${google_compute_instance.z2g_vm.zone} --project=${var.project_id}"
}

output "logs_command" {
  description = "Command to view live migration logs on the VM."
  value       = "gcloud compute ssh ${google_compute_instance.z2g_vm.name} --zone=${google_compute_instance.z2g_vm.zone} --project=${var.project_id} --command='sudo journalctl -u z2g -f'"
}
