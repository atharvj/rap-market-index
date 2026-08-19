export type WatchNowMarketEvent = {
  title: string;
  source_url: string | null;
  raw_payload: unknown;
};

export function isWatchNowMarketEvent(event: WatchNowMarketEvent) {
  const rawPayload = toRawPayload(event.raw_payload);
  const source = getRawString(rawPayload.source);
  const classificationReason = getRawString(rawPayload.classificationReason);
  const title = event.title.toLowerCase();
  const videoId = getYoutubeVideoId(rawPayload, event.source_url);
  const durationSeconds = getRawNumber(rawPayload.durationSeconds);
  const youtubeEmbeddable = getRawBoolean(rawPayload.youtubeEmbeddable);
  const youtubePrivacyStatus = getRawString(rawPayload.youtubePrivacyStatus);
  const youtubeUploadStatus = getRawString(rawPayload.youtubeUploadStatus);
  const hasOfficialVideoTitle =
    title.includes("official video") ||
    title.includes("official music video") ||
    title.includes("music video");
  const hasOfficialVideoClassification =
    classificationReason === "official_video_upload_title" ||
    classificationReason === "major_feature_upload_title";
  const hasEditorialVideoClassification = [
    "lyrics_interview",
    "music_interview",
    "music_documentary",
    "editorial_performance"
  ].includes(classificationReason);
  const isAudioOnly =
    title.includes("official audio") ||
    title.includes("lyric video") ||
    title.includes("visualizer") ||
    classificationReason === "track_audio_upload_title" ||
    classificationReason === "official_audio_release_cluster";
  const isShortForm =
    (typeof durationSeconds === "number" && durationSeconds > 0 && durationSeconds <= 75) ||
    title.includes("#shorts") ||
    title.includes("youtube short");
  const isEligibleOfficialUpload =
    source === "youtube_upload_event" &&
    (hasOfficialVideoTitle || hasOfficialVideoClassification);
  const isEligibleEditorialVideo =
    source === "youtube_editorial_event" &&
    hasEditorialVideoClassification;

  return (
    (isEligibleOfficialUpload || isEligibleEditorialVideo) &&
    Boolean(videoId) &&
    youtubeEmbeddable !== false &&
    (!youtubePrivacyStatus || youtubePrivacyStatus === "public") &&
    (!youtubeUploadStatus || youtubeUploadStatus === "processed") &&
    !isAudioOnly &&
    !isShortForm
  );
}

export function getYoutubeVideoId(rawPayload: Record<string, unknown>, sourceUrl: string | null) {
  const storedVideoId =
    getRawText(rawPayload.videoId) ||
    getRawText(rawPayload.representativeVideoId);

  if (/^[A-Za-z0-9_-]{6,20}$/.test(storedVideoId)) {
    return storedVideoId;
  }

  if (!sourceUrl) {
    return null;
  }

  try {
    const url = new URL(sourceUrl);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const candidate =
      hostname === "youtu.be"
        ? url.pathname.split("/").filter(Boolean)[0] ?? ""
        : hostname.endsWith("youtube.com")
          ? url.searchParams.get("v") ?? url.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/)?.[1] ?? ""
          : "";

    return /^[A-Za-z0-9_-]{6,20}$/.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function toRawPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getRawString(value: unknown) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function getRawText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getRawNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getRawBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}
