/**
 * Envelope encryption for the one secret the DB holds: theta's SimpleFIN
 * access URL, which embeds the user's bank credentials. The client-isolation
 * rules already keep it off the wire; this keeps it unreadable in a leaked DB
 * snapshot/backup too.
 *
 * AES-256-GCM with a key derived (HKDF-SHA256) from AUTH_SECRET — no new
 * secret to provision, and the SimpleFIN feature is accounts-only so
 * AUTH_SECRET is guaranteed present wherever this runs. Sealed values carry a
 * versioned prefix; `openSecret` passes legacy plaintext rows through
 * unchanged and they get sealed on their next write.
 *
 * Caveat (documented, accepted): deriving from AUTH_SECRET ties the sealed
 * rows to that secret — rotating AUTH_SECRET invalidates stored bank links,
 * and users simply re-link. A dedicated KMS key would decouple that; overkill
 * for this deployment model.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";
const HKDF_SALT = "alpha.simplefin.v1";

function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET required to seal/open secrets");
  return Buffer.from(hkdfSync("sha256", secret, HKDF_SALT, "secretbox", 32));
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/** Unseal a sealed value; legacy plaintext (no prefix) passes through. */
export function openSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  const [ivB64, tagB64, ctB64] = stored.slice(PREFIX.length).split(":");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
