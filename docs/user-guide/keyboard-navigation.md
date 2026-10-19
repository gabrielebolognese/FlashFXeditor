# Keyboard navigation

You can reach and use every control of the editor with the keyboard alone: move from control to control with <kbd>Tab</kbd>, read the tooltip and shortcut of the control you are on, press it with <kbd>Space</kbd> or <kbd>Enter</kbd>, and move through sliders, the color picker and the lists of cards with the arrow keys. Use it when you prefer the keyboard, or when a mouse is not comfortable for you. Your shortcuts keep working as before.

> **Video placeholder: Work with the keyboard alone**
> - File: `videos/keyboard-navigation/overview.mp4` (not recorded yet)
> - Length: about 75 seconds
> - Shows:
>   1. A project with a video clip selected. Click the **Edit Properties** tab, then press <kbd>Tab</kbd> a few times: a gold ring moves from control to control through the quick actions; after a moment, each one's tooltip shows its name.
>   2. Keep pressing <kbd>Tab</kbd> down to the **Enabled** switch of the **Clip** section: its tooltip reads **Clip enabled**. Press <kbd>Space</kbd>: the clip turns off and playback does not start. Press <kbd>Space</kbd> again: it is back on.
>   3. Click the switch with the mouse, then press <kbd>Space</kbd>: playback starts, and the switch stays as it was. Press <kbd>Space</kbd> again to pause.
>   4. Click the **Media** tab, press <kbd>Tab</kbd> until a media card has a gold ring, press <kbd>→</kbd> twice: the third card is selected. Press <kbd>Enter</kbd>: it is inserted at the playhead.
>   5. Narrow the timeline until **More tools** (…) appears. Press <kbd>Tab</kbd> until **More tools** has the ring, press <kbd>Enter</kbd>: the menu opens with the ring on its first button. Press <kbd>Tab</kbd> to **Zoom in** and <kbd>Space</kbd>: the timeline zooms in, and the menu stays open. Press <kbd>Escape</kbd>: the menu closes and the ring is back on **More tools**.

