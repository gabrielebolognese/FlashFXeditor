// Words for the alpha cases the importer cannot play natively (Batch 64, spec §21.11).

/** The ffmpeg command that makes a WebM the app plays with transparency (also in docs/INTEROP.md). */
export const ALPHA_WEBM_COMMAND = "ffmpeg -i in.mov -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 24 out.webm";

/** ProRes (any profile) is not decodable in a browser: refused, with the conversion. */
export const PRORES_REFUSAL = `ProRes cannot be decoded in the browser: convert it to a VP9 WebM with alpha (${ALPHA_WEBM_COMMAND}) or to an H.264 MP4`;

const PRORES_FOURCC = /^(apch|apcn|apcs|apco|ap4h|ap4x|aprn|aprh)/i;

export function isProRes(codec: string): boolean {
  return PRORES_FOURCC.test(codec);
}

/** The toast text for a file whose alpha channel is ignored: it plays opaque. */
export function ignoredAlphaNote(codecFamily: string): string {
  return `Its ${codecFamily} alpha channel cannot be decoded here, so it plays opaque. For transparency, convert it to a VP9 WebM with alpha: ${ALPHA_WEBM_COMMAND}`;
}
