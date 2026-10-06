"use client";

import { TableKit } from "@tiptap/extension-table";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { EditorContent, Extension, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useState } from "react";
import { buttonClass } from "@/components/ui";
import { parseDocument, templateFields, type ContractDoc } from "@/lib/contracts/document";
import { FIELD_PATTERN, isKnownField, mergeFields } from "@/lib/contracts/fields";

/** Outlines {{fields}} as they're typed: solid for known fields, dashed and labelled for unknown. */
const MergeFieldHighlight = Extension.create({
  name: "mergeFieldHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("mergeFieldHighlight"),
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;
              for (const match of node.text.matchAll(FIELD_PATTERN)) {
                const from = pos + (match.index ?? 0);
                const known = isKnownField(match[1]);
                decorations.push(
                  Decoration.inline(from, from + match[0].length, {
                    class: known ? "merge-field" : "merge-field-unknown",
                    title: known
                      ? "Filled in from the check-out"
                      : "Unknown field: won't be filled in",
                  }),
                );
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

const small = `${buttonClass("secondary")} px-2`;

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`${small} ${active ? "border-accent text-accent" : ""}`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      bullets: e.isActive("bulletList"),
      numbers: e.isActive("orderedList"),
      inTable: e.isActive("table"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();

  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {([1, 2, 3] as const).map((level) => (
          <ToolButton
            key={level}
            label={`Heading ${level}`}
            active={state[`h${level}`]}
            onClick={() => chain().toggleHeading({ level }).run()}
          >
            H{level}
          </ToolButton>
        ))}
        <ToolButton label="Bold" active={state.bold} onClick={() => chain().toggleBold().run()}>
          <strong>B</strong>
        </ToolButton>
        <ToolButton
          label="Italic"
          active={state.italic}
          onClick={() => chain().toggleItalic().run()}
        >
          <em>I</em>
        </ToolButton>
        <ToolButton
          label="Underline"
          active={state.underline}
          onClick={() => chain().toggleUnderline().run()}
        >
          <u>U</u>
        </ToolButton>
        <ToolButton
          label="Bulleted list"
          active={state.bullets}
          onClick={() => chain().toggleBulletList().run()}
        >
          • List
        </ToolButton>
        <ToolButton
          label="Numbered list"
          active={state.numbers}
          onClick={() => chain().toggleOrderedList().run()}
        >
          1. List
        </ToolButton>
        <ToolButton label="Horizontal line" onClick={() => chain().setHorizontalRule().run()}>
          Line
        </ToolButton>
        <ToolButton
          label="Insert table"
          disabled={state.inTable}
          onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          Table
        </ToolButton>
        <ToolButton label="Undo" disabled={!state.canUndo} onClick={() => chain().undo().run()}>
          Undo
        </ToolButton>
        <ToolButton label="Redo" disabled={!state.canRedo} onClick={() => chain().redo().run()}>
          Redo
        </ToolButton>
        <label className="sr-only" htmlFor="insert-field">
          Insert a field
        </label>
        <select
          id="insert-field"
          value=""
          onChange={(event) => {
            const name = event.target.value;
            if (name) chain().insertContent(`{{${name}}}`).run();
          }}
          className="rounded-theme border-border bg-surface text-text min-h-10 border px-2"
        >
          <option value="">Insert a field…</option>
          {mergeFields.map((field) => (
            <option key={field.name} value={field.name}>
              {field.label} ({`{{${field.name}}}`})
            </option>
          ))}
        </select>
      </div>
      {state.inTable ? (
        <div className="flex flex-wrap gap-1" aria-label="Table">
          <ToolButton label="Add row below" onClick={() => chain().addRowAfter().run()}>
            + Row
          </ToolButton>
          <ToolButton label="Add column right" onClick={() => chain().addColumnAfter().run()}>
            + Column
          </ToolButton>
          <ToolButton label="Delete row" onClick={() => chain().deleteRow().run()}>
            − Row
          </ToolButton>
          <ToolButton label="Delete column" onClick={() => chain().deleteColumn().run()}>
            − Column
          </ToolButton>
          <ToolButton label="Header row on or off" onClick={() => chain().toggleHeaderRow().run()}>
            Header row
          </ToolButton>
          <ToolButton label="Delete table" onClick={() => chain().deleteTable().run()}>
            Delete table
          </ToolButton>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The template editor. Its JSON goes to the server in a hidden field, where
 * it's checked against the same allow-list before a new version is saved.
 */
export function TemplateEditor({ initial }: { initial: ContractDoc }) {
  const [json, setJson] = useState(() => JSON.stringify(initial));
  const [unknown, setUnknown] = useState(() => templateFields(initial).unknown);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        code: false,
        codeBlock: false,
        blockquote: false,
        strike: false,
        link: false,
      }),
      TableKit.configure({ table: { resizable: false } }),
      MergeFieldHighlight,
    ],
    content: initial,
    editorProps: {
      attributes: {
        class: "contract rounded-theme border-border bg-surface border p-4",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Contract template",
      },
    },
    onUpdate: ({ editor: e }) => {
      const doc = e.getJSON();
      setJson(JSON.stringify(doc));
      const parsed = parseDocument(doc);
      setUnknown(parsed.ok ? templateFields(parsed.doc).unknown : []);
    },
  });

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="content" value={json} />
      {editor ? <Toolbar editor={editor} /> : <p className="text-muted">Loading the editor…</p>}
      <EditorContent editor={editor} />
      {unknown.length > 0 ? (
        <div className="border-bad rounded-theme border p-2" role="status">
          <p className="font-semibold">
            Unknown field{unknown.length === 1 ? "" : "s"}: these won&apos;t be filled in.
          </p>
          <ul className="list-disc pl-5">
            {unknown.map((name) => (
              <li key={name} className="font-mono">{`{{${name}}}`}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-muted">
        Fields like <span className="font-mono">{"{{group}}"}</span> are filled in from the
        check-out. Put <span className="font-mono">{"{{item_list}}"}</span> on its own line to get a
        table of items, codes and fees.
      </p>
    </div>
  );
}
