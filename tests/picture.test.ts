import assert from "node:assert/strict";
import test from "node:test";
import { centerCrop, cropOf } from "../app/kalo/picture.ts";

test("Bildausschnitt: Mitte, Verschieben und nie über den Rand", () => {
  assert.deepEqual(centerCrop(400, 200), { x: 100, y: 0, side: 200 });
  // Without moving, the crop is the middle square.
  assert.deepEqual(cropOf(400, 200, 100, 1, { x: 0, y: 0 }).crop, { x: 100, y: 0, side: 200 });
  // Dragging right shows more of the left side; far beyond the edge it stops at the edge.
  const left = cropOf(400, 200, 100, 1, { x: 999, y: 0 });
  assert.deepEqual(left.offset, { x: 50, y: 0 });
  assert.deepEqual(left.crop, { x: 0, y: 0, side: 200 });
  // Zoom 2 keeps half the side; moving up shows the lower part.
  const zoomed = cropOf(400, 200, 100, 2, { x: 0, y: -999 });
  assert.equal(zoomed.crop.side, 100);
  assert.equal(zoomed.crop.y, 100);
});
