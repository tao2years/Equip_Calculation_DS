export function applyOcrReview(recognition, review, options = {}) {
  if (recognition.jobId !== review.jobId) throw new Error(`Review jobId ${review.jobId} does not match recognition ${recognition.jobId}`);
  const issues = [];
  const reviewedImages = [];
  const reviewBySequence = new Map((review.images || []).map((image) => [image.sequence, image]));
  for (const image of recognition.images || []) {
    const decisionImage = reviewBySequence.get(image.sequence);
    if (!decisionImage) throw new Error(`Review is missing image sequence ${image.sequence}`);
    if (decisionImage.imageSha256 !== image.imageSha256) throw new Error(`Review image hash mismatch at sequence ${image.sequence}`);
    if (decisionImage.reviewStatus === "pending") throw new Error(`Review image ${image.sequence} is still pending`);
    if (decisionImage.reviewStatus === "rejected") {
      reviewedImages.push({ ...structuredClone(image), captureType: decisionImage.captureType, reviewStatus: "rejected" });
      issues.push({ severity: "warning", code: "image_rejected", sequence: image.sequence });
      continue;
    }
    const decisions = new Map((decisionImage.decisions || []).map((decision) => [decision.lineIndex, decision]));
    const reviewed = structuredClone(image);
    reviewed.captureType = decisionImage.captureType;
    reviewed.reviewStatus = "accepted";
    reviewed.detections = reviewed.detections.map((detection) => {
      const decision = decisions.get(detection.lineIndex);
      if (!decision) throw new Error(`Accepted image ${image.sequence} is missing a decision for line ${detection.lineIndex}`);
      if (decision.status !== "matched" || !decision.selectedId) throw new Error(`Accepted image ${image.sequence} has unresolved line ${detection.lineIndex}`);
      const selected = (detection.matches || []).find((match) => match.id === decision.selectedId);
      if (!selected) throw new Error(`Review selected unknown candidate ${decision.selectedId} at image ${image.sequence}, line ${detection.lineIndex}`);
      return {
        ...detection,
        text: decision.rawText,
        normalizedText: selected.normalized || detection.normalizedText,
        matches: [selected]
      };
    });
    reviewedImages.push(reviewed);
  }
  if ((review.images || []).length !== recognition.images.length) throw new Error("Review contains an unexpected number of images");
  const createdAt = options.createdAt || new Date().toISOString();
  return {
    recognition: {
      ...structuredClone(recognition),
      createdAt,
      engine: `${recognition.engine}+human-review`,
      images: reviewedImages
    },
    report: {
      schemaVersion: "0.1.0",
      jobId: recognition.jobId,
      createdAt,
      sourceRecognition: recognition.sourceManifest,
      reviewedAt: review.reviewedAt,
      counts: {
        total: reviewedImages.length,
        accepted: reviewedImages.filter((image) => image.reviewStatus === "accepted").length,
        rejected: reviewedImages.filter((image) => image.reviewStatus === "rejected").length
      },
      issues
    }
  };
}
