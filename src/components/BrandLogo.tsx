export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <img
      src="/binge-logo.svg"
      alt="BINGE"
      width={640}
      height={154}
      className={`brand-logo ${className}`}
    />
  );
}
