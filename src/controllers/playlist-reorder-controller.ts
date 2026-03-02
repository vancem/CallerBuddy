/**
 * ReactiveController that provides drag-and-drop reorder behavior for a playlist list.
 * Used by both playlist-editor and playlist-play to avoid duplicated DnD logic.
 *
 * Handles: reorder within playlist (move). Optionally supports external drop
 * (e.g. drag from song table) via config callbacks.
 */

import type { ReactiveController, ReactiveControllerHost } from "lit";
import { callerBuddy } from "../caller-buddy.js";
import type { Song } from "../models/song.js";

export interface PlaylistReorderControllerConfig {
  /** Called when a song is dropped from an external source (e.g. song table). */
  onExternalDrop?: (dropIndex: number) => void;
  /** Returns the song being dragged from an external source, if any. */
  getExternalDragData?: () => Song | null;
  /** Called when a reorder completes (e.g. to reset selection state). */
  onReorderComplete?: () => void;
}

export class PlaylistReorderController implements ReactiveController {
  host: ReactiveControllerHost;

  /** Index of the playlist item the drag is currently hovering over (-1 = none). */
  dragOverIndex = -1;
  /** Whether the drop indicator should appear above or below the hovered item. */
  dropPosition: "above" | "below" = "above";
  /** The playlist index of the item currently being dragged (for reorder). */
  draggingPlaylistIndex = -1;

  private config: PlaylistReorderControllerConfig;

  constructor(host: ReactiveControllerHost, config: PlaylistReorderControllerConfig = {}) {
    this.host = host;
    this.config = config;
    host.addController(this);
  }

  hostConnected() {}

  hostDisconnected() {}

  private requestUpdate() {
    this.host.requestUpdate();
  }

  private reset() {
    this.dragOverIndex = -1;
    this.draggingPlaylistIndex = -1;
    this.requestUpdate();
  }

  onPlaylistItemDragStart(e: DragEvent, index: number) {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData("application/x-callerbuddy-playlist-item", String(index));
    e.dataTransfer.effectAllowed = "move";
    this.draggingPlaylistIndex = index;
    this.requestUpdate();
  }

  onDragEnd = () => {
    this.reset();
  };

  onPlaylistDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = this.draggingPlaylistIndex >= 0 ? "move" : "copy";
    }
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    this.dropPosition = e.clientY < midY ? "above" : "below";
    this.dragOverIndex = index;
    this.requestUpdate();
  }

  onDragEnter = (e: DragEvent) => {
    e.preventDefault();
  };

  onPlaylistContainerDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = this.draggingPlaylistIndex >= 0 ? "move" : "copy";
    }
  };

  onPlaylistDrop = (e: DragEvent) => {
    e.preventDefault();

    const dropIndex =
      this.dropPosition === "below" ? this.dragOverIndex + 1 : this.dragOverIndex;

    if (this.draggingPlaylistIndex >= 0) {
      const fromIndex = this.draggingPlaylistIndex;
      const adjustedTo = dropIndex > fromIndex ? dropIndex - 1 : dropIndex;
      if (fromIndex !== adjustedTo) {
        callerBuddy.state.moveInPlaylist(fromIndex, adjustedTo);
        this.config.onReorderComplete?.();
      }
    } else if (
      this.config.onExternalDrop &&
      this.config.getExternalDragData?.()
    ) {
      this.config.onExternalDrop(dropIndex);
    }

    this.reset();
  };

  onPlaylistDragLeave = (e: DragEvent) => {
    const related = e.relatedTarget as Node | null;
    const container = e.currentTarget as HTMLElement;
    if (related && container.contains(related)) return;
    this.dragOverIndex = -1;
    this.requestUpdate();
  };
}
