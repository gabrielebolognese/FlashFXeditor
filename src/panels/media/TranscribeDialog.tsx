import { Captions, Check, Download, FileUp, Mic, Trash2 } from "lucide-react";
import { useState } from "react";
import { documentStore, appSettings, sessionStore } from "../../app/services.js";
import { applyTranscript, closeTranscribeDialog, discardTranscript, removeModel, startTranscription } from "../../app/transcribeController.js";
import { closeWordsImportDialog, reviewImportedWords } from "../../app/wordsImportController.js";
import { CHUNK_LIMITS, wordsToCues, type ChunkOptions } from "../../text/wordsImport.js";
import { NumberField, useValueBinding } from "../../ui/NumberField.js";
import { Toggle } from "../../ui/Toggle.js";
import { transcribeDialog, transcribeRange, transcription, wordsImportDialog, type WordsImportState, type TranscribeDialogState, type TranscribeRangeChoice, type TranscriptReview, type TranscriptionState } from "../../app/transcription.js";
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
const selectWords = (state: WordsImportState | null) => state;
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
          {/* Always there (Batch 46): disabled until the chosen model is downloaded. */}
          <span className={styles.footerStart}>
            <Button control icon={Trash2} disabled={!cached || state.removing !== null} tooltip={cached ? "Delete this model's files from the browser (it downloads again next time)" : cached === false ? "This model is not downloaded" : "Checking the downloaded models…"} onClick={() => void removeModel(model)}>
              {state.removing === model ? "Removing…" : "Remove model"}
            </Button>
          </span>
          <Button control onClick={closeTranscribeDialog}>Cancel</Button>
          <Button control variant="primary" disabled={!frames} tooltip={frames ? undefined : "The timeline is empty: nothing to transcribe"} autoFocus onClick={start}>
            {/* Both labels share one cell: the button keeps the longer one's width as the model changes. */}
            <span className={styles.startLabels}>
              <span className={styles.startLabel} data-shown={cached === false || undefined}>
                <Download className={styles.startIcon} aria-hidden="true" />
                {`Download ${whisperModel(model).sizeMb[device]} MB and transcribe`}
              </span>
              <span className={styles.startLabel} data-shown={cached !== false || undefined}>
                Transcribe
              </span>
            </span>
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
          {/* Both chips always (Batch 46): In to out is disabled until an in or out point is set. */}
          <div className={styles.chips}>
            <IconButton
              control
              text="In to out"
              label={inOutKey === "" ? "Transcribe the in/out range: set an in or out point first" : "Transcribe the in/out range"}
              pressed={range === "inOut"}
              disabled={inOutKey === ""}
              onClick={() => setRange("inOut")}
            />
            <IconButton control text="Whole timeline" label="Transcribe the whole timeline" pressed={range === "all"} onClick={() => setRange("all")} />
          </div>
          <span className={styles.mono}>{frames ? span(project, frames) : "The timeline is empty"}</span>
        </div>
      </div>
      <p className={styles.status}>
        {state.error
          ? `Couldn't read the model cache: ${state.error}`
          : state.status
            ? `Runs on ${DEVICE_TEXT[device]} of this computer; the audio never leaves it. ${cached ? "" : "The model downloads once from Hugging Face and stays in this browser."}`
            : "Checking the downloaded models…"}
      </p>
      {/* A reserved line (Batch 46): what the transcription replaces, or that it replaces nothing. */}
      <p className={styles.warning} data-quiet={replaced === 0 || undefined}>
        {replaced > 0
          ? `The ${replaced} cue${replaced === 1 ? "" : "s"} in this range will be replaced: you review the new ones first.`
          : "No cue is replaced: you review the new ones before they go on the caption track."}
      </p>
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
      title={review.source ? "Review the imported words" : "Review the transcript"}
      icon={Captions}
      size="lg"
      onClose={discardTranscript}
      footer={
        <>
          <Button control onClick={discardTranscript}>Discard</Button>
          <Button control variant="primary" autoFocus onClick={add}>
            {review.replaced > 0 ? `Replace ${review.replaced} cue${review.replaced === 1 ? "" : "s"}` : `Add ${count} caption${count === 1 ? "" : "s"}`}
          </Button>
        </>
      }
    >
      <p className={styles.summary}>
        {review.source
          ? `${count} cue${count === 1 ? "" : "s"} · ${review.words} words · ${review.source.fileName}`
          : `${count} cue${count === 1 ? "" : "s"} · ${review.words} words · ${languageName(review.language ?? "")} · Whisper ${whisperModel(review.model ?? "base").label} on ${review.device === "webgpu" ? "WebGPU" : "WebAssembly"}`}
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
          : `They go on the caption track with word timings, so the highlight follows the words. Undo removes them.`}
      </p>
    </Modal>
  );
}

