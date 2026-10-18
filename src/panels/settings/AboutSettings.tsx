import { Command, FileText, Keyboard } from "lucide-react";
import { closeSettings } from "../../app/commandController.js";
import { activeBackend } from "../../app/previewController.js";
import { actions, appVersion } from "../../app/services.js";
import type { RendererBackend } from "../../render/gpu/backend.js";
import { Button } from "../../ui/Button.js";
import { Row } from "../properties/Section.js";
import styles from "./AboutSettings.module.css";
import { Group } from "./GeneralSettings.js";
import pageStyles from "./GeneralSettings.module.css";

// Settings > About (Batch 50, the release's in-app help; `app.about` in the palette): the version every
// saved project.json records as `appVersion`, the renderer the startup check chose, the way to the
// cheat sheet and the command palette, and the licenses of the bundled packages and fonts
// (licenses.txt, written by the production build: scripts/licenses.ts).

const RENDERERS: Record<RendererBackend, string> = { webgpu: "WebGPU", webgl2: "WebGL2" };

/** The cheat sheet and the palette are dialogs of their own: the settings close first. */
const openAfterSettings = (id: string) => () => {
  closeSettings();
  actions.run(id);
};

const openLicenses = () => window.open(new URL("licenses.txt", document.baseURI).href, "_blank", "noopener");

export function AboutSettings() {
  const backend = activeBackend();
  return (
    <div className={pageStyles.page}>
      <Group title="Shorts Editor" note="A video editor for short vertical videos. Projects are folders on your disk, and your media never leaves your computer.">
        <Row label="Version">
          <span className={styles.value}>{appVersion}</span>
        </Row>
        <Row label="Renderer">
          <span className={styles.value}>{backend ? RENDERERS[backend] : "Not started"}</span>
        </Row>
      </Group>
      <Group title="Help" note="Every command can be found by name in the command palette, with its shortcut.">
        <Row label="Shortcuts">
          <span className={styles.actions}>
            <Button size="compact" icon={Keyboard} commandId="app.shortcuts" onClick={openAfterSettings("app.shortcuts")}>
              Keyboard shortcuts
            </Button>
          </span>
        </Row>
        <Row label="Commands">
          <span className={styles.actions}>
            <Button size="compact" icon={Command} commandId="app.commandPalette" onClick={openAfterSettings("app.commandPalette")}>
              Command palette
            </Button>
          </span>
        </Row>
      </Group>
      <Group title="Licenses" note="The open-source packages and the fonts that come with the editor, with their license texts.">
        <Row label="Third party">
          <span className={styles.actions}>
            <Button control size="compact" icon={FileText} tooltip="Open the license list in a new tab" onClick={openLicenses}>
              View licenses
            </Button>
          </span>
        </Row>
      </Group>
    </div>
  );
}
