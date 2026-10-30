import type { ReactNode } from 'react';
import './pageContent.css';

interface HeroIconProps {
  icon: ReactNode;
  /** Optional background color (defaults to the app primary). */
  color?: string;
}

/**
 * A colored, rounded badge that fills the page hero cover. Use it as the cover
 * for non-photographic entities (All Photos, an album folder, a tag, …) so every
 * page hero shares the exact same cover footprint.
 */
export function HeroIcon({ icon, color }: HeroIconProps) {
  return (
    <span
      className="hero-icon"
      style={color ? { background: color, boxShadow: `0 8px 24px ${color}40` } : undefined}
    >
      {icon}
    </span>
  );
}
