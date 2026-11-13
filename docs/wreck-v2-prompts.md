# Wreck v2: the sleeping colossus (image prompts)

A new, more interesting centrepiece: not a fresh crash, but an **ancient giant machine that died here
long ago** and has slowly become part of the landscape. Use these in one ChatGPT chat, in order.

Save the four views as `front.png`, `left.png`, `back.png`, `right.png` in
`public/assets/crashwood/wreck-v2/`. I'll model it in Blender from them (no Tripo).

## Design block (paste first)

> Design an ancient, long-dead giant machine for a hand-painted 2.5D adventure game. It is one single object, roughly the size of a house. Concept: a colossal four-legged mechanical guardian that collapsed centuries ago and never moved again. It lies slumped on its belly with its front legs folded under it and its long neck resting on the ground, the head turned slightly toward the viewer, like a sleeping animal. The head is a smooth rounded helmet shape with one large round eye socket; the glass of the eye is cracked and almost dark, with only a faint, dim amber glow deep inside. The body is a long rounded shell of overlapping curved armour plates, like a beetle or an armadillo; several plates have fallen off, showing a hollow ribcage of curved metal beams inside. Time has taken it over: thick moss carpets the top of the back and head, long vines and roots hang from the ribs and wrap around the legs, ferns and small flowers grow in the gaps, and one young tree grows straight out of the middle of its back, its roots gripping the plates. A small bird's nest sits in the eye socket's rim. The metal is weathered to soft green-grey with deep rust-orange stains, faded traces of old pale-blue paint markings, and pale lichen spots. Nothing is shiny; it looks peaceful and very old, not scary. Style: stylized hand-painted game art, soft painterly brush texture, clean readable shapes, gentle colours, not photorealistic. No characters, no text, no logos.

## View prompts (one at a time, after the design block)

**front.png**
> Draw the FRONT view of this machine: straight-on orthographic view from the front, camera at mid height, no perspective. The whole machine is centred with a margin on every side. Plain light-grey background, no ground plane, no cast shadow, flat even studio lighting. Square image, 2048x2048.

**left.png**
> Same machine, exactly the same details, moss, vines, tree and colours. Now the LEFT SIDE view: straight-on orthographic view from its left side, same scale and same height in frame as the front view. The long body, the tree on its back and the neck resting on the ground are clearly visible. Plain light-grey background, no ground, no cast shadow, flat even lighting. Square image, 2048x2048.

**back.png**
> Same machine, exactly the same details. Now the BACK view: straight-on orthographic view from directly behind, same scale as the front view. Show the curved rear armour plates, the folded back legs and the tree rising from the back. Plain light-grey background, no ground, no cast shadow, flat even lighting. Square image, 2048x2048.

**right.png**
> Same machine, exactly the same details. Now the RIGHT SIDE view: straight-on orthographic view from its right side, same scale as the front view. On this side several armour plates are missing so the hollow ribcage with hanging vines shows. Plain light-grey background, no ground, no cast shadow, flat even lighting. Square image, 2048x2048.

## Optional matching props (one image each, transparent background)

- **Fallen armour plate:** "A single large curved armour plate from the same machine, lying on the ground half-buried, covered in moss and small ferns, transparent background."
- **Broken leg segment:** "A detached mechanical leg segment from the same machine, overgrown with vines and moss, lying on its side, transparent background."
- **Mossy cables:** "A tangle of old thick cables from the same machine, half-buried, wrapped in roots and moss, transparent background."

## Tips

- If a view comes back with a different design, reply: "Keep it identical to the front view — same plates, same tree, same moss."
- Keep the glow tiny (only the faint amber eye). I'll add the real soft glow in the game.
