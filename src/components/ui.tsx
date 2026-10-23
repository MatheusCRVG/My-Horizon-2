import { useEffect, useRef, useId, type ReactNode } from "react";
import {
  X,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  Search,
  Download,
  House,
  ShoppingCart,
  Utensils,
  Car,
  Heart,
  GraduationCap,
  Plane,
  BriefcaseBusiness,
  Clapperboard,
  ShoppingBag,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { money } from "../core/model";
import { BRAND } from "../core/brand";
import { saveExport } from "../services/files";
export function Modal({
  title,
  children,
  onClose,
  className,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      className={className}
      ref={ref}
      aria-labelledby={titleId}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-head">
        <div>
          <span className="eyebrow">{BRAND.name}</span>
          <h2 id={titleId}>{title}</h2>
        </div>
        <button className="icon-btn" aria-label="Fechar" onClick={onClose}>
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export type Field = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "select" | "textarea" | "password";
  options?: { value: string; label: string }[];
  required?: boolean;
  min?: number;
  max?: number;
  step?: string;
  default?: any;
  hint?: string;
};
export function DataForm({
  fields,
  initial = {},
  onSubmit,
  submit = "Salvar",
  extra,
  submitDisabled = false,
  scrollable = false,
  onCancel,
  onInvalid,
}: {
  fields: Field[];
  initial?: Record<string, any>;
  onSubmit: (d: Record<string, any>) => Promise<void> | void;
  submit?: string;
  extra?: ReactNode;
  submitDisabled?: boolean;
  scrollable?: boolean;
  onCancel?: () => void;
  onInvalid?: () => void;
}) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    if (f.type === "number") {
      let v = z.coerce
        .number({ invalid_type_error: "Informe um número válido." })
        .finite();
      if (f.min !== undefined) v = v.min(f.min, `Mínimo: ${f.min}`);
      if (f.max !== undefined) v = v.max(f.max, `Máximo: ${f.max}`);
      shape[f.key] = v;
    } else {
      let v = z.string();
      if (f.required) v = v.min(1, "Preencha este campo.");
      if (f.type === "date" && f.required)
        v = v.regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
      shape[f.key] = v;
    }
  }
  const defaults = Object.fromEntries(
    fields.map((f) => [
      f.key,
      initial[f.key] ??
        f.default ??
        (f.type === "number"
          ? 0
          : f.type === "select" && f.required
            ? (f.options?.[0]?.value ?? "")
            : ""),
    ]),
  );
  for (const f of fields)
    if (f.type === "select") defaults[f.key] = String(defaults[f.key] ?? "");
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(z.object(shape)),
    defaultValues: defaults,
  });
  const content = (
    <>
      <div className="form-grid">
        {fields.map((f) => (
          <label className={f.type === "textarea" ? "span-2" : ""} key={f.key}>
            <span>
              {f.label}
              {f.required ? " *" : ""}
            </span>
            {f.type === "select" ? (
              <select {...register(f.key)}>
                {!f.required && <option value="">Não informado</option>}
                {f.options?.map((o) => (
                  <option value={o.value} key={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === "textarea" ? (
              <textarea rows={3} {...register(f.key)} />
            ) : (
              <input
                type={f.type ?? "text"}
                min={f.min}
                max={f.max}
                step={f.step ?? (f.type === "number" ? "0.01" : undefined)}
                {...register(f.key)}
              />
            )}
            {f.hint && <small>{f.hint}</small>}
            {errors[f.key] && (
              <small className="negative">
                {String(errors[f.key]?.message)}
              </small>
            )}
          </label>
        ))}
      </div>
      {extra}
      {errors.root && (
        <p role="alert" className="error-box">
          {String(errors.root.message)}
        </p>
      )}
    </>
  );
  return (
    <form
      noValidate={!!onInvalid}
      onSubmit={handleSubmit(async (d) => {
        try {
          await onSubmit(d);
        } catch (e) {
          setError("root", { message: (e as Error).message });
        }
      }, onInvalid)}
    >
      {scrollable ? (
        <div className="data-form-content">{content}</div>
      ) : (
        content
      )}
      <div className="form-actions">
        {onCancel && (
          <button
            type="button"
            className="btn form-cancel"
            disabled={isSubmitting}
            onClick={onCancel}
          >
            Cancelar
          </button>
        )}
        <span>* Campos obrigatórios</span>
        <button
          className="btn primary"
          disabled={isSubmitting || submitDisabled}
          type="submit"
        >
          {isSubmitting ? "Salvando…" : submit}
        </button>
      </div>
    </form>
  );
}
export function Empty({
  title = "Seu próximo capítulo começa aqui",
  text = "Adicione seu primeiro registro para acompanhar seus planos.",
  action,
}: {
  title?: string;
  text?: string;
  action?: () => void;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Wallet size={28} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <button className="btn primary" onClick={action}>
          <Plus size={17} />
          Adicionar
        </button>
      )}
    </div>
  );
}
export function Stat({
  label,
  value,
  detail,
  tone = "",
  icon,
}: {
  label: string;
  value: number;
  detail?: string;
  tone?: string;
  icon?: ReactNode;
}) {
  return (
    <article className={`stat ${tone}`}>
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-icon">{icon ?? <Wallet size={18} />}</span>
      </div>
      <strong>{money(value)}</strong>
      {detail && <small>{detail}</small>}
    </article>
  );
}
export function Progress({ value }: { value: number }) {
  return (
    <div className="progress">
      <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
export function Amount({ value, type }: { value: number; type?: string }) {
  return (
    <span
      className={
        type === "income" ? "positive" : type === "expense" ? "negative" : ""
      }
    >
      {type === "income" ? "+ " : type === "expense" ? "− " : ""}
      {money(value)}
    </span>
  );
}
export function TypeIcon({
  type,
  category,
}: {
  type: string;
  category?: string;
}) {
  const icons: Record<string, typeof House> = {
    Moradia: House,
    Mercado: ShoppingCart,
    Alimentação: Utensils,
    Transporte: Car,
    Saúde: Heart,
    Educação: GraduationCap,
    Viagens: Plane,
    Salário: BriefcaseBusiness,
    Lazer: Clapperboard,
    Compras: ShoppingBag,
  };
  const Icon = category ? icons[category] : null;
  return (
    <span className={`type-icon ${type}`} data-category={category}>
      {Icon ? (
        <Icon size={18} />
      ) : type === "income" ? (
        <ArrowDownLeft size={18} />
      ) : type === "expense" ? (
        <ArrowUpRight size={18} />
      ) : (
        <Wallet size={18} />
      )}
    </span>
  );
}
export function Toolbar({
  search,
  setSearch,
  children,
  onAdd,
  onExport,
}: {
  search?: string;
  setSearch?: (v: string) => void;
  children?: ReactNode;
  onAdd?: () => void;
  onExport?: () => void;
}) {
  return (
    <div className="toolbar">
      {setSearch && (
        <label className="search">
          <Search size={17} />
          <input
            aria-label="Pesquisar registros"
            placeholder="Pesquisar…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      )}
      {children}
      <div className="toolbar-end">
        {onExport && (
          <button className="btn" onClick={onExport}>
            <Download size={16} />
            Exportar CSV
          </button>
        )}
        {onAdd && (
          <button className="btn primary" onClick={onAdd}>
            <Plus size={17} />
            Adicionar
          </button>
        )}
      </div>
    </div>
  );
}
export async function download(
  data: string,
  name: string,
  type = "application/json",
) {
  return saveExport(data, name, type);
}
export function csvExport(headers: string[], data: unknown[][], name: string) {
  const cell = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+@\-\t\r]/.test(s) && !/^[-+]?[0-9.,]+$/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  download(
    "\ufeff" +
      [headers, ...data].map((r) => r.map(cell).join(";")).join("\r\n"),
    name,
    "text/csv;charset=utf-8",
  );
}
