import crypto from "node:crypto";

export function encryptRefreshToken(refreshToken: string, keyMaterial: string) {
  const key = crypto.createHash("sha256").update(keyMaterial, "utf8").digest();
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(refreshToken, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString("base64")}`;
}
