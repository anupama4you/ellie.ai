# Ellie website avatar

The homepage's `#website-avatar` section presents a separate website service. The demo is a self-contained `<ellie-avatar>` web component, using the existing bundled Vapi SDK and Netlify configuration endpoint with `mode: "avatar"`. It uses the configured VAPI_WEB_ASSISTANT_ID and voice, overriding the demo persona and disabling model tools. Without an assistant ID it uses the existing transient-assistant fallback. VAPI_PUBLIC_KEY is required; private keys are never delivered to the browser.

## Embed

After this branch is deployed to callellie.com, add this to an HTTPS website:

```html
<ellie-avatar></ellie-avatar>
<script src="https://callellie.com/assets/avatar/ellie-avatar.js" defer></script>
```

The host must allow that script and Vapi/Daily's network/media resources in any Content Security Policy, allow microphone use, and include its domain in the Vapi public key's allowed origins. No iframe is required. The script resolves the SDK, configuration and privacy links against its own origin. This snippet runs the public Ellie demonstration, not an automatically provisioned customer assistant. Customer-specific assistants and business knowledge must be configured during service setup. Do not publish private API keys in markup.

The SVG character and styling are original and local. Mouth opening follows assistant audio amplitude reported by this bundled SDK's `volume-level` event. It is not phoneme-accurate lip sync or photorealistic video. Blinking and subtle movement are procedural; listening/speaking expressions follow call state, not inferred emotions. No avatar subscription is used. Vapi usage and hosting still cost money.

## Behaviour and checks

- Explicit user click and microphone permission; no autoplay call.
- Live transcripts use textContent, not HTML. They are held in the current component only; Vapi's configured recording/transcript policy still applies.
- Mute, hang up, retry, 45-second connection timeout, and 3-minute demo limit.
- Cancelling while loading invalidates the attempt; late events do not reopen the UI.
- Shared page call ownership prevents the homepage's other demos starting simultaneously.
- Shadow DOM isolates the widget styles. Reduced-motion preferences disable decorative movement.
- Client limits are convenience controls, not abuse protection. Keep provider-side duration/budget/origin limits enabled for public demos.

Run `NODE_PATH=$CODEX_PRIMARY_RUNTIME_NODE_MODULES node tests/avatar-browser.cjs` for mocked browser lifecycle checks. These verify UI/audio-event behaviour without spending Vapi credits. A deployed HTTPS microphone conversation remains necessary to verify the actual assistant, voice and provider configuration.
