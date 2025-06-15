#!/bin/bash
docker run --rm -v $(pwd)/data:/app/data booth-manager npx tsx /app/test-wishlist.ts