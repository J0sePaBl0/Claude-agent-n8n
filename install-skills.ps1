# Installs n8n skills into Claude Code's global skills directory
$dest = "$env:USERPROFILE\.claude\skills"
New-Item -ItemType Directory -Force $dest | Out-Null
Copy-Item -Path "$PSScriptRoot\skills\*" -Destination $dest -Recurse -Force
Write-Host "n8n skills installed to $dest - restart Claude Code to activate."