## In this page
- [Move between controls](#move-between-controls)
- [Press buttons, switches, chips and tabs](#press-buttons-switches-chips-and-tabs)
- [Know when the keys go to a control](#know-when-the-keys-go-to-a-control)
- [Use sliders with the arrow keys](#use-sliders-with-the-arrow-keys)
- [Move through cards and lists](#move-through-cards-and-lists)
- [Use menus and pickers](#use-menus-and-pickers)
- [Where the focus goes when something closes](#where-the-focus-goes-when-something-closes)
- [Related pages](#related-pages)

## Move between controls

1. Click next to where you want to start, for example on a panel's tab or in an empty part of a panel.
2. Press <kbd>Tab</kbd> to move to the next control, or <kbd>Shift</kbd>+<kbd>Tab</kbd> to the previous one. The control you are on has a gold ring around it: it has the keyboard focus.
3. Wait a moment: the control's tooltip shows its name and, if it has one, its shortcut, for example **Snap** with <kbd>S</kbd>. Any key closes the tooltip. See [Read tooltips and shortcuts](workspace.md#read-tooltips-and-shortcuts).

- <kbd>Tab</kbd> reaches every control of the app bar, the panel headers, the timeline toolbar, the transport bar under the preview and the **Edit Properties** panel: buttons, switches, chips, fields, section headers and the stopwatches.
- **Dimmed controls are reached too.** Their tooltip often says why they are dimmed, for example **Transcribe: no audio on the timeline**. A dimmed field shows its value but you can't change it, and a dimmed dropdown list doesn't open.
- Moving into a panel with <kbd>Tab</kbd> makes it the active panel, as a click does. See [Send shortcuts to the right panel](workspace.md#send-shortcuts-to-the-right-panel).
- Each list of media cards or preset cards, and the row of buttons in the preset bar, is a single stop: <kbd>Tab</kbd> enters it, and the arrow keys move inside. See [Move through cards and lists](#move-through-cards-and-lists).
- While the preview fills the window (<kbd>F</kbd>), <kbd>Tab</kbd> moves only through its header and transport bar, and they stay shown while one of their controls has the focus. See [Fill the window with the preview](preview-zoom-overlays-fullscreen.md#fill-the-window-with-the-preview).

> **Tip:** On the gold **Export** button of the app bar, the ring is a dark gap with a gold edge, so you can still see it on the gold.

## Press buttons, switches, chips and tabs

On a control that has the gold ring:

| Control | <kbd>Space</kbd> or <kbd>Enter</kbd> |
| --- | --- |
| A button | Clicks it |
| A switch, such as **Enabled** or **Outline** | Turns it on or off |
| A chip, such as **Center**, **Start** or **End** in a transition's **Alignment** | Chooses it |
| A tab, such as **Media**, **Presets** and **Captions**, or **Edit Properties** and **Export** | Shows it |
| A section header in **Edit Properties** | Folds or unfolds the section |
| A button with a menu, such as **Zoom** in the Preview header or **More tools** | Opens the menu |

- Each chip of a row, and each tab, is its own stop: press <kbd>Tab</kbd> to move to the next one, then <kbd>Space</kbd> or <kbd>Enter</kbd> to choose it.
- In a text or number field, the keys type as usual. See [Type a value](editing-properties.md#type-a-value).
- <kbd>Esc</kbd>, <kbd>Delete</kbd> and shortcuts with <kbd>Ctrl</kbd> or <kbd>Alt</kbd> keep working as shortcuts while a control has the ring. For example, <kbd>Ctrl</kbd>+<kbd>Z</kbd> still undoes, and <kbd>Esc</kbd> still closes the **Export** tab.

## Know when the keys go to a control

<kbd>Space</kbd>, <kbd>Enter</kbd> and the arrow keys go to a control only when you reached it with the keyboard. After you click a control with the mouse, they work as shortcuts again:

| You | Then <kbd>Space</kbd> | Then <kbd>→</kbd> |
| --- | --- | --- |
| Reach a switch with <kbd>Tab</kbd> | Turns the switch on or off | Moves to the next frame |
| Click a switch with the mouse | Plays or pauses | Moves to the next frame |
| Reach the zoom slider with <kbd>Tab</kbd> | Nothing: the slider keeps it | Zooms the timeline in |
| Drag the zoom slider with the mouse | Plays or pauses | Moves to the next frame |

So a click never makes <kbd>Space</kbd> press a switch or a button a second time: it always plays. To give the keys back to the control, press <kbd>Tab</kbd> and <kbd>Shift</kbd>+<kbd>Tab</kbd>.

- A click on the timeline or on the preview picture takes the focus away from any control.
- When you open **More tools** with the mouse, the ring sits on its first control, but <kbd>Space</kbd> still plays until you press <kbd>Tab</kbd>. Right-click menus are different: while one is open, <kbd>Space</kbd> and <kbd>Enter</kbd> always work on its rows.
- A dropdown list and a text field always take the keys while they have the focus, also after a click: see [How shortcuts work](keyboard-shortcuts.md#how-shortcuts-work).

## Use sliders with the arrow keys

A slider with the gold ring keeps the arrow keys, and <kbd>Home</kbd> and <kbd>End</kbd>, for itself:

| Slider | Keys |
| --- | --- |
| The timeline zoom slider (tooltip **Timeline zoom**) | <kbd>→</kbd> or <kbd>↑</kbd> zooms in a small step, <kbd>←</kbd> or <kbd>↓</kbd> zooms out; <kbd>Home</kbd> zooms all the way out, <kbd>End</kbd> all the way in. The slider keeps the focus, so you can keep pressing. See [Zoom in and out](timeline.md#zoom-in-and-out). |
| The **Master volume** knob under the preview | 1 dB per arrow, 10 dB with <kbd>Page Up</kbd> and <kbd>Page Down</kbd>, <kbd>Home</kbd> for -60.0 dB and <kbd>End</kbd> for 0.0 dB. See [Turn the volume up or down](audio.md#turn-the-volume-up-or-down). |
| **Threshold** in the **Remove silence** row | 1 dB per arrow, <kbd>Home</kbd> for -60 dB and <kbd>End</kbd> for -10 dB. See [Set the threshold, minimum silence and padding](removing-silence.md#set-the-threshold-minimum-silence-and-padding). |
| The square and the strips of the color picker | Saturation and brightness, hue and opacity in steps of 1% or 1° (10 with <kbd>Shift</kbd>). See [Pick a color](editing-properties.md#pick-a-color). |
| A column edge in the media list view (a gold line when focused) | <kbd>→</kbd> widens the column by 8 pixels, <kbd>←</kbd> narrows it (32 pixels with <kbd>Shift</kbd>). See [Resize the list columns](organizing-media.md#resize-the-list-columns). |

## Move through cards and lists

> **Video placeholder: Browse media and presets with the keyboard**
> - File: `videos/keyboard-navigation/cards.mp4` (not recorded yet)
> - Length: about 40 seconds
> - Shows: the **Media** tab in grid view with eight cards in two rows; press <kbd>Tab</kbd> until the selected card has the gold ring; press <kbd>↓</kbd>: the card under it is selected; press <kbd>Shift</kbd>+<kbd>→</kbd> twice: three cards are selected; press <kbd>Home</kbd>: the first card alone is selected; press <kbd>Enter</kbd>: it is inserted at the playhead; press <kbd>Enter</kbd> on the next card: it follows right after; open the **Presets** tab, select a title on the timeline, press <kbd>Tab</kbd> until a preset card has the ring, press <kbd>→</kbd> and <kbd>Space</kbd>: the title takes the preset's look.

The cards of the **Media** tab (grid view and list view) and of the **Presets** tab are each one stop for <kbd>Tab</kbd>. The ring lands on the selected media item, or on the preset card you were on last; otherwise on the first card.

| Key | What it does |
| --- | --- |
| <kbd>←</kbd> or <kbd>→</kbd> | The previous or next card |
| <kbd>↑</kbd> or <kbd>↓</kbd> | The card above or below, one row up or down. In list view, the previous or next row. |
| <kbd>Home</kbd> or <kbd>End</kbd> | The first or the last card |
| <kbd>Enter</kbd> or <kbd>Space</kbd> | **Media:** inserts the media item at the playhead, as a double-click does. The playhead moves to the end of the new clip, so the next card follows right after. **Presets:** does what a click does: applies the preset to the selected texts, or adds a new text with it at the playhead. |

- **Media tab:** the card you move to is selected, as with a click. Hold <kbd>Shift</kbd> with the arrow keys to select a range. With <kbd>Ctrl</kbd> or <kbd>Alt</kbd> held, the keys run their shortcuts instead.
- **Presets tab:** the arrow keys move only the ring; presets are not selected.
- **Preset bar:** its row of buttons above the preview works the same way: <kbd>←</kbd> and <kbd>→</kbd> move the ring (the row scrolls along), <kbd>Home</kbd> and <kbd>End</kbd> go to the first and last button, and <kbd>Enter</kbd> or <kbd>Space</kbd> does what a click does. The set menu, the arrows, **+** and **Manage presets (the Presets tab)** are stops of their own. See [Use the bar with the keyboard](preset-bar.md#use-the-bar-with-the-keyboard).
- Clicking a card doesn't give it the focus, so <kbd>Space</kbd> still plays. Only when a card already had the ring does the clicked card take it.

See [Insert at the playhead](adding-media-to-the-timeline.md#insert-at-the-playhead) and [Apply a preset to text](text-presets.md#apply-a-preset-to-text).

## Use menus and pickers

- **Right-click menus and the preview's menus:** the arrow keys move between rows, <kbd>Enter</kbd> runs a row and <kbd>Esc</kbd> closes the menu. The row you move to gets a gold ring. See [Use menus with the keyboard](command-palette-and-custom-shortcuts.md#use-menus-with-the-keyboard).
- **More tools** (…), in a narrow timeline toolbar: <kbd>Enter</kbd> opens it with the focus on its first control, <kbd>Tab</kbd> and <kbd>Shift</kbd>+<kbd>Tab</kbd> go round its controls, and <kbd>Escape</kbd> closes it. See [When the toolbar does not fit](workspace.md#when-the-toolbar-does-not-fit).
- **The color picker:** <kbd>Enter</kbd> on a color swatch opens it with the cursor in the hex field; <kbd>Tab</kbd> goes round its parts and <kbd>Esc</kbd> closes it. See [Pick a color](editing-properties.md#pick-a-color).
- **The font browser:** <kbd>Enter</kbd> on **Font** opens it with the cursor in the search field; <kbd>↓</kbd> and <kbd>↑</kbd> highlight a font and show it on your text, <kbd>Enter</kbd> applies it and <kbd>Esc</kbd> closes the browser without a change. <kbd>Tab</kbd> moves on to **Add fonts…** and the look and weight chips, which <kbd>Space</kbd> turns on and off. See [See a font on your text, then apply it](fonts.md#see-a-font-on-your-text-then-apply-it).

## Where the focus goes when something closes

When the control you are on goes away, the keyboard focus doesn't get lost. It goes back to the control that opened it, so the next <kbd>Tab</kbd> continues from there:

| What closes | The focus goes to |
| --- | --- |
| The **More tools** menu | **More tools** |
| The color picker | Its color swatch |
| The font browser, after a pick or <kbd>Esc</kbd> | **Font** |
| The project name field in the app bar, after <kbd>Enter</kbd> or <kbd>Escape</kbd> | The project name |
| A bin's name field, after <kbd>Enter</kbd> or <kbd>Escape</kbd> | The bin's chip |
| The **Remove silence** row (**Apply**, **Cancel** or <kbd>Esc</kbd>) | **Remove silence** in the quick actions |
| The preset name field of **Save as preset** | **Save as preset** |
| The preset name field of **+** in the preset bar | **+** |
| An export card you removed from the **Queue** | The next card, or the previous one |
| The quick actions or a section, after **Delete** or a new selection | The top of the **Edit Properties** panel |

## Related pages
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [The workspace](workspace.md)
- [Editing properties](editing-properties.md)
- [Organizing media](organizing-media.md)
- [Text presets](text-presets.md)
- [The preset bar](preset-bar.md)
- [Command palette and custom shortcuts](command-palette-and-custom-shortcuts.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 52, 2026-10-19</sub>
