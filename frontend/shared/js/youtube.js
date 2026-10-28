// Recognise YouTube links and derive the video id and thumbnail from them.

const YOUTUBE_PATTERNS = [
  /(?:youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/,
  /(?:youtu\.be\/)([\w-]{11})/,
  /(?:youtube\.com\/(?:shorts|embed|live)\/)([\w-]{11})/,
];

/** Returns the 11-character video id, or null if the text is no YouTube link. */
function getYouTubeId(url) {
  if (!url) return null;
  for (const pattern of YOUTUBE_PATTERNS) {
    const match = url.trim().match(pattern);
    if (match) return match[1];
  }
  return null;
}

function getYouTubeThumbnail(id) {
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}
