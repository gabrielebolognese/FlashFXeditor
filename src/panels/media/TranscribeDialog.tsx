import { Captions, Check, Download, Mic, Trash2 } from "lucide-react";
import { useState } from "react";
import { documentStore, appSettings, sessionStore } from "../../app/services.js";
import { applyTranscript, closeTranscribeDialog, discardTranscript, removeModel, startTranscription } from "../../app/transcribeController.js";
import { transcribeDialog, transcribeRange, transcription, type TranscribeDialogState, type TranscribeRangeChoice, type TranscriptReview, type TranscriptionState } from "../../app/transcription.js";
import { formatTimecode } from "../../core/document/time.js";
import type { Project } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { LANGUAGE_OPTIONS, languageName } from "../../media/transcribe/languages.js";
import { WHISPER_MODELS, whisperModel, type TranscribeDevice, type WhisperModelId } from "../../media/transcribe/models.js";
import { cuesInRange } from "../../timeline/edit/captions.js";
import { Button } from "../../ui/Button.js";
import { IconButton } from "../../ui/IconButton.js";
import { Modal } from "../../ui/Modal.js";
import { Select } from "../../ui/Select.js";
import styles from "./TranscribeDialog.module.css";

// The Transcribe dialog and the review of its result (spec §10.6), shown by DialogHost.
// - Transcribe: the model (tiny / base / small, each with its download size or "Downloaded", the
//   selected one removable from the browser's cache), the language (detected, or one of Whisper's),
//   the range (in to out when set, or the whole timeline), what runs where. Its choices are kept in
//   the app settings. Enter starts (the primary button has the focus).
// - Review: the cues the transcription made, with their times, before they go in; a note when they
//   replace cues of the range. Add (or Replace) puts them on the caption track in one undo step;
//   Discard (Esc) drops them.

const AUTO = "auto";
const LANGUAGE_SELECT = [{ value: AUTO, label: "Detect automatically" }, ...LANGUAGE_OPTIONS.map((option) => ({ value: option.code, label: option.name }))];
const DEVICE_TEXT: Record<TranscribeDevice, string> = { webgpu: "the graphics card (WebGPU)", wasm: "the processor (WebAssembly)" };

const selectDialog = (state: TranscribeDialogState | null) => state;
const selectReview = (state: TranscriptionState) => (state.kind === "review" ? state.review : null);
const selectInOut = (state: { inPoint: number | null; outPoint: number | null }) => (state.inPoint === null && state.outPoint === null ? "" : `${state.inPoint ?? ""}-${state.outPoint ?? ""}`);

/** `start - end` as timecodes. */
function span(project: Project, range: { start: number; end: number }): string {
  const { fps } = project.settings;
  const mode = sessionStore.state.getState().timecodeFormat;
  return `${formatTimecode(range.start, fps, mode)} – ${formatTimecode(range.end, fps, mode)}`;
}

function ModelRow({ id, selected, cached, device, onSelect }: { id: WhisperModelId; selected: boolean; cached: boolean | null; device: TranscribeDevice; onSelect: () => void }) {
  const model = whisperModel(id);
  return (
    <button type="button" role="radio" aria-checked={selected} className={styles.model} data-selected={selected || undefined} onClick={onSelect}>
      <span className={styles.modelText}>
        <span className={styles.modelName}>{model.label}</span>
        <span className={styles.modelNote}>{model.note}</span>
      </span>
      {cached ? (
        <span className={styles.cached}>
          <Check className={styles.statusIcon} aria-hidden="true" />
          Downloaded
        </span>
      ) : (
        <span className={styles.size}>
          {cached === false && <Download className={styles.statusIcon} aria-hidden="true" />}
          {model.sizeMb[device]} MB
        </span>
      )}
    </button>
  );
}

