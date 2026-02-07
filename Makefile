.PHONY: dev build typecheck lint clean install push-setup push-rotate-keys connect-mock-agent connect-dev-agent

# Development
dev: connect-mock-agent

connect-mock-agent:
	cp .env.mock .env
	docker compose down && docker compose up -d

connect-dev-agent:
	cp .env.dev .env
	docker compose down && docker compose up -d

# Type checking
typecheck:
	docker compose exec -w /opt/clawchat/client client pnpm exec tsc --noEmit
	docker compose exec -w /opt/clawchat/server server pnpm exec tsc --noEmit

typecheck-client:
	docker compose exec -w /opt/clawchat/client client pnpm exec tsc --noEmit

typecheck-server:
	docker compose exec -w /opt/clawchat/server server pnpm exec tsc --noEmit

# Build
build:
	docker compose exec client pnpm build
	docker compose exec server pnpm build

# Install dependencies
install:
	docker compose run --rm client pnpm install
	docker compose run --rm server pnpm install

# Logs
logs:
	docker compose logs -f

logs-client:
	docker compose logs -f client

logs-server:
	docker compose logs -f server

# Shell access
shell-client:
	docker compose exec client sh

shell-server:
	docker compose exec server sh

# Clean
clean:
	docker compose down
	rm -rf client/dist server/dist

# Setup push notifications (generate VAPID keys and add to .env)
push-setup:
	@if [ -f .env ] && grep -q "VAPID_PUBLIC_KEY" .env; then \
		echo "VAPID keys already exist in .env"; \
	else \
		echo "Generating VAPID keys..."; \
		KEYS=$$(docker compose exec server npx web-push generate-vapid-keys --json 2>/dev/null); \
		PUBLIC=$$(echo "$$KEYS" | grep -o '"publicKey":"[^"]*"' | cut -d'"' -f4); \
		PRIVATE=$$(echo "$$KEYS" | grep -o '"privateKey":"[^"]*"' | cut -d'"' -f4); \
		echo "" >> .env; \
		echo "# Push notification VAPID keys" >> .env; \
		echo "VAPID_PUBLIC_KEY=$$PUBLIC" >> .env; \
		echo "VAPID_PRIVATE_KEY=$$PRIVATE" >> .env; \
		echo "VAPID_SUBJECT=mailto:admin@localhost" >> .env; \
		echo "VAPID keys added to .env"; \
		echo "Restarting server..."; \
		docker compose restart server; \
	fi

# Rotate VAPID keys (replaces existing keys in .env and restarts server)
push-rotate-keys:
	@echo "Generating new VAPID keys..."
	@KEYS=$$(docker compose exec server npx web-push generate-vapid-keys --json 2>/dev/null); \
	PUBLIC=$$(echo "$$KEYS" | grep -o '"publicKey":"[^"]*"' | cut -d'"' -f4); \
	PRIVATE=$$(echo "$$KEYS" | grep -o '"privateKey":"[^"]*"' | cut -d'"' -f4); \
	if [ -z "$$PUBLIC" ] || [ -z "$$PRIVATE" ]; then echo "Failed to generate keys"; exit 1; fi; \
	sed -i '' 's|^VAPID_PUBLIC_KEY=.*|VAPID_PUBLIC_KEY='"$$PUBLIC"'|' .env; \
	sed -i '' 's|^VAPID_PRIVATE_KEY=.*|VAPID_PRIVATE_KEY='"$$PRIVATE"'|' .env; \
	echo "VAPID keys rotated in .env"; \
	echo "Restarting server..."; \
	docker compose restart server
