import type { Cover } from "./horizons";

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };
export type ImageFrame = Size & { left: number; top: number };
export const MIN_COVER_ZOOM = 1;
export const MAX_COVER_ZOOM = 4;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const validSize = (s: Size) =>
  s.width > 0 &&
  s.height > 0 &&
  Number.isFinite(s.width) &&
  Number.isFinite(s.height);
export function coverFrame(cover: Cover, box: Size, image: Size): ImageFrame {
  if (!validSize(box) || !validSize(image))
    return {
      left: 0,
      top: 0,
      width: Number.isFinite(box.width) ? Math.max(0, box.width) : 0,
      height: Number.isFinite(box.height) ? Math.max(0, box.height) : 0,
    };
  const zoom = clamp(
    Number.isFinite(cover.zoom) ? cover.zoom : 1,
    MIN_COVER_ZOOM,
    MAX_COVER_ZOOM,
  );
  const scale =
    Math.max(box.width / image.width, box.height / image.height) * zoom;
  const width = image.width * scale,
    height = image.height * scale;
  // Legacy x/y were CSS object-position anchors. Preserve their exact rendered
  // framing until the user makes an explicit adjustment in the new editor.
  const x = Number.isFinite(cover.x) ? clamp(cover.x, 0, 100) : 50,
    y = Number.isFinite(cover.y) ? clamp(cover.y, 0, 100) : 50;
  const left =
    cover.framing === "focal"
      ? box.width / 2 - (width * x) / 100
      : (-(width - box.width) * x) / 100;
  const top =
    cover.framing === "focal"
      ? box.height / 2 - (height * y) / 100
      : (-(height - box.height) * y) / 100;
  return {
    width,
    height,
    left: clamp(left, box.width - width, 0),
    top: clamp(top, box.height - height, 0),
  };
}
function fromFrame(
  cover: Cover,
  box: Size,
  frame: ImageFrame,
  zoom: number,
): Cover {
  return {
    ...cover,
    framing: "focal",
    x: ((box.width / 2 - frame.left) / frame.width) * 100,
    y: ((box.height / 2 - frame.top) / frame.height) * 100,
    zoom,
  };
}
/** Keep the image point under `from` under `to` at the next zoom. */
export function transformCover(
  cover: Cover,
  box: Size,
  image: Size,
  from: Point,
  to: Point,
  nextZoom = cover.zoom,
): Cover {
  if (
    !validSize(box) ||
    !validSize(image) ||
    ![from.x, from.y, to.x, to.y, nextZoom].every(Number.isFinite)
  )
    return cover;
  const previous = coverFrame(cover, box, image),
    zoom = clamp(nextZoom, MIN_COVER_ZOOM, MAX_COVER_ZOOM);
  const frame = coverFrame({ ...cover, zoom }, box, image);
  frame.left = clamp(
    to.x - ((from.x - previous.left) / previous.width) * frame.width,
    box.width - frame.width,
    0,
  );
  frame.top = clamp(
    to.y - ((from.y - previous.top) / previous.height) * frame.height,
    box.height - frame.height,
    0,
  );
  return fromFrame(cover, box, frame, zoom);
}
export function panCover(cover: Cover, box: Size, image: Size, delta: Point) {
  const center = { x: box.width / 2, y: box.height / 2 };
  return transformCover(cover, box, image, center, {
    x: center.x + delta.x,
    y: center.y + delta.y,
  });
}
export function zoomCover(
  cover: Cover,
  box: Size,
  image: Size,
  zoom: number,
  anchor: Point = { x: box.width / 2, y: box.height / 2 },
) {
  return transformCover(cover, box, image, anchor, anchor, zoom);
}
export const resetCoverFrame = (cover: Cover): Cover => ({
  ...cover,
  framing: "focal",
  x: 50,
  y: 50,
  zoom: 1,
});
