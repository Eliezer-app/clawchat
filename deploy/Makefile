APP_DIR = /opt/clawchat

.PHONY: setup deploy status logs build install-deps install-node install-service install-nginx ssl

# Full setup: install everything, build, configure systemd + nginx + ssl
setup: require-domain install-node install-deps build install-service install-nginx ssl
	@echo ""
	@echo "Setup complete. To enable push notifications, run: make push-setup"

require-domain:
ifndef DOMAIN
	$(eval DOMAIN := $(shell grep '^BASE_URL=' $(APP_DIR)/.env 2>/dev/null | sed 's|BASE_URL=https://||'))
endif
ifndef DOMAIN
	$(error DOMAIN is required. Usage: make setup DOMAIN=chat.example.com)
endif

# Deploy update: pull, install, build, restart
deploy:
	cd $(APP_DIR) && git pull
	cd $(APP_DIR) && corepack enable && pnpm install
	cd $(APP_DIR) && pnpm --filter @clawchat/shared build
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
	cd $(APP_DIR) && pnpm --filter @clawchat/shared build
	cd $(APP_DIR) && pnpm --filter @clawchat/client build
	cd $(APP_DIR) && pnpm --filter @clawchat/server build

install-service:
	@id -u clawchat >/dev/null 2>&1 || (sudo useradd -r -s /usr/sbin/nologin clawchat && echo "Created clawchat user")
	sudo mkdir -p $(APP_DIR)/server/data $(APP_DIR)/apps /opt/eliezer/chat-public
	@test -f $(APP_DIR)/.env || (cp $(APP_DIR)/.env.example $(APP_DIR)/.env && echo "Created .env from .env.example")
	@grep -q "^BASE_URL=" $(APP_DIR)/.env || echo "BASE_URL=https://$(DOMAIN)" >> $(APP_DIR)/.env
	sudo chown -R clawchat:clawchat $(APP_DIR)/server/data $(APP_DIR)/apps /opt/eliezer/chat-public
	sudo chown clawchat:clawchat $(APP_DIR)/.env
	sudo cp $(APP_DIR)/deploy/clawchat.service /etc/systemd/system/
	sudo systemctl daemon-reload
	sudo systemctl enable clawchat
	sudo systemctl restart clawchat

install-nginx:
	sudo apt-get install -y nginx
	sed 's/DOMAIN/$(DOMAIN)/g' $(APP_DIR)/deploy/nginx.conf | sudo tee /etc/nginx/sites-available/clawchat >/dev/null
	sudo ln -sf /etc/nginx/sites-available/clawchat /etc/nginx/sites-enabled/
	sudo nginx -t && sudo systemctl reload nginx

ssl:
	sudo apt-get install -y certbot python3-certbot-nginx
	@if sudo certbot certificates 2>/dev/null | grep -q "$(DOMAIN)"; then \
		echo "SSL cert for $(DOMAIN) already exists"; \
	else \
		sudo certbot --nginx -d $(DOMAIN); \
	fi

push-setup:
	@if [ -f $(APP_DIR)/.env ] && grep -q "^VAPID_PUBLIC_KEY=" $(APP_DIR)/.env; then \
		echo "VAPID keys already exist in .env"; \
	else \
		echo "Generating VAPID keys..."; \
		KEYS=$$(npx web-push generate-vapid-keys --json 2>/dev/null); \
		PUBLIC=$$(echo "$$KEYS" | grep -o '"publicKey":"[^"]*"' | cut -d'"' -f4); \
		PRIVATE=$$(echo "$$KEYS" | grep -o '"privateKey":"[^"]*"' | cut -d'"' -f4); \
		sed -i '/^#.*VAPID/d; /^#.*Push notification/d' $(APP_DIR)/.env; \
		echo "" >> $(APP_DIR)/.env; \
		echo "# Push notification VAPID keys" >> $(APP_DIR)/.env; \
		echo "VAPID_PUBLIC_KEY=$$PUBLIC" >> $(APP_DIR)/.env; \
		echo "VAPID_PRIVATE_KEY=$$PRIVATE" >> $(APP_DIR)/.env; \
		SUBJECT=$$(grep '^BASE_URL=' $(APP_DIR)/.env 2>/dev/null | cut -d= -f2); \
		if [ -z "$$SUBJECT" ]; then SUBJECT="mailto:admin@localhost"; fi; \
		echo "VAPID_SUBJECT=$$SUBJECT" >> $(APP_DIR)/.env; \
		echo "VAPID keys added to .env"; \
		echo "Restarting server..."; \
		sudo systemctl restart clawchat; \
	fi
