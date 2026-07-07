import { dispatch } from "@/commands/history";
import { useVideoStore } from "@/editors/video/useVideoStore";

export type RecordKind = "screen" | "camera" | "mic";

function mimeFor(kind: RecordKind): string {
  if (kind === "mic") {
    return MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
  }
  return MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
    ? "video/webm;codecs=vp9,opus"
    : "video/webm";
}

async function streamFor(kind: RecordKind): Promise<MediaStream> {
  if (kind === "screen") {
    return navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  }
  return navigator.mediaDevices.getUserMedia(
    kind === "camera" ? { video: true, audio: true } : { audio: true },
  );
}

/** Record screen/camera/mic; on stop the take lands on the matching track. */
export async function startRecording(kind: RecordKind): Promise<void> {
  const stream = await streamFor(kind); // throws if the user denies — caller ignores
  const mime = mimeFor(kind);
  const recorder = new MediaRecorder(stream, { mimeType: mime });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e): void => {
    if (e.data.size) chunks.push(e.data);
  };
  recorder.onstop = (): void => {
    stream.getTracks().forEach((t) => t.stop());
    useVideoStore.getState().setRecording(null);
    const blob = new Blob(chunks, { type: mime.split(";")[0] });
    if (blob.size > 0) {
      void dispatch("video.addRecordedMedia", { blob, name: `${kind}-recording.webm` });
    }
  };
  // Ending the share from the browser's own UI stops the recording too.
  stream.getVideoTracks()[0]?.addEventListener("ended", () => {
    if (recorder.state === "recording") recorder.stop();
  });
  recorder.start();
  useVideoStore.getState().setRecording({ kind, stop: () => recorder.stop() });
}
