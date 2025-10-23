#!/bin/bash

# Stop and remove SearXNG container
docker compose -f docker-compose.searxng.yml down

echo "SearXNG stopped and removed"