/** The chunking rules of a words file without a chunk list (spec §21.8): live count of the cues they make. */
function WordsImportDialog({ state }: { state: WordsImportState }) {
  const [options, setOptions] = useState<ChunkOptions>(state.options);
  const set = (patch: Partial<ChunkOptions>) => setOptions((now) => ({ ...now, ...patch }));
  const cues = wordsToCues(state.imported, options).length;
  const limits = CHUNK_LIMITS;
  const maxWords = useValueBinding(options.maxWords, (value) => set({ maxWords: Math.round(value) }));
  const perLine = useValueBinding(options.charsPerLine, (value) => set({ charsPerLine: Math.round(value) }));
  const maxLines = useValueBinding(options.maxLines, (value) => set({ maxLines: Math.round(value) }));
  const pause = useValueBinding(options.pauseMs, (value) => set({ pauseMs: Math.round(value) }));
  const go = () => reviewImportedWords(state.imported, options, state.fileName);
  return (
    <Modal
      title="Import words"
      icon={FileUp}
      onClose={closeWordsImportDialog}
      footer={
        <>
          <Button control onClick={closeWordsImportDialog}>Cancel</Button>
          <Button control variant="primary" autoFocus onClick={go}>
            {`Review ${cues} cue${cues === 1 ? "" : "s"}`}
          </Button>
        </>
      }
    >
      <p className={styles.summary}>
        {state.imported.words.length} words in {state.fileName}, with no chunk list: they are cut into cues by these rules.
      </p>
      <div className={styles.form}>
        <span className={styles.label}>Max words per cue</span>
        <NumberField binding={maxWords} min={limits.maxWords.min} max={limits.maxWords.max} step={1} precision={0} ariaLabel="Maximum words per cue" />
        <span className={styles.label}>Max characters per line</span>
        <NumberField binding={perLine} min={limits.charsPerLine.min} max={limits.charsPerLine.max} step={1} precision={0} ariaLabel="Maximum characters per line" />
        <span className={styles.label}>Max lines</span>
        <NumberField binding={maxLines} min={limits.maxLines.min} max={limits.maxLines.max} step={1} precision={0} ariaLabel="Maximum lines per cue" />
        <span className={styles.label}>Break at pauses over</span>
        <NumberField binding={pause} min={limits.pauseMs.min} max={limits.pauseMs.max} step={50} precision={0} unit="ms" ariaLabel="Break at pauses longer than, in milliseconds" />
        <span className={styles.label}>Break at punctuation</span>
        <Toggle checked={options.breakAtPunctuation} onChange={(checked) => set({ breakAtPunctuation: checked })} label="Break cues at sentence ends" />
      </div>
      <p className={styles.note}>You review the cues before they go on the caption track; the cues of that span are replaced only when you confirm.</p>
    </Modal>
  );
}

/** The Transcribe dialog, the Import words dialog or the review, whichever is open. */
export function TranscribeDialogs() {
  const dialog = useStoreSelector(transcribeDialog, selectDialog);
  const review = useStoreSelector(transcription, selectReview);
  const words = useStoreSelector(wordsImportDialog, selectWords);
  if (review) return <ReviewDialog review={review} />;
  if (words) return <WordsImportDialog state={words} />;
  return dialog ? <TranscribeSettingsDialog state={dialog} /> : null;
}
