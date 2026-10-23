import { useState } from "react";
import {
  Plane,
  Car,
  House,
  GraduationCap,
  ShieldCheck,
  Target,
  Wallet,
  Upload,
  ImageOff,
  LoaderCircle,
  Check,
} from "lucide-react";
import {
  coverSource,
  defaultCover,
  horizonCategories,
  horizonCategory,
  type Cover,
} from "../core/horizons";
import type { Entity } from "../core/model";
import { coverFrame, type Size } from "../core/cover-framing";
import { useElementSize } from "./useElementSize";
import { CoverEditor } from "./CoverEditor";
const icons = {
  travel: Plane,
  car: Car,
  home: House,
  study: GraduationCap,
  reserve: ShieldCheck,
  savings: Wallet,
  personal: Target,
  other: Target,
};
export function HorizonCover({
  goal,
  cover = goal.data.cover ?? defaultCover(goal),
  large = false,
}: {
  goal: Entity;
  cover?: Cover;
  large?: boolean;
}) {
  const [failed, setFailed] = useState("");
  const [natural, setNatural] = useState<{ src: string; size: Size }>();
  const { ref, size } = useElementSize<HTMLDivElement>();
  const src = coverSource(cover),
    category = horizonCategory(goal),
    Icon = icons[category.id];
  const frame =
    natural && natural.src === src && size.width > 0
      ? coverFrame(cover, size, natural.size)
      : undefined;
  return (
    <div
      ref={ref}
      data-framing={cover.framing ?? "legacy"}
      data-focus-x={cover.x}
      data-focus-y={cover.y}
      data-zoom={cover.zoom}
      className={`horizon-cover ${large ? "large" : ""} ${!src || failed === src ? "icon-cover" : ""}`}
    >
      {src && failed !== src ? (
        <img
          key={src}
          src={src}
          alt={`Capa de ${goal.data.name || category.label}`}
          loading={large ? "eager" : "lazy"}
          decoding="async"
          onError={() => setFailed(src)}
          onLoad={(event) =>
            setNatural({
              src,
              size: {
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              },
            })
          }
          style={{
            ...(frame
              ? {
                  width: frame.width,
                  height: frame.height,
                  left: frame.left,
                  top: frame.top,
                  right: "auto",
                  bottom: "auto",
                  transform: "none",
                }
              : {
                  objectPosition: `${cover.x}% ${cover.y}%`,
                  transform: `scale(${cover.zoom})`,
                  transformOrigin: `${cover.x}% ${cover.y}%`,
                }),
          }}
        />
      ) : (
        <>
          <Icon size={large ? 62 : 43} />
          {failed === src && src && (
            <span className="cover-unavailable">
              <ImageOff size={14} />
              Imagem indisponível
            </span>
          )}
        </>
      )}
    </div>
  );
}
export async function compressCover(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw Error("Escolha uma foto JPG, PNG ou WebP.");
  if (file.size > 8 * 1024 * 1024) throw Error("A foto deve ter até 8 MB.");
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const signature =
    head[0] === 255 && head[1] === 216
      ? "image/jpeg"
      : head[0] === 137 && head[1] === 80 && head[2] === 78 && head[3] === 71
        ? "image/png"
        : String.fromCharCode(...head.slice(0, 4)) === "RIFF" &&
            String.fromCharCode(...head.slice(8, 12)) === "WEBP"
          ? "image/webp"
          : "";
  if (signature !== file.type)
    throw Error("O conteúdo não corresponde a uma foto válida.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw Error("Não foi possível abrir esta imagem. Tente outra foto.");
  }
  try {
    if (bitmap.width < 240 || bitmap.height < 160)
      throw Error("Use uma foto com pelo menos 240 × 160 pixels.");
    if (
      bitmap.width > 10000 ||
      bitmap.height > 10000 ||
      bitmap.width * bitmap.height > 40000000
    )
      throw Error("A resolução é muito alta. Reduza a foto antes de enviar.");
    const canvas = document.createElement("canvas"),
      scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let blob: Blob | null = null;
    for (const quality of [0.82, 0.68, 0.52, 0.36]) {
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", quality),
      );
      if (blob && blob.size < 190000) break;
    }
    if (!blob || blob.type !== "image/webp" || blob.size > 220000)
      throw Error(
        "Não foi possível comprimir esta foto. Escolha uma imagem menor.",
      );
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(Error("Falha ao ler a imagem comprimida."));
      r.readAsDataURL(blob!);
    });
  } finally {
    bitmap.close();
  }
}
export function CoverPicker({
  goal,
  value,
  onChange,
  onBusy,
}: {
  goal: Entity;
  value: Cover;
  onChange: (v: Cover) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [tab, setTab] = useState<string>(horizonCategory(goal).id),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [uploaded, setUploaded] = useState<Cover | null>(
      value.type === "upload" ? value : null,
    ),
    [galleryEdits, setGalleryEdits] = useState<Record<string, Cover>>({});
  const selected = horizonCategories.find((c) => c.id === tab)!;
  const remember = () => {
    if (value.type === "upload") setUploaded(value);
    if (value.type === "gallery" && value.image)
      setGalleryEdits((old) => ({ ...old, [value.image!]: value }));
  };
  return (
    <section className="cover-picker">
      <div className="split">
        <div>
          <h3>A imagem do seu horizonte</h3>
          <p>Uma conquista que você consegue visualizar.</p>
        </div>
      </div>
      {value.type === "icon" ? (
        <div className="cover-preview cover-icon-preview">
          <HorizonCover goal={goal} cover={value} />
        </div>
      ) : (
        <CoverEditor value={value} onChange={onChange} disabled={busy} />
      )}
      <div className="cover-source-actions">
        <span>Escolha sua foto</span>
        <label className={`btn upload-cover ${busy ? "disabled" : ""}`}>
          {busy ? (
            <LoaderCircle size={17} className="spin" />
          ) : (
            <Upload size={17} />
          )}
          Enviar foto
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Enviar foto da capa"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setBusy(true);
              onBusy(true);
              setError("");
              try {
                const data = await compressCover(file);
                remember();
                const next: Cover = {
                  type: "upload",
                  data,
                  x: 50,
                  y: 50,
                  zoom: 1,
                  framing: "focal",
                };
                setUploaded(next);
                onChange(next);
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
                onBusy(false);
              }
            }}
          />
        </label>
        <button
          type="button"
          className={`btn cover-icon-choice ${value.type === "icon" ? "active" : ""}`}
          disabled={busy}
          aria-pressed={value.type === "icon"}
          onClick={() => {
            setError("");
            remember();
            onChange({ type: "icon", x: 50, y: 50, zoom: 1 });
          }}
        >
          <Target size={16} />
          Usar capa com ícone
        </button>
      </div>
      {busy && (
        <p className="cover-upload-status" role="status">
          Preparando sua foto…
        </p>
      )}
      {uploaded && (
        <div className="cover-uploaded-choice">
          <button
            type="button"
            disabled={busy}
            className={value.type === "upload" ? "selected" : ""}
            aria-pressed={value.type === "upload"}
            onClick={() => {
              if (value.type === "upload") return;
              remember();
              setError("");
              onChange(uploaded);
            }}
          >
            <img src={uploaded.data} alt="" />
            <span>Sua foto enviada</span>
            {value.type === "upload" && <Check size={16} />}
          </button>
        </div>
      )}
      <h4 className="cover-gallery-title">Fotografias sugeridas</h4>
      <div
        className="cover-gallery-tabs"
        role="group"
        aria-label="Categorias da galeria"
      >
        {horizonCategories.map((c) => (
          <button
            type="button"
            aria-pressed={tab === c.id}
            className={tab === c.id ? "active" : ""}
            disabled={busy}
            key={c.id}
            onClick={() => setTab(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="cover-gallery">
        {selected.images.map((image, i) => (
          <button
            type="button"
            key={image}
            aria-label={`Escolher capa ${selected.label} ${i + 1}`}
            aria-pressed={value.type === "gallery" && value.image === image}
            disabled={busy}
            onClick={() => {
              if (value.type === "gallery" && value.image === image) return;
              setError("");
              remember();
              onChange(
                galleryEdits[image] ?? {
                  type: "gallery",
                  image,
                  x: 50,
                  y: 50,
                  zoom: 1,
                  framing: "focal",
                },
              );
            }}
          >
            {value.type === "gallery" && value.image === image ? (
              <>
                <HorizonCover goal={goal} cover={value} />
                <span className="cover-selected-mark">
                  <Check size={14} />
                  Selecionada
                </span>
              </>
            ) : (
              <img
                src={`/covers/${image}.webp`}
                alt={`${selected.label}, opção ${i + 1}`}
                loading="lazy"
              />
            )}
          </button>
        ))}
      </div>
      <div className="split">
        <small>
          JPG, PNG ou WebP até 8 MB. O app salva uma cópia otimizada; o arquivo
          original permanece intacto.
        </small>
      </div>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
