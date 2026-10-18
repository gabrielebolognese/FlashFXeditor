import { ChevronDown, FilePlus2, MonitorDown, PencilLine, Search, Star, Trash2, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent, type WheelEvent } from "react";
import { createPortal } from "react-dom";
import { fontCatalog, loadFontCatalog, type CatalogState } from "../../app/catalogController.js";
import { fontBrowserRequest, requestSystemFonts, setBrowserFamily, systemFaces, systemFonts, type SystemFonts } from "../../app/fontController.js";
import { appSettings, fontLibrary } from "../../app/services.js";
import { fontsVersion } from "../../app/textController.js";
import { addFontFiles, droppedFontFiles, dragHasFiles, pickFontFiles, rememberFont, removeUserFamily, renameUserFamily, setUserFamilyCategories, setUserFamilyTags, userFonts, type UserFontsState } from "../../app/userFontsController.js";
import type { TextStyle } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { toggleFavoriteFont, type AppSettings } from "../../project/appSettings.js";
import { CORE_FONTS } from "../../render/text/bundledFonts.js";
import { CATEGORY_IDS, CATEGORY_LABELS, nearestWeight, WEIGHT_BANDS, type CategoryId, type WeightBandId } from "../../text/fonts/catalog.js";
import { formatTags, parseTags, userFamilies } from "../../text/fonts/userFonts.js";
import { quoteFamily } from "../../text/fonts.js";
import { Button } from "../../ui/Button.js";
import { IconButton } from "../../ui/IconButton.js";
import { useDismiss } from "../../ui/useDismiss.js";
import { ACTION_ADD, ACTION_SYSTEM, browserItems, coreFilterable, resolveFamily, systemFamilies, type BrowserSources } from "./fontBrowserItems.js";
import { FontList, type FontRowItem } from "./FontList.js";
import styles from "./FontBrowser.module.css";
import { useFocusReturn } from "./focusReturn.js";
import fieldStyles from "./TextSection.module.css";
import { MIXED, NONE, type Shared } from "./useShared.js";

// The font field and its browser (spec §20.1, replacing the Batch 28 picker; spec §11 "Font field
// opens a searchable list with live previews and sections"):
// - The field shows the family in its own font, and a Missing chip inside it when the family is not
//   available (it draws with the DS body font; the timeline clip has a badge too).
// - The browser: a search over names, categories and tags (Enter picks the highlighted row, else the
//   first), category chips, weight chips, then the sections Recent, Favorites, My fonts, Library and
//   On this computer in a virtualized list (FontList: rows load their font files when they show, no
//   React render while scrolling or hovering). A star keeps a family in Favorites; My fonts rows have
//   an edit button (rename, categories, tags, remove).
// - Live preview: hovering a row or moving through rows with Up / Down shows the font on the edited
//   texts (ephemeral, `StyleTarget.preview`); a click or Enter commits one undo step (the family, and
//   the weight: the band's with a weight chip on, else the family's nearest to the text's); Escape (or
//   a click outside) restores and closes.
// - Font files dropped on the browser are added to My fonts.

/** What the font rows edit (StyleFields' target). */
export interface FontTarget {
  edit(label: string, patch: (style: TextStyle) => Partial<TextStyle>): void;
  preview(patch: ((style: TextStyle) => Partial<TextStyle>) | null): void;
}

const selectFavorites = (settings: AppSettings) => settings.favoriteFonts;
const selectRecent = (settings: AppSettings) => settings.recentFonts;
const selectSystem = (state: SystemFonts) => state;
const selectCatalog = (state: CatalogState) => state;
const selectUser = (state: UserFontsState) => state.fonts;
const selectRequest = (count: number) => count;

/** The CSS stack that draws `family`, the UI font behind it. */
export const familyStyle = (family: string): CSSProperties => ({ fontFamily: `${quoteFamily(family)}, var(--font-ui)` });

const MISSING = "This font is not available here: the text uses the fallback font";
const CORE = coreFilterable(CORE_FONTS);

/** The last `text.fontBrowser` request a field answered. */
let answered = 0;

