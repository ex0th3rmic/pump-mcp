/**
 * Pins a coin's image and metadata JSON to IPFS (via Pinata, with the operator's PINATA_JWT) and
 * returns the `uri` that `/trade` create takes.
 *
 * The image comes inline as a data URL. The server never fetches an image URL on the caller's behalf:
 * that would make it a proxy for whatever the model's code points it at.
 */
export type MetadataErrorCode = "BAD_REQUEST" | "NOT_CONFIGURED" | "UPSTREAM";
export class MetadataError extends Error {
  constructor(
    message: string,
    readonly code: MetadataErrorCode,
    readonly status?: number,
  ) {
    super(message);
    this.name = "MetadataError";
  }
}

const PINATA = "https://api.pinata.cloud/pinning";
const DEFAULT_GATEWAY = "https://ipfs.io/ipfs/";
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };

export interface MetadataResult {
  uri: string;
  image: string;
  metadata: Record<string, unknown>;
}

const bad = (m: string) => new MetadataError(m, "BAD_REQUEST");

function link(v: unknown, field: string): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string" || !/^https:\/\/[^\s]+$/.test(v) || v.length > 200) throw bad(`${field} must be an https:// link under 200 characters`);
  return v;
}

function parseImage(v: unknown): { bytes: Uint8Array; type: string; ext: string } {
  if (typeof v !== "string") throw bad("image is required, as a data URL: data:image/png;base64,...");
  const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(v);
  if (!m) throw bad("image must be a base64 data URL of a png, jpeg, gif or webp; the server does not fetch image URLs");
  const b64 = m[2]!.replace(/\s/g, "");
  if (b64.length * 0.75 > MAX_IMAGE_BYTES + 3) throw bad("image must be 2 MB or smaller");
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch {
    throw bad("image is not valid base64");
  }
  if (bytes.length > MAX_IMAGE_BYTES) throw bad("image must be 2 MB or smaller");
  return { bytes, type: m[1]!, ext: IMAGE_TYPES[m[1]!]! };
}

export async function pinMetadata(
  body: unknown,
  deps: { jwt: string | undefined; gateway?: string; fetchImpl: (input: string, init?: RequestInit) => Promise<Response> },
): Promise<MetadataResult> {
  if (!body || typeof body !== "object") throw bad("body must be an object");
  const b = body as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const symbol = typeof b.symbol === "string" ? b.symbol.trim() : "";
  if (!name || name.length > 32) throw bad("name must be 1 to 32 characters");
  if (!symbol || symbol.length > 10) throw bad("symbol must be 1 to 10 characters");
  const description = typeof b.description === "string" ? b.description : "";
  if (description.length > 1000) throw bad("description must be 1000 characters or fewer");
  const links = { website: link(b.website, "website"), twitter: link(b.twitter, "twitter"), telegram: link(b.telegram, "telegram") };
  const image = parseImage(b.image);
  if (!deps.jwt) throw new MetadataError("Metadata upload is disabled: PINATA_JWT is not configured on this server. Host the image and JSON yourself and pass its https:// or ipfs:// uri to /trade.", "NOT_CONFIGURED");

  const gateway = (deps.gateway || DEFAULT_GATEWAY).replace(/\/?$/, "/");
  const auth = { authorization: `Bearer ${deps.jwt}` };
  const pin = async (url: string, init: RequestInit) => {
    const res = await deps.fetchImpl(url, init);
    const text = await res.text();
    if (!res.ok) throw new MetadataError(`IPFS pinning responded ${res.status}: ${text.slice(0, 300)}`, "UPSTREAM", res.status);
    const cid = (JSON.parse(text) as { IpfsHash?: string }).IpfsHash;
    if (!cid) throw new MetadataError("IPFS pinning returned no content id", "UPSTREAM");
    return cid;
  };

  const form = new FormData();
  form.append("file", new Blob([image.bytes], { type: image.type }), `${symbol.toLowerCase()}.${image.ext}`);
  form.append("pinataMetadata", JSON.stringify({ name: `${symbol} image` }));
  const imageCid = await pin(`${PINATA}/pinFileToIPFS`, { method: "POST", headers: auth, body: form });

  const metadata: Record<string, unknown> = { name, symbol, description, image: gateway + imageCid, showName: true };
  for (const [k, v] of Object.entries(links)) if (v) metadata[k] = v;
  const metaCid = await pin(`${PINATA}/pinJSONToIPFS`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ pinataContent: metadata, pinataMetadata: { name: `${symbol} metadata` } }),
  });
  return { uri: gateway + metaCid, image: gateway + imageCid, metadata };
}
