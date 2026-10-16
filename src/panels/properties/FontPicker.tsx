import { ChevronDown, MonitorDown, Search, Star, TriangleAlert } from "lucide-react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { fontsVersion } from "../../app/textController.js";
import { requestSystemFonts, systemFonts, type SystemFonts } from "../../app/fontController.js";
import { appSettings, documentStore, fontLibrary } from "../../app/services.js";
import type { Project } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { toggleFavoriteFont, type AppSettings } from "../../project/appSettings.js";
import { BUNDLED_FONTS, bundledFont } from "../../render/text/bundledFonts.js";
import { projectTextStyles, quoteFamily, usedFamilies } from "../../text/fonts.js";
import { useDismiss } from "../../ui/useDismiss.js";
import styles from "./TextSection.module.css";
import { MIXED, NONE, type Shared } from "./useShared.js";

// The font field and its picker (spec §11 "Font field opens a searchable list with live previews and
// sections: Favorites, Bundled, System, Used in project"; §10.1 "the picker shows a preview rendered
// with the real font"):
// - The field shows the family in its own font, and a Missing chip when the family is not available
//   (it draws with the DS body font; the timeline clip has a badge too).
// - The picker: a search field (Enter picks the first match), then the sections. Each family is drawn
//   in its own font, set when its row scrolls into view (lazy previews: a long system list loads only
//   what is seen, and scrolling renders nothing in React). A star keeps a family in Favorites (app
//   settings). System fonts are listed on request (the Local Font Access permission asks once).
// TODO(batch 40): arrow-key navigation in the list (the shared menus' keyboard TODO).

const selectUsed = (project: Project) => usedFamilies(projectTextStyles(project).map((style) => ({ kind: "text", style }))).join("\n");
const selectFavorites = (settings: AppSettings) => settings.favoriteFonts;
const selectSystem = (state: SystemFonts) => state;
const selectVersion = (version: number) => version;

/** The CSS stack that draws `family`, the UI font behind it. */
export const familyStyle = (family: string): CSSProperties => ({ fontFamily: `${quoteFamily(family)}, var(--font-ui)` });

