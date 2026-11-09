# Templates

A template is a compound clip with fields you can change. Make a title card once, choose which parts can vary (the text, a color, a picture), and then give every copy its own values. Save the card as a template to reuse it in other projects.

> **Video placeholder: Make and use a template**
> - File: `videos/templates/overview.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows: select a card compound and double-click it; select the title text; in **Properties** > **Parameters** leave **Field** on **Text** and click **As parameter**; select the bar, choose **Color** and click **As parameter**; press <kbd>Esc</kbd> twice; duplicate the compound; change **Text** and the color on the copy; click **Save as template**; open the **Presets** tab and double-click the card under **Templates**.

## In this page
- [Make fields you can change](#make-fields-you-can-change)
- [Edit the fields of a copy](#edit-the-fields-of-a-copy)
- [Save a template](#save-a-template)
- [Insert a template](#insert-a-template)
- [Fill templates from the command line](#fill-templates-from-the-command-line)
- [Limits](#limits)

## Make fields you can change
1. Make a compound clip (see [Compound clips](compound-clips.md)) and double-click it to open it.
2. Select a clip inside it, such as the title text.
3. In **Properties**, find the **Parameters** section.
4. In **Field**, choose what to expose, then click **As parameter**.

The **Field** list shows the fields the selected clip has:

| Field | Works for |
|---|---|
| **Text**, **Text color**, **Font**, **Font size** | Text clips |
| **Color** | Solid and shape clips |
| **Media** | Image and video clips |
| **Width**, **Height** | Clips with a size |
| **Position X**, **Position Y**, **Scale**, **Rotation**, **Opacity** | Any clip |
| **Visible**, **Loop** | Clips that have them |

Each parameter then gets its own rows:
- A name row (the row is labeled with its kind: text, color, number, media, font or toggle). Type a new name to rename it. Click the bin button to remove the parameter.
- **Range** for numbers: a minimum and a maximum.
- **Default**: click **Use current** to make the field's current value the default.

To make one more field follow an existing parameter (for example two texts that share one name), select that clip, choose its field, pick the parameter in **Add to** and click **Add**.

> **Note:** Changes to the parameters can be undone with <kbd>Ctrl</kbd>+<kbd>Z</kbd>.

## Edit the fields of a copy
Select a compound clip whose content has parameters. **Properties** shows one row per parameter, with the right control: a text box, a color swatch, a number field, a switch or a media list. Change a value and only that copy changes. Copies share the same content, so editing the content (moving the title inside, for example) changes every copy and keeps their values.

- Click the reset button at the end of a row (**Reset** plus the field's name) to bring that field back to the template's value.
- In the **Template** row, click **Reset all** to clear every value of the copy.
- Select several copies of one template to change them together.

> **Note:** A field you never changed shows the template's value. **Font** is a text box: type the family name.

## Save a template
1. Select the compound clip.
2. In **Properties**, in the **Template** row, click **Save as template**. You can also run **Save as template** from the command palette.

The template keeps its fields, a picture of the card, and the media and fonts it uses. It is stored for all your projects. If you chose a library folder for your presets, it is also written there, in a `templates` folder, so it travels with the folder to another machine.

## Insert a template
1. Open the **Presets** tab in the left panel. The **Templates** section appears once you have saved a template.
2. Type in **Search templates** to filter the cards.
3. Double-click a card, or focus it and press <kbd>Enter</kbd> or <kbd>Space</kbd>.

The template appears at the playhead, with its media and fonts copied into the project. One undo removes it all. To delete a template, click the bin button on its card (**Delete template**).

> **Note:** You cannot drag a card onto the timeline yet.

## Fill templates from the command line
If you work with the project folder tools, `fill <folder> <values.json>` sets the values of copies in a project folder in one go. Copies are named by clip id or name, parameters by id or label, and colors are written as `#rrggbb`. If any value is wrong, nothing is written.

## Limits
- **Break apart** is refused while a copy has its own values. Click **Reset all** first.
- A parameter that points at a field that no longer exists sets nothing.
- Volume is not available as a parameter.
- You cannot rename a template or its category yet.

## Related pages
- [Compound clips](compound-clips.md)
- [Text presets](text-presets.md)
- [Fonts](fonts.md)
- [Properties](editing-properties.md)

<sub>Last updated: Batch 80, 2026-11-09</sub>
