import {
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Minus, Plus, RotateCcw, ImageOff, Move } from "lucide-react";
import { coverSource, type Cover } from "../core/horizons";
import {
  coverFrame,
  panCover,
  zoomCover,
  transformCover,
  resetCoverFrame,
  MIN_COVER_ZOOM,
  MAX_COVER_ZOOM,
  type Point,
  type Size,
} from "../core/cover-framing";
import { useElementSize } from "./useElementSize";

type ActivePointer = Point & {
  startX: number;
  startY: number;
  type: string;
  at: number;
  moved: boolean;
  multiple: boolean;
};
const centerOf = (pointers: ActivePointer[]): Point =>
  pointers.length === 2
    ? {
        x: (pointers[0].x + pointers[1].x) / 2,
        y: (pointers[0].y + pointers[1].y) / 2,
      }
    : pointers[0];
const distance = (points: ActivePointer[]) =>
  points.length === 2
    ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
    : 0;
export function CoverEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: Cover;
  onChange: (cover: Cover) => void;
  disabled?: boolean;
}) {
  const { ref, size } = useElementSize<HTMLDivElement>();
  const [natural, setNatural] = useState<{ src: string; size: Size }>(),
    [failed, setFailed] = useState(""),
    [dragging, setDragging] = useState(false),
    [touch, setTouch] = useState(false);
  const source = coverSource(value),
    helpId = useId(),
    keyboardId = useId();
  const current = useRef(value),
    box = useRef(size),
    image = useRef<Size>({ width: 0, height: 0 }),
    callback = useRef(onChange),
    blocked = useRef(disabled);
  const pointers = useRef(new Map<number, ActivePointer>()),
    lastTap = useRef<{ point: Point; time: number } | null>(null),
    lastTouch = useRef(-Infinity);
  current.current = value;
  box.current = size;
  callback.current = onChange;
  blocked.current = disabled;
  image.current =
    natural && natural.src === source ? natural.size : { width: 0, height: 0 };
  const ready = !!image.current.width && size.width > 0 && failed !== source;
  const commit = (next: Cover) => {
    current.current = next;
    callback.current(next);
  };
  const zoom = (next: number, anchor?: Point) => {
    if (!blocked.current && image.current.width)
      commit(
        zoomCover(current.current, box.current, image.current, next, anchor),
      );
  };
  const reset = () => {
    if (!disabled) commit(resetCoverFrame(current.current));
  };
  useEffect(() => {
    setTouch(matchMedia("(pointer: coarse)").matches);
    const element = ref.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (blocked.current || !image.current.width || !event.deltaY) return;
      event.preventDefault();
      const bounds = element.getBoundingClientRect();
      const delta =
        event.deltaY *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? bounds.height
            : 1);
      const next =
        current.current.zoom *
        Math.exp(-Math.max(-300, Math.min(300, delta)) * 0.002);
      commit(
        zoomCover(current.current, box.current, image.current, next, {
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
        }),
      );
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [ref]);
  useEffect(() => {
    pointers.current.clear();
    setDragging(false);
    lastTap.current = null;
  }, [source]);
  const point = (event: ReactPointerEvent): Point => {
    const b = ref.current!.getBoundingClientRect();
    return { x: event.clientX - b.left, y: event.clientY - b.top };
  };
  const toggleZoom = (anchor: Point) =>
    zoom(current.current.zoom < 1.95 ? 2 : 1, anchor);
  const finish = (event: ReactPointerEvent, cancelled = false) => {
    const entry = pointers.current.get(event.pointerId);
    if (!entry) return;
    pointers.current.delete(event.pointerId);
    if (ref.current?.hasPointerCapture(event.pointerId))
      ref.current.releasePointerCapture(event.pointerId);
    setDragging(pointers.current.size > 0);
    if (entry.type === "touch") {
      lastTouch.current = performance.now();
      if (
        !cancelled &&
        !entry.moved &&
        !entry.multiple &&
        performance.now() - entry.at < 300
      ) {
        const p = point(event),
          previous = lastTap.current,
          now = performance.now();
        if (
          previous &&
          now - previous.time < 350 &&
          Math.hypot(previous.point.x - p.x, previous.point.y - p.y) < 28
        ) {
          toggleZoom(p);
          lastTap.current = null;
        } else lastTap.current = { point: p, time: now };
      } else lastTap.current = null;
    }
  };
  const frame = ready ? coverFrame(value, size, image.current) : undefined;
  return (
    <div className="cover-editor">
      <div className="cover-preview">
        <div
          ref={ref}
          className={`cover-crop-area ${dragging ? "is-dragging" : ""} ${!ready ? "is-loading" : ""}`}
          role="group"
          data-focus-x={value.x}
          data-focus-y={value.y}
          data-zoom={value.zoom}
          tabIndex={disabled ? -1 : 0}
          aria-label="Enquadramento da foto"
          aria-describedby={`${helpId} ${keyboardId}`}
          aria-busy={!ready && failed !== source}
          aria-disabled={disabled || undefined}
          onPointerDown={(event) => {
            if (
              disabled ||
              !ready ||
              (event.pointerType === "mouse" && event.button !== 0) ||
              pointers.current.size >= 2
            )
              return;
            event.preventDefault();
            ref.current?.focus({ preventScroll: true });
            if (event.pointerType === "touch") {
              setTouch(true);
              lastTouch.current = performance.now();
            }
            const p = point(event),
              multiple = pointers.current.size > 0;
            for (const existing of pointers.current.values())
              existing.multiple = true;
            pointers.current.set(event.pointerId, {
              ...p,
              startX: p.x,
              startY: p.y,
              type: event.pointerType,
              at: performance.now(),
              moved: false,
              multiple,
            });
            ref.current?.setPointerCapture(event.pointerId);
            setDragging(true);
          }}
          onPointerMove={(event) => {
            const active = pointers.current.get(event.pointerId);
            if (!active || disabled) return;
            event.preventDefault();
            const before = [...pointers.current.values()].map((p) => ({
                ...p,
              })),
              nextPoint = point(event);
            active.x = nextPoint.x;
            active.y = nextPoint.y;
            if (
              Math.hypot(active.x - active.startX, active.y - active.startY) > 5
            )
              active.moved = true;
            const after = [...pointers.current.values()],
              oldDistance = distance(before),
              newDistance = distance(after);
            const nextZoom =
              before.length === 2 && oldDistance > 0
                ? (current.current.zoom * newDistance) / oldDistance
                : current.current.zoom;
            commit(
              transformCover(
                current.current,
                box.current,
                image.current,
                centerOf(before),
                centerOf(after),
                nextZoom,
              ),
            );
          }}
          onPointerUp={(event) => finish(event)}
          onPointerCancel={(event) => finish(event, true)}
          onLostPointerCapture={(event) => finish(event, true)}
          onDoubleClick={(event) => {
            event.preventDefault();
            if (performance.now() - lastTouch.current < 500) return;
            const b = ref.current!.getBoundingClientRect();
            toggleZoom({ x: event.clientX - b.left, y: event.clientY - b.top });
          }}
          onKeyDown={(event) => {
            if (!ready || disabled) return;
            const delta = event.shiftKey ? 35 : 12,
              directions: Record<string, Point> = {
                ArrowLeft: { x: -delta, y: 0 },
                ArrowRight: { x: delta, y: 0 },
                ArrowUp: { x: 0, y: -delta },
                ArrowDown: { x: 0, y: delta },
              };
            if (directions[event.key]) {
              event.preventDefault();
              commit(
                panCover(
                  current.current,
                  box.current,
                  image.current,
                  directions[event.key],
                ),
              );
            } else if (["+", "="].includes(event.key)) {
              event.preventDefault();
              zoom(current.current.zoom * 1.2);
            } else if (["-", "_"].includes(event.key)) {
              event.preventDefault();
              zoom(current.current.zoom / 1.2);
            } else if (["0", "Home"].includes(event.key)) {
              event.preventDefault();
              reset();
            }
          }}
        >
          <img
            key={source}
            src={source}
            alt="Foto em edição de enquadramento"
            draggable={false}
            onLoad={(event) =>
              setNatural({
                src: source!,
                size: {
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                },
              })
            }
            onError={() => setFailed(source!)}
            style={
              frame
                ? {
                    width: frame.width,
                    height: frame.height,
                    left: frame.left,
                    top: frame.top,
                  }
                : undefined
            }
          />
          <div className="crop-guide" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
          {failed === source ? (
            <div className="crop-image-error" role="status">
              <ImageOff size={27} />
              <span>Não foi possível abrir esta foto.</span>
              <small>Escolha outra imagem ou tente novamente.</small>
            </div>
          ) : (
            !ready && (
              <span className="crop-loading" role="status">
                Preparando prévia…
              </span>
            )
          )}
        </div>
      </div>
      <div className="crop-toolbar">
        <p id={helpId}>
          <Move size={15} />
          {touch
            ? "Arraste para ajustar · Faça pinça para ampliar"
            : "Arraste para ajustar · Role para ampliar"}
        </p>
        <div
          className="crop-zoom-controls"
          role="group"
          aria-label="Aproximação da foto"
        >
          <button
            type="button"
            className="icon-btn"
            aria-label="Reduzir foto"
            disabled={disabled || !ready || value.zoom <= MIN_COVER_ZOOM}
            onClick={() => zoom(value.zoom / 1.2)}
          >
            <Minus size={17} />
          </button>
          <output aria-live="polite" aria-label="Zoom da foto">
            {Math.round(value.zoom * 100)}%
          </output>
          <button
            type="button"
            className="icon-btn"
            aria-label="Ampliar foto"
            disabled={disabled || !ready || value.zoom >= MAX_COVER_ZOOM}
            onClick={() => zoom(value.zoom * 1.2)}
          >
            <Plus size={17} />
          </button>
        </div>
      </div>
      <div className="crop-reset-row">
        <span id={keyboardId}>
          Teclado: setas para mover, + e − para ampliar, 0 para redefinir.
        </span>
        <button
          type="button"
          className="text-btn"
          disabled={disabled || !ready}
          onClick={reset}
        >
          <RotateCcw size={14} />
          Redefinir enquadramento
        </button>
      </div>
    </div>
  );
}