export function FontField({ value, target }: { value: Shared<string>; target: FontTarget }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const family = value === MIXED || value === NONE ? null : value;
  // Re-read when fonts change (a catalog read, My fonts), rendered only when the answer changes.
  const missing = useStoreSelector(fontsVersion, () => family !== null && fontLibrary.source(family) === "missing");
  const close = useCallback(() => setAnchor(null), []);
  // `text.fontBrowser`: the field the properties panel shows opens its browser.
  const request = useStoreSelector(fontBrowserRequest, selectRequest);
  useEffect(() => {
    if (request > answered && button.current) {
      answered = request;
      setAnchor(button.current);
    }
  }, [request]);
  return (
    <div className={fieldStyles.fontRow}>
      <button
        ref={button}
        type="button"
        className={fieldStyles.fontButton}
        aria-label={missing ? "Font (missing: the text uses the fallback font)" : "Font"}
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        data-tooltip="Font"
        data-control=""
        onClick={(event) => setAnchor(anchor ? null : event.currentTarget)}
      >
        <span className={fieldStyles.fontName} style={family ? familyStyle(family) : undefined} data-mixed={family === null || undefined}>
          {family ?? "--"}
        </span>
        {missing && (
          <span className={fieldStyles.missing} data-tooltip={MISSING} aria-hidden="true">
            <TriangleAlert aria-hidden="true" />
            Missing
          </span>
        )}
        <ChevronDown className={fieldStyles.chevron} aria-hidden="true" />
      </button>
      {anchor && <FontBrowser anchor={anchor} current={family} target={target} onClose={close} />}
    </div>
  );
}

