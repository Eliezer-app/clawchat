APP_DIR = /opt/clawchat

.PHONY: setup deploy status logs build install-deps install-node install-service install-nginx ssl

# Full setup: install everything, build, configure systemd + nginx + ssl
setup: require-domain install-node install-deps build install-service install-nginx ssl

require-domain:
ifndef DOMAIN
	$(error DOMAIN is required. Usage: make setup DOMAIN=chat.example.com)
endif

# Deploy update: pull, install, build, restart
deploy:
	cd $(APP_DIR) && git pull
	cd $(APP_DIR) && corepack enable && pnpm install
	cd $(APP_DIR) && pnpm --filter @clawchat/client build
	cd $(APP_DIR) && pnpm --filter @clawchat/server build
	sudo systemctl restart clawchat

# Service status + recent logs
status:
	@systemctl status clawchat --no-pager || true
	@echo ""
	@journalctl -u clawchat -n 20 --no-pager

# Follow logs
logs:
	journalctl -u clawchat -f

# --- Internal targets ---

install-node:
	@if command -v node >/dev/null && node -v | grep -q '^v2[0-9]'; then \
		echo "Node $$(node -v) already installed"; \
	else \
		echo "Installing Node 20..."; \
		curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -; \
		sudo apt-get install -y nodejs; \
	fi
	sudo corepack enable

install-deps:
	cd $(APP_DIR) && pnpm install

build:
	cd $(APP_DIR) && pnpm --filter @clawchat/client build
	cd $(APP_DIR) && pnpm --filter @clawchat/server build

install-service:
	@test -f $(APP_DIR)/.env || (cp $(APP_DIR)/.env.example $(APP_DIR)/.env && echo "Created .env from .env.example — edit before starting")
	sudo cp $(APP_DIR)/deploy/clawchat.service /etc/systemd/system/
	sudo systemctl daemon-reload
	sudo systemctl enable --now clawchat

install-nginx:
	sudo apt-get install -y nginx
	sed 's/DOMAIN/$(DOMAIN)/g' $(APP_DIR)/deploy/nginx.conf | sudo tee /etc/nginx/sites-available/clawchat >/dev/null
	sudo ln -sf /etc/nginx/sites-available/clawchat /etc/nginx/sites-enabled/
	sudo nginx -t && sudo systemctl reload nginx

ssl:
	sudo apt-get install -y certbot python3-certbot-nginx
	sudo certbot --nginx -d $(DOMAIN)
