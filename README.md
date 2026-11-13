# Crashwood and Overgrown Depot

Run `npm run dev` and open the URL Vite prints. Crashwood starts on a woodland path leading down into the impact basin. Use A/D to move and Space to jump. Follow the rocky path uphill and through the woodland to finish.

Use the **Scene** menu to switch between Crashwood and Overgrown Depot. Each scene starts from its beginning when selected. You can also open `/?level=depot` directly. In Overgrown Depot, follow the path to the spillway, press Space near the channel edge to jump, then press Space again after the robot grabs the stone lip. Follow the forest path to the trail sign.

## Edit the scene

Edit [depot.json](src/layouts/depot.json) and reload the preview. The JSON lists the [art pieces](src/scene-catalog.js), their positions, and the walking surfaces. The builder reads image dimensions to derive sprite height, tiles strips such as the terrain and track, and applies draw order and parallax from the layer.

Each file has a display `name`, a starting robot position `spawnX`, and a list of `placements`. Here is one placement for a railcar on the right.

```json
{ "piece": "railcar", "layer": "trains", "x": 1.05, "width": 2.05, "bottom": -0.48 }
```

| Field | What it controls |
| --- | --- |
| `piece` | An art name from the piece list. Each name points to a PNG in `public/assets/`. |
| `layer` | Where it draws, from `background` at the back to `foreground` at the front. Later placements on the same layer draw on top. Background moves slowly as you walk. Foreground moves faster. |
| `x` | Left or right of the opening camera center. Negative is left, positive is right. Defaults to zero. For a repeating piece, this sets the first copy's position. For a strip, it shifts the pattern. |
| `width` | The width in game units. The builder gets the height from the art. |
| `bottom` | The vertical position of the bottom edge. A larger number moves the piece up. |
| `spacing` | Optional distance between repeated copies. Use 0.1 or more. Without it, a prop appears once. |
| `variation` | Optional left/right shift for repeated copies. Use zero or a positive number smaller than half the spacing. |
| `span` | Optional left and right limits for a repeating strip. This is how the rails end behind the oak and the depot path ends at the spillway lip. |

Each platform has horizontal endpoints `left` and `right` and a walking height `y`. Set `endY` to give the platform a different height at its right end. Match adjoining heights so the robot can walk across them. Set `grabLeft` to `true` to let the robot catch a platform's left edge. The outer endpoints bound the camera and walkable area. The optional `jumpSpeed` sets the initial upward speed. `finishX` places the trail sign and completes the demo when the robot reaches it on foot.

The forest terrain placement uses `surface: true` so its artwork follows the slope defined by the platforms. `fadeIn` blends an image in from the left across the given fraction of its width. `flip` mirrors an image horizontally.

The distant cliffs, river valley, viaduct, woodland, and cypress outcrop each have a parallax speed in the piece catalog. The playable terrain and near ferns move at their own speeds. The stone wall, wheel, water, and banks use separate PNGs. Transparent pixels around each sprite expose the layers behind it.

The preview reports invalid fields. Run `npm run build` to package the game.
