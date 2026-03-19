'use client';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TiptapImage from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import CharacterCount from '@tiptap/extension-character-count';
import { useCallback, useState, useEffect } from 'react';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3, List, ListOrdered, Quote,
  Code, Link as LinkIcon, Image, AlignLeft, AlignCenter, AlignRight,
  Undo, Redo, Minus, Type,
} from 'lucide-react';

// FIX: hoisted to module scope — no re-creation on every render
interface ToolbarButtonProps {
  onClick: () => void; active?: boolean; disabled?: boolean; title: string;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, active, disabled, title, children }: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}  // FIX: explicit accessible name for screen readers
      className={`p-1.5 rounded transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : 'text-zinc-400 hover:text-white hover:bg-zinc-700'
      } disabled:opacity-30 disabled:cursor-not-allowed`}>
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-zinc-700 mx-1" />;
}

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  onImageUpload?: (file: File) => Promise<string>;
  placeholder?: string;
}

export function RichTextEditor({ content, onChange, onImageUpload, placeholder = 'Start writing your story...' }: RichTextEditorProps) {
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl]             = useState('');
  const [isDragging, setIsDragging]       = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: { HTMLAttributes: { class: 'bg-zinc-900 rounded-lg p-4 font-mono text-sm text-emerald-400 overflow-x-auto' } },
      }),
      TiptapImage.configure({
        // FIX: allowBase64 disabled — pasted images must go through /api/cms/media upload
        // instead of being inlined as data: URLs in post content (bloats DB, breaks CDN caching)
        allowBase64: false,
        HTMLAttributes: { class: 'rounded-lg max-w-full h-auto my-4 border border-zinc-800' },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-blue-400 underline hover:text-blue-300 cursor-pointer' },
      }),
      Placeholder.configure({ placeholder }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      CharacterCount,  // FIX: registered so editor.storage.characterCount is available
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'prose prose-invert prose-zinc max-w-none focus:outline-none px-8 py-6 min-h-[500px] text-zinc-100 leading-relaxed',
      },
      handleDrop: (_view, event, _slice, moved) => {
        if (!moved && event.dataTransfer?.files.length) {
          const file = event.dataTransfer.files[0];
          if (file.type.startsWith('image/') && onImageUpload) {
            onImageUpload(file).then(url => editor?.chain().focus().setImage({ src: url }).run());
            return true;
          }
        }
        return false;
      },
    },
  });

  // FIX: editor in dep array to satisfy exhaustive-deps
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor || !onImageUpload) return;
    try {
      const url = await onImageUpload(file);
      editor.chain().focus().setImage({ src: url }).run();
    } catch { /* silently ignore upload errors */ }
    e.target.value = '';
  }, [editor, onImageUpload]);

  const insertLink = () => {
    if (!editor || !linkUrl) return;
    editor.chain().focus().setLink({ href: linkUrl }).run();
    setLinkUrl('');
    setShowLinkInput(false);
  };

  if (!editor) return <div className="h-96 bg-zinc-900 rounded-xl animate-pulse" />;

  const words = editor.storage.characterCount?.words?.() ?? 0;
  const chars  = editor.storage.characterCount?.characters?.() ?? 0;

  return (
    <div
      className={`border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950 ${isDragging ? 'ring-2 ring-blue-500 ring-inset' : ''}`}
      onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={() => setIsDragging(false)}>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-3 py-2 border-b border-zinc-800 bg-zinc-900/50">
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo">
          <Undo className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo">
          <Redo className="h-4 w-4" />
        </ToolbarButton>
        <Divider />

        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive('heading', { level: 1 })} title="Heading 1">
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })} title="Heading 2">
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive('heading', { level: 3 })} title="Heading 3">
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setParagraph().run()}
          active={editor.isActive('paragraph')} title="Paragraph">
          <Type className="h-4 w-4" />
        </ToolbarButton>
        <Divider />

        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="Inline Code">
          <Code className="h-4 w-4" />
        </ToolbarButton>
        <Divider />

        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()}
          active={editor.isActive({ textAlign: 'left' })} title="Align Left">
          <AlignLeft className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()}
          active={editor.isActive({ textAlign: 'center' })} title="Align Center">
          <AlignCenter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()}
          active={editor.isActive({ textAlign: 'right' })} title="Align Right">
          <AlignRight className="h-4 w-4" />
        </ToolbarButton>
        <Divider />

        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')} title="Bullet List">
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')} title="Numbered List">
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive('blockquote')} title="Quote">
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divider">
          <Minus className="h-4 w-4" />
        </ToolbarButton>
        <Divider />

        <ToolbarButton onClick={() => setShowLinkInput(!showLinkInput)} active={editor.isActive('link')} title="Insert Link">
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>

        {/* FIX: keyboard-accessible image upload — label has htmlFor matching input id;
            input uses sr-only (visually hidden but tabbable) instead of hidden (removes from tab order) */}
        <label
          htmlFor="rte-image-upload"
          className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors cursor-pointer"
          title="Insert Image"
          aria-label="Insert Image"
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              document.getElementById('rte-image-upload')?.click();
            }
          }}>
          <Image className="h-4 w-4" aria-hidden="true" />
          <input
            id="rte-image-upload"
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Upload image file"
            onChange={handleImageUpload} />
        </label>
      </div>

      {/* Link Input */}
      {showLinkInput && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 bg-zinc-900">
          <input
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && insertLink()}
            placeholder="https://example.com"
            autoFocus
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-blue-500" />
          <button onClick={insertLink}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors">
            Insert
          </button>
          <button
            onClick={() => { editor.chain().focus().unsetLink().run(); setShowLinkInput(false); }}
            className="px-3 py-1.5 text-zinc-400 hover:text-white text-sm rounded transition-colors">
            Remove
          </button>
        </div>
      )}

      {/* Editor canvas */}
      <div className="relative">
        <EditorContent editor={editor} />
        {isDragging && (
          <div className="absolute inset-0 bg-blue-500/10 flex items-center justify-center pointer-events-none">
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-6 py-4 text-center">
              <p className="text-white font-medium">Drop image here</p>
            </div>
          </div>
        )}
      </div>

      {/* Word + char count footer */}
      <div className="flex items-center justify-end px-4 py-2 border-t border-zinc-800 bg-zinc-900/30">
        <span className="text-xs text-zinc-600">
          {words.toLocaleString()} words · {chars.toLocaleString()} characters
        </span>
      </div>
    </div>
  );
}
