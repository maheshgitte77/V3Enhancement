const { promisify } = require("util");
const { execFile } = require("child_process");
const ffprobePath = require("ffprobe-static").path;

let ffmpegPath = null;
try {
  ffmpegPath = require("ffmpeg-static");
} catch (_) {
  ffmpegPath = null;
}

const execFileAsync = promisify(execFile);

const parseJSON = (input) => {
  try {
    return JSON.parse(input);
  } catch (_) {
    return null;
  }
};

const parseDb = (value) => {
  if (typeof value !== "string") return null;
  const numeric = Number(value.replace(" dB", "").trim());
  return Number.isFinite(numeric) ? numeric : null;
};

const probeMedia = async (filePath) => {
  const { stdout } = await execFileAsync(ffprobePath, [
    "-v",
    "error",
    "-show_streams",
    "-show_format",
    "-print_format",
    "json",
    filePath,
  ]);

  const parsed = parseJSON(stdout) || {};
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const format = parsed.format || {};
  const audioStream = streams.find((s) => s.codec_type === "audio");

  return {
    hasAudioStream: !!audioStream,
    audioStream,
    formatDurationSec: Number(format.duration || 0) || 0,
  };
};

const detectSilenceWithFfmpeg = async (filePath) => {
  if (!ffmpegPath) {
    return { checked: false, reason: "ffmpeg-binary-unavailable" };
  }

  try {
    const { stderr } = await execFileAsync(ffmpegPath, [
      "-hide_banner",
      "-i",
      filePath,
      "-af",
      "volumedetect",
      "-f",
      "null",
      process.platform === "win32" ? "NUL" : "/dev/null",
    ]);

    const meanMatch = stderr.match(/mean_volume:\s*([-\d.]+ dB)/i);
    const maxMatch = stderr.match(/max_volume:\s*([-\d.]+ dB)/i);
    const meanDb = parseDb(meanMatch?.[1]);
    const maxDb = parseDb(maxMatch?.[1]);

    // Heuristic: real human voice should usually exceed these levels.
    const likelySilent =
      meanDb !== null && maxDb !== null && meanDb < -45 && maxDb < -25;

    return { checked: true, meanDb, maxDb, likelySilent };
  } catch (error) {
    return {
      checked: false,
      reason: "ffmpeg-volumedetect-failed",
      error: error.message,
    };
  }
};

const checkMediaHasAudibleAudio = async (filePath, logger = console) => {
  const probe = await probeMedia(filePath);
  const silence = await detectSilenceWithFfmpeg(filePath);

  let reason = "ok";
  let guardPassed = true;

  if (!probe.hasAudioStream) {
    guardPassed = false;
    reason = "no-audio-stream";
  } else if (
    probe.audioStream &&
    String(probe.audioStream.codec_name || "").toLowerCase() === "none"
  ) {
    guardPassed = false;
    reason = "invalid-audio-codec";
  } else if (silence.checked && silence.likelySilent) {
    guardPassed = false;
    reason = "audio-likely-silent";
  }

  const result = {
    guardPassed,
    reason,
    hasAudioStream: probe.hasAudioStream,
    audioCodec: probe.audioStream?.codec_name || null,
    audioChannels: probe.audioStream?.channels || null,
    audioSampleRate: probe.audioStream?.sample_rate || null,
    formatDurationSec: probe.formatDurationSec,
    silenceCheck: silence,
  };

  logger.info("Audio guard evaluation completed", {
    filePath,
    guardPassed: result.guardPassed,
    reason: result.reason,
    hasAudioStream: result.hasAudioStream,
    audioCodec: result.audioCodec,
    silenceChecked: !!result.silenceCheck?.checked,
    meanDb: result.silenceCheck?.meanDb ?? null,
    maxDb: result.silenceCheck?.maxDb ?? null,
  });

  return result;
};

module.exports = {
  checkMediaHasAudibleAudio,
};
