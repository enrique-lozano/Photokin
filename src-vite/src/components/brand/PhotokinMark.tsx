import type { SVGProps } from 'react';

/** Single-colour Photokin mark; inherits `currentColor` so it follows the surrounding theme. */
export function PhotokinMark({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg viewBox="6.5 3.5 56 56" width={size} height={size} fill="currentColor" aria-hidden="true" {...props}>
      <rect x="12" y="8" width="11" height="49" rx="5.5" />
      <path
        fillRule="evenodd"
        d="M57 25a19 19 0 1 0-38 0 19 19 0 1 0 38 0zM47 25a9 9 0 1 1-18 0 9 9 0 1 1 18 0z"
      />
      <circle cx="38" cy="25" r="3.5" />
    </svg>
  );
}