function TranscribeSettingsDialog({ state }: { state: TranscribeDialogState }) {
  const settings = appSettings.getState();
  const [model, setModel] = useState<WhisperModelId>(settings.transcribeModel);
  const [language, setLanguage] = useState<string>(settings.transcribeLanguage ?? AUTO);
  const inOutKey = useStoreSelector(sessionStore.state, selectInOut);
  const [range, setRange] = useState<TranscribeRangeChoice>(inOutKey === "" ? "all" : "inOut");
  const project = documentStore.getState();
  const frames = transcribeRange(project, sessionStore.state.getState(), range);
  const replaced = frames ? cuesInRange(project, frames).length : 0;
  const device = state.status?.device ?? "webgpu";
  const cached = state.status ? state.status.cached[model] : null;
  const start = () => void startTranscription({ model, language: language === AUTO ? null : language, range });
  return (
    <Modal
      title="Transcribe captions"
      icon={Mic}
      onClose={closeTranscribeDialog}
      footer={
        <>
          {cached && (
            <span className={styles.footerStart}>
              <Button icon={Trash2} disabled={state.removing !== null} tooltip="Delete this model's files from the browser (it downloads again next time)" onClick={() => void removeModel(model)}>
                {state.removing === model ? "Removing…" : "Remove model"}
              </Button>
            </span>
          )}
          <Button onClick={closeTranscribeDialog}>Cancel</Button>
          <Button variant="primary" icon={cached === false ? Download : undefined} disabled={!frames} autoFocus onClick={start}>
            {cached === false ? `Download ${whisperModel(model).sizeMb[device]} MB and transcribe` : "Transcribe"}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <span className={styles.label}>Model</span>
        <div className={styles.models} role="radiogroup" aria-label="Whisper model">
          {WHISPER_MODELS.map((option) => (
            <ModelRow key={option.id} id={option.id} selected={model === option.id} cached={state.status ? state.status.cached[option.id] : null} device={device} onSelect={() => setModel(option.id)} />
          ))}
        </div>
        <span className={styles.label}>Language</span>
        <Select value={language} options={LANGUAGE_SELECT} onChange={setLanguage} label="Transcription language" />
        <span className={styles.label}>Range</span>
        <div className={styles.range}>
          {inOutKey !== "" && (
            <div className={styles.chips}>
              <IconButton text="In to out" label="Transcribe the in/out range" pressed={range === "inOut"} onClick={() => setRange("inOut")} />
              <IconButton text="Whole timeline" label="Transcribe the whole timeline" pressed={range === "all"} onClick={() => setRange("all")} />
            </div>
          )}
          <span className={styles.mono}>{frames ? span(project, frames) : "The timeline is empty"}</span>
        </div>
      </div>
      <p className={styles.note}>
        {state.error
          ? `Couldn't read the model cache: ${state.error}`
          : state.status
            ? `Runs on ${DEVICE_TEXT[device]} of this computer; the audio never leaves it. ${cached ? "" : "The model downloads once from Hugging Face and stays in this browser."}`
            : "Checking the downloaded models…"}
      </p>
      {replaced > 0 && (
        <p className={styles.warning}>
          The {replaced} cue{replaced === 1 ? "" : "s"} in this range will be replaced: you review the new ones first.
        </p>
      )}
    </Modal>
  );
}

function ReviewDialog({ review }: { review: TranscriptReview }) {
  const project = documentStore.getState();
  const { fps } = project.settings;
  const mode = sessionStore.state.getState().timecodeFormat;
  const count = review.cues.length;
  const add = () => void applyTranscript();
  return (
    <Modal
      title="Review the transcript"
      icon={Captions}
      size="lg"
      onClose={discardTranscript}
      footer={
        <>
          <Button onClick={discardTranscript}>Discard</Button>
          <Button variant="primary" autoFocus onClick={add}>
            {review.replaced > 0 ? `Replace ${review.replaced} cue${review.replaced === 1 ? "" : "s"}` : `Add ${count} caption${count === 1 ? "" : "s"}`}
          </Button>
        </>
      }
    >
      <p className={styles.summary}>
        {count} cue{count === 1 ? "" : "s"} · {review.words} words · {languageName(review.language)} · Whisper {whisperModel(review.model).label} on {review.device === "webgpu" ? "WebGPU" : "WebAssembly"}
      </p>
      <ol className={styles.cues} aria-label="Transcribed cues">
        {review.cues.map((cue, i) => (
          <li key={i} className={styles.cue}>
            <span className={styles.cueTime}>{formatTimecode(cue.start, fps, mode)}</span>
            <span className={styles.cueText}>{cue.text}</span>
          </li>
        ))}
      </ol>
      <p className={review.replaced > 0 ? styles.warning : styles.note}>
        {review.replaced > 0
          ? `They replace the ${review.replaced} cue${review.replaced === 1 ? "" : "s"} in ${span(project, review.range)}. Undo brings them back.`
          : `They go on the caption track with word timings, so the spoken word is highlighted. Undo removes them.`}
      </p>
    </Modal>
  );
}

/** The Transcribe dialog or the review, whichever is open. */
export function TranscribeDialogs() {
  const dialog = useStoreSelector(transcribeDialog, selectDialog);
  const review = useStoreSelector(transcription, selectReview);
  if (review) return <ReviewDialog review={review} />;
  return dialog ? <TranscribeSettingsDialog state={dialog} /> : null;
}
