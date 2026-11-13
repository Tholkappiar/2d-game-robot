# Wreck machine: image prompts for Tripo multi-view

This is our own machine design (a crashed survey walker), not a copy of the one in the reference game.

## How to use

1. In one ChatGPT chat, paste the **Design block**, then ask for the 4 views one at a time.
   After the front view, say "same machine, same details" for each next view so they match.
2. Save them as `front.png`, `left.png`, `back.png`, `right.png` (Tripo reads the view from the file name).
3. Run (about 110 credits; add `--dry-run` first to check without spending):

   ```
   tripo make front.png left.png back.png right.png --name crashwood-wreck -o tripo-out/wreck
   ```

4. Give me the `.glb` and I'll place it in the crater and add the real blue glow and sparks in the game.

Rules that make Tripo work well:
- Plain light-grey background, no ground, no shadow on the floor, no scenery.
- Whole machine in frame with a margin, centred, same size in all 4 views.
- Flat, even studio light (no strong shadows; they get baked into the texture).
- Keep the blue light as small painted glowing parts. Don't ask for lightning bolts or flying sparks in the images: Tripo would turn them into solid geometry. I add sparks in the game.

## Design block (paste first)

> Design a crashed alien survey walker machine for a hand-painted 2.5D adventure game. It is one single object. Body: a large egg-shaped hull of dark weathered grey-green metal plates, lying tilted about 25 degrees to one side, with one side torn open showing ribbed inner frames and bundles of thick cables. On top of the hull is a broken ring-shaped sensor mast, snapped and bent over. Under the hull are three long insect-like legs with two joints each: two legs are folded and buckled under the weight, one leg is stretched out straight to the side. Every leg joint has a small round glass lens that glows soft electric blue. Inside the torn opening, a cracked spherical power core glows the same electric blue, and a few exposed cable ends have tiny blue glowing tips. Surface: matte painted metal, chipped edges, light rust streaks, soot and scorch marks near the torn side, a little moss on the top. Style: stylized hand-painted game asset, clean readable shapes, soft brush texture, not photorealistic. No text, no logos, no characters.

## View prompts (one at a time)

**front.png**
> Using the design above, draw the FRONT view of the machine: straight-on orthographic view, camera at mid height, no perspective. Whole machine centred with a margin on all sides. Plain light-grey background, no ground, no cast shadow, flat even studio lighting. Square image, 2048x2048.

**left.png**
> Same machine, same details and colours. Now the LEFT SIDE view: straight-on orthographic view from the machine's left, same scale and same height in frame as the front view. Plain light-grey background, no ground, no cast shadow, flat even lighting. Square image, 2048x2048.

**back.png**
> Same machine, same details and colours. Now the BACK view: straight-on orthographic view from directly behind, same scale as the front view. The torn opening is not visible from here; show the intact rear plates and the backs of the legs. Plain light-grey background, no ground, no cast shadow, flat even lighting. Square image, 2048x2048.

**right.png**
> Same machine, same details and colours. Now the RIGHT SIDE view: straight-on orthographic view from the machine's right, same scale as the front view. Plain light-grey background, no ground, no cast shadow, flat even lighting. Square image, 2048x2048.

## Optional extra props for Tripo (single image each is enough)

- A big slanted slab of pale grey cliff rock with scorch marks.
- A burnt fallen tree trunk with glowing orange ember cracks.
- A dead bare tree, charred at the base.
- A pile of broken rock rubble.
