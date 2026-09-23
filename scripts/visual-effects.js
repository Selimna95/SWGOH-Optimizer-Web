class VisualEffectsEngine {
  constructor() { this.init(); }
  init() {
    this.createScanlineEffect();
    this.attachInteractiveEffects();
    this.startAmbientAnimation();
  }
  createScanlineEffect() {
    const scanline = document.createElement('div');
    scanline.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9997;background:repeating-linear-gradient(0deg,rgba(66,232,255,0.02) 0px,rgba(66,232,255,0.02) 1px,transparent 1px,transparent 3px);opacity:0.4;';
    document.body.appendChild(scanline);
  }
  attachInteractiveEffects() {
    document.querySelectorAll('.panel').forEach(panel => {
      panel.addEventListener('mouseenter', () => this.triggerPulseEffect(panel));
    });
    document.querySelectorAll('.primary, .nav').forEach(btn => {
      btn.addEventListener('click', (e) => this.createClickRipple(e));
    });
  }
  triggerPulseEffect(element) {
    const glow = document.createElement('div');
    glow.style.cssText = 'position:absolute;inset:-2px;border-radius:inherit;background:radial-gradient(circle,rgba(66,232,255,0.3),transparent 70%);opacity:0;animation:pulseGlow 0.6s ease forwards;';
    element.parentNode.appendChild(glow);
    setTimeout(() => glow.remove(), 600);
  }
  createClickRipple(event) {
    const ripple = document.createElement('div');
    const rect = event.currentTarget.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    ripple.style.cssText = `position:absolute;left:${event.clientX-rect.left-size/2}px;top:${event.clientY-rect.top-size/2}px;width:${size}px;height:${size}px;border-radius:50%;background:rgba(66,232,255,0.4);transform:scale(0);animation:rippleExpand 0.5s ease forwards;pointer-events:none;`;
    event.currentTarget.style.position = 'relative';
    event.currentTarget.style.overflow = 'hidden';
    event.currentTarget.appendChild(ripple);
    setTimeout(() => ripple.remove(), 500);
  }
  startAmbientAnimation() {
    setInterval(() => {
      const p = document.createElement('div');
      p.style.cssText = `position:fixed;left:${Math.random()*window.innerWidth}px;top:${Math.random()*window.innerHeight}px;width:${Math.random()*3+1}px;height:${Math.random()*3+1}px;background:rgba(66,232,255,0.6);border-radius:50%;pointer-events:none;z-index:9996;opacity:0;animation:particleFloat 3s ease-in forwards;`;
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 5000);
    }, 2000);
  }
}
document.addEventListener('DOMContentLoaded', () => { window.visualEffects = new VisualEffectsEngine(); });
