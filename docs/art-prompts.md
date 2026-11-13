# Art prompts for ChatGPT (Crashwood)

How to use:
- Start every chat by pasting the **Style block**. Then send one asset prompt at a time.
- Keep all assets in the **same chat**, so the style stays consistent.
- Save each result as PNG into `public/assets/` with the file name shown.
- If a "transparent" result comes back with a white or grey background, reply: *"Same image, but with a truly transparent background (PNG with alpha), no backdrop."*

---

## Style block (paste first)

> We are making background art for a side-scrolling 2.5D adventure game set in an overgrown forest crater on an alien-but-earthly planet. Style: hand-painted, painterly environment concept art. Soft, visible brush strokes, clean shapes, cinematic and calm. Colors: deep teal and green forest (#1f3d3a, #3f6b5a, #7fa58a), warm sunlight highlights (#ffe2b8), cool blue-grey stone (#6c6f78), sandy dirt path (#b3a48c), and a clear sky blue (#6fa6c8). Lighting: late-morning sun from the **upper right**, soft atmospheric haze, so things get lighter and bluer with distance. Pure side view, camera at eye level, no perspective tilt. No characters, no animals, no text, no logos, no UI, no frame or border.

---

## 1. Sky — `crash-sky-v2.png`

> Wide side-view sky for the game background, 1536x1024. Clear blue sky getting paler near the horizon, a few large soft cumulus clouds lit warm from the upper right, and a faint thin pale planetary ring arcing across the upper left of the sky. Leave the bottom 30% as plain hazy pale blue, because hills will cover it. The left and right edges must match so it can tile horizontally. No ground, no trees.

## 2. Far hills — `crash-far-hills.png` (transparent)

> 1536x1024 PNG with a transparent background. A long horizontal band of distant forested hills and low mountains, seen from the side, sitting in the lower half of the canvas. Very hazy and light: blue-green tones, low contrast, soft mist pooling in the valleys between the hills. The top edge is the hill silhouette against transparency, and the bottom fades out softly. Seamless left and right edges.

## 3. Crater wall — `crash-basin-v2.png` (transparent)

> 1536x1024 PNG with a transparent background. The far wall of a large impact crater seen from the side: a broad, curved bowl of pale blue-grey layered rock and loose scree. The rim is lined with green trees and a few dead bare trunks. Mid-distance, so it has some haze and medium contrast. Sunlit from the upper right, with soft dappled tree shadows on the slope. The bottom of the image fades out softly. Nothing in the center of the bowl (we place our own wreck there).

## 4. Mid forest tree line — `crash-woods-v2.png` (transparent)

> 1536x1024 PNG with a transparent background. A side-view line of mid-distance forest trees: varied deciduous canopies with clustered painterly leaves, visible trunks, and a few gaps showing nothing (transparent) between them. Deep teal-green in shadow, warm yellow-green where the sun hits from the upper right. The bottom of the trunks fades out softly to transparent. Seamless left and right edges.

## 5. Foreground silhouettes — `crash-foreground-v2.png` (transparent)

> 1536x1024 PNG with a transparent background. Near-black (#0b1418) flat silhouettes for the very front layer of a side-scrolling game: one large leafy tree on the far left with its canopy hanging into the top-left corner, one slim bare forked trunk around the right third, a few hanging branches, and a low broken edge of rocks and grass blades along the bottom. Pure flat silhouettes, no inner detail, no gradients. Keep the middle of the image open.

## 6. Plant sheets (transparent) — for the 3D path

One sheet per prompt. Ask for **separate plants with space between them** (no overlap), so we can cut them out.

**`plants-grass.png`**
> 1536x1024 PNG with a transparent background. A sprite sheet of 6 separate wild grass clumps in side view, each standing on its base, spaced apart with no overlap. Mix of short tufts and tall clumps with a few seed heads. Greens and yellow-greens, lit from the upper right. Painterly, crisp edges, no ground or shadow under them.

**`plants-ferns.png`**
> 1536x1024 PNG with a transparent background. A sprite sheet of 6 separate fern and leafy ground plants in side view, each standing on its base, spaced apart with no overlap: 3 ferns of different sizes, 2 broad-leaf clumps, and 1 clover patch. Deep and fresh greens, lit from the upper right. Painterly, crisp edges, no ground or shadow under them.

**`plants-bushes.png`**
> 1536x1024 PNG with a transparent background. A sprite sheet of 4 separate small round shrubs and bushes in side view, each standing on its base, spaced apart with no overlap. Dense painterly leaf clusters, dark teal shadows and warm green highlights from the upper right. No ground or shadow under them.

**`plants-moss-hanging.png`**
> 1536x1024 PNG with a transparent background. A sprite sheet of 6 separate pieces: 3 strands of hanging moss and roots that drape over a rock edge (attached at the top), and 3 low flat moss patches with tiny white flowers. Greens with small warm highlights. No background.
