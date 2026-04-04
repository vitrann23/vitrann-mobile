import { API_BASE_URL } from "../services/apiClient";

/**
 * Normalizes image URLs from the backend to work in all environments
 * Handles:
 * - Relative paths (/uploads/...)
 * - localhost URLs (http://localhost:8081/uploads/...)
 * - Full production URLs (https://theinfranova.com/uploads/...)
 */
export function normalizeImageUrl(
  imageUrl: string | null | undefined,
): string | null {
  if (!imageUrl) return null;

  // If it's already a full URL (starts with http:// or https://)
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    // Replace localhost URLs with production domain
    if (imageUrl.includes("localhost") || imageUrl.includes("127.0.0.1")) {
      // Extract the path from localhost URL
      const url = new URL(imageUrl);
      const path = url.pathname;
      // Use production domain
      const baseUrl = API_BASE_URL.replace("/api", "");
      return `${baseUrl}${path}`;
    }
    // Already a valid full URL, return as is
    return imageUrl;
  }

  // If it's a relative path (starts with /)
  if (imageUrl.startsWith("/")) {
    const baseUrl = API_BASE_URL.replace("/api", "");
    return `${baseUrl}${imageUrl}`;
  }

  // If it doesn't start with /, assume it's relative to the API base
  const baseUrl = API_BASE_URL.replace("/api", "");
  return `${baseUrl}/${imageUrl}`;
}
