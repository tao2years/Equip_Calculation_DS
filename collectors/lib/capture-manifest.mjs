import path from "node:path";

export function normalizeCaptureManifest(manifest) {
  if (Array.isArray(manifest.files)) {
    return {
      jobId: manifest.jobId,
      status: manifest.status || "unknown",
      privacy: manifest.privacy || { localOnly: true },
      files: manifest.files.map((file) => ({
        sequence: file.sequence,
        originalName: file.originalName,
        localPath: file.localPath,
        sha256: file.sha256,
        mediaType: file.mediaType,
        captureType: file.captureType || "unclassified",
        reviewStatus: file.reviewStatus || "pending"
      }))
    };
  }
  if (Array.isArray(manifest.captures)) {
    return {
      jobId: manifest.sessionId,
      status: manifest.status || "unknown",
      privacy: manifest.privacy || { localOnly: true, uploadPerformed: false },
      files: manifest.captures.map((capture) => ({
        sequence: capture.sequence,
        originalName: path.basename(capture.localPath),
        localPath: capture.localPath,
        sha256: capture.sha256,
        mediaType: capture.mediaType,
        captureType: capture.captureType || "unclassified",
        reviewStatus: "pending"
      }))
    };
  }
  throw new Error("Unsupported capture manifest: expected files[] or captures[]");
}
