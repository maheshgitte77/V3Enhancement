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

const probeDurationSec = async (filePath) => {
  const { stdout } = await execFileAsync(ffprobePath, [
    "-v",
    "error",
    "-show_format",
    "-print_format",
    "json",
    filePath,
  ]);
  const parsed = parseJSON(stdout) || {};
  const duration = Number(parsed?.format?.duration || 0) || 0;
  return duration;
};

/**
 * Lightweight local "VAD" (speech-like activity) detector.
 *
 * IMPORTANT: This is not speaker identification. It is a deterministic guard to avoid
 * hallucinated transcripts when mic is on but no human speech is present.
 *
 * Strategy:
 * - Band-limit to speech-ish range (highpass+lowpass)
 * - Run ffmpeg silencedetect to find silence regions
 * - Compute non-silence segments; if enough non-silence exists, treat as speechPresent
 *
 * This is intentionally conservative (prefers false-negative over false-positive).
 */
const detectHumanSpeechLikeActivity = async (
  filePath,
  logger = console,
  options = {},
) => {
  const config = {
    silenceDb: options.silenceDb ?? -35,
    minSilenceDurationSec: options.minSilenceDurationSec ?? 0.25,
    minSpeechTotalSec: options.minSpeechTotalSec ?? 1.5,
    minSpeechSegmentSec: options.minSpeechSegmentSec ?? 0.35,
    minSpeechSegments: options.minSpeechSegments ?? 2,
    timeoutMs: options.timeoutMs ?? 60000,
  };

  if (!ffmpegPath) {
    return {
      checked: false,
      speechPresent: null,
      reason: "ffmpeg-binary-unavailable",
      config,
    };
  }

  let durationSec = 0;
  try {
    durationSec = await probeDurationSec(filePath);
  } catch (e) {
    durationSec = 0;
  }

  try {
    // NOTE: We don't decode to disk. We just analyze and parse stderr.
    // Band limiting reduces false positives from low-frequency hums and high-frequency hiss.
    const filter = `highpass=f=200,lowpass=f=3400,silencedetect=n=${config.silenceDb}dB:d=${config.minSilenceDurationSec}`;
    const { stderr } = await execFileAsync(
      ffmpegPath,
      [
        "-hide_banner",
        "-nostats",
        "-i",
        filePath,
        "-vn",
        "-af",
        filter,
        "-f",
        "null",
        process.platform === "win32" ? "NUL" : "/dev/null",
      ],
      { timeout: config.timeoutMs, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
    );

    const silenceStarts = [];
    const silenceEnds = [];

    // Example lines:
    // [silencedetect @ ...] silence_start: 0.023
    // [silencedetect @ ...] silence_end: 1.234 | silence_duration: 1.211
    const startRe = /silence_start:\s*([0-9.]+)/g;
    const endRe = /silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)/g;

    let m;
    while ((m = startRe.exec(stderr)) !== null) {
      const t = Number(m[1]);
      if (Number.isFinite(t)) silenceStarts.push(t);
    }
    while ((m = endRe.exec(stderr)) !== null) {
      const end = Number(m[1]);
      const dur = Number(m[2]);
      if (Number.isFinite(end) && Number.isFinite(dur)) {
        silenceEnds.push({ end, dur });
      }
    }

    // Build silence intervals from parsed events.
    // Prefer durations from silence_end lines. Handle trailing silence_start without end.
    const silenceIntervals = [];
    for (let i = 0; i < silenceEnds.length; i++) {
      const end = silenceEnds[i].end;
      const dur = silenceEnds[i].dur;
      const start = Math.max(0, end - dur);
      silenceIntervals.push([start, end]);
    }

    // If we have more starts than ends, treat last start as "silence till end".
    if (silenceStarts.length > silenceEnds.length) {
      const lastStart = silenceStarts[silenceStarts.length - 1];
      const end = durationSec > 0 ? durationSec : null;
      if (end !== null && Number.isFinite(lastStart) && lastStart < end) {
        silenceIntervals.push([lastStart, end]);
      }
    }

    // Compute non-silence segments by subtracting silence from [0, duration].
    const total = durationSec > 0 ? durationSec : null;
    let speechSeconds = 0;
    const nonSilentSegments = [];

    if (total !== null) {
      // Normalize intervals
      const normalized = silenceIntervals
        .map(([s, e]) => [Math.max(0, s), Math.min(total, e)])
        .filter(([s, e]) => e > s)
        .sort((a, b) => a[0] - b[0]);

      // Merge overlaps
      const merged = [];
      for (const [s, e] of normalized) {
        const last = merged[merged.length - 1];
        if (!last || s > last[1]) merged.push([s, e]);
        else last[1] = Math.max(last[1], e);
      }

      // Invert merged silence to non-silence
      let cursor = 0;
      for (const [s, e] of merged) {
        if (s > cursor) {
          nonSilentSegments.push([cursor, s]);
        }
        cursor = Math.max(cursor, e);
      }
      if (cursor < total) nonSilentSegments.push([cursor, total]);

      // Sum speech-like seconds with a minimum segment length
      const qualifying = nonSilentSegments
        .map(([s, e]) => ({ start: s, end: e, dur: e - s }))
        .filter((seg) => seg.dur >= config.minSpeechSegmentSec);

      speechSeconds = qualifying.reduce((sum, seg) => sum + seg.dur, 0);

      const speechPresent =
        speechSeconds >= config.minSpeechTotalSec &&
        qualifying.length >= config.minSpeechSegments;

      const result = {
        checked: true,
        speechPresent,
        reason: speechPresent ? "speech-like-detected" : "no-speech-like-activity",
        durationSec: total,
        speechSeconds: Number(speechSeconds.toFixed(3)),
        speechSegments: qualifying.length,
        silenceIntervalsCount: merged.length,
        config,
      };

      logger.info("Speech VAD evaluation completed", {
        filePath,
        speechPresent: result.speechPresent,
        reason: result.reason,
        durationSec: result.durationSec,
        speechSeconds: result.speechSeconds,
        speechSegments: result.speechSegments,
        silenceIntervalsCount: result.silenceIntervalsCount,
        silenceDb: config.silenceDb,
      });

      return result;
    }

    // If duration is unknown, we can’t reliably infer speech; be conservative.
    logger.warn("Speech VAD duration unknown; skipping strict decision", {
      filePath,
    });
    return {
      checked: false,
      speechPresent: null,
      reason: "duration-unknown",
      config,
    };
  } catch (error) {
    logger.warn("Speech VAD evaluation failed", {
      filePath,
      error: error.message,
    });
    return {
      checked: false,
      speechPresent: null,
      reason: "vad-failed",
      error: error.message,
      config,
    };
  }
};

module.exports = {
  detectHumanSpeechLikeActivity,
};

