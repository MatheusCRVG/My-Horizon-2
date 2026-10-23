import { BRAND } from "../core/brand";
export function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <button
      className="brand my-brand"
      aria-label={`${BRAND.name} — início`}
      onClick={onClick}
      type="button"
    >
      <img
        className="brand-on-light"
        src={BRAND.logo}
        alt={BRAND.wordmark}
        width="1032"
        height="510"
      />
      <img
        className="brand-on-dark"
        src={BRAND.darkLogo}
        alt=""
        aria-hidden="true"
        width="1032"
        height="510"
      />
    </button>
  );
}
