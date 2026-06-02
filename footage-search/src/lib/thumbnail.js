/**
 * Build JPEG data URL from raw frame bytes (worker + main thread safe).
 */
export function thumbnailDataUrlFromFrameBytes(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!data.length) return null;
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < data.length; i += chunk) {
    binary += String.fromCharCode(...data.subarray(i, i + chunk));
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

export function thumbnailDataUrlFromFrames(frames) {
  if (!frames?.length) return null;
  const first = frames.reduce((a, b) =>
    (a.timestamp ?? 0) <= (b.timestamp ?? 0) ? a : b
  );
  return thumbnailDataUrlFromFrameBytes(first.data);
}
