.PHONY: dev build typecheck lint clean install

# Development
dev:
	docker compose up

# Type checking
typecheck:
	docker compose exec -w /app/client client pnpm exec tsc --noEmit
	docker compose exec -w /app/server server pnpm exec tsc --noEmit

typecheck-client:
	docker compose exec -w /app/client client pnpm exec tsc --noEmit

typecheck-server:
	docker compose exec -w /app/server server pnpm exec tsc --noEmit

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
