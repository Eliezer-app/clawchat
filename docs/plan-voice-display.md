# Voice Display Mode

## Flow

1. Hotword detected → screen turns on
2. Ensure chat panel is visible (left half)
3. Stream STT fragments into chat (user bubble updates live)
4. Voice ends → chat bubble committed (final transcription)
5. Agent thinks
6. Agent replies → TTS (voice output)
7. If reply contains a widget → displayed in right panel

## Open Questions

- Which system controls each step?
- Who detects the hotword? (voice system / terminal controller)
- Who turns the screen on? (osascript? pmset?)
- Who ensures the chat panel is visible? (voice system calls chrome-panel.sh? agent does it?)
- Who streams STT into chat? (voice system POSTs fragments to /send with role: "user"?)
- Who triggers TTS? (subscriber receives agent message, voice system speaks it)
- Who opens the widget in the right panel? (agent calls chrome-panel.sh? or sends a command?)
