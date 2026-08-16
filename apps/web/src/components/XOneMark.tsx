import type { SVGProps } from "react";

export function XOneMark({ size = 32, title, ...props }: SVGProps<SVGSVGElement> & { size?: number; title?: string }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} {...props}>
      {title ? <title>{title}</title> : null}
      <path d="M4 10h8l5 7m6 6 5 7h8M4 30h8l5-7m6-6 5-7h8" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" />
      <path d="m15 14 10 12m0-12L15 26" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.6" />
      <circle cx="4" cy="10" r="2" fill="currentColor" /><circle cx="36" cy="10" r="2" fill="currentColor" /><circle cx="4" cy="30" r="2" fill="currentColor" /><circle cx="36" cy="30" r="2" fill="currentColor" />
    </svg>
  );
}
