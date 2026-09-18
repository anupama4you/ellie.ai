const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('assets/avatar/ellie-avatar.js', 'utf8');
function setup() {
  const registry = new Map(), clients = [], timers = new Map();
  let timer = 0;
  function element() { return { style: {}, attrs: {}, innerHTML: 'closed-mouth', textContent: '', listeners: {}, addEventListener(n, fn) { this.listeners[n] = fn; }, setAttribute(k,v) { this.attrs[k] = v; } }; }
  class HTMLElement {
    constructor() { this.dataset = {}; }
    attachShadow() {
      const nodes = new Map();
      return { innerHTML: '', querySelector: name => { if (!nodes.has(name)) nodes.set(name, element()); return nodes.get(name); }, querySelectorAll: () => Array.from({length:5}, element) };
    }
  }
  class Vapi {
    constructor() { this.events = {}; clients.push(this); }
    on(name, fn) { this.events[name] = fn; }
    emit(name, data) { this.events[name]?.(data); }
    async start() { this.emit('call-start'); return {id:'test'}; }
    stop() { this.stopped = true; this.emit('call-end'); }
    setMuted(muted) { this.muted = muted; }
  }
  const context = {
    HTMLElement, URL, AbortController, Promise, console,
    customElements: { get: n => registry.get(n), define: (n,v) => registry.set(n,v) },
    document: { currentScript: { src:'https://callellie.com/assets/avatar/ellie-avatar.js' } },
    navigator: { mediaDevices: {getUserMedia() {}} },
    isSecureContext: true, Vapi,
    addEventListener() {}, removeEventListener() {},
    setTimeout(fn, ms) { const id = ++timer; timers.set(id, {fn,ms}); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch: async () => ({ok:true,json:async()=>({publicKey:'public',assistantId:'assistant',assistantOverrides:{}})}),
  };
  context.window = context;
  vm.runInNewContext(source, context);
  const widget = new (registry.get('ellie-avatar'))(); widget.connectedCallback();
  return {widget,context,clients,timers};
}
test('live lifecycle: audio mouth, listening, captions, mute, cleanup and stale events', async () => {
  const {widget,context,clients,timers} = setup();
  await widget.start(); const client = clients[0];
  assert.equal(widget.dataset.state,'listening');
  client.emit('speech-start'); client.emit('volume-level', .8);
  assert.match(widget.mouth.innerHTML,/ry="9.2"/);
  client.emit('speech-end'); assert.equal(widget.mouth.innerHTML,'closed-mouth');
  client.emit('message',{type:'transcript',role:'assistant',transcript:'<script>bad()</script>'});
  assert.match(widget.caption.textContent,/<script>/);
  widget.mute.listeners.click(); assert.equal(client.muted,true);
  widget.end(); assert.equal(client.stopped,true); assert.equal(context.__ellieCallOwner,null);
  assert.equal(timers.size,0); assert.equal(widget.dataset.state,'idle');
  client.emit('speech-start'); assert.equal(widget.dataset.state,'idle');
  await widget.start(); assert.equal(clients.length,2);
  widget.end();
});
test('cancelled configuration cannot start a delayed call',async()=>{
  const {widget,context,clients} = setup(); let resolve;
  context.fetch = () => new Promise(r=>resolve=r);
  const start = widget.start(); widget.end();
  resolve({ok:true,json:async()=>({publicKey:'public'})}); await start;
  assert.equal(clients.length,0); assert.equal(widget.dataset.state,'idle');
});
test('missing configuration and SDK errors release ownership for retry',async()=>{
  const {widget,context,clients} = setup();
  context.fetch = async()=>({ok:true,json:async()=>({})});
  await widget.start(); assert.match(widget.status.textContent,/not configured/);
  assert.equal(context.__ellieCallOwner,null);
  context.fetch = async()=>({ok:true,json:async()=>({publicKey:'public'})});
  await widget.start(); clients[0].emit('error',{});
  assert.match(widget.status.textContent,/microphone permission/);
  assert.equal(context.__ellieCallOwner,null);
});
test('page call lock, connection timeout and demo duration limit',async()=>{
  const {widget,context,clients,timers} = setup();
  context.__ellieCallOwner={}; await widget.start(); assert.equal(clients.length,0);
  assert.match(widget.status.textContent,/other Ellie call/);
  context.__ellieCallOwner=null; await widget.start();
  [...timers.values()].find(t=>t.ms===180000).fn();
  assert.equal(clients[0].stopped,true); assert.match(widget.status.textContent,/Demo finished/);
  context.fetch=()=>new Promise(()=>{}); widget.start();
  [...timers.values()].find(t=>t.ms===45000).fn();
  assert.match(widget.status.textContent,/timed out/); assert.equal(context.__ellieCallOwner,null);
});
test('insecure hosts do not initiate calls',async()=>{
  const {widget,context,clients}=setup();context.isSecureContext=false;
  await widget.start();assert.equal(clients.length,0);assert.match(widget.status.textContent,/HTTPS/);
});
