import crypto from "node:crypto";

export function encryptRefreshToken(refreshToken: string, keyMaterial: string) {
  // hashes raw keyMaterial into 32 byte secret key
  const key = crypto.createHash("sha256").update(keyMaterial, "utf8").digest();
  
  // generate a unique random 12-byte binary string
  // security: encrypting the exact same token twice will produce diff output strings
  const iv = crypto.randomBytes(12);

  // boot up encryption engine
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  // encrypt raw text token and merge with excrypted data fragments into one big binary buffer
  const ciphertext = Buffer.concat([cipher.update(refreshToken, "utf8"), cipher.final()]);
  // generate unique tag for encrypted data that will be used
  // when decrypting to verify token has not been tampered with
  const tag = cipher.getAuthTag();

  // convert buffers into base64 and combine into single string seperated by periods
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString("base64")}`;
}

export function decryptRefreshToken(blob: string, keyMaterial: string) {
  // hashes raw keyMaterial string into 32 byte secret key
  const key = crypto.createHash("sha256").update(keyMaterial, "utf8").digest();

  // break data into 3 parts seperated by periods, validate their existence
  //1: Initialization Vector //2: Authentication Tag //3: actual string
  const [ivB64, tagB64, ciphertextB64] = blob.split(".");
  if (!ivB64 || !tagB64 || !ciphertextB64) throw new Error("Invalid ciphertext format");

  // convert from Base64 strings back into raw binary buffers so crypto can read them
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  // initialize description engine using derived key and unique IV
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);

  // security guard: checks tag and ensures ciphertext wasn't modified
  // will throw error if token is at all altered
  decipher.setAuthTag(tag);

  // convert final raw binary buffer back into the original UTF-8 string refresh token
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
