/* ============================================================
   Ellie AI Receptionist — Page Script
   callellie.com
   ============================================================ */

(function () {
  'use strict';

  // ── Light / dark theme toggle ─────────────────────────────
  const themeToggle = document.getElementById('theme-toggle');
  const savedTheme = localStorage.getItem('ellie-theme');
  if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      const next = isLight ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('ellie-theme', next);
    });
  }

  // ── Nav scroll ────────────────────────────────────────────
  const nav = document.getElementById('main-nav');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);
  }, { passive: true });

  // ── Mobile hamburger ──────────────────────────────────────
  const hamburger  = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobile-menu');

  hamburger.addEventListener('click', () => {
    const open = mobileMenu.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', String(open));
    const spans = hamburger.querySelectorAll('span');
    if (open) {
      spans[0].style.transform = 'translateY(7px) rotate(45deg)';
      spans[1].style.opacity   = '0';
      spans[2].style.transform = 'translateY(-7px) rotate(-45deg)';
    } else {
      spans.forEach(s => { s.style.transform = s.style.opacity = ''; });
    }
  });
  mobileMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      mobileMenu.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      hamburger.querySelectorAll('span').forEach(s => { s.style.transform = s.style.opacity = ''; });
    });
  });

  // ── Scroll reveal ─────────────────────────────────────────
  const revealObs = new IntersectionObserver(
    entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); revealObs.unobserve(e.target); }
    }),
    { threshold: 0.08, rootMargin: '0px 0px -32px 0px' }
  );
  document.querySelectorAll('.reveal').forEach(el => revealObs.observe(el));

  // ── Hero avatar video: tap to play talking clip, then back to loop ──
  const heroPlayBtn  = document.getElementById('hero-av-play');
  const heroVideo    = document.getElementById('hero-av-video');
  const heroAvSound  = document.querySelector('.hero-av-sound');

  const HERO_LOOP_SRC = 'assets/ellie/ellie-loop.mp4';
  const HERO_PLAY_SRC = 'assets/ellie/ellie-loop-play.mp4';

  function playHeroTalkClip() {
    if (!heroVideo) return;
    heroVideo.loop   = false;
    heroVideo.muted  = false;
    heroVideo.src    = HERO_PLAY_SRC;
    heroVideo.currentTime = 0;
    heroVideo.play().catch(() => {});
    if (heroPlayBtn) heroPlayBtn.classList.add('playing');
    if (heroAvSound) heroAvSound.classList.add('active');
  }

  function backToHeroLoop() {
    if (!heroVideo) return;
    heroVideo.loop  = true;
    heroVideo.muted = true;
    heroVideo.src   = HERO_LOOP_SRC;
    heroVideo.play().catch(() => {});
    if (heroPlayBtn) heroPlayBtn.classList.remove('playing');
    if (heroAvSound) heroAvSound.classList.remove('active');
  }

  if (heroVideo) {
    if (heroPlayBtn) heroPlayBtn.addEventListener('click', () => {
      if (heroVideo.src.includes('ellie-loop-play')) backToHeroLoop();
      else playHeroTalkClip();
    });
    heroVideo.addEventListener('ended', () => {
      if (heroVideo.src.includes('ellie-loop-play')) backToHeroLoop();
    });
  }

  // ── Clock in phone status bar ─────────────────────────────
  function updateClock() {
    const el = document.getElementById('phone-time');
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  updateClock();
  setInterval(updateClock, 30000);

  // ── Phone demo simulation ─────────────────────────────────
  const DEFAULT_DEMO_SCRIPT = [
    { role: 'ellie',  text: "Hi there! I'm Ellie, your AI receptionist. I answer calls, book appointments and send SMS confirmations 24/7. How can I help?", delay: 800 },
    { role: 'caller', text: "How do you handle bookings after hours?", delay: 3200 },
    { role: 'ellie',  text: "I never sleep! I answer every call within 2 rings — evenings, weekends, public holidays. I collect the customer's details and book straight into your calendar.", delay: 2600 },
    { role: 'caller', text: "What if someone asks something you don't know?", delay: 3200 },
    { role: 'ellie',  text: "I let them know I'll pass the message on, take their details, and notify you instantly. No caller ever gets an empty voicemail.", delay: 2600 },
    { role: 'caller', text: "How quickly can we get set up?", delay: 3000 },
    { role: 'ellie',  text: "Most businesses go live in under 20 minutes. Enter your website URL on the left and I'll learn your business right now!", delay: 2400 },
  ];

  let DEMO_SCRIPT = DEFAULT_DEMO_SCRIPT;

  // ── DOM refs ─────────────────────────────────────────────────
  const demoBizUrlInput  = document.getElementById('demo-biz-url');
  const demoBizBtn       = document.getElementById('demo-biz-btn');
  const demoUrlStatus    = document.getElementById('demo-url-status');
  const demoContactName  = document.getElementById('demo-contact-name');
  const demoContactLabel = document.getElementById('demo-contact-label');
  const demoPhoneNote    = document.getElementById('demo-phone-note');
  const demoStepUrl      = document.getElementById('demo-step-url');
  const demoStepEdit     = document.getElementById('demo-step-edit');
  const demoEditBack     = document.getElementById('demo-edit-back');
  const demoManualBtn    = document.getElementById('demo-manual-btn');
  const demoBriefFavicon = document.getElementById('demo-brief-favicon');
  const demoBriefDomain  = document.getElementById('demo-brief-domain');
  const demoBriefedBadge = document.getElementById('demo-briefed-badge');
  const editName         = document.getElementById('edit-name');
  const editPhone        = document.getElementById('edit-phone');
  const editLocation     = document.getElementById('edit-location');
  const editServices     = document.getElementById('edit-services');
  const editHours        = document.getElementById('edit-hours');
  const editDesc         = document.getElementById('edit-description');
  const demoGenerateBtn  = document.getElementById('demo-generate-btn');
  const demoGenerateName = document.getElementById('demo-generate-name');

  let briefedConfig = null; // stores full API response incl. publicKey + assistantOverrides

  function setDemoUrlStatus(type, msg) {
    if (!demoUrlStatus) return;
    demoUrlStatus.className = 'demo-url-status' + (type ? ' ' + type : '');
    demoUrlStatus.textContent = msg;
  }

  function setBtnLoading(loading) {
    if (!demoBizBtn) return;
    demoBizBtn.classList.toggle('loading', loading);
    demoBizBtn.disabled = loading;
    const phoneLoader = document.getElementById('phone-fetch-loader');
    if (phoneLoader) phoneLoader.classList.toggle('active', loading);
  }

  function getCompanyDomain(raw) {
    return extractDomain(raw || '').split('/')[0].split('?')[0].split('#')[0];
  }

  function showEditStep(data, fromUrl) {
    // Populate editable fields
    if (editName)     editName.value     = data.businessName        || '';
    if (editPhone)    editPhone.value    = data.businessPhone       || '';
    if (editLocation) editLocation.value = data.businessLocation    || '';
    if (editServices) editServices.value = data.businessServices    || '';
    if (editHours)    editHours.value    = data.businessHours       || '';
    if (editDesc)     editDesc.value     = data.businessDescription || '';

    const bName = data.businessName || 'Ellie';
    if (demoGenerateName) demoGenerateName.textContent = `${bName}'s`;

    if (fromUrl) {
      const domain = getCompanyDomain(fromUrl);
      if (demoBriefDomain) demoBriefDomain.textContent = domain;
      if (demoBriefFavicon) {
        demoBriefFavicon.style.display = '';
        demoBriefFavicon.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
        demoBriefFavicon.onerror = () => { demoBriefFavicon.style.display = 'none'; };
      }
      if (demoBriefedBadge) demoBriefedBadge.style.display = '';
    } else {
      if (demoBriefDomain)  demoBriefDomain.textContent   = 'Enter your details below';
      if (demoBriefFavicon) demoBriefFavicon.style.display = 'none';
      if (demoBriefedBadge) demoBriefedBadge.style.display = 'none';
    }

    // Also update generate button name when name field is edited
    if (editName) {
      editName.addEventListener('input', () => {
          }, { once: false });
    }

    if (demoStepUrl)  demoStepUrl.style.display  = 'none';
    if (demoStepEdit) demoStepEdit.style.display  = '';
  }

  function buildSystemPrompt(name, fields) {
    const lines = [
      fields.description,
      fields.services  && `Services: ${fields.services}`,
      fields.phone     && `Phone: ${fields.phone}`,
      fields.location  && `Location: ${fields.location}`,
      fields.hours     && `Hours: ${fields.hours}`,
    ].filter(Boolean);

    return `You are Ellie, the AI receptionist for ${name}. This is a live demo call — the person calling is trying Ellie out to see how she'd sound to their own customers, so stay fully in character as ${name}'s receptionist for the entire call.

Business context:
${lines.join('\n') || `${name} hasn't provided further business details yet — keep answers general and friendly, and don't invent specifics.`}

Persona: Warm, professional, calm under pressure. Speak in natural Australian English. Never sound robotic.

How to handle calls:
- Greet: "Thanks for calling ${name}, this is Ellie. How can I help you today?"
- For bookings: collect their first name, then say "We have tomorrow at 9:00am, 10:30am, or 2:00pm available — which works best for you?" Once they choose, treat their phone number as already known from the call — don't ask for it, and don't read digits back; just refer to it naturally.
- Once you have their name and preferred time, confidently wrap it up as done: "You're all booked in — I'll send a text confirmation to your number shortly." This is a simulated demo booking with no real calendar or SMS system behind it, so never mention checking a system, a tool, or "let me look that up" — always speak as though the booking and text message genuinely happened.
- For questions answerable from the context above: answer confidently and briefly.
- For questions you cannot answer from the context: "I'll make sure the team gets back to you on that soon."
- For after-hours enquiries: still answer politely, offer to book them in for tomorrow using the same flow above, and let them know ${name} is currently closed.
- If directly asked if you're an AI: be honest, then reassure them you can still fully help.
- Always end the call by pitching Ellie for their own business: "If you'd like to have me as your own receptionist, you can request a free callback down below."

Keep responses under 45 words unless the caller asks for more detail. Never make up pricing, hours, or services not in the context above.`;
  }

  function isValidWebsite(val) {
    try {
      const url = /^https?:\/\//i.test(val) ? val : `https://${val}`;
      const u = new URL(url);
      // Must have a proper hostname with at least one dot (e.g. example.com)
      return u.hostname.includes('.') && u.hostname.length > 3;
    } catch {
      return false;
    }
  }

  // Australian landline/mobile only — accepts 04xx xxx xxx, 0[2378] xxxx xxxx,
  // or the +61 equivalents, with any spaces/dashes/parens stripped first.
  function isValidAuPhone(val) {
    const digits = String(val || '').trim().replace(/[\s()-]/g, '');
    return /^(?:\+?61|0)[2-478]\d{8}$/.test(digits);
  }

  async function fetchAndBrief() {
    const val = demoBizUrlInput ? demoBizUrlInput.value.trim() : '';
    if (!val) return;

    if (!isValidWebsite(val)) {
      setDemoUrlStatus('error', 'Please enter a valid website, e.g. yourbusiness.com.au');
      demoBizUrlInput.focus();
      return;
    }

    setBtnLoading(true);
    setDemoUrlStatus('briefing', 'Analyzing your business website…');

    try {
      const res = await fetch('/.netlify/functions/demo-vapi-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessWebsite: val }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`server error ${res.status}`);
      const data = await res.json();
      briefedConfig = { ...data, _websiteUrl: val };
      setDemoUrlStatus('ready', `✓ Details fetched for ${data.businessName || getCompanyDomain(val)}`);
      showEditStep(data, val);

      // Save demo lead as soon as URL is analysed
      fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          'form-name':   'demo-lead',
          business_name: data.businessName    || '',
          website_url:   val,
          phone:         data.businessPhone   || '',
          location:      data.businessLocation|| '',
          services:      data.businessServices|| '',
          hours:         data.businessHours   || '',
          description:   data.businessDescription || '',
        }).toString(),
      }).catch(() => {});
    } catch (err) {
      briefedConfig = null;
      const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      setDemoUrlStatus('error', isTimeout
        ? '⚠ Website took too long — try again or click "Enter manually" below'
        : '⚠ Could not read website — try again or click "Enter manually" below');
      // Stay on URL step so the error is visible; user can retry or go manual
    } finally {
      setBtnLoading(false);
    }
  }

  if (demoBizBtn)      demoBizBtn.addEventListener('click', fetchAndBrief);
  if (demoBizUrlInput) demoBizUrlInput.addEventListener('keydown', e => { if (e.key === 'Enter') fetchAndBrief(); });

  if (demoManualBtn) demoManualBtn.addEventListener('click', () => {
    briefedConfig = null;
    setDemoUrlStatus('', '');
    showEditStep({}, null);
  });

  if (demoEditBack) demoEditBack.addEventListener('click', () => {
    if (demoStepEdit) demoStepEdit.style.display = 'none';
    if (demoStepUrl)  demoStepUrl.style.display  = '';
    setDemoUrlStatus('', '');
  });

  if (demoGenerateBtn) demoGenerateBtn.addEventListener('click', () => {
    const name     = editName?.value.trim()     || 'Ellie';
    const phone    = editPhone?.value.trim()    || '';
    const location = editLocation?.value.trim() || '';
    const services = editServices?.value.trim() || '';
    const hours    = editHours?.value.trim()    || '';
    const desc     = editDesc?.value.trim()     || '';

    const systemPrompt = buildSystemPrompt(name, { description: desc, phone, location, services, hours });
    const firstMessage = `Thanks for calling ${name}, this is Ellie. How can I help you today?`;

    // Store generated prompt separately — startDemo() always fetches fresh VAPI config
    // and patches these in, so we never pass stale session data to VAPI.
    briefedConfig = {
      ...(briefedConfig || {}),
      _generated:    true,
      _systemPrompt: systemPrompt,
      _firstMessage: firstMessage,
    };

    // Silently save demo lead to Netlify Forms
    try {
      fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          'form-name':   'demo-lead',
          business_name: name,
          website_url:   briefedConfig?._websiteUrl || '',
          phone,
          location,
          services,
          hours,
          description:   desc,
        }).toString(),
      }).catch(() => {});
    } catch {}

    // Update phone UI to show ready state
    if (demoContactName)  demoContactName.textContent  = name;
    if (demoContactLabel) demoContactLabel.textContent = 'Ellie · AI Receptionist';
    if (demoPhoneNote)    demoPhoneNote.textContent    = `${name}'s Ellie is ready — press Call`;

    // Vibrate call button + show bubble
    const callWrap = document.getElementById('call-btn-wrap');
    if (callWrap) {
      callWrap.classList.remove('ready');
      void callWrap.offsetWidth; // force reflow to restart animation
      callWrap.classList.add('ready');
    }

    // On mobile, scroll the phone into view so user sees the animated call button
    if (window.innerWidth < 900) {
      const phoneWrap = document.querySelector('.phone-wrap');
      if (phoneWrap) {
        setTimeout(() => phoneWrap.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
      }
    }
  });

  const callBtn    = document.getElementById('demo-call-btn');
  const endBtn     = document.getElementById('demo-end-btn');
  const btns       = document.getElementById('demo-btns');
  const transcript = document.getElementById('demo-transcript');
  const emptyEl    = document.getElementById('demo-transcript-empty');
  const statusDot  = document.getElementById('demo-status-dot');
  const statusText = document.getElementById('demo-status-text');
  const timerEl    = document.getElementById('demo-timer');
  const waveEl     = document.getElementById('demo-wave');
  const avatarFrame = document.getElementById('demo-phone-avatar');

  let demoActive   = false;
  let demoTimeout  = null;
  let timerInterval = null;
  let timerSecs    = 0;
  let pendingTimeouts = [];

  function clearAllTimeouts() {
    pendingTimeouts.forEach(t => clearTimeout(t));
    pendingTimeouts = [];
  }

  function scheduleTimeout(fn, delay) {
    const t = setTimeout(fn, delay);
    pendingTimeouts.push(t);
    return t;
  }

  function setStatus(text, connected) {
    statusText.textContent = text;
    statusDot.classList.toggle('active', connected);
  }

  function setWave(active) {
    waveEl.classList.toggle('active', active);
  }

  function setAvatarState(state) {
    if (!avatarFrame) return;
    avatarFrame.classList.remove('phone-state-speaking');
    if (state === 'speaking') avatarFrame.classList.add('phone-state-speaking');
    const talking = avatarFrame.querySelector('.phone-avatar-talking');
    if (talking) {
      talking.style.opacity = state === 'speaking' ? '0.85' : '0';
    }
  }

  function addBubble(role, text) {
    if (emptyEl) emptyEl.style.display = 'none';
    const msg = document.createElement('div');
    msg.className = `log-msg ${role === 'caller' ? 'caller' : ''}`;
    const isEllie = role === 'ellie';
    msg.innerHTML = `
      <div class="log-avatar ${isEllie ? 'ellie-av' : 'caller-av'}">${isEllie ? 'E' : 'Y'}</div>
      <div class="log-body">
        <div class="log-who">${isEllie ? 'Ellie' : 'You'}</div>
        <div class="log-bubble ${isEllie ? 'ellie-bub' : 'caller-bub'}">${text}</div>
      </div>`;
    transcript.appendChild(msg);
    requestAnimationFrame(() => msg.classList.add('show'));
    transcript.scrollTop = transcript.scrollHeight;
    return msg;
  }

  function addTyping() {
    if (emptyEl) emptyEl.style.display = 'none';
    const msg = document.createElement('div');
    msg.className = 'log-msg';
    msg.innerHTML = `
      <div class="log-avatar ellie-av">E</div>
      <div class="log-body">
        <div class="log-who">Ellie</div>
        <div class="log-bubble ellie-bub">
          <div class="log-typing"><span></span><span></span><span></span></div>
        </div>
      </div>`;
    transcript.appendChild(msg);
    requestAnimationFrame(() => msg.classList.add('show'));
    transcript.scrollTop = transcript.scrollHeight;
    return msg;
  }

  let vapiInstance = null;

  function resetDemo() {
    clearAllTimeouts();
    clearInterval(timerInterval);
    stopRing();
    timerSecs = 0;
    demoActive = false;
    if (vapiInstance) { try { vapiInstance.stop(); } catch(_) {} vapiInstance = null; }
    transcript.innerHTML = '';
    if (emptyEl) { transcript.appendChild(emptyEl); emptyEl.style.display = ''; }
    setStatus('Ready to call', false);
    setWave(false);
    setAvatarState('idle');
    timerEl.textContent = '';
    btns.className = 'phone-btns phone-btns-idle';
    callBtn.style.display = '';
    endBtn.style.display  = 'none';
  }

  /* ── Synthetic ring tone (AU: 400+450 Hz, 400ms on/200ms off × 2, 2s silence) ── */
  let ringCtx = null, ringTimeout = null;
  function startRing() {
    stopRing();
    try {
      ringCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (_) { return; }

    function beep(startAt, dur) {
      [400, 450].forEach(freq => {
        const osc  = ringCtx.createOscillator();
        const gain = ringCtx.createGain();
        osc.type      = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, startAt);
        gain.gain.linearRampToValueAtTime(0.18, startAt + 0.02);
        gain.gain.setValueAtTime(0.18, startAt + dur - 0.02);
        gain.gain.linearRampToValueAtTime(0, startAt + dur);
        osc.connect(gain);
        gain.connect(ringCtx.destination);
        osc.start(startAt);
        osc.stop(startAt + dur);
      });
    }

    function scheduleRing() {
      if (!ringCtx) return;
      const now = ringCtx.currentTime;
      // AU pattern: 0.4s on, 0.2s off, 0.4s on, 2s silence = 3s cycle
      beep(now,        0.4);
      beep(now + 0.6,  0.4);
      ringTimeout = setTimeout(scheduleRing, 3000);
    }
    scheduleRing();
  }
  function stopRing() {
    clearTimeout(ringTimeout);
    if (ringCtx) { try { ringCtx.close(); } catch (_) {} ringCtx = null; }
  }

  async function startDemo() {
    if (demoActive) return;
    demoActive = true;
    btns.className = 'phone-btns phone-btns-active';
    callBtn.style.display = 'none';
    endBtn.style.display  = '';
    setStatus('Ringing…', false);
    startRing();
    document.getElementById('call-btn-wrap')?.classList.remove('ready');

    try {
      // Always fetch a fresh config from the server for a valid publicKey/session.
      // If the user went through Generate, we patch the overrides with their edited fields.
      // If user already clicked Generate, the system prompt is pre-built client-side —
      // no need to re-crawl. Just fetch the generic config (fast) and patch it in below.
      const cfgRes = await fetch('/.netlify/functions/demo-vapi-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!cfgRes.ok) throw new Error('Could not prepare company context');
      const { publicKey, assistantId, assistantOverrides } = await cfgRes.json();

      // If user clicked Generate, override the system prompt + firstMessage with their edited fields
      if (briefedConfig?._generated) {
        const { _systemPrompt, _firstMessage } = briefedConfig;
        if (_systemPrompt && assistantOverrides?.model?.messages?.[0]) {
          assistantOverrides.model.messages[0].content = _systemPrompt;
        }
        if (_firstMessage) assistantOverrides.firstMessage = _firstMessage;
      }

      const VapiClass = (typeof Vapi === 'function') ? Vapi : Vapi.default;
      const vapi = new VapiClass(publicKey);
      vapiInstance = vapi;

      // ── UI events ──────────────────────────────────────────
      vapi.on('call-start', () => {
        stopRing();
        document.getElementById('call-btn-wrap')?.classList.remove('ready');
        setStatus('Connected', true);
        timerSecs = 0;
        timerEl.textContent = '0:00';
        timerInterval = setInterval(() => {
          timerSecs++;
          timerEl.textContent = `${Math.floor(timerSecs/60)}:${String(timerSecs%60).padStart(2,'0')}`;
        }, 1000);
      });

      vapi.on('call-end', () => {
        clearInterval(timerInterval);
        setStatus('Call ended', false);
        setWave(false);
        setAvatarState('idle');
        demoActive = false;
        btns.className = 'phone-btns phone-btns-idle';
        callBtn.style.display = '';
        endBtn.style.display  = 'none';
        vapiInstance = null;
      });

      vapi.on('speech-start', () => {
        setWave(true);
        setAvatarState('speaking');
        setStatus('Ellie is speaking…', true);
      });

      vapi.on('speech-end', () => {
        setWave(false);
        setAvatarState('idle');
        setStatus('Listening…', true);
      });

      vapi.on('message', (msg) => {
        if (msg.type === 'transcript' && msg.transcriptType === 'final' && msg.transcript?.trim()) {
          addBubble(msg.role === 'assistant' ? 'ellie' : 'caller', msg.transcript.trim());
        }
      });

      vapi.on('error', (err) => {
        console.error('VAPI error', err);
        stopRing();
        setStatus('Could not connect', false);
        resetDemo();
      });

      // ── Start the call ────────────────────────────────────
      // If a pre-built assistantId exists use it with overrides,
      // otherwise pass the full config as a transient assistant.
      if (assistantId) {
        vapi.start(assistantId, assistantOverrides);
      } else {
        vapi.start(assistantOverrides);
      }

    } catch (err) {
      console.error('Demo start error', err);
      setStatus('Connection failed', false);
      resetDemo();
    }
  }

  if (callBtn) callBtn.addEventListener('click', startDemo);
  if (endBtn)  endBtn.addEventListener('click',  resetDemo);

  // ── Hero URL bar → visible demo ───────────────────────────
  const heroBizUrl   = document.getElementById('hero-biz-url');
  const heroUrlBtn   = document.getElementById('hero-url-btn');
  const heroDomBadge = document.getElementById('hero-domain-badge');
  const heroDomText  = document.getElementById('hero-domain-text');

  function extractDomain(url) {
    try {
      const s = url.includes('://') ? url : 'https://' + url;
      return new URL(s).hostname.replace(/^www\./, '');
    } catch { return url.trim(); }
  }

  function applyHeroUrl(raw) {
    if (!raw) {
      if (demoBizUrlInput) demoBizUrlInput.focus();
      return;
    }
    const domain = extractDomain(raw);
    if (heroDomText) heroDomText.textContent = domain;
    if (heroDomBadge) heroDomBadge.classList.add('visible');

    // Pre-fill the visible demo and the disabled live-call section if it is re-enabled later.
    if (demoBizUrlInput) demoBizUrlInput.value = raw;
    const liveUrl = document.getElementById('live-website-url');
    if (liveUrl) liveUrl.value = raw;
    applyLiveBriefing(raw);
  }

  if (heroBizUrl) {
    heroBizUrl.addEventListener('input', () => {
      const v = heroBizUrl.value.trim();
      if (heroDomBadge) heroDomBadge.classList.toggle('visible', v.length > 4);
      if (v.length > 4 && heroDomText) heroDomText.textContent = extractDomain(v);
    });
  }

  if (heroUrlBtn) {
    heroUrlBtn.addEventListener('click', () => {
      const url = heroBizUrl ? heroBizUrl.value.trim() : '';

      // If Ellie is already generated, jump straight to the phone
      if (briefedConfig?._generated) {
        const phoneWrap = document.querySelector('.phone-wrap');
        (phoneWrap || document.getElementById('demo'))
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      applyHeroUrl(url);
      if (url && demoBizUrlInput) {
        demoBizUrlInput.value = url;
        fetchAndBrief();
      }
      const target = document.getElementById('demo');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // ── Try Live: website URL briefing ────────────────────────
  const liveWebsiteUrl    = document.getElementById('live-website-url');
  const liveBriefingBadge = document.getElementById('live-briefing-badge');
  const liveBriefingText  = document.getElementById('live-briefing-text');
  const liveDescDefault   = document.getElementById('live-desc-default');
  const liveDescBriefed   = document.getElementById('live-desc-briefed');
  const liveBriefedDomain = document.getElementById('live-briefed-domain');

  function applyLiveBriefing(url) {
    if (!url) return;
    const domain = extractDomain(url);
    if (liveBriefingBadge) liveBriefingBadge.classList.add('visible');
    if (liveBriefingText) liveBriefingText.textContent = 'Ellie is studying ' + domain + '…';
    if (liveBriefedDomain) liveBriefedDomain.textContent = domain;
    if (liveDescDefault) liveDescDefault.classList.add('hidden');
    if (liveDescBriefed) liveDescBriefed.classList.add('visible');
    // After 2s, change to "ready" state
    setTimeout(() => {
      if (liveBriefingText) liveBriefingText.textContent = '✓ Ellie is ready to represent ' + domain;
      if (liveBriefingBadge) liveBriefingBadge.style.background = 'rgba(34,197,94,.07)';
      if (liveBriefingBadge) liveBriefingBadge.style.borderColor = 'rgba(34,197,94,.25)';
      if (liveBriefingBadge) liveBriefingBadge.style.color = '#4ade80';
      const dots = liveBriefingBadge ? liveBriefingBadge.querySelector('.live-briefing-dots') : null;
      if (dots) dots.style.display = 'none';
    }, 2200);
  }

  if (liveWebsiteUrl) {
    let briefDebounce = null;
    liveWebsiteUrl.addEventListener('input', () => {
      clearTimeout(briefDebounce);
      const v = liveWebsiteUrl.value.trim();
      if (!v || v.length < 5) {
        if (liveBriefingBadge) liveBriefingBadge.classList.remove('visible');
        if (liveDescDefault) liveDescDefault.classList.remove('hidden');
        if (liveDescBriefed) liveDescBriefed.classList.remove('visible');
        return;
      }
      // Reset state
      if (liveBriefingBadge) { liveBriefingBadge.style.background = ''; liveBriefingBadge.style.borderColor = ''; liveBriefingBadge.style.color = ''; }
      const dots = liveBriefingBadge ? liveBriefingBadge.querySelector('.live-briefing-dots') : null;
      if (dots) dots.style.display = '';
      briefDebounce = setTimeout(() => applyLiveBriefing(v), 600);
    });
  }

  // ── Live call (outbound via Netlify function) ─────────────
  const liveBiz     = document.getElementById('live-biz');
  const livePhone   = document.getElementById('live-phone');
  const liveCallBtn = document.getElementById('live-call-btn');
  const liveStatus  = document.getElementById('live-status');

  function flashInvalid(el) {
    el.style.borderColor = '#ef4444';
    el.focus();
    setTimeout(() => { el.style.borderColor = ''; }, 1800);
  }

  if (liveCallBtn) {
    liveCallBtn.addEventListener('click', async () => {
      const biz     = liveBiz   ? liveBiz.value.trim()   : '';
      const phone   = livePhone ? livePhone.value.trim() : '';
      const website = liveWebsiteUrl ? liveWebsiteUrl.value.trim() : '';
      if (!isValidAuPhone(phone)) { flashInvalid(livePhone); return; }

      liveCallBtn.disabled = true;
      liveStatus.hidden = false;

      if (website) {
        liveStatus.className = 'live-status live-status--calling';
        liveStatus.textContent = 'Briefing Ellie on ' + extractDomain(website) + '…';
        await new Promise(r => setTimeout(r, 1600));
      }

      liveStatus.className = 'live-status live-status--calling';
      liveStatus.textContent = 'Calling your number now…';

      try {
        const res  = await fetch('/.netlify/functions/call-initiate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, businessType: biz || 'General', businessWebsite: website }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Could not start call');

        liveStatus.className = 'live-status live-status--success';
        liveStatus.textContent = website
          ? 'Ellie is calling you now — she knows your business. Pick up and start talking!'
          : 'Ellie is calling you now! Pick up and start talking.';
        setTimeout(() => { liveCallBtn.disabled = false; liveStatus.hidden = true; }, 35000);
      } catch (err) {
        liveStatus.className = 'live-status live-status--error';
        liveStatus.textContent = err.message || 'Something went wrong — please try again.';
        liveCallBtn.disabled = false;
      }
    });
  }

  // ── Tech features accordion ───────────────────────────────
  document.querySelectorAll('.ellie-tech-feat').forEach(feat => {
    feat.addEventListener('click', () => {
      const isOpen = feat.classList.contains('open');
      document.querySelectorAll('.ellie-tech-feat.open').forEach(f => f.classList.remove('open'));
      if (!isOpen) feat.classList.add('open');
    });
  });

  // ── FAQ accordion ─────────────────────────────────────────
  document.querySelectorAll('.faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const item   = btn.closest('.faq-item');
      const answer = item.querySelector('.faq-a');
      const isOpen = item.classList.contains('open');

      document.querySelectorAll('.faq-item.open').forEach(other => {
        if (other !== item) {
          other.classList.remove('open');
          other.querySelector('.faq-a').style.maxHeight = null;
          other.querySelector('.faq-q').setAttribute('aria-expanded', 'false');
        }
      });

      item.classList.toggle('open', !isOpen);
      btn.setAttribute('aria-expanded', String(!isOpen));
      answer.style.maxHeight = isOpen ? null : answer.scrollHeight + 'px';
    });
  });

  // ── Free trial callback form ──────────────────────────────
  const trialForm      = document.getElementById('trial-form');
  const trialFlipInner = document.getElementById('trial-flip-inner');
  const trialResubmit  = document.getElementById('trial-resubmit');

  if (trialForm) {
    const trialPhone = trialForm.querySelector('input[name="phone"]');

    trialForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (trialPhone && !isValidAuPhone(trialPhone.value)) {
        flashInvalid(trialPhone);
        return;
      }

      if (typeof confetti === 'function') {
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 }, colors: ['#a78bfa','#ec4899','#34d399','#fbbf24','#60a5fa'] });
        setTimeout(() => confetti({ particleCount: 60, spread: 120, origin: { y: 0.55 }, colors: ['#a78bfa','#ec4899','#34d399'] }), 350);
      }

      trialFlipInner.classList.add('flipped');

      try {
        await fetch('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(new FormData(trialForm)).toString(),
        });
      } catch {}
    });
  }

  if (trialResubmit) {
    trialResubmit.addEventListener('click', () => {
      trialFlipInner.classList.remove('flipped');
      setTimeout(() => trialForm.reset(), 400);
    });
  }

  // ── Demo booking form ─────────────────────────────────────
  const demoForm  = document.getElementById('demo-form');
  const ctaSubmit = document.getElementById('cta-submit');

  if (demoForm) {
    demoForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      ctaSubmit.disabled = true;
      ctaSubmit.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Request sent! We'll be in touch within 1 business day.`;
      ctaSubmit.style.background = 'linear-gradient(135deg,#22c55e,#16a34a)';
      ctaSubmit.style.boxShadow  = '0 0 28px rgba(34,197,94,.4)';
      demoForm.querySelectorAll('input, select, textarea').forEach(el => el.disabled = true);
    });
  }

  // ── Dashboard gallery: huge hover preview (desktop only) ──
  const dashPreview    = document.getElementById('dash-hover-preview');
  const dashPreviewImg = document.getElementById('dash-hover-preview-img');
  const dashPreviewTag = document.getElementById('dash-hover-preview-tag');

  if (dashPreview && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.querySelectorAll('.dash-gallery-card').forEach(card => {
      const img = card.querySelector('img');
      const tag = card.querySelector('.dash-gallery-tag');
      card.addEventListener('mouseenter', () => {
        dashPreviewImg.src = img.src;
        dashPreviewImg.alt = img.alt;
        dashPreviewTag.textContent = tag?.textContent || '';
        dashPreview.classList.add('is-active');
      });
      card.addEventListener('mouseleave', () => {
        dashPreview.classList.remove('is-active');
      });
    });
  }

  // ── Problem section loss counter ─────────────────────────
  // ── Revenue chart draw animation ─────────────────────────
  const pcLineBad  = document.getElementById('pcLineBad');
  const pcLineGood = document.getElementById('pcLineGood');
  const pcDots     = document.querySelectorAll('.pc-dot, .pc-ellie-marker');
  if (pcLineBad) {
    let drawn = false;
    new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !drawn) {
        drawn = true;
        pcLineBad.classList.add('pc-drawn');
        pcLineGood.classList.add('pc-drawn');
        setTimeout(() => pcDots.forEach(d => d.classList.add('pc-shown')), 1800);
      }
    }, { threshold: 0.3 }).observe(pcLineBad);
  }

  const probLossEl = document.getElementById('prob-loss-num');
  if (probLossEl) {
    let counted = false;
    new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !counted) {
        counted = true;
        let n = 0; const target = 1800;
        const iv = setInterval(() => {
          n = Math.min(n + 36, target);
          probLossEl.textContent = '$' + n.toLocaleString();
          if (n >= target) clearInterval(iv);
        }, 18);
      }
    }, { threshold: 0.5 }).observe(probLossEl);
  }

  // ── Integrations hub ─────────────────────────────────────
  (function buildIntHub() {
    const svg = document.getElementById('int-svg');
    if (!svg) return;

    const CX = 300, CY = 300, RADIUS = 210, NODE_R = 28;

    // slug: Simple Icons CDN identifier — https://cdn.simpleicons.org/[slug]/[hexcolor]
    const INT_TOOLS = [
      { name: 'Google',    sub: 'Calendar',   color: '#4285F4', slug: 'googlecalendar' },
      { name: 'Xero',      sub: 'Accounting', color: '#1AB4D7', slug: 'xero'           },
      { name: 'HubSpot',   sub: 'CRM',        color: '#FF7A59', slug: 'hubspot'        },
      { name: 'Stripe',    sub: 'Payments',   color: '#635BFF', slug: 'stripe'         },
      { name: 'ServiceM8', sub: 'Field Jobs', color: '#F59E0B', slug: 'servicem8'      },
      { name: 'Calendly',  sub: 'Scheduling', color: '#4BA1FF', slug: 'calendly'       },
      { name: 'Mailchimp', sub: 'Marketing',  color: '#FFE01B', slug: 'mailchimp'      },
      { name: 'Zapier',    sub: 'Automation', color: '#FF4A00', slug: 'zapier'         },
      { name: 'Sheets',    sub: 'Google',     color: '#34A853', slug: 'googlesheets'   },
      { name: 'Square',    sub: 'Payments',   color: '#FFFFFF', slug: 'square'         },
      { name: 'Cliniko',   sub: 'Practice',   color: '#00C4B4', slug: 'cliniko'        },
      { name: 'MYOB',      sub: 'Accounting', color: '#BB6BD9', slug: 'myob'           },
    ];

    function ns(tag) { return document.createElementNS('http://www.w3.org/2000/svg', tag); }

    function setAttrs(el, attrs) {
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      return el;
    }

    const linesG    = svg.querySelector('#int-lines');
    const ringsG    = svg.querySelector('#int-rings');
    const nodesG    = svg.querySelector('#int-nodes');
    const particleG = svg.querySelector('#int-particles');

    INT_TOOLS.forEach((tool, i) => {
      const angle = (i / INT_TOOLS.length) * Math.PI * 2 - Math.PI / 2;
      const nx = CX + Math.cos(angle) * RADIUS;
      const ny = CY + Math.sin(angle) * RADIUS;

      // Connection line
      const line = setAttrs(ns('line'), {
        x1: CX, y1: CY, x2: nx, y2: ny,
        stroke: tool.color,
        'stroke-width': '1',
        'stroke-opacity': '0.2',
        'stroke-dasharray': '4 6',
      });
      linesG.appendChild(line);

      // Tool icon — Simple Icons CDN brand logo
      const g = ns('g');
      const IMG = 30;
      const hex = tool.color.replace('#', '');

      // Letter fallback (visible if CDN image fails to load for niche tools)
      const fallback = setAttrs(ns('text'), {
        x: String(nx), y: String(ny + 5),
        'text-anchor': 'middle',
        'font-family': 'Inter,sans-serif',
        'font-size': '15', 'font-weight': '800',
        fill: tool.color,
      });
      fallback.textContent = tool.name[0];
      g.appendChild(fallback);

      // Brand icon from Simple Icons CDN (renders over the fallback)
      const imgEl = setAttrs(ns('image'), {
        href: `https://cdn.simpleicons.org/${tool.slug}/${hex}`,
        x: String(nx - IMG / 2), y: String(ny - IMG / 2),
        width: String(IMG), height: String(IMG),
        filter: 'url(#ig-glow-v)',
      });
      g.appendChild(imgEl);

      // Label positioning based on angle quadrant
      const labelPad = NODE_R + 14;
      const lx = CX + Math.cos(angle) * (RADIUS + labelPad);
      const ly = CY + Math.sin(angle) * (RADIUS + labelPad);
      const anchor = Math.cos(angle) > 0.25 ? 'start' : Math.cos(angle) < -0.25 ? 'end' : 'middle';

      const nameEl = setAttrs(ns('text'), {
        x: lx, y: ly - 2,
        'text-anchor': anchor,
        'font-family': 'Inter,sans-serif',
        'font-size': '10.5',
        'font-weight': '600',
        fill: 'rgba(255,255,255,0.8)',
      });
      nameEl.textContent = tool.name;
      g.appendChild(nameEl);

      const subEl = setAttrs(ns('text'), {
        x: lx, y: ly + 10,
        'text-anchor': anchor,
        'font-family': 'Inter,sans-serif',
        'font-size': '8.5',
        fill: tool.color,
        'fill-opacity': '0.75',
      });
      subEl.textContent = tool.sub;
      g.appendChild(subEl);

      nodesG.appendChild(g);

      // Animated particles along the line
      const pCount = 2;
      for (let p = 0; p < pCount; p++) {
        const inbound = p % 2 === 0;
        const dot = setAttrs(ns('circle'), {
          r: '3',
          fill: tool.color,
          opacity: '0.85',
          filter: 'url(#ig-glow-v)',
        });

        const motionPath = `M ${inbound ? nx : CX} ${inbound ? ny : CY} L ${inbound ? CX : nx} ${inbound ? CY : ny}`;
        const mPath = ns('path');
        mPath.setAttribute('d', motionPath);
        mPath.setAttribute('id', `ipath-${i}-${p}`);
        mPath.setAttribute('fill', 'none');
        mPath.setAttribute('stroke', 'none');
        svg.querySelector('defs').appendChild(mPath);

        const motion = ns('animateMotion');
        motion.setAttribute('dur', (2.4 + i * 0.18 + p * 1.1) + 's');
        motion.setAttribute('repeatCount', 'indefinite');
        motion.setAttribute('begin', (p * 1.2 + i * 0.15) + 's');

        const mref = ns('mpath');
        mref.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', `#ipath-${i}-${p}`);
        motion.appendChild(mref);
        dot.appendChild(motion);
        particleG.appendChild(dot);
      }
    });

    // Pulse rings on center node
    [60, 80, 105].forEach((r, idx) => {
      const ring = setAttrs(ns('circle'), {
        cx: CX, cy: CY, r,
        fill: 'none',
        stroke: 'rgba(167,139,250,0.35)',
        'stroke-width': '1',
      });
      const anim = setAttrs(ns('animate'), {
        attributeName: 'stroke-opacity',
        values: '0.35;0.05;0.35',
        dur: (2.4 + idx * 0.6) + 's',
        repeatCount: 'indefinite',
        begin: (idx * 0.4) + 's',
      });
      ring.appendChild(anim);
      ringsG.appendChild(ring);
    });

    // Animate connection count to 12
    const connNum = document.getElementById('int-conn-num');
    if (connNum) {
      let counted = false;
      new IntersectionObserver(entries => {
        if (entries[0].isIntersecting && !counted) {
          counted = true;
          let n = 0;
          const iv = setInterval(() => {
            n++;
            connNum.textContent = n;
            if (n >= 12) clearInterval(iv);
          }, 90);
        }
      }, { threshold: 0.4 }).observe(svg);
    }
  })();

  // ── Hero avatar idle animation (subtle mouth twitch) ──────
  const heroClip = document.getElementById('hero-ellie-clip');
  if (heroClip) {
    const talkingImg = heroClip.querySelector('.e-photo-talking');
    let talkTimeout = null;

    function scheduleTalk() {
      const delay = 4000 + Math.random() * 6000;
      talkTimeout = setTimeout(() => {
        heroClip.classList.add('is-speaking');
        if (talkingImg) talkingImg.style.opacity = '0.7';
        setTimeout(() => {
          heroClip.classList.remove('is-speaking');
          if (talkingImg) talkingImg.style.opacity = '0';
          scheduleTalk();
        }, 1200 + Math.random() * 1600);
      }, delay);
    }
    scheduleTalk();
  }


})();
