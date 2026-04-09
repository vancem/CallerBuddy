/**
 * ReactiveController that provides drag-to-resize behavior for a playlist panel.
 * Used by both playlist-editor and playlist-play to avoid duplicated resize logic.
 */

import type { ReactiveController, ReactiveControllerHost } from "lit";
import { callerBuddy } from "../caller-buddy.js";

const MIN_PLAYLIST_WIDTH = 180;
const MAX_PLAYLIST_WIDTH = 500;

export class PanelResizeController implements ReactiveController {
  host: ReactiveControllerHost;

  width: number;

  private startX = 0;
  private startWidth = 0;
  private boundMousemove = (e: MouseEvent) => this.onMouseMove(e);
  private boundMouseup = () => this.onMouseUp();

  constructor(host: ReactiveControllerHost, initialWidth: number) {
    this.host = host;
    this.width = initialWidth;
    host.addController(this);
  }

  hostConnected() {}

  hostDisconnected() {
    this.stop();
  }

  onMouseDown(e: MouseEvent): void {
    e.preventDefault();
    this.startX = e.clientX;
    this.startWidth = this.width;
    document.addEventListener("mousemove", this.boundMousemove);
    document.addEventListener("mouseup", this.boundMouseup);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  private onMouseMove(e: MouseEvent): void {
    const delta = e.clientX - this.startX;
    this.width = Math.round(
      Math.max(MIN_PLAYLIST_WIDTH, Math.min(MAX_PLAYLIST_WIDTH, this.startWidth + delta)),
    );
    this.host.requestUpdate();
  }

  private onMouseUp(): void {
    this.stop();
    void callerBuddy.updateSetting("playlistPanelWidth", this.width);
  }

  stop(): void {
    document.removeEventListener("mousemove", this.boundMousemove);
    document.removeEventListener("mouseup", this.boundMouseup);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }
}
