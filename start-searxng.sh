#!/bin/bash

# Start SearXNG with proper DNS configuration for network connectivity
docker compose -f docker-compose.searxng.yml up -d

echo "SearXNG started on http://localhost:8085"
echo "Use 'stop-searxng.sh' to stop the container when done."