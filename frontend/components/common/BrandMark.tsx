type BrandMarkProps = {
  className?: string;
};

/**
 * The road glyph from the app icon: a tapered carriageway with amber centre-line
 * dashes. One drawing so the phone header, the auth hero and the console rail
 * are unmistakably the same mark.
 */
export default function BrandMark({ className = "" }: BrandMarkProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      {/* Tapered carriageway, narrow at the horizon. */}
      <path d="M9.6 4.6h4.8l3.1 14.8H6.5L9.6 4.6Z" fill="currentColor" fillOpacity="0.95" />
      {/* Centre line dashes. */}
      <path
        d="M11.62 7.4h.76l.26 2.1h-1.28l.26-2.1Zm.5 4.3h1.02l.32 2.6h-1.66l.32-2.6Zm.52 4.9h1.3l.2 1.6h-1.7l.2-1.6Z"
        fill="#D97706"
      />
    </svg>
  );
}