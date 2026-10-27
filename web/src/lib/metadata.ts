import { mcp } from "./mcp";
import type { MetadataResult } from "./types";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export interface MetadataInput {
  name: string;
  symbol: string;
  description: string;
  website?: string;
  twitter?: string;
  telegram?: string;
}

export function validateMetadata(input: MetadataInput): void {
  const name = input.name.trim();
  const symbol = input.symbol.trim();
  if (!name || name.length > 32) throw new Error("Token name must be 1 to 32 characters.");
  if (!symbol || symbol.length > 10) throw new Error("Token symbol must be 1 to 10 characters.");
  if (input.description.length > 1000) throw new Error("Description must be 1000 characters or fewer.");
  for (const [field, value] of Object.entries({ website: input.website, twitter: input.twitter, telegram: input.telegram })) {
    if (value && (!/^https:\/\/[^\s]+$/.test(value) || value.length > 200)) throw new Error(`${field} must be an HTTPS URL under 200 characters.`);
  }
}

export function validateMetadataUri(uri: string): void {
  if (!/^(https:\/\/|ipfs:\/\/)/.test(uri) || uri.length > 200) throw new Error("Metadata URI must be HTTPS or IPFS and under 200 characters.");
}

export function fileToDataUrl(file: File): Promise<string> {
  if (!IMAGE_TYPES.has(file.type)) return Promise.reject(new Error("Artwork must be PNG, JPEG, GIF, or WebP."));
  if (file.size > MAX_IMAGE_BYTES) return Promise.reject(new Error("Artwork must be 2 MB or smaller."));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read artwork."));
    reader.onerror = () => reject(new Error("Could not read artwork."));
    reader.readAsDataURL(file);
  });
}

export async function pinMetadata(token: string, input: MetadataInput & { image: string }): Promise<MetadataResult> {
  validateMetadata(input);
  if (!input.image.startsWith("data:image/")) throw new Error("Choose artwork before pinning metadata.");
  const code = `async () => codemode.request({ method: "POST", path: "/metadata", body: ${JSON.stringify(input)} })`;
  const result = await mcp.execute<MetadataResult>(token, code);
  if (result.isError || !result.data?.uri) throw new Error(result.text || "Metadata pinning returned no URI.");
  return result.data;
}
