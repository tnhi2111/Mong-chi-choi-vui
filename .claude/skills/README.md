# Skills (from mengto/skills) — 35 kept

Copied from https://github.com/mengto/skills (commit `a45892d`, MIT — see `LICENSE-mengto-skills`).
Each folder is a Claude Code project skill (`<name>/SKILL.md`): Claude sees every skill's
description at the start of a session and loads the full skill by itself when a task fits.
Flat (one level) because Claude Code only discovers `.claude/skills/<name>/SKILL.md`.

Only the skills that fit this site were kept (3D / Three.js, wood-metal-cloth-paper materials,
motion, UI polish, QA loops). Removed: game dev / combat, SVG illustration styles, social-media
and Codex/Apple-specific workflows, stock images, scroll-page and other brands' design systems.
Get any of them back from the upstream repo if a task needs one.

These are general playbooks. For this site `CLAUDE.md` wins (birthday theme, Cormorant +
wine/champagne, no Tailwind/GSAP, the owner's working agreement).

## 3d (10)

- `3d-cloth-material` — Build convincing woven cloth in Three.js, with a thread-level weave normal map, sheen and anisotropic highlights, folds that never stretch the texture, hems with thickness, stitches, seams, frayed edges, fold occlusion, dye and wear variation, and light passing through thin fabric
- `3d-high-poly-models` — Create or integrate highly detailed 3D models with smooth silhouettes, shaped surfaces, believable bevels, and close-up geometry, then prepare suitable runtime LODs and loading
- `3d-high-resolution-textures` — Build sharp, physically coherent high-resolution materials for 3D rendering with appropriate PBR maps, texel density, UV direction, mipmaps, anisotropic filtering, and progressive asset delivery
- `3d-metal-material` — Build hyperrealistic PBR metal in Three.js: steel, brass, gold, copper and iron as true conductors (metalness 1, measured F0 tint, no albedo) with roughness-varied finishes (polished, brushed anisotropic, aged with patina and worn edges) lit by a dark HDR studio of real bright window cards prefiltered with PMREM
- `3d-orbit-inspect-demo` — Make a 3D object lean around on hover and open a full inspect view on click
- `3d-paper-material` — Build a paper sheet in Three.js that reads as paper up close — washi, cotton rag or kraft with baked fibre and tooth relief, laid and chain lines, a torn deckle edge with frayed fibres, four-layer thickness, a rolled corner and crease, ink that wicks along the fibres, toasted aged edges, contact shadows and back-lit translucency
- `3d-retina-resolution` — Render a 3D canvas sharply on Retina and HiDPI displays, including explicit 200 percent resolution, synchronized renderer and post-processing sizes, correct pointer coordinates, and measured quality fallbacks
- `3d-virtual-tour` — Build guided and interactive virtual tours through a 3D environment with authored camera paths, room and floor-plan navigation, orbit inspection, smooth mode handoffs, and progressive loading
- `3d-wood-lighting-scorecard` — Light carved wood in a dark room in three.js, with procedural grain and pores, one warm key through a window, soft shadows that touch, light shafts, background rays and dust, then score the render out of 10 on an anchored rubric with a runnable headless scorecard and iterate until each item reaches the target
- `3d-wood-material` — Build convincing timber for Three.js as one procedural MeshPhysicalMaterial with growth rings, cathedral figure, pores, medullary rays, checks, tool marks, end grain, and oil, wax, or lacquer finishes, so the grain follows the form and survives macro close-ups without image textures

## codex (4)

- `audit-verify-explain-grade-5` — Audit work, verify claims with concrete evidence, and explain the result in simple grade-5 language
- `iterate-until-verified` — Apply a prompt-agnostic execution and verification loop to any substantial task while preserving the original request
- `optimize-web-animations` — Profile, audit, and optimize frontend page performance with emphasis on animation work, memory-leak risks, long-session slowdowns, CSS animations, canvas/WebGL requestAnimationFrame loops, marquees, skeletons, GSAP/Three/Matter effects, timers, listeners, and observers
- `video-to-superprompt` — Turn a reference video into a super detailed recreation or inspiration prompt

## game-development (1)

- `optimize-threejs-games` — Profile, diagnose, and improve Three.js or WebGL game performance without regressing gameplay

## ui (3)

- `audit-ai-design-slop` — Audit websites, apps, screenshots, mockups, and design code for harmful AI-design clichés, generic generated defaults, and established UI defects
- `design-first-ui-prompting` — Use when you need design-first, spec-driven, skimmable prompts for UI generation
- `no-ai-design-slop` — Prevent and remove generic AI-generated design defaults, incoherent visual choices, and established UI defects while creating, revising, or reviewing websites, apps, screenshots, mockups, and design code

## web-design (15)

- `add-mouse-driven-orbit` — Add restrained mouse-driven orbit and parallax depth to a Three.js hero by damping one pointer target and splitting it across camera translation, look-at, and small object rotations
- `ambient-section-particles` — Add a restrained particle atmosphere inside one section with configurable shapes, density, gravity, wind, sway, rotation, recycling or settling, pointer disturbance, visibility pausing, responsive limits, and reduced-motion fallbacks
- `animation-systems` — Use when designing or implementing product-grade web motion like Stripe, Linear, Apple, and Vercel
- `beautiful-shadows` — Apply exact Tailwind arbitrary shadow utilities for polished, layered neutral elevation
- `build-awwwards-quality-sites` — Art-direct and implement distinctive, motion-rich marketing, editorial, portfolio, and landing websites with original reference-inspired imagery, standout heroes, GSAP choreography, one smooth-scroll engine, optional Three.js shaders, honest icon and logo sourcing, photo avatars, accessibility, and performance safeguards
- `build-threejs-scroll-worlds` — Build rich, scroll-controlled real-time Three.js experiences as one persistent 3D world whose camera, lighting, atmosphere, materials, objects, DOM story, and interactions evolve across authored chapters
- `css-alpha-masking` — Apply CSS alpha masking with linear-gradient for horizontal or vertical edge fades (mask-image and -webkit-mask-image)
- `css-border-gradient` — Apply subtle gradient-border treatments for premium web surfaces
- `glass-dark-ui` — Build dark-mode glassmorphism interfaces with readable contrast, frosted surfaces, and gradient borders using a pseudo-element mask
- `pointer-trail-emitter` — Build a cursor trail whose spacing stays constant at any hand speed, by emitting motes per unit of distance travelled rather than on a timer, so a flick draws the same continuous ribbon as a crawl instead of breaking into scattered dots
- `progressive-blur` — Create a layered CSS progressive blur (top or bottom) using multiple backdrop-filter masks for depth and softness
- `staggered-word-reveal` — Create subtle editorial word-by-word text reveal animations where each word fades and rises into place once it enters the viewport
- `threejs` — Use when building or debugging interactive 3D scenes on the web with Three.js (scene/camera/renderer, lights/materials, GLTF loading, controls, performance)
- `webgl-3d-object` — Create a real 3D WebGL object with geometric mesh depth, physically based material, directional and ambient lighting, perspective camera, subtle rotation, and floating motion
- `webgl-landing-steering` — Use when creating or refining WebGL-heavy landing pages and you need to steer toward a specific visual outcome (premium, technical, playful, cinematic) while balancing conversion clarity, performance, and implementation complexity

## workflow (2)

- `workflow-progress-screenshots` — Show the user real screenshots of the work as it progresses, without being asked
- `workflow-score-to-target` — Score work out of 10 against a clear rubric, then improve it round by round until every item reaches the target score the user named (for example "get it to 8 out of 10", "bring everything under 6 up to 6+")
