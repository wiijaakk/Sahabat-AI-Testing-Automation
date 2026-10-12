import crypto from "node:crypto";

export function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** Cheap "did the pixels move" check. Full sha of a JPEG-sized png is fine at 1440x900. */
export function shotHash(buf: Buffer): string {
  return sha256(buf);
}