function FontBrowser({ anchor, current, target, onClose }: { anchor: HTMLElement; current: string | null; target: FontTarget; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const listHost = useRef<HTMLDivElement>(null);
  const icons = useRef<HTMLDivElement>(null);
  const list = useRef<FontList | null>(null);
  const dragDepth = useRef(0);
  const ids = useId();
  const [text, setText] = useState("");
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [band, setBand] = useState<WeightBandId | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const favorites = useStoreSelector(appSettings, selectFavorites);
  const recent = useStoreSelector(appSettings, selectRecent);
  const system = useStoreSelector(systemFonts, selectSystem);
  const catalog = useStoreSelector(fontCatalog, selectCatalog);
  const mine = useStoreSelector(userFonts, selectUser);

  // The catalog loads on the first open (spec §20.1: never at app start).
  useEffect(() => {
    void loadFontCatalog();
  }, []);

  const sources = useMemo(
    (): BrowserSources => ({
      recent,
      favorites,
      user: userFamilies(mine),
      catalog: catalog.catalog,
      catalogStatus: catalog.status,
      core: CORE,
      systemStatus: system.status,
      system: system.status === "ready" ? systemFamilies(system.families, (family) => systemFaces(family).map((face) => face.weight)) : [],
      current,
    }),
    [recent, favorites, mine, catalog, system, current],
  );
  const items = useMemo(() => browserItems(sources, { text, category, band }), [sources, text, category, band]);

  // The live preview and the family `fonts.toggleFavorite` stars: the hovered row, else the arrow keys' row.
  const pointed = useRef<{ hover: FontRowItem | null; keys: FontRowItem | null }>({ hover: null, keys: null });
  const latest = useRef({ sources, band, target });
  useLayoutEffect(() => {
    latest.current = { sources, band, target };
  });
  const patchFor = useCallback((item: FontRowItem) => {
    const { sources: from, band: chosen } = latest.current;
    const font = resolveFamily(from, item.family);
    return (style: TextStyle): Partial<TextStyle> => ({ fontFamily: item.family, fontWeight: chosen ? item.weight : nearestWeight(font, style.fontWeight) });
  }, []);
  const showPreview = useCallback(() => {
    const item = pointed.current.hover ?? pointed.current.keys;
    setBrowserFamily(item?.family ?? null);
    latest.current.target.preview(item ? patchFor(item) : null);
  }, [patchFor]);
  const pick = useCallback(
    (item: FontRowItem) => {
      latest.current.target.edit("Change font", patchFor(item));
      rememberFont(item.family);
      onClose();
    },
    [onClose, patchFor],
  );

  // The list (framework-free): created once, its callbacks reading the latest state through refs.
  const handlers = useRef({ pick, showPreview });
  useLayoutEffect(() => {
    handlers.current = { pick, showPreview };
  });
  useLayoutEffect(() => {
    const host = listHost.current;
    const templates = icons.current;
    if (!host || !templates) return;
    const instance = new FontList(host, {
      classes: styles,
      icons: templates,
      previewReady: (family, weight) => fontLibrary.previewReady(family, weight),
      preview: (family, weight) => fontLibrary.preview(family, weight),
      onHover: (item) => {
        pointed.current.hover = item;
        handlers.current.showPreview();
      },
      onPick: (item) => handlers.current.pick(item),
      onStar: (item) => void appSettings.update({ favoriteFonts: toggleFavoriteFont(appSettings.getState().favoriteFonts, item.family) }),
      onEdit: (item) => setEditing(item.family),
      onAction: (action) => {
        if (action === ACTION_SYSTEM) void requestSystemFonts();
        else if (action === ACTION_ADD) void pickFontFiles();
      },
      optionId: (index) => `${ids}-option-${index}`,
    });
    list.current = instance;
    return () => {
      instance.destroy();
      list.current = null;
    };
  }, [ids]);
  // The arrow keys' row, while it is still listed (a search can drop it).
  const activeIndex = active === null ? -1 : items.findIndex((item) => item.key === active);
  const activeKey = activeIndex >= 0 ? active : null;
  useLayoutEffect(() => {
    list.current?.setItems(items);
  }, [items]);
  useLayoutEffect(() => {
    list.current?.setActive(activeKey);
  }, [activeKey, items]);

  // Placed under the field (fixed, kept in the window), like the color picker; the search field takes the focus.
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

  // Closed (a pick, Escape, a click outside): the live preview ends.
  useEffect(
    () => () => {
      setBrowserFamily(null);
      latest.current.target.preview(null);
    },
    [],
  );
  useDismiss([panel, { current: anchor }], onClose);
  // Closed with the focus inside (a pick, Escape), it goes back to the font field, not to the page.
  useFocusReturn(panel, () => anchor);

  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    const instance = list.current;
    if (!instance) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = instance.step(event.key === "ArrowDown" ? 1 : -1);
      if (!next) return;
      pointed.current.keys = next;
      // The keys move the preview even under a resting pointer.
      pointed.current.hover = null;
      setActive(next.key);
      showPreview();
    } else if (event.key === "Enter") {
      event.preventDefault();
      const chosen = (activeKey !== null ? (items[activeIndex] as FontRowItem | undefined) : undefined) ?? items.find((item): item is FontRowItem => item.kind === "font");
      if (chosen) pick(chosen);
    }
  };
  const listId = `${ids}-fonts`;

  // Font files dropped on the browser join My fonts (spec §20.1); the highlight is a data attribute (no render).
  const setDropping = (on: boolean) => {
    const element = panel.current;
    if (!element) return;
    if (on) element.dataset.dropping = "";
    else delete element.dataset.dropping;
  };
  const onDragEnter = (event: DragEvent) => {
    if (!dragHasFiles(event.dataTransfer)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDropping(true);
  };
  const onDragOver = (event: DragEvent) => {
    if (!dragHasFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };
  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDropping(false);
  };
  const onDrop = (event: DragEvent) => {
    if (!dragHasFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = 0;
    setDropping(false);
    const files = droppedFontFiles(event.dataTransfer);
    void addFontFiles(files.length > 0 ? files : [...event.dataTransfer.files]);
  };
  // The category chips scroll sideways with the wheel.
  const onChipsWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (event.deltaY !== 0) event.currentTarget.scrollLeft += event.deltaY;
  };

  return createPortal(
    <div ref={panel} className={styles.browser} role="dialog" aria-label="Fonts" data-control="" onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <div className={styles.top}>
        <label className={styles.search}>
          <Search aria-hidden="true" />
          <input
            type="text"
            role="combobox"
            value={text}
            placeholder="Search fonts, looks, tags"
            aria-label="Search fonts"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? `${ids}-option-${activeIndex}` : undefined}
            spellCheck={false}
            onChange={(event) => {
              setText(event.target.value);
              setActive(null);
              pointed.current.keys = null;
            }}
            onKeyDown={onSearchKey}
          />
        </label>
        <IconButton commandId="fonts.add" icon={FilePlus2} size="default" />
      </div>
      <div className={styles.chips} role="toolbar" aria-label="Font looks" onWheel={onChipsWheel}>
        <IconButton control text="All" label="All looks" pressed={category === null} onClick={() => setCategory(null)} />
        {CATEGORY_IDS.map((id) => (
          <IconButton key={id} control text={CATEGORY_LABELS[id]} label={CATEGORY_LABELS[id]} pressed={category === id} onClick={() => setCategory(category === id ? null : id)} />
        ))}
      </div>
      <div className={`${styles.chips} ${styles.weights}`} role="toolbar" aria-label="Font weights">
        <IconButton control text="All" label="All weights" pressed={band === null} onClick={() => setBand(null)} />
        {WEIGHT_BANDS.map((weight) => (
          <IconButton
            key={weight.id}
            control
            text={weight.label}
            label={`${weight.label} (${weight.min === weight.max ? weight.min : `${weight.min}-${weight.max}`})`}
            pressed={band === weight.id}
            onClick={() => setBand(band === weight.id ? null : weight.id)}
          />
        ))}
      </div>
      <div ref={listHost} id={listId} className={styles.list} role="listbox" aria-label="Font families" hidden={editing !== null} />
      {editing !== null && <MyFontEditor key={editing} family={editing} onRename={setEditing} onDone={() => setEditing(null)} />}
      <div ref={icons} className={styles.icons} aria-hidden="true">
        <Star data-icon="star" />
        <PencilLine data-icon="edit" />
        <MonitorDown data-icon={ACTION_SYSTEM} />
        <FilePlus2 data-icon={ACTION_ADD} />
      </div>
    </div>,
    document.body,
  );
}

