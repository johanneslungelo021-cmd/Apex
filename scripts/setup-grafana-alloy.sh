#!/bin/bash

###########################################################
# Grafana Alloy Setup Script for Apex - Sentient Interface
# Run this script on your server with sudo privileges
###########################################################

set -e

echo "🚀 Setting up Grafana Alloy for Apex GitHub Metrics..."
echo ""

# Configuration
ALLOY_CONFIG_DIR="/etc/alloy"
ALLOY_CONFIG_FILE="/etc/alloy/config.alloy"
GITHUB_TOKEN_FILE="/etc/alloy/github_token.txt"

# Step 1: Create directory
echo "📁 Step 1: Creating Alloy configuration directory..."
sudo mkdir -p "$ALLOY_CONFIG_DIR"
echo "   ✓ Directory created: $ALLOY_CONFIG_DIR"

# Step 2: Prompt for GitHub Token
echo ""
echo "🔑 Step 2: GitHub Personal Access Token"
echo "   Create one at: https://github.com/settings/tokens"
echo "   Required scope: public_repo (read-only)"
echo ""
read -p "   Enter your GitHub token (starts with ghp_): " GITHUB_TOKEN

if [ -z "$GITHUB_TOKEN" ]; then
    echo "   ✗ Error: GitHub token is required!"
    exit 1
fi

# Step 3: Store GitHub token securely
echo ""
echo "🔐 Step 3: Storing GitHub token securely..."
echo "$GITHUB_TOKEN" | sudo tee "$GITHUB_TOKEN_FILE" > /dev/null
sudo chmod 600 "$GITHUB_TOKEN_FILE"
echo "   ✓ Token stored: $GITHUB_TOKEN_FILE"
echo "   ✓ Permissions set: 600"

# Step 4: Create/Update Alloy configuration
echo ""
echo "📝 Step 4: Creating Alloy configuration..."

# Check if config exists and backup
if [ -f "$ALLOY_CONFIG_FILE" ]; then
    echo "   Backing up existing config..."
    sudo cp "$ALLOY_CONFIG_FILE" "${ALLOY_CONFIG_FILE}.backup.$(date +%Y%m%d%H%M%S)"
fi

# Append GitHub exporter config
sudo tee -a "$ALLOY_CONFIG_FILE" > /dev/null << 'EOF'

///////////////////////////////////////////////////////////
// GitHub Exporter - Apex Repository Metrics
///////////////////////////////////////////////////////////

prometheus.exporter.github "apex" {
  repositories    = ["johanneslungelo021-cmd/Apex"]
  api_token_file  = "/etc/alloy/github_token.txt"
}

discovery.relabel "apex" {
  targets = prometheus.exporter.github.apex.targets

  rule {
    target_label = "instance"
    replacement  = "apex-vaal"
  }

  rule {
    target_label = "job"
    replacement  = "integrations/github"
  }
}

prometheus.scrape "apex" {
  targets    = discovery.relabel.apex.output
  forward_to = [prometheus.relabel.apex.receiver]
  job_name   = "integrations/github"
}

prometheus.relabel "apex" {
  forward_to = [prometheus.remote_write.metrics_service.receiver]

  rule {
    source_labels = ["__name__"]
    regex         = "up|github_rate_limit|github_rate_remaining|github_repo_forks|github_repo_open_issues|github_repo_pull_request_count|github_repo_size_kb|github_repo_stars|github_repo_watchers"
    action        = "keep"
  }
}

EOF

echo "   ✓ Configuration appended to: $ALLOY_CONFIG_FILE"

# Step 5: Restart Alloy service
echo ""
echo "🔄 Step 5: Restarting Alloy service..."
sudo systemctl restart alloy.service
echo "   ✓ Alloy service restarted"

# Step 6: Check service status
echo ""
echo "📊 Step 6: Checking service status..."
sleep 2
if sudo systemctl is-active --quiet alloy.service; then
    echo "   ✓ Alloy service is running"
else
    echo "   ✗ Alloy service is not running!"
    echo "   Check logs: sudo journalctl -u alloy.service -n 50"
    exit 1
fi

# Step 7: Show verification info
echo ""
echo "══════════════════════════════════════════════════════════════"
echo "✅ SETUP COMPLETE!"
echo "══════════════════════════════════════════════════════════════"
echo ""
echo "📍 Next Steps:"
echo ""
echo "1. Test connection at:"
echo "   https://dimakatsomoleli.grafana.net/a/grafana-assistant-app"
echo ""
echo "2. When test is green, click 'Install' for dashboards"
echo ""
echo "3. Verify metrics are being collected:"
echo "   curl http://localhost:12345/metrics | grep github_repo"
echo ""
echo "4. Check Alloy logs if needed:"
echo "   sudo journalctl -u alloy.service -f"
echo ""
echo "══════════════════════════════════════════════════════════════"
