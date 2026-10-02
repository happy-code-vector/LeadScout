import type { PublicBrand } from "@/lib/public/brand";

/** Google-reviews trust link; renders nothing until rating and Maps URL are set. */
export function ReviewsBadge({ brand, className = "" }: { brand: PublicBrand; className?: string }) {
  if (!brand.googleRating || !brand.googleMapsUrl) return null;
  return (
    <a
      href={brand.googleMapsUrl}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline ${className}`}
    >
      <span className="text-amber-500">★</span>
      <span>
        {brand.googleRating}
        {brand.googleReviewCount > 0 ? ` from ${brand.googleReviewCount} Google reviews` : " on Google"}
      </span>
    </a>
  );
}
