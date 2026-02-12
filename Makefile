.PHONY: dev build typecheck lint clean install push-setup push-rotate-keys connect-mock-agent connect-dev-agent api-docs invite prod-deploy prod-start prod-stop prod-status prod-logs prod-logs-all prod-logs-clear prod-invite prod-git-unlock

# Development
dev: connect-dev-agent

connect-mock-agent:
	$(MAKE) _switch-env ENV_FILE=.env.mock

connect-dev-agent:
	$(MAKE) _switch-env ENV_FILE=.env.dev

_switch-env:
	@PK=$$(grep '^VAPID_PUBLIC_KEY=.\+' .env 2>/dev/null | tail -1); \
	SK=$$(grep '^VAPID_PRIVATE_KEY=.\+' .env 2>/dev/null | tail -1); \
	SU=$$(grep '^VAPID_SUBJECT=.\+' .env 2>/dev/null | tail -1); \
	cp $(ENV_FILE) .env; \
	sed -i '' '/^VAPID_/d' .env; \
	if [ -n "$$PK" ]; then echo "$$PK" >> .env; fi; \
	if [ -n "$$SK" ]; then echo "$$SK" >> .env; fi; \
	if [ -n "$$SU" ]; then echo "$$SU" >> .env; fi
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
	@if systemctl is-enabled clawchat >/dev/null 2>&1; then \
		$(MAKE) -C deploy push-setup; \
	else \
		$(MAKE) _push-setup-dev; \
	fi

_push-setup-dev:
	@if [ -f .env ] && grep -q "^VAPID_PUBLIC_KEY=.\+" .env; then \
		echo "VAPID keys already exist in .env"; \
	else \
		echo "Generating VAPID keys..."; \
		KEYS=$$(docker compose exec server npx web-push generate-vapid-keys --json 2>/dev/null); \
		PUBLIC=$$(echo "$$KEYS" | grep -o '"publicKey":"[^"]*"' | cut -d'"' -f4); \
		PRIVATE=$$(echo "$$KEYS" | grep -o '"privateKey":"[^"]*"' | cut -d'"' -f4); \
		sed -i '' '/^#.*VAPID/d' .env; \
		sed -i '' '/^#.*Push notification/d' .env; \
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

# Create invite token
invite:
	docker compose exec server pnpm run invite

prod-invite:
	cd /opt/clawchat && pnpm run invite

# Production
prod-start:
	systemctl start clawchat

prod-stop:
	systemctl stop clawchat

prod-status:
	@systemctl status clawchat --no-pager || true
	@echo ""
	@curl -sf http://127.0.0.1:3101/api/health && echo || echo "Health check failed"

prod-deploy:
	$(MAKE) -C deploy deploy

prod-logs:
	journalctl -u clawchat -f

prod-logs-all:
	journalctl -u clawchat --no-pager | less

prod-logs-clear:
	sudo journalctl --rotate && sudo journalctl --vacuum-time=1s -u clawchat

prod-git-unlock:
	@echo 'eval "$$(ssh-agent -s)" && ssh-add /root/.ssh/git_access'

# Print Agent API docs (extracted from source comments)
api-docs:
	@awk '/^[[:space:]]*\/\/ (GET|POST|PUT|PATCH|DELETE) \//{p=1} p{if(/^[[:space:]]*\/\//){sub(/^[[:space:]]*\/\/ ?/,"");print}else{p=0}}' server/src/index.ts
