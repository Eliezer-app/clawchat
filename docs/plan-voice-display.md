# Voice Display Mode

## Flow

1. [ ] Hotword detected → screen turns on
2. [ ] Ensure chat panel is visible (left half)
3. [x] Stream STT fragments into chat (user bubble updates live)
4. [x] Voice ends → chat bubble committed (final transcription)
5. [ ] Agent thinks
6. [x] Agent replies → TTS (voice output via subscriber)
7. [ ] If reply contains a widget → displayed in right panel

## Done

- **API**: `/user/send` and `/agent/send` with required role param
- **Partial messages**: streaming STT with auto-cleanup on timeout
- **Subscribers**: SUBSCRIBER_URLS delivers agent messages to external systems (voice TTS)
- **STT context**: `GET /stt-prompt` returns last 2 messages as plain text
- **Chrome panel management**: `scripts/chrome-panel.sh` for split-screen (left/right/close)
- **Mac bare-metal setup**: `deploy/setup-mac.sh`

## Open Questions

- Which system controls each step?
- Who detects the hotword? (voice system / terminal controller)
- Who turns the screen on? (osascript? pmset?)
- Who ensures the chat panel is visible? (voice system calls chrome-panel.sh? agent does it?)
- Who triggers TTS? (subscriber receives agent message, voice system speaks it)
- Who opens the widget in the right panel? (agent calls chrome-panel.sh? or sends a command?)

## TODO

- [ ] Display mode CSS (large text, no input, no settings)
- [ ] `/display` route in client
