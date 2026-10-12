import type { BBox, ControlPreview } from "../lib/types";

/** The box to frame: the recorded box, or a guess around the tap point older runs kept. */
function focusOf(p: ControlPreview): BBox | null {
  if (p.box) return p.box;
  if (p.point) return { x: p.point.x - 110, y: p.point.y - 26, width: 220, height: 52 };
  return null;
}

/**
 * Shows part of a run or scan screenshot. "zoom" frames the control with some context around it;
 * "whole" shows the full screen small with the control marked, so you can tell where it lives.
 */
export function ShotCrop(props: { preview: ControlPreview; width: number; height?: number; mode: "zoom" | "whole"; className?: string }) {
  const p = props.preview;
  const f = focusOf(p);
  const W = props.width;

  if (props.mode === "whole" || !f) {
    const scale = W / p.width;
    const H = Math.round(p.height * scale);
    return (
      <div className={`relative overflow-hidden bg-soft ${props.className ?? ""}`} style={{ width: W, height: H }}>
        <img src={p.src} alt="" draggable={false} className="absolute left-0 top-0 max-w-none select-none" style={{ width: p.width * scale, height: p.height * scale }} />
        {f ? (
          <span
            className="absolute rounded-[3px] bg-brand/25 ring-2 ring-brand"
            style={{
              left: f.x * scale - 2,
              top: f.y * scale - 2,
              width: Math.max(6, f.width * scale + 4),
              height: Math.max(6, f.height * scale + 4),
            }}
          />
        ) : null}
      </div>
    );
  }

  const H = props.height ?? Math.round(W / 2);
  // generous context around small icons, a thin margin around wide fields
  const padX = Math.min(120, Math.max(36, f.width * 0.25));
  const padY = Math.min(60, Math.max(20, f.height * 0.9));
  const fill = Math.max(W / p.width, H / p.height);
  const scale = Math.max(fill, Math.min(p.box ? 2.5 : 1.6, W / (f.width + padX * 2), H / (f.height + padY * 2)));
  const cx = f.x + f.width / 2;
  const cy = f.y + f.height / 2;
  const left = Math.min(0, Math.max(W - p.width * scale, W / 2 - cx * scale));
  const top = Math.min(0, Math.max(H - p.height * scale, H / 2 - cy * scale));

  return (
    <div className={`relative overflow-hidden bg-soft ${props.className ?? ""}`} style={{ width: W, height: H }}>
      <img
        src={p.src}
        alt=""
        draggable={false}
        className="absolute max-w-none select-none"
        style={{ left, top, width: p.width * scale, height: p.height * scale }}
      />
      {p.from === "scan" ? (
        // run screenshots already have the box drawn in; scan screenshots are clean
        <span
          className="absolute rounded-[4px] ring-2 ring-brand"
          style={{ left: left + f.x * scale - 3, top: top + f.y * scale - 3, width: f.width * scale + 6, height: f.height * scale + 6 }}
        />
      ) : null}
    </div>
  );
}
