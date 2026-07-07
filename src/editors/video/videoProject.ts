import {
  bumpIdCounterPast,
  type MediaSource,
  type VideoProject,
} from "@/editors/video/videoModel";

export const STUDIO_PROJECT_VERSION = 1;

export interface SerialisedProject {
  version: number;
  studio: "video";
  project: Omit<VideoProject, "sources"> & { sources: Omit<MediaSource, "url">[] };
}

/** Project → JSON-safe shape. Object URLs are session-scoped so they are stripped. */
export function serialiseProject(project: VideoProject): SerialisedProject {
  return {
    version: STUDIO_PROJECT_VERSION,
    studio: "video",
    project: {
      ...project,
      sources: project.sources.map(({ url: _url, ...rest }) => rest),
    },
  };
}

/**
 * JSON-safe shape → project. Media URLs start empty; the caller re-links blobs
 * (IndexedDB / file paths) and registers them with the media cache.
 */
export function deserialiseProject(data: SerialisedProject): VideoProject {
  if (data.studio !== "video" || typeof data.version !== "number") {
    throw new Error("Not a Studio video project file");
  }
  if (data.version > STUDIO_PROJECT_VERSION) {
    throw new Error(`Project file version ${data.version} is newer than this build supports`);
  }
  const project: VideoProject = {
    ...data.project,
    markers: data.project.markers ?? [],
    sources: data.project.sources.map((s) => ({ ...s, url: "" })),
  };
  bumpIdCounterPast(project);
  return project;
}
