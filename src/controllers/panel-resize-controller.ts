/**
 * ReactiveController that provides drag-to-resize behavior for a playlist panel.
 * Used by both playlist-editor and playlist-play to avoid duplicated resize logic.
 */

import type { ReactiveController, ReactiveControllerHost } from "lit";
import { callerBuddy } from "../caller-buddy.js";
import { scalePointerDeltaForHtmlZoom } from "../utils/html-zoom-pointer.js";

const MIN_PLAYLIST_SIZE = 180;
const MAX_PLAYLIST_SIZE = 500;

export type PanelResizeAxis = "x" | "y";

export interface PanelResizeOptions {
  axis?: PanelResizeAxis;
  /** Min size in px. */
  min?: number;
  /** Max size in px. */
  max?: number;
  /** Which Settings key to persist to. Defaults to playlistPanelWidth. */
  settingKey?: "playlistPanelWidth" | "playlistPanelHeight";
}

export class PanelResizeController implements ReactiveController {
  host: ReactiveControllerHost;

  size: number;
  private axis: PanelResizeAxis;
  private min: number;
  private max: number;
  private settingKey: "playlistPanelWidth" | "playlistPanelHeight";

  private startX = 0;
  private startY = 0;
  private startWidth = 0;
  private boundMousemove = (e: MouseEvent) => this.onMouseMove(e);
  private boundMouseup = () => this.onMouseUp();
  private activePointerId: number | null = null;
  private boundPointerMove = (e: PointerEvent) => this.onPointerMove(e);
  private boundPointerUp = (e: PointerEvent) => this.onPointerUp(e);
  private boundPointerCancel = (e: PointerEvent) => this.onPointerCancel(e);

  constructor(host: ReactiveControllerHost, initialSize: number, opts?: PanelResizeOptions) {
    this.host = host;
    this.size = initialSize;
    this.axis = opts?.axis ?? "x";
    this.min = opts?.min ?? MIN_PLAYLIST_SIZE;
    this.max = opts?.max ?? MAX_PLAYLIST_SIZE;
    this.settingKey = opts?.settingKey ?? "playlistPanelWidth";
    host.addController(this);
  }

  hostConnected() {}

  hostDisconnected() {
    this.stop();
  }

  onMouseDown(e: MouseEvent): void {
    e.preventDefault();
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.startWidth = this.size;
    document.addEventListener("mousemove", this.boundMousemove);
    document.addEventListener("mouseup", this.boundMouseup);
    document.body.style.cursor = this.axis === "x" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
  }

  private onMouseMove(e: MouseEvent): void {
    const raw =
      this.axis === "x" ? e.clientX - this.startX : e.clientY - this.startY;
    const delta = scalePointerDeltaForHtmlZoom(raw);
    this.size = Math.round(Math.max(this.min, Math.min(this.max, this.startWidth + delta)));
    this.host.requestUpdate();
  }

  private onMouseUp(): void {
    this.stop();
    void callerBuddy.updateSetting(this.settingKey, this.size);
  }

  onPointerDown(e: PointerEvent): void {
    // Pointer events are required for touch devices (Android/iOS).
    // We listen on document so we keep receiving moves even if capture fails.
    e.preventDefault();
    this.activePointerId = e.pointerId;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.startWidth = this.size;
    document.addEventListener("pointermove", this.boundPointerMove, { passive: false });
    document.addEventListener("pointerup", this.boundPointerUp, { passive: false });
    document.addEventListener("pointercancel", this.boundPointerCancel, { passive: false });
    document.body.style.cursor = this.axis === "x" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.activePointerId === null || e.pointerId !== this.activePointerId) return;
    e.preventDefault();
    const raw =
      this.axis === "x" ? e.clientX - this.startX : e.clientY - this.startY;
    const delta = scalePointerDeltaForHtmlZoom(raw);
    this.size = Math.round(Math.max(this.min, Math.min(this.max, this.startWidth + delta)));
    this.host.requestUpdate();
  }

  private onPointerUp(e: PointerEvent): void {
    if (this.activePointerId === null || e.pointerId !== this.activePointerId) return;
    e.preventDefault();
    this.activePointerId = null;
    this.stop();
    void callerBuddy.updateSetting(this.settingKey, this.size);
  }

  private onPointerCancel(e: PointerEvent): void {
    if (this.activePointerId === null || e.pointerId !== this.activePointerId) return;
    e.preventDefault();
    this.activePointerId = null;
    this.stop();
  }

  stop(): void {
    document.removeEventListener("mousemove", this.boundMousemove);
    document.removeEventListener("mouseup", this.boundMouseup);
    document.removeEventListener("pointermove", this.boundPointerMove);
    document.removeEventListener("pointerup", this.boundPointerUp);
    document.removeEventListener("pointercancel", this.boundPointerCancel);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }

  /** Back-compat: older call sites use `.width` for the horizontal size. */
  get width(): number {
    return this.size;
  }
  set width(v: number) {
    this.size = v;
  }
}
