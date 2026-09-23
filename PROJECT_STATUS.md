# SWGOH Optimizer Web — V42

V42 is based on V39/V41 and keeps application logic intact while hardening Optimizer profile availability and improving dashboard ergonomics.

- 334 Optimizer profiles are bundled in `optimizer-profiles.js` as a same-origin fallback.
- `app.js` first uses the embedded profiles, then JSON path fallbacks.
- Kyber remains dynamic via SWGOH.GG, with a local Optimizer-profile reference fallback when Kyber is unavailable.
- Dashboard typography, account summary, Galactic Power hierarchy and spacing were redesigned for readability.
- Horizontal navigation bars remain available.
- Python optimizer engine and Cloudflare relay code are preserved.