export function FontField({ value, onPick }: { value: Shared<string>; onPick: (family: string) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  useStoreSelector(fontsVersion, selectVersion);
  const family = value === MIXED || value === NONE ? null : value;
  const missing = family !== null && fontLibrary.source(family) === "missing";
  const close = useCallback(() => setAnchor(null), []);
  return (
    <div className={styles.fontRow}>
      <button
        type="button"
        className={styles.fontButton}
        aria-label="Font"
        aria-haspopup="listbox"
        aria-expanded={anchor !== null}
        data-tooltip="Font"
        onClick={(event) => setAnchor(anchor ? null : event.currentTarget)}
      >
        <span className={styles.fontName} style={family ? familyStyle(family) : undefined} data-mixed={family === null || undefined}>
          {family ?? "--"}
        </span>
        <ChevronDown className={styles.chevron} aria-hidden="true" />
      </button>
      {missing && (
        <span className={styles.missing} data-tooltip="This font is not installed here: the text uses the fallback font">
          <TriangleAlert aria-hidden="true" />
          Missing
        </span>
      )}
      {anchor && <FontPicker anchor={anchor} current={family} onPick={onPick} onClose={close} />}
    </div>
  );
}

type Entry = { kind: "heading"; label: string } | { kind: "font"; family: string; key: string } | { kind: "note"; label: string } | { kind: "system" };

const matches = (family: string, query: string) => query === "" || family.toLowerCase().includes(query);

function FontPicker({ anchor, current, onPick, onClose }: { anchor: HTMLElement; current: string | null; onPick: (family: string) => void; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const used = useStoreSelector(documentStore, selectUsed);
  const favorites = useStoreSelector(appSettings, selectFavorites);
  const system = useStoreSelector(systemFonts, selectSystem);

  const entries = useMemo((): Entry[] => {
    const q = query.trim().toLowerCase();
    const out: Entry[] = [];
    const section = (label: string, families: readonly string[], id: string) => {
      const shown = families.filter((family) => matches(family, q));
      if (shown.length === 0) return;
      out.push({ kind: "heading", label });
      for (const family of shown) out.push({ kind: "font", family, key: `${id}:${family}` });
    };
    section("Favorites", favorites, "fav");
    section("Used in project", used === "" ? [] : used.split("\n"), "used");
    section(
      "Bundled",
      BUNDLED_FONTS.map((font) => font.family),
      "bundled",
    );
    const installed = system.families.filter((family) => !bundledFont(family) && matches(family, q));
    out.push({ kind: "heading", label: "System" });
    if (system.status === "ready") {
      for (const family of installed) out.push({ kind: "font", family, key: `system:${family}` });
      if (installed.length === 0) out.push({ kind: "note", label: q === "" ? "No system fonts" : "No match" });
    } else if (system.status === "loading") out.push({ kind: "note", label: "Listing the system fonts…" });
    else if (system.status === "unsupported") out.push({ kind: "note", label: "This browser cannot list system fonts" });
    else {
      if (system.status === "denied") out.push({ kind: "note", label: "Font access was not allowed" });
      out.push({ kind: "system" });
    }
    return out;
  }, [query, used, favorites, system]);

  // Placed under the field (fixed, kept in the window), like the color picker.
  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    const rect = anchor.getBoundingClientRect();
    const gap = Number.parseFloat(getComputedStyle(element).getPropertyValue("--space-1")) || 0;
    const left = Math.max(gap, Math.min(rect.left, window.innerWidth - element.offsetWidth - gap));
    const below = rect.bottom + gap + element.offsetHeight <= window.innerHeight;
    element.style.left = `${left}px`;
    element.style.top = `${below ? rect.bottom + gap : Math.max(gap, rect.top - gap - element.offsetHeight)}px`;
    element.style.visibility = "visible";
    element.querySelector<HTMLInputElement>("input")?.focus();
  }, [anchor]);

  // Lazy previews: a row gets its family's font when it scrolls into view (DOM writes, no render).
  useLayoutEffect(() => {
    const root = list.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (seen) => {
        for (const item of seen) {
          if (!item.isIntersecting) continue;
          const target = item.target as HTMLElement;
          const family = target.dataset.family;
          if (family) Object.assign(target.style, familyStyle(family));
          observer.unobserve(target);
        }
      },
      { root },
    );
    for (const element of root.querySelectorAll<HTMLElement>("[data-family]")) observer.observe(element);
    return () => observer.disconnect();
  }, [entries]);

  useDismiss([panel, { current: anchor }], onClose);

  const pick = (family: string) => {
    onPick(family);
    onClose();
  };
  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    const first = entries.find((entry) => entry.kind === "font");
    if (first?.kind === "font") pick(first.family);
  };
  const star = (event: MouseEvent, family: string) => {
    event.stopPropagation();
    void appSettings.update({ favoriteFonts: toggleFavoriteFont(appSettings.getState().favoriteFonts, family) });
  };

  return createPortal(
    <div ref={panel} className={styles.picker} role="dialog" aria-label="Fonts">
      <label className={styles.search}>
        <Search aria-hidden="true" />
        <input type="text" value={query} placeholder="Search fonts" aria-label="Search fonts" spellCheck={false} onChange={(event) => setQuery(event.target.value)} onKeyDown={onSearchKey} />
      </label>
      <div ref={list} className={styles.list} role="listbox" aria-label="Font families">
        {entries.map((entry, i) => {
          switch (entry.kind) {
            case "heading":
              return (
                <div key={`h:${entry.label}`} className={styles.heading} role="presentation">
                  {entry.label}
                </div>
              );
            case "note":
              return (
                <div key={`n:${i}`} className={styles.note}>
                  {entry.label}
                </div>
              );
            case "system":
              return (
                <button key="system" type="button" className={styles.action} onClick={() => void requestSystemFonts()}>
                  <MonitorDown aria-hidden="true" />
                  Show system fonts
                </button>
              );
            case "font": {
              const favorite = favorites.includes(entry.family);
              return (
                <div key={entry.key} className={styles.row} role="option" aria-selected={entry.family === current} tabIndex={-1} onClick={() => pick(entry.family)}>
                  <span className={styles.family} data-family={entry.family}>
                    {entry.family}
                  </span>
                  <button type="button" className={styles.star} aria-label={favorite ? `Remove ${entry.family} from favorites` : `Add ${entry.family} to favorites`} aria-pressed={favorite} onClick={(event) => star(event, entry.family)}>
                    <Star aria-hidden="true" />
                  </button>
                </div>
              );
            }
          }
        })}
      </div>
    </div>,
    document.body,
  );
}