/** My fonts: a family's name, categories and tags, and Remove (spec §20.1). */
function MyFontEditor({ family, onRename, onDone }: { family: string; onRename: (name: string) => void; onDone: () => void }) {
  const fonts = useStoreSelector(userFonts, selectUser);
  const group = useMemo(() => userFamilies(fonts).find((entry) => entry.family.toLowerCase() === family.toLowerCase()) ?? null, [fonts, family]);
  const [name, setName] = useState(family);
  const [taken, setTaken] = useState(false);
  const [tags, setTags] = useState(group ? formatTags(group.tags) : "");
  const ids = useId();
  if (!group) return null;
  const rename = () => {
    if (name.trim() === "" || name === family) {
      setName(family);
      return;
    }
    if (renameUserFamily(family, name)) onRename(name.trim().replace(/\s+/g, " "));
    else setTaken(true);
  };
  const toggle = (id: CategoryId) => setUserFamilyCategories(family, group.categories.includes(id) ? group.categories.filter((c) => c !== id) : [...group.categories, id]);
  const fromFile = group.faces.some((face) => face.from === "file");
  return (
    <div className={styles.editor} role="group" aria-label={`Edit ${family}`}>
      <div className={styles.editorTitle} style={familyStyle(family)}>
        {family}
      </div>
      <div className={styles.editorNote}>
        {group.faces.map((face) => face.style).join(", ")} · {group.faces.map((face) => face.fileName).join(", ")}
        {fromFile ? " · named from the file name" : ""}
      </div>
      <label className={styles.field} htmlFor={`${ids}-name`}>
        Name
        <input
          id={`${ids}-name`}
          value={name}
          aria-invalid={taken || undefined}
          spellCheck={false}
          onChange={(event) => {
            setName(event.target.value);
            setTaken(false);
          }}
          onBlur={rename}
          onKeyDown={(event) => {
            if (event.key === "Enter") rename();
          }}
        />
        {taken && <span className={styles.error}>Another font of My fonts has this name</span>}
      </label>
      <div className={styles.field}>
        Looks
        <div className={styles.categories} role="group" aria-label="Looks">
          {CATEGORY_IDS.map((id) => (
            <IconButton key={id} control text={CATEGORY_LABELS[id]} label={CATEGORY_LABELS[id]} pressed={group.categories.includes(id)} onClick={() => toggle(id)} />
          ))}
        </div>
      </div>
      <label className={styles.field} htmlFor={`${ids}-tags`}>
        Tags (comma-separated)
        <input
          id={`${ids}-tags`}
          value={tags}
          spellCheck={false}
          onChange={(event) => setTags(event.target.value)}
          onBlur={() => setUserFamilyTags(family, parseTags(tags))}
          onKeyDown={(event) => {
            if (event.key === "Enter") setUserFamilyTags(family, parseTags(tags));
          }}
        />
      </label>
      <div className={styles.editorActions}>
        <Button
          control
          size="compact"
          icon={Trash2}
          tooltip="Remove from My fonts (projects that use it keep their copy)"
          onClick={() => {
            void removeUserFamily(family);
            onDone();
          }}
        >
          Remove
        </Button>
        <Button control size="compact" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
