# Skills (from mengto/skills)

Copied from https://github.com/mengto/skills (commit `a45892d`, MIT — see `LICENSE-mengto-skills`).
Each folder here is a Claude Code project skill (`<name>/SKILL.md`): Claude sees every skill's
description at the start of a session and loads the full skill by itself when a task fits.
They are flat (one level) because Claude Code only discovers `.claude/skills/<name>/SKILL.md`;
the upstream categories are kept in this index only. Not part of the website build.

Note: these are general playbooks written for many projects. For this site, `CLAUDE.md` wins
(birthday theme, Cormorant + wine/champagne, the owner's working agreement).

## 3d (16)

- `3d-cloth-material` — Build convincing woven cloth in Three.js, with a thread-level weave normal map, sheen and anisotropic highlights, folds that never stretch the texture, hems with thickness, stitches, seams, frayed edges, fold occlusion, dye and wear variation, and light passing through thin fabric
- `3d-falling-leaves` — Build recognizable falling leaves in world space using instanced geometry, independent tumble, coupled sideways drift, shared wind, scene occlusion, and camera-aware recycling
- `3d-four-seasons` — Add coordinated spring, summer, fall, and winter states to a 3D scene, blending foliage, sunlight, sky, ground materials, snow, and particles without rebuilding the world
- `3d-high-poly-models` — Create or integrate highly detailed 3D models with smooth silhouettes, shaped surfaces, believable bevels, and close-up geometry, then prepare suitable runtime LODs and loading
- `3d-high-resolution-textures` — Build sharp, physically coherent high-resolution materials for 3D rendering with appropriate PBR maps, texel density, UV direction, mipmaps, anisotropic filtering, and progressive asset delivery
- `3d-metal-material` — Build hyperrealistic PBR metal in Three.js: steel, brass, gold, copper and iron as true conductors (metalness 1, measured F0 tint, no albedo) with roughness-varied finishes (polished, brushed anisotropic, aged with patina and worn edges) lit by a dark HDR studio of real bright window cards prefiltered with PMREM
- `3d-orbit-inspect-demo` — Make a 3D object lean around on hover and open a full inspect view on click
- `3d-paper-material` — Build a paper sheet in Three.js that reads as paper up close — washi, cotton rag or kraft with baked fibre and tooth relief, laid and chain lines, a torn deckle edge with frayed fibres, four-layer thickness, a rolled corner and crease, ink that wicks along the fibres, toasted aged edges, contact shadows and back-lit translucency
- `3d-retina-resolution` — Render a 3D canvas sharply on Retina and HiDPI displays, including explicit 200 percent resolution, synchronized renderer and post-processing sizes, correct pointer coordinates, and measured quality fallbacks
- `3d-sky-background` — Create a camera-correct sky background for a 3D scene with a procedural atmosphere or panorama, horizon haze, aligned sunlight, and coherent environment lighting
- `3d-sky-rays` — Add sun shafts and crepuscular rays to a Three.js or equivalent 3D scene, using scene occlusion, a projected sun position, controlled foreground spill, and scalable post-processing
- `3d-ultra-realistic-water` — Build an ultra-realistic open ocean in Three.js with a deep-water Gerstner spectrum shaded per pixel from analytic derivatives, each wave faded at its own pixel footprint, plus Fresnel sky-cube and planar reflections, subsurface light through the crests, HDR sun glitter, Jacobian lace foam, a Kelvin wake, hull foam, buoyancy queries and aerial perspective into the sky's horizon haze
- `3d-underwater-god-rays` — Add volumetric underwater god rays to a Three.js scene, marching one drifting swell field along every view ray at half resolution so the light shafts converge on the sun, parallax with the camera and carry rippling caustic streaks, with a shimmering surface underside, a sun that wobbles through the ripples, and the same light dappling fish as they swim through the beams
- `3d-virtual-tour` — Build guided and interactive virtual tours through a 3D environment with authored camera paths, room and floor-plan navigation, orbit inspection, smooth mode handoffs, and progressive loading
- `3d-wood-lighting-scorecard` — Light carved wood in a dark room in three.js, with procedural grain and pores, one warm key through a window, soft shadows that touch, light shafts, background rays and dust, then score the render out of 10 on an anchored rubric with a runnable headless scorecard and iterate until each item reaches the target
- `3d-wood-material` — Build convincing timber for Three.js as one procedural MeshPhysicalMaterial with growth rings, cathedral figure, pores, medullary rays, checks, tool marks, end grain, and oil, wax, or lacquer finishes, so the grain follows the form and survives macro close-ups without image textures

## codex (20)

- `article-prompts-to-skills` — Convert an article, tutorial, or prompt pack into focused reusable AgentSkills, one independent capability per skill, with portable instructions, example prompts, working demos, preview screenshots, validation, gallery updates, and a narrow commit
- `audit-reference-originality` — Audit a website or digital experience against its supplied source references for originality and plagiarism risk
- `audit-verify-explain-grade-5` — Audit work, verify claims with concrete evidence, and explain the result in simple grade-5 language
- `browser-video-recording` — Create polished 60 fps 4:3 4K browser screen-recording style videos from Codex in-app browser captures, with browser-only crop, natural macOS cursor styling, deliberate click choreography, zoom-follow framing, ffprobe/thumbnail verification, and optional native recording compatibility checks
- `build-daily-inspiration-sites` — Turn a completed daily UI inspiration capture into exactly five original landing-page builds, one per separate Codex task, using Sites
- `codex-gpt-image-2-5-flare` — Generate or edit artwork with built-in Codex image gen, especially transparent PNG ornaments, game sprites, emblems, and UI graphics
- `daily-ui-inspiration-capture` — Create a recurring daily UI inspiration capture
- `elevenlabs-tts` — Generate ElevenLabs text-to-speech audio from scripts or inline text using local voice profiles
- `generate-reference-inspired-brand-worlds` — Generate multiple original brand campaign worlds from a supplied visual reference while controlling how close the new work feels without copying protected signature elements
- `html-to-interaction-prompts` — Convert a supplied HTML page or generated HTML reference into a screenshot-backed article containing multiple reusable interaction prompts
- `implement-fog-of-war` — Implement, tune, debug, or validate soft wall-aware fog of war and gameplay perception in Three.js action games
- `iterate-until-verified` — Apply a prompt-agnostic execution and verification loop to any substantial task while preserving the original request
- `optimize-web-animations` — Profile, audit, and optimize frontend page performance with emphasis on animation work, memory-leak risks, long-session slowdowns, CSS animations, canvas/WebGL requestAnimationFrame loops, marquees, skeletons, GSAP/Three/Matter effects, timers, listeners, and observers
- `performance-profiling` — Guide performance profiling for Apple platform apps with Instruments, Xcode diagnostics, and MetricKit
- `publish-project-to-github` — Package a finished local project into an intentional GitHub repository, create a strong README and visual preview, push it safely, configure a public GitHub Pages URL when the project is compatible, and verify the deployed result
- `stitched-full-page-capture` — Capture or repair reliable full-page screenshots for lazy-loaded, scroll-animated, Framer, WebGL/canvas, or reveal-heavy web pages
- `video-to-superprompt` — Turn a reference video into a super detailed recreation or inspiration prompt
- `web-technique-to-skill` — Turn a visual or interaction technique you already built into a reusable web-design skill, by isolating the one mechanism that makes it work while reproducing its approved reference exactly around that focus, and packaging it with a demo that proves both the mechanism and the visual fidelity
- `write-like-meng-on-x` — Write, rewrite, review, or continuously refine X/Twitter posts in Meng To's current voice using his deduplicated authored-post corpus, personal and product context, shared resources, and Content repo evidence
- `x-bookmark-quote-posts` — Check a user's latest X/Twitter bookmarks and turn recent saved posts into source-backed quote-post drafts calibrated against the user's latest 100 authored posts

## game-combat (6)

- `fire-smoke-skill-vfx` — Build the effects of a fire skill as one visual language in Three.js
- `game-dev-combat-animation` — Build, fix and review character combat animations (melee strikes, bow shots, spell casts, skills, monster attacks, whole move sets) so they read like Diablo IV, Baldur's Gate 3 or Elden Ring and never stretch, lock, wring or break an arm, wrist or hand
- `game-dev-combat-skill-polish` — Score a game's combat skills and spells out of 10 with blind judges, then raise the weakest to a bar, for timing and readability (does a skill read as itself, does the blow land when it lands) and for art (detail, light, trails, impact, art direction, judged against a reference such as Diablo IV)
- `ice-frost-skill-vfx` — Build the effects of an ice and frost skill as one visual language in Three.js
- `lightning-energy-skill-vfx` — Build the effects of a close-combat energy skill as one visual language in Three.js
- `water-crystal-skill-vfx` — Build the effects of a water and crystal skill as one visual language in Three.js

## game-development (20)

- `author-game-levels` — Author or revise readable, flat-world Three.js game levels
- `build-game-audio-feedback` — Design or implement responsive audio feedback for a Three.js or web game
- `build-game-camera-controls` — Implement or tune Three.js game cameras
- `build-game-changelog` — Design, implement, backfill, audit, and release in-game changelogs with contiguous versioning, deployment provenance, menu-state navigation, accessible toggle, close, and Escape behavior, and responsive release-ledger UI
- `build-game-inventory` — Build or repair game inventory, loot, equipment, tooltips, drag-and-drop, persistence, and progression systems
- `build-game-map-editor` — Build, extend, or audit production-linked browser map editors for Three.js and isometric games
- `build-game-monster-system` — Build, integrate, audit, or refactor rigged monsters for Three.js and web action games
- `build-hybrid-game-assets` — Plan, create, integrate, or audit a hybrid asset pipeline for a Three.js or web game
- `build-isometric-arpg` — Build or extend a playable isometric action RPG in Three.js, React, or similar web technology
- `build-mobile-threejs-games` — Build, tune, or test a Three.js game for mobile web
- `build-rigged-game-assets` — Create, integrate, or audit production-ready rigged 3D characters and monsters with a main model, skeleton, animation library, sockets, collision contracts, separate character equipment, optimized runtime files, catalog media, and an interactive moveset inspector
- `build-threejs-enemy-systems` — Build or refactor reusable, data-driven enemy archetype and moveset systems for Three.js action games
- `build-vesperfall-review-assets` — Build truthful Vesperfall asset-library review pairs from transparent PNG references and live Three.js, FBX, or img2threejs models
- `create-game-vfx` — Create readable, performance-safe Three.js game visual effects
- `design-action-combat` — Design, implement, tune, or test readable tactical action combat for web games
- `design-game-encounters` — Design, implement, tune, or test Three.js action-game encounters
- `optimize-threejs-games` — Profile, diagnose, and improve Three.js or WebGL game performance without regressing gameplay
- `ship-web-games` — Package, deploy, and verify a playable Three.js or web game
- `test-playable-web-games` — Test a playable browser game end to end with deterministic fixtures and real browser evidence
- `tune-enemy-ai` — Build, debug, balance, or test combat enemy AI for playable action games

## illustration (14)

- `illustration-bold-pop` — Draws hand-authored SVG spot illustrations in a bold pop-geometric style for design and coding scenes
- `illustration-flat-with-black` — Draws flat vector spot illustrations of tall, long-legged people doing design and coding things, with solid black as a main colour
- `illustration-flat` — Draws flat vector illustrations as SVG cards (480x360): slim, long-limbed people acting out one design or coding moment with one hero prop
- `illustration-framed-panel` — Draws original design-and-coding scenes as SVG cards (480x360) in a framed-panel cartoon style
- `illustration-grainy-gouache` — Draws original cosy animal scenes as hand-authored SVG cards (480x360) in a grainy gouache, risograph-like style
- `illustration-halftone-line` — Draws hand-authored SVG spot illustrations in a halftone line style for design and coding scenes
- `illustration-ink-sketch` — Draws hand-inked cartoon critters and living objects as SVG cards (480x360), each acting out a coding or design idea
- `illustration-isometric-mono` — Draws true-isometric diorama illustrations of developer and design workspaces in one green ramp, generated as SVG with a bundled scene kit
- `illustration-line-interior` — Draws original hand-written SVG spot scenes in the Line interior style, wide airy rooms or terraces where slim, realistic people do design and coding work
- `illustration-one-line` — Draws original hand-written SVG spot illustrations in the One-line style, joyful action figures doing design and coding work
- `illustration-outlined-cartoon` — Draws original hand-authored SVG spot illustrations in an outlined cartoon style for design and coding subjects
- `illustration-teal-spot` — Draws original spot illustrations of one hero object as SVG cards (480x360) in a teal-on-white style
- `illustration-two-colour-brush` — Draws original design and coding scenes as hand-authored SVG cards (480x360) in a two-colour brush-marker style
- `illustration-vintage-emblem` — Draws original hand-authored SVG badge illustrations in a vintage emblem style for design and coding subjects

## media (3)

- `aura-asset-images` — Use when you need high-quality stock-style images from Aura Assets (aura.build/assets) similar to Unsplash for design mockups and marketing: backgrounds, abstract wallpapers, architecture, portraits, and headshots
- `html-reel` — Turn a tweet, a video, a YouTube video or a landing page into a 9:16 reel (Instagram Reels, TikTok, Shorts) that says what the source says and looks like it, with every cut on a word
- `unsplash-asset-images` — Use when you need to pick high-quality Unsplash images for product/design assets (avatars, headshots, portraits, large website backgrounds, and abstract wallpapers) and output real Unsplash URLs plus practical instructions for producing the right resolutions and aspect ratios (1:1, 4:5, 3:4, 16:9, 9:16)

## ui (3)

- `audit-ai-design-slop` — Audit websites, apps, screenshots, mockups, and design code for harmful AI-design clichés, generic generated defaults, and established UI defects
- `design-first-ui-prompting` — Use when you need design-first, spec-driven, skimmable prompts for UI generation
- `no-ai-design-slop` — Prevent and remove generic AI-generated design defaults, incoherent visual choices, and established UI defects while creating, revising, or reviewing websites, apps, screenshots, mockups, and design code

## web-design (92)

- `add-mouse-driven-orbit` — Add restrained mouse-driven orbit and parallax depth to a Three.js hero by damping one pointer target and splitting it across camera translation, look-at, and small object rotations
- `add-shader-cursor-trail` — Add the Shaders WebGPU mouse effect used for the Tidal Commons hero: a white twinkling halftone cursor trail driven by ChromaFlow, masked through a DotGrid, finished with chromatic ripples and film grain, and protected by static, touch, accessibility, SSR, and performance fallbacks
- `agency-grid-layout-minimal` — Create a minimal agency design system with a disciplined editorial grid, oversized typography, quiet uppercase utility labels, restrained image blocks, and subtle structural detail
- `ambient-section-particles` — Add a restrained particle atmosphere inside one section with configurable shapes, density, gravity, wind, sway, rotation, recycling or settling, pointer disturbance, visibility pausing, responsive limits, and reduced-motion fallbacks
- `animation-on-scroll` — Create an on-scroll animation trigger using IntersectionObserver with Tailwind-friendly animation classes and keyframes
- `animation-systems` — Use when designing or implementing product-grade web motion like Stripe, Linear, Apple, and Vercel
- `atmosphere-background` — Create a dark atmospheric background with drifting vertical light folds, screen-blended glow, and a concentrated luminous corner or lower-edge bloom
- `background-grid-webgl` — Create a perspective WebGL background grid with fading lines, subtle particle haze, slow forward drift, and gentle camera parallax
- `beam-glow-states` — Create React loading, processing, selected, current, focus, and pressed states with the border-beam package's animated edge glow
- `beautiful-shadows` — Apply exact Tailwind arbitrary shadow utilities for polished, layered neutral elevation
- `blue-cloudy-clean-modern` — Create a clean modern design system with a luminous blue sky atmosphere, soft drifting cloud light, minimal white framing, and serene premium typography
- `blue-laser-clean-glass-layout` — Create a clean dark glass layout system with a thin blue laser atmosphere, frosted premium shells, and polished dashboard structure
- `book-serif-index` — Create an archival book-reader design system with serif-led pages, mono index navigation, aged paper surfaces, margin notes, and a premium catalog frame
- `bright-green-tech-system-webgl` — Create a bright-green technical design system with structured split layouts, hard-framed dark surfaces, mono utility labels, and a prominent WebGL visualization zone
- `build-awwwards-quality-sites` — Art-direct and implement distinctive, motion-rich marketing, editorial, portfolio, and landing websites with original reference-inspired imagery, standout heroes, GSAP choreography, one smooth-scroll engine, optional Three.js shaders, honest icon and logo sourcing, photo avatars, accessibility, and performance safeguards
- `build-interactive-particle-trail` — Build a cursor or touch particle interaction that emits by distance along the traveled segment into a recycled GPU point pool, with optional keyboard-triggered bursts
- `build-threejs-scroll-worlds` — Build rich, scroll-controlled real-time Three.js experiences as one persistent 3D world whose camera, lighting, atmosphere, materials, objects, DOM story, and interactions evolve across authored chapters
- `build-wireframe-scan-reveal` — Reveal Three.js geometry with an expanding world-space scan whose wire cage leads the solid surface, then burns away
- `cinematic-gsap-lenis-motion-system` — Create premium cinematic web motion systems with GSAP, ScrollTrigger, and Lenis
- `cinematic-scroll-storytelling` — Create cinematic scroll-driven landing pages with Lenis smooth scrolling, GSAP ScrollTrigger, scroll-linked progression, staggered text reveals, sticky card stacks, parallax backgrounds, scroll-scrubbed transitions, footer reveals, and immersive preloaders
- `clean-minimal-beige-light-mode` — Create a clean minimal beige light-mode design system with warm neutral shells, quiet process grids, restrained accent color, and elegant low-contrast structure
- `cobejs` — Use when adding a lightweight interactive globe with cobe (canvas setup, markers, interaction, performance, integration with React/Next.js)
- `company-logos` — Use Iconify Simple Icons logos (64x64) instead of text logos
- `container-lines` — Add vertical container-size guide lines with mini corner squares for precise, structured web layouts
- `corner-diagonals` — Apply diagonal-cut corners and chamfered edges to buttons, cards, panels, and container shells
- `corner-lasers` — Create a corner-anchored laser composition with thin beams, a bright emitter node, bloom, and atmospheric glow or fog
- `css-alpha-masking` — Apply CSS alpha masking with linear-gradient for horizontal or vertical edge fades (mask-image and -webkit-mask-image)
- `css-border-gradient` — Apply subtle gradient-border treatments for premium web surfaces
- `dark-blue-contrasting-clean` — Create a dark-blue clean design system with strong contrast, cobalt gradient feature blocks, crisp framed structure, and restrained premium glow
- `dark-glass-clean-layout` — Create a dark glass layout system with frosted premium shells, clean multi-column workspace structure, floating data cards, and restrained atmospheric depth
- `dither-background` — Create a dark monochrome procedural background with enlarged square pixels and visible Bayer-style ordered dithering
- `dither-laser-dark-mode` — Create a dark premium design system that combines near-black surfaces, subtle ordered-dither texture, and a thin accent-colored laser atmosphere
- `documentary-brutalist-agency` — Create or redesign creative agency, production studio, architecture, culture, and portfolio websites with billboard typography, hard black-and-white chapters, exposed grids, documentary imagery, irregular collages, restrained parallax, brutalist navigation, and accessible FAQ controls
- `editorial-portfolio-chapters` — Create or redesign creative-studio, agency, photographer, artist, and portfolio websites where project work leads the story
- `editorial-service-booking` — Create or redesign appointment-based service websites for salons, barbers, spas, wellness studios, clinics, and hospitality brands
- `editorial-tech` — Blend editorial magazine composition with precision product-tech detailing using asymmetrical grids, cinematic media bands, mono utility labels, and restrained accent color
- `falling-leaves` — Build falling leaves that read as leaves, with each one tumbling on its own axis so it presents a face, thins to an edge, and opens out again, and with its sideways slip driven by that same tumble
- `fire-paper-loader` — Build a burning-paper ring loader whose GLSL flame is drawn by a Worker on an OffscreenCanvas started from the head, so a main thread blocked by the page build cannot freeze it, with a progress count, an even-paced run into the hand-off, and a clean fade to the page
- `framed-grid-layout` — Create minimal framed grid layouts with thin visible boundary lines, L-shaped corner brackets, subtle diagonal line texture, and strict section alignment
- `framed-tech-dark-border-gradient` — Create a framed dark technical design system with border-gradient shells, asymmetrical grid panels, mono utility labeling, and restrained monochrome atmosphere
- `funky-purple-container-tech` — Create a dark container-led technical design system with fuchsia-purple accents, layered rounded shells, crisp frame lines, and playful futuristic focal objects
- `glass-dark-mode-clock` — Create a dark glass design system with frosted shells, soft beam grids, circular clock-like calibration dials, and precise sci-fi instrument framing
- `glass-dark-ui` — Build dark-mode glassmorphism interfaces with readable contrast, frosted surfaces, and gradient borders using a pseudo-element mask
- `globe-gl` — Use when implementing globe.gl (Globe.GL) for 3D globe data visualization with WebGL/ThreeJS, including setup, data layers (points, arcs, polygons, labels), and integration patterns in plain HTML or React
- `globe-particles` — Create a globe-like 3D particle visualization with a dense luminous spherical core and thinner orbital ring or flattened disc
- `gooey-blob-system` — Create a gooey blob system using SVG filters where multiple shapes merge into a single fluid form
- `gsap-scrolltrigger-storytelling` — Build cinematic sticky product storytelling with GSAP ScrollTrigger, progressive UI reveals, scroll-synced animation, smooth interpolation, and immersive section transitions
- `gsap` — Use when you need to add or debug professional web animations with GSAP (timelines, ScrollTrigger, stagger, transforms) in HTML/CSS/JS/React
- `high-contrast-skeuomorphic-clean` — Create a high-contrast clean skeuomorphic design system with molded dark surfaces, crisp light separation, tactile inset depth, and restrained signal accents
- `horizontal-scroll-scenes` — Build scene-by-scene chapters that advance left to right on one fixed stage while the user scrolls vertically, with native scroll as the only input
- `html-demo` — Show an app working on a web page by drawing it live in HTML instead of recording it
- `image-first-grid-layout` — Create an image-led grid design system with full-bleed photography, structural guide lines, anchored content blocks, and restrained technical overlays
- `landing-page` — Use when designing or rewriting a high-converting landing page (single-offer page) for SaaS/apps/services
- `light-mode-paper-technical` — Create a light-mode technical design system with warm paper surfaces, dark outer framing, subtle diagonal texture, precise bracketed geometry, and restrained accent signals
- `liquid-metal-border` — Add and tune animated liquid-metal WebGL borders with the React `metal-fx` package
- `marquee-loop` — Apply seamless infinite marquee loops using duplicated items
- `masked-reveal` — Create masked staggered word reveals on scroll with GSAP ScrollTrigger
- `matterjs` — Use when implementing 2D physics interactions with Matter.js, including Engine/World setup, Render/Runner configuration, adding bodies and constraints, and scroll/interaction-friendly canvas scenes
- `mesh-gradient-dark-blue-clean` — Create a futuristic, premium, clean dark-blue mesh-gradient design system across background rendering, hero shell, navigation, floating nodes, framed sections, CTAs, and motion
- `nested-container-clean-agency` — Create a clean agency design system built from nested containers, with an outer editorial shell, inset dark feature blocks, rounded premium cards, and restrained accent color
- `nested-container-frames` — Create a container-in-container layout system using nested frames
- `number-details` — Add decorative 01, 02, 03 numeric detail markers
- `operational-enterprise-ai` — Create or redesign enterprise AI, automation, security, and operations product pages that explain system boundaries, approvals, auditability, exceptions, and rollback
- `orange-clean-paper-saas` — Create a clean paper-toned SaaS design system with warm neutrals, orange accent signals, rounded premium forms, and polished product illustration surfaces
- `paper-cinder-transition` — Change between pages, chapters or scenes with a paper-burn transition, a ragged ember line that sweeps across the frame, chars the old page ahead of it and reveals the next scene live behind it, written as one WebGL composite pass over a frozen frame and a scissored live scene
- `pointer-trail-emitter` — Build a cursor trail whose spacing stays constant at any hand speed, by emitting motes per unit of distance travelled rather than on a timer, so a flick draws the same continuous ribbon as a crawl instead of breaking into scattered dots
- `pricing-page` — Use when designing or rewriting a high-converting SaaS pricing page (structure, plan design, copywriting, SEO/AEO, FAQs, layout patterns, experiments)
- `product-proof-saas` — Create or redesign SaaS and AI product landing pages where a real workflow, interface, or deterministic demo is the central proof
- `progressive-blur` — Create a layered CSS progressive blur (top or bottom) using multiple backdrop-filter masks for depth and softness
- `reveal-hover-effect` — Build cursor-following spotlight reveals that expose a second aligned image through a soft radial mask
- `scroll-progress-timeline` — Turn any ordered process into a data-driven vertical or horizontal scroll story with a base line, progress fill, active step states, responsive collapse, semantic fallback, and reduced-motion behavior
- `scroll-scrubbed-visual-sequence` — Build reversible scroll-controlled visual transformations with a pinned or sticky stage, normalized progress, and video, image-sequence, canvas, SVG, or DOM renderers
- `scroll-scrubbed-word-reveal` — Reveal marked-up text word by word as scroll progress advances, while preserving semantic inline links, emphasis, responsive line wrapping, and reduced-motion readability
- `scroll-world-storytelling` — Turn an article, case study, brand narrative, product journey, or long-form story into a cinematic scroll-driven landing page using one of three renderers: scrubbed video, a real-time Three.js world, or semantic HTML/SVG data and typography
- `shaders-cursor-ripples` — Add cursor-following fluid WebGPU distortion over an existing image with the Shaders library's ImageTexture and CursorRipples components
- `skeuomorphic-ui` — Create skeuomorphic web UI surfaces with layered gradients, stacked inner and outer shadows, reflective gradient borders, micro texture, and embossed text or icon details
- `solar-duotone-bold` — Use Iconify Solar Duotone Bold icon style
- `split-layout-technical` — Create a technical split-screen design system with dual panels, fine frame lines, mono metadata, quiet editorial typography, and premium inset surfaces
- `staggered-word-reveal` — Create subtle editorial word-by-word text reveal animations where each word fades and rises into place once it enters the viewport
- `tailwindcss` — Use when designing/implementing UI with Tailwind CSS (layout, typography, responsive, theming, component patterns)
- `tech-green-dark-mode-modern` — Create a modern dark-mode technical design system with matte-black surfaces, emerald signal accents, mono system labeling, framed dashboard cards, and restrained glow
- `technical-wireframe-info-layout` — Create a monochrome technical wireframe design system with exploded 3D structure, connector annotations, sparse information labels, and precise dark diagnostic framing
- `thinking-orbs` — Add accessible animated AI loading and agent-status indicators with the React thinking-orbs library
- `threejs-landscape` — Build a live Three.js landscape that stays quiet behind a subject — a noise heightfield on a polar grid so resolution follows the lens, ground coloured by slope and moisture rather than by texture, instanced GPU grass whose wind costs nothing on the CPU, scattered stones, a gradient sky dome, a star field you can actually see, and a time-of-day system that cross-fades instead of cutting
- `threejs-towers` — Generate architecture procedurally in Three.js and film it assembling — a small geometry vocabulary that builds pagodas, castles, domes and spires from parameters instead of mesh files, hip roofs with flying eaves driven by a single profile function, and a clipping-plane build animation where everything below a rising line is finished work and scaffolding stands above it
- `threejs-weather` — Put weather into a Three.js scene that reads as weather — rain anchored inside the frustum, a storm that is the rain leaned on rather than a second system, lightning on its own light with thunder scheduled by distance, snow that blows up into blizzards and keeps settling until the ground goes white, wet ground with puddles and splashes, and looping ambience that has no seam
- `threejs` — Use when building or debugging interactive 3D scenes on the web with Three.js (scene/camera/renderer, lights/materials, GLTF loading, controls, performance)
- `unicorn-studio` — Use when embedding and customizing Unicorn Studio interactive animations on the web (embed, responsive sizing, performance, layering with UI, fallbacks)
- `vantajs` — Use when adding animated WebGL background effects with Vanta.js (setup, parameters, resizing, performance, integration in React/Next.js)
- `webgl-3d-object` — Create a real 3D WebGL object with geometric mesh depth, physically based material, directional and ambient lighting, perspective camera, subtle rotation, and floating motion
- `webgl-landing-steering` — Use when creating or refining WebGL-heavy landing pages and you need to steer toward a specific visual outcome (premium, technical, playful, cinematic) while balancing conversion clarity, performance, and implementation complexity
- `webgl-laser` — Create a fixed full-screen WebGL laser background effect with a thin white-hot vertical core, restrained brand-colored halo, and soft smoky fog around the beam

## workflow (4)

- `workflow-progress-screenshots` — Show the user real screenshots of the work as it progresses, without being asked
- `workflow-score-to-target` — Score work out of 10 against a clear rubric, then improve it round by round until every item reaches the target score the user named (for example "get it to 8 out of 10", "bring everything under 6 up to 6+")
- `workflow-ship-change` — Ship every change the way the user requires, with the guardrails
- `workflow-threads-manager` — Oversee the other Claude threads (sessions) working on the same project
