export const MEDIA_URL_PATTERN = /^\/api\/media\/[\w-]+\.(png|jpe?g|webp|gif)$/i;

export function isMediaUrl(value: unknown): value is string {
  return typeof value === "string" && MEDIA_URL_PATTERN.test(value);
}
