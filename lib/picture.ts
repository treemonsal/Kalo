/**
 * Profile pictures live in their own row ("picture:<token>"), not in the account. So the large image never
 * travels with every swipe and answer; pages load it once from its own address and the browser keeps it.
 * A new picture gets a new token, so the address can be cached forever.
 */
export const PICTURE_PREFIX = "data:image/jpeg;base64,";
export const PICTURE_MAX = 120_000;
export type StoredPicture = { owner: string; data: string };

export const pictureKey = (token: string) => "picture:" + token;
export const pictureUrl = (token: string | undefined) => token ? "/api/workspace?picture=" + token : null;

/** Turns a stored picture into the bytes of the JPEG file. */
export function pictureBytes(picture: StoredPicture) {
  return Uint8Array.from(atob(picture.data.slice(PICTURE_PREFIX.length)), char => char.charCodeAt(0));
}
