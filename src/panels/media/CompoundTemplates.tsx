import { Trash2 } from "lucide-react";
import { useMemo, useState, type KeyboardEvent } from "react";
import { insertCompoundTemplate, removeCompoundTemplate } from "../../app/compoundTemplateController.js";
import { compoundTemplateStore } from "../../app/services.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { filterCompoundTemplates } from "../../project/compoundTemplates.js";
import { IconButton } from "../../ui/IconButton.js";
import { TextField } from "../../ui/TextField.js";
import styles from "./PresetsTab.module.css";

// The Templates section of the Presets tab (spec §21.24, Batch 80): the compound templates saved from any project
// (global store, mirrored in the library folder). A card inserts its template at the playhead on a double-click,
// Enter or its Insert button (one undo step; its media and fonts are copied into the project). Dragging a card
// onto the timeline is not supported (the media copy is asynchronous): TODO(batch 81+).

export function CompoundTemplates() {
  const templates = useStoreSelector(compoundTemplateStore.list, (list) => list);
  const [query, setQuery] = useState("");
  const shown = useMemo(() => filterCompoundTemplates(templates, query), [templates, query]);
  if (templates.length === 0) return null;
  const onKeyDown = (event: KeyboardEvent<HTMLElement>, id: string) => {
    if (event.target !== event.currentTarget || event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    event.stopPropagation();
    void insertCompoundTemplate(id);
  };
  return (
    <section className={styles.templates} aria-label="Templates">
      <div className={styles.templatesHead}>
        <span className={styles.templatesTitle}>Templates</span>
        <div className={styles.search}>
          <TextField value={query} onChange={setQuery} ariaLabel="Search templates" placeholder="Search templates" />
        </div>
      </div>
      <div className={styles.grid}>
        {shown.map((template) => (
          <div
            key={template.id}
            className={styles.card}
            role="button"
            tabIndex={0}
            aria-label={`Insert template ${template.name}`}
            data-tooltip={`${template.name} (${template.category}, ${template.params} fields). Double-click or Enter: insert at the playhead.`}
            onDoubleClick={() => void insertCompoundTemplate(template.id)}
            onKeyDown={(event) => onKeyDown(event, template.id)}
          >
            <div className={styles.thumb}>{template.thumbnail && <img className={styles.templateImage} src={template.thumbnail} alt="" draggable={false} />}</div>
            <div className={styles.info}>
              <span className={styles.name}>{template.name}</span>
              <IconButton control icon={Trash2} label={`Delete template ${template.name}`} onClick={() => void removeCompoundTemplate(template.id)} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
