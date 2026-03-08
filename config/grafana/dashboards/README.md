# Apex Grafana Dashboards

This directory contains Grafana dashboard configurations for monitoring the Apex Sentient Interface.

## Dashboards

### 1. Apex - Dashboard Query Analytics (`apex-usage-insights.json`)

Monitors Grafana usage insights to track dashboard query activity:
- **📊 Dashboard Query Events** - Count of data-request events over time
- **⏱ Avg Dashboard Query Duration** - Query latency trends
- **🗂 Queries by Datasource** - Breakdown by datasource type
- **📋 Live Dashboard Activity Logs** - Real-time query activity stream

**Datasource:** Loki (`grafanacloud-usage-insights`)

### 2. Apex - AI Agent Metrics (`apex-ai-agent-metrics.json`)

Comprehensive AI agent performance monitoring:
- **Query Metrics**
  - Query volume by status (success/error/timeout)
  - Queries by tier (simple/complex/research)
  - Security events (rate limits, payload rejections)
  - Inference latency percentiles (p50/p95/p99)
- **Cost Tracking**
  - Estimated API costs by tier
  - Total cost and cost per query
- **Model Usage**
  - Queries by model
  - Token usage rates

**Datasource:** Prometheus (`grafanacloud-prom`)

## Setup Instructions

### Option 1: Manual Import

1. Open your Grafana instance
2. Navigate to **Dashboards → New → Import**
3. Upload the JSON file or paste the contents
4. Select the appropriate datasource
5. Click **Import**

### Option 2: Provisioning (Recommended for Production)

1. Copy the dashboard JSON files to your Grafana dashboards directory:
   ```bash
   sudo mkdir -p /var/lib/grafana/dashboards/apex/
   sudo cp config/grafana/dashboards/*.json /var/lib/grafana/dashboards/apex/
   ```

2. Copy the provisioning configuration:
   ```bash
   sudo cp config/grafana/provisioning/dashboards/*.yaml /etc/grafana/provisioning/dashboards/
   sudo cp config/grafana/provisioning/datasources/*.yaml /etc/grafana/provisioning/datasources/
   ```

3. Configure environment variables for datasource credentials via systemd:
   ```bash
   # Create a systemd drop-in override for Grafana
   sudo mkdir -p /etc/systemd/system/grafana-server.service.d/
   sudo tee /etc/systemd/system/grafana-server.service.d/environment.conf <<EOF
   [Service]
   Environment="PROMETHEUS_URL=https://prometheus-prod-XX-prod-us-central-0.grafana.net"
   Environment="PROMETHEUS_USER=XXXXXX"
   Environment="PROMETHEUS_PASSWORD=YOUR_API_KEY"
   Environment="LOKI_URL=https://logs-prod-XX-prod-us-central-0.grafana.net"
   Environment="LOKI_USER=XXXXXX"
   Environment="LOKI_PASSWORD=YOUR_API_KEY"
   EOF
   
   # Reload systemd and restart Grafana
   sudo systemctl daemon-reload
   sudo systemctl restart grafana-server
   ```
   
   > **Note:** Shell `export` commands don't persist across `systemctl restart`. Use systemd `Environment=` directives or `/etc/default/grafana-server` as shown above.

## Metrics Reference

### Application Metrics (Prometheus)

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `apex_ai_agent_queries_total` | Counter | `status`, `tier`, `model`, `provider` | Total AI agent queries |
| `apex_inference_latency_seconds` | Histogram | `tier`, `model`, `provider` | Inference latency |
| `apex_cost_accumulator_usd_total` | Counter | `tier`, `model` | Estimated API costs |
| `apex_rate_limit_total` | Counter | `route` | Rate limit hits |
| `apex_payload_rejected_total` | Counter | `route` | Payload rejections |

### Log Metrics (Loki)

| Query | Description |
|-------|-------------|
| `count_over_time({service_name="grafana"} \|= "data-request" [$__auto])` | Query event count |
| `avg_over_time({...} \| unwrap duration [$__auto])` | Average query duration |
| `sum by(datasourceName) (count_over_time(...))` | Queries by datasource |

## Dashboard URLs

Once imported, dashboards will be available at:
- Usage Insights: `https://your-grafana/d/apex-usage-insights`
- AI Agent Metrics: `https://your-grafana/d/apex-ai-agent-metrics`

## Related Documentation

- [Grafana Dashboard Provisioning](https://grafana.com/docs/grafana/latest/administration/provisioning/#dashboards)
- [Loki Query Language](https://grafana.com/docs/loki/latest/query/)
- [PromQL Documentation](https://prometheus.io/docs/prometheus/latest/querying/basics/)
