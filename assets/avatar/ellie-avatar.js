/* Ellie website avatar. Self-contained, no avatar streaming service required. */
(() => {
  'use strict';
  if (customElements.get('ellie-avatar')) return;
  const base = new URL('.', document.currentScript.src);
  let sdkPromise;
  function loadSdk() {
    if (window.Vapi) return Promise.resolve(window.Vapi);
    if (!sdkPromise) sdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('../../vapi-sdk.js', base).href;
      script.onload = () => window.Vapi ? resolve(window.Vapi) : reject(new Error('Voice could not load. Please try again.'));
      script.onerror = () => reject(new Error('Voice could not load. Check your connection and try again.'));
      document.head.append(script);
    }).catch(error => { sdkPromise = null; throw error; });
    return sdkPromise;
  }
  class EllieAvatar extends HTMLElement {
    connectedCallback() {
      if (this.root) { window.addEventListener('pagehide', this.onLeave); return; }
      this.root = this.attachShadow({ mode: 'open' });
      this.root.innerHTML = `
        <style>
          :host{display:block;--accent:#c6b3ff;color:#f8f7ff;font-family:Inter,Arial,sans-serif}
          *{box-sizing:border-box}button{font:inherit;cursor:pointer}button:focus-visible{outline:3px solid #c6b3ff;outline-offset:4px}
          .card{overflow:hidden;border:1px solid #ffffff24;border-radius:28px;background:#161423;box-shadow:0 30px 80px #0003}
          .stage{position:relative;height:350px;background:radial-gradient(ellipse at 50% 65%,#72618c 0,#393047 46%,#211d2d 85%);overflow:hidden}
          .stage:after{content:'';position:absolute;inset:70% 0 0;background:linear-gradient(transparent,#161423);pointer-events:none}
          .top{position:absolute;top:20px;left:20px;right:20px;display:flex;justify-content:space-between;z-index:1;font-size:11px;letter-spacing:.07em}
          .badge{padding:8px 11px;border:1px solid #ffffff24;border-radius:30px;background:#19142188}.dot{display:inline-block;width:6px;height:6px;background:#c6b3ff;border-radius:50%;margin-right:6px}
          svg{display:block;height:100%;width:100%;overflow:visible}.head{transform-origin:220px 230px;animation:sway 8s ease-in-out infinite}.eyes{transform-box:fill-box;transform-origin:center;animation:blink 5.5s infinite}.brows{transition:transform .3s}
          :host([data-state=listening]) .head{animation:none;transform:rotate(-2deg)}:host([data-state=speaking]) .brows{transform:translateY(-2px)}
          @keyframes sway{0%,100%{transform:rotate(-1deg) translateY(1px)}50%{transform:rotate(1deg) translateY(-2px)}}
          @keyframes blink{0%,43%,47%,100%{transform:scaleY(1)}45%{transform:scaleY(.08)}}
          .body{padding:0 24px 24px;position:relative}.identity{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}.name{font-size:22px;font-weight:650;letter-spacing:-.6px}.sub{font-size:12px;color:#b7b0c7;margin-top:5px}.wave{height:25px;display:flex;align-items:center;gap:4px}.wave i{height:5px;width:3px;border-radius:4px;background:var(--accent);transition:height .1s}
          .caption{min-height:58px;font-size:14px;line-height:1.6;color:#e0dce9;margin:0 0 16px;overflow-wrap:anywhere}
          .actions{display:flex;gap:8px}.start{flex:1;border:0;border-radius:12px;padding:15px 10px;background:#d4c5ff;color:#24143c;font-weight:700;font-size:14px}.start:hover{background:#e1d6ff}.mute{border:1px solid #ffffff30;border-radius:12px;background:transparent;color:#fff;padding:12px}.mute[hidden]{display:none}
          .note{font-size:11px;color:#afa6be;text-align:center;line-height:1.5;margin:12px 0 0}.status{color:#ccc3dd;font-size:12px;margin-bottom:12px;min-height:18px}
          @media(prefers-reduced-motion:reduce){.head,.eyes{animation:none!important}.brows{transition:none}}
          @media(max-width:440px){.stage{height:300px}.body{padding:0 18px 20px}}
        </style>
        <div class="card">
          <div class="stage">
            <div class="top"><span class="badge"><span class="dot"></span>INTERACTIVE DEMO</span><span class="badge">AI AVATAR</span></div>
            <svg viewBox="0 0 440 350" role="img" aria-label="Ellie, an animated virtual receptionist">
              <defs>
                <linearGradient id="hair" x2="1" y2="1"><stop stop-color="#513829"/><stop offset="1" stop-color="#211b23"/></linearGradient>
                <linearGradient id="skin" x2=".8" y2="1"><stop stop-color="#f8ceb0"/><stop offset="1" stop-color="#d99578"/></linearGradient>
                <linearGradient id="jacket" x2="1" y2="1"><stop stop-color="#b3a0d3"/><stop offset="1" stop-color="#695584"/></linearGradient>
              </defs>
              <ellipse cx="220" cy="346" rx="138" ry="16" fill="#211b2d"/>
              <path d="M133 161Q112 245 132 301H311Q333 229 305 149Z" fill="url(#hair)"/>
              <path d="M86 365L100 295Q110 266 176 253L264 253Q327 264 341 295L354 365" fill="url(#jacket)"/>
              <path d="M178 252L220 277L264 252L255 355H185Z" fill="#eee5ec"/>
              <path d="M180 238V257Q220 291 260 257V234" fill="url(#skin)"/>
              <path d="M165 255L192 307L175 322L206 365H123L132 274Z M275 255L249 307L266 322L234 365H321L308 274Z" fill="#9c86be"/>
              <path d="M177 253L193 306M264 253L249 306" fill="none" stroke="#cfbde4" stroke-width="2"/>
              <g class="head">
                <path d="M134 162Q121 61 219 62Q314 57 311 171L291 229H147Z" fill="url(#hair)"/>
                <ellipse cx="151" cy="187" rx="12" ry="20" fill="#dd9b7d"/><ellipse cx="289" cy="187" rx="12" ry="20" fill="#dd9b7d"/>
                <path d="M151 138Q152 96 220 94Q287 96 289 143L281 218Q267 257 220 267Q174 257 158 218Z" fill="url(#skin)"/>
                <path d="M146 162Q121 71 209 66Q300 57 307 152Q263 136 248 101Q202 139 146 162" fill="url(#hair)"/>
                <path d="M154 133Q185 83 235 82M157 145Q199 129 227 104" fill="none" stroke="#74503a" stroke-width="4" opacity=".5" stroke-linecap="round"/>
                <g class="brows" fill="none" stroke="#644534" stroke-width="5" stroke-linecap="round"><path d="M171 170Q184 162 199 168"/><path d="M242 168Q257 162 269 170"/></g>
                <g class="eyes"><path d="M169 184Q185 170 201 184Q185 195 169 184M239 184Q255 170 271 184Q255 195 239 184" fill="#ffefdf"/><ellipse cx="186" cy="183" rx="6" ry="7" fill="#574b3e"/><ellipse cx="254" cy="183" rx="6" ry="7" fill="#574b3e"/><circle cx="186" cy="183" r="3" fill="#201a21"/><circle cx="254" cy="183" r="3" fill="#201a21"/><circle cx="188" cy="181" r="2" fill="white"/><circle cx="256" cy="181" r="2" fill="white"/><path d="M169 184Q185 170 201 184M239 184Q255 170 271 184" fill="none" stroke="#5b3931" stroke-width="2"/></g>
                <path d="M218 184L213 207Q220 212 227 206" fill="none" stroke="#be8066" stroke-width="2" stroke-linecap="round"/>
                <ellipse cx="177" cy="211" rx="14" ry="7" fill="#e69486" opacity=".38"/><ellipse cx="265" cy="211" rx="14" ry="7" fill="#e69486" opacity=".38"/>
                <g class="mouth"><ellipse cx="220" cy="230" rx="17" ry="2" fill="#702e3f"/><path d="M202 226Q211 221 220 224Q229 221 238 226Q220 240 202 226" fill="#ac5663"/><path d="M203 227Q220 231 237 227" stroke="#703343" fill="none" stroke-width="1.5"/></g>
                <circle cx="150" cy="208" r="4" fill="#e8d0a0"/><circle cx="290" cy="208" r="4" fill="#e8d0a0"/>
              </g>
              <circle cx="283" cy="299" r="9" fill="#d9c7ff"/><path d="M279 299h8m-6-3h4m-4 6h4" stroke="#685085" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="body">
            <div class="identity"><div><div class="name">Meet Ellie.</div><div class="sub">Your website, with a friendly face.</div></div><div class="wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div></div>
            <p class="caption">What if your next customer could just ask your website?</p>
            <div class="status" role="status" aria-live="polite">Ready when you are</div>
            <div class="actions"><button class="start" type="button">Talk to Ellie ↗</button><button class="mute" type="button" hidden aria-pressed="false">Mute mic</button></div>
            <p class="note">Microphone needed · Live AI conversation<br>By starting, you agree to our <a style="color:inherit" href="${new URL('../../privacy.html', base).href}" target="_blank" rel="noopener">privacy policy</a>.</p>
          </div>
        </div>`;
      this.button = this.root.querySelector('.start');
      this.status = this.root.querySelector('.status');
      this.caption = this.root.querySelector('.caption');
      this.mute = this.root.querySelector('.mute');
      this.mouth = this.root.querySelector('.mouth');
      this.closedMouth = this.mouth.innerHTML;
      this.bars = [...this.root.querySelectorAll('.wave i')];
      this.button.addEventListener('click', () => this.busy ? this.end() : this.start());
      this.mute.addEventListener('click', () => {
        this.muted = !this.muted;
        this.vapi?.setMuted(this.muted);
        this.mute.textContent = this.muted ? 'Unmute mic' : 'Mute mic';
        this.mute.setAttribute('aria-pressed', String(this.muted));
      });
      this.onLeave = () => this.end();
      window.addEventListener('pagehide', this.onLeave);
      this.setState('idle', 'Ready when you are');
    }
    disconnectedCallback() { this.end(); window.removeEventListener('pagehide', this.onLeave); }
    setState(state, label) { this.dataset.state = state; this.status.textContent = label; if (state !== 'speaking') this.animateMouth(0); }
    animateMouth(level) {
      const v = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
      // Amplitude-driven jaw opening, not phoneme/viseme synthesis.
      this.mouth.innerHTML = v < .025 ? this.closedMouth : `<ellipse cx="220" cy="230" rx="${15 + v * 2}" ry="${2 + v * 9}" fill="#693040" stroke="#ac5663" stroke-width="3"/><path d="M208 226Q220 229 232 226" fill="none" stroke="#ffeadb" stroke-width="3" stroke-linecap="round"/>`;
      this.bars.forEach((bar, i) => { bar.style.height = `${5 + v * (i % 2 ? 15 : 23)}px`; });
    }
    async start() {
      if (this.busy) return;
      if (window.__ellieCallOwner) { this.status.textContent = 'Please end your other Ellie call first.'; return; }
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        this.status.textContent = 'Voice needs HTTPS and a browser with microphone support.'; return;
      }
      window.__ellieCallOwner = this;
      this.busy = true;
      const token = this.token = {};
      this.button.textContent = 'Cancel connection';
      this.caption.textContent = 'Allow your microphone, then say hello. You can interrupt Ellie naturally.';
      this.setState('connecting', 'Connecting…');
      this.abort = new AbortController();
      this.timeout = setTimeout(() => this.end('Connection timed out. Please try again.'), 45000);
      try {
        const [Sdk, response] = await Promise.all([
          loadSdk(),
          fetch(new URL('../../.netlify/functions/demo-vapi-config', base), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'avatar' }), signal: this.abort.signal,
          }),
        ]);
        if (!response.ok) throw new Error('Could not connect. Please try again shortly.');
        const config = await response.json();
        if (this.token !== token) return;
        if (!config.publicKey) throw new Error('This demo is not configured yet. Please contact Ellie.');
        const VapiClass = typeof Sdk === 'function' ? Sdk : Sdk.default;
        const client = this.vapi = new VapiClass(config.publicKey);
        const on = (name, fn) => client.on(name, (...args) => { if (this.token === token) fn(...args); });
        on('call-start', () => {
          clearTimeout(this.timeout);
          this.button.textContent = 'End conversation';
          this.mute.hidden = false;
          this.setState('listening', 'Listening — go ahead');
          this.limit = setTimeout(() => this.end('Demo finished. Thanks for chatting!'), 180000);
        });
        on('speech-start', () => this.setState('speaking', 'Ellie is speaking'));
        on('speech-end', () => this.setState('listening', 'Listening — go ahead'));
        on('volume-level', level => { if (this.dataset.state === 'speaking') this.animateMouth(level); });
        on('message', message => {
          if (message.type !== 'transcript' || !message.transcript?.trim()) return;
          this.caption.textContent = `${message.role === 'assistant' ? 'Ellie' : 'You'}: ${message.transcript}`;
          if (message.role === 'user' && message.transcriptType === 'final') this.setState('thinking', 'Thinking…');
        });
        on('call-end', () => this.end('Conversation ended. Talk again anytime.'));
        on('error', () => this.end('Could not connect. Check microphone permission and try again.'));
        const call = config.assistantId
          ? await client.start(config.assistantId, config.assistantOverrides)
          : await client.start(config.assistantOverrides);
        if (this.token !== token) { await client.stop(); return; }
        if (!call) this.end('Could not start the call. Please try again.');
      } catch (error) {
        if (this.token === token) this.end(error.name === 'NotAllowedError' ? 'Microphone blocked. Allow access and try again.' : error.message);
      }
    }
    end(message = 'Conversation ended. Talk again anytime.') {
      this.token = null;
      this.abort?.abort();
      clearTimeout(this.timeout); clearTimeout(this.limit);
      const client = this.vapi; this.vapi = null;
      if (client) { try { Promise.resolve(client.stop()).catch(() => {}); } catch (_) {} }
      if (window.__ellieCallOwner === this) window.__ellieCallOwner = null;
      this.busy = false; this.muted = false;
      if (!this.root) return;
      this.mute.hidden = true; this.mute.textContent = 'Mute mic'; this.mute.setAttribute('aria-pressed', 'false');
      this.button.textContent = 'Talk to Ellie ↗';
      this.setState('idle', message);
    }
  }
  customElements.define('ellie-avatar', EllieAvatar);
})();
