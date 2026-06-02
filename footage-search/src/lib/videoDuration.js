/**
 * Read duration from a video File via HTML5 metadata (main thread only).
 */
export function getVideoDuration(file) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const url = URL.createObjectURL(file);

    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      URL.revokeObjectURL(url);
      resolve(duration);
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };

    video.src = url;
  });
}
