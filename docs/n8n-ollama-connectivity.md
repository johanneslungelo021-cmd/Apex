# Ollama Connectivity Guide for n8n

## The "Byzantine API Blockade" Issue

When your Tri-Model Council gate shows **0 approve | 0 reject | 3 abstain**, it means your n8n instance cannot physically talk to Ollama. Here's how to fix this immediately.

---

## Scenario 1: n8n in Docker + Ollama on Host Machine

**Problem:** Using `localhost:11434` inside n8n container will fail because it looks inside the container, not at your host machine.

**Solution:** Use `host.docker.internal` to access host services from inside Docker.

```bash
# In your n8n environment variables or .env file
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

### For Docker Compose:

```yaml
services:
  n8n:
    image: n8nio/n8n
    environment:
      - OLLAMA_BASE_URL=http://host.docker.internal:11434
    extra_hosts:
      - "host.docker.internal:host-gateway"  # Required for Linux
```

> **Note:** On Linux, `host.docker.internal` requires Docker 20.10+ and the `extra_hosts` configuration above. On macOS and Windows, this is supported natively.

---

## Scenario 2: Ollama Binding Issue

**Problem:** Ollama binds to `127.0.0.1` by default, which only accepts connections from the local machine.

**Solution:** Tell Ollama to accept external requests.

### For Linux/macOS:

```bash
# Set the environment variable before starting Ollama
export OLLAMA_HOST=0.0.0.0:11434
ollama serve
```

### For Systemd (Linux):

Create or edit `/etc/systemd/system/ollama.service`:

```ini
[Unit]
Description=Ollama Service
After=network.target

[Service]
Type=simple
User=ollama
Environment="OLLAMA_HOST=0.0.0.0:11434"
ExecStart=/usr/local/bin/ollama serve
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Then reload and restart:

```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

### For Docker Ollama:

```bash
docker run -d \
  --gpus all \
  -p 0.0.0.0:11434:11434 \
  -v ollama:/root/.ollama \
  --name ollama \
  ollama/ollama
```

---

## Scenario 3: Both n8n and Ollama in Docker

If both services are in Docker, use Docker networking:

### Docker Compose:

```yaml
version: '3.8'

services:
  ollama:
    image: ollama/ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama

  n8n:
    image: n8nio/n8n
    depends_on:
      - ollama
    environment:
      - OLLAMA_BASE_URL=http://ollama:11434
    ports:
      - "5678:5678"

volumes:
  ollama_data:
```

---

## Verifying Connectivity

### 1. Check Ollama is Running

```bash
curl http://localhost:11434/api/tags
```

Expected response: JSON list of available models.

### 2. Test from Inside n8n Container

```bash
# Enter the n8n container
docker exec -it <n8n-container-name> sh

# Test connectivity
curl http://host.docker.internal:11434/api/tags
# OR for Docker network
curl http://ollama:11434/api/tags
```

### 3. Check Firewall Rules

```bash
# Linux (ufw)
sudo ufw allow 11434/tcp

# Linux (firewalld)
sudo firewall-cmd --add-port=11434/tcp --permanent
sudo firewall-cmd --reload
```

---

## n8n Workflow Configuration

The workflow JSON files have been updated with the correct fallback URL:

```json
{
  "parameters": {
    "url": "={{ ($env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434') + '/api/generate' }}"
  }
}
```

This uses:
1. `OLLAMA_BASE_URL` environment variable if set
2. Falls back to `http://host.docker.internal:11434` for Docker-to-host communication

---

## Required Models

Pull the models required by the Tri-Model Council:

```bash
# DeepSeek R1 (Reasoning)
ollama pull deepseek-v3.2

# Qwen 3.5 (Analysis)
ollama pull qwen3.5:397b

# Kimi K2 (Thinking)
ollama pull kimi-k2-thinking
```

---

## Troubleshooting Checklist

- [ ] Ollama service is running (`ps aux | grep ollama`)
- [ ] Ollama is listening on correct interface (`netstat -tlnp | grep 11434`)
- [ ] Firewall allows port 11434
- [ ] `OLLAMA_HOST=0.0.0.0` is set if n8n needs external access
- [ ] n8n environment has correct `OLLAMA_BASE_URL`
- [ ] Models are pulled (`ollama list`)
- [ ] n8n can reach Ollama URL (test with curl inside container)

---

## Quick Fix Summary

| Scenario | Solution |
|----------|----------|
| n8n in Docker, Ollama on host | `OLLAMA_BASE_URL=http://host.docker.internal:11434` |
| Ollama refusing connections | `OLLAMA_HOST=0.0.0.0:11434` |
| Both in Docker | Use Docker network: `http://ollama:11434` |
| Bare metal (both local) | `OLLAMA_BASE_URL=http://localhost:11434` |

---

## Security Note

When exposing Ollama on `0.0.0.0`, it becomes accessible from any IP that can reach your machine. Consider:

1. Running behind a reverse proxy with authentication
2. Using firewall rules to restrict access
3. Running on a private network only
4. Using a VPN for remote access
