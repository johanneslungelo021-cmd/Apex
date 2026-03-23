'use client';

/**
 * Creator CMS Editor with TipTap
 *
 * Rich text editor for South African creators.
 * Run: npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-image @tiptap/extension-link @tiptap/extension-placeholder @tiptap/extension-underline @tiptap/extension-text-align @tiptap/extension-code-block
 *
 * @module components/cms/TipTapEditor
 */

import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import CodeBlock from '@tiptap/extension-code-block';

interface ContentMetadata {
  title: string;
  slug: string;
  excerpt: string;
  tags: string[];
  seoTitle: string;
  seoDescription: string;
  coverImageUrl: string;
  contentType: 'article' | 'video' | 'course' | 'template' | 'ebook';
  price: number;
  minTier: 'free' | 'basic' | 'pro' | 'enterprise';
}

interface TipTapEditorProps {
  initialContent?: string;
  initialMetadata?: Partial<ContentMetadata>;
  onSave: (content: string, metadata: ContentMetadata) => Promise<void>;
  onPublish?: (content: string, metadata: ContentMetadata) => Promise<void>;
  autoSaveInterval?: number;
  creatorId: string;
}

const ToolbarButton = ({
  onClick,
  isActive,
  disabled,
  children,
  title,
}: {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`p-2 rounded-lg transition-colors ${
      isActive ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    } disabled:opacity-50 disabled:cursor-not-allowed`}
  >
    {children}
  </button>
);

export default function TipTapEditor({
  initialContent = '',
  initialMetadata = {},
  onSave,
  onPublish,
  autoSaveInterval = 30000,
  creatorId,
}: TipTapEditorProps) {
  const [metadata, setMetadata] = useState<ContentMetadata>({
    title: initialMetadata.title || '',
    slug: initialMetadata.slug || '',
    excerpt: initialMetadata.excerpt || '',
    tags: initialMetadata.tags || [],
    seoTitle: initialMetadata.seoTitle || '',
    seoDescription: initialMetadata.seoDescription || '',
    coverImageUrl: initialMetadata.coverImageUrl || '',
    contentType: initialMetadata.contentType || 'article',
    price: initialMetadata.price || 0,
    minTier: initialMetadata.minTier || 'free',
  });

  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showSeoPanel, setShowSeoPanel] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [readTime, setReadTime] = useState(1);
  const [newTag, setNewTag] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Image.configure({ inline: true, allowBase64: true }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: 'Start writing your content...' }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      CodeBlock.configure({
        HTMLAttributes: { class: 'bg-gray-900 text-gray-100 rounded-lg p-4 font-mono text-sm overflow-x-auto' },
      }),
    ],
    content: initialContent,
    onUpdate: ({ editor }) => {
      const text = editor.getText();
      const words = text.trim().split(/\s+/).filter(Boolean).length;
      setWordCount(words);
      setReadTime(Math.max(1, Math.ceil(words / 200)));
    },
  });

  // Auto-save
  useEffect(() => {
    if (!editor || !autoSaveInterval) return;

    const interval = setInterval(async () => {
      if (editor.isEmpty) return;
      setSaving(true);
      try {
        await onSave(editor.getHTML(), metadata);
        setLastSaved(new Date());
      } catch (error) {
        console.error('Auto-save failed:', error);
      } finally {
        setSaving(false);
      }
    }, autoSaveInterval);

    return () => clearInterval(interval);
  }, [editor, metadata, onSave, autoSaveInterval]);

  // Generate slug from title
  useEffect(() => {
    if (metadata.title && !initialMetadata.slug) {
      const slug = metadata.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      setMetadata((prev) => ({ ...prev, slug }));
    }
  }, [metadata.title, initialMetadata.slug]);

  // Handle image upload
  const handleImageUpload = useCallback(async (file: File) => {
    if (!editor) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Image must be under 2MB for optimal performance');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('creatorId', creatorId);

    try {
      const response = await fetch('/api/cms/media', { method: 'POST', body: formData });
      if (!response.ok) throw new Error('Upload failed');
      const { url } = await response.json();
      editor.chain().focus().setImage({ src: url }).run();
    } catch (error) {
      console.error('Image upload failed:', error);
      alert('Failed to upload image. Please try again.');
    }
  }, [editor, creatorId]);

  // AI content generation
  const generateAIContent = useCallback(async () => {
    if (!editor || !aiPrompt.trim()) return;
    setAiGenerating(true);
    try {
      const response = await fetch('/api/cms/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt, context: editor.getText().slice(-500), contentType: metadata.contentType }),
      });
      if (!response.ok) throw new Error('AI generation failed');
      const { content } = await response.json();
      editor.chain().focus().insertContent(content).run();
      setAiPrompt('');
      setShowAIPanel(false);
    } catch (error) {
      console.error('AI generation failed:', error);
      alert('Failed to generate content. Please try again.');
    } finally {
      setAiGenerating(false);
    }
  }, [editor, aiPrompt, metadata.contentType]);

  // Tag management
  const addTag = useCallback(() => {
    if (newTag.trim() && !metadata.tags.includes(newTag.trim())) {
      setMetadata((prev) => ({ ...prev, tags: [...prev.tags, newTag.trim().toLowerCase()] }));
      setNewTag('');
    }
  }, [newTag, metadata.tags]);

  const removeTag = useCallback((tag: string) => {
    setMetadata((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }));
  }, []);

  // Save & Publish
  const handleSave = async () => {
    if (!editor) return;
    setSaving(true);
    try {
      await onSave(editor.getHTML(), metadata);
      setLastSaved(new Date());
    } catch (error) {
      console.error('Save failed:', error);
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!editor || !onPublish) return;
    setSaving(true);
    try {
      await onPublish(editor.getHTML(), metadata);
    } catch (error) {
      console.error('Publish failed:', error);
    } finally {
      setSaving(false);
    }
  };

  if (!editor) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 space-y-4">
        <input
          type="text"
          value={metadata.title}
          onChange={(e) => setMetadata((prev) => ({ ...prev, title: e.target.value }))}
          placeholder="Enter your content title..."
          className="w-full text-2xl font-bold text-gray-900 placeholder-gray-400 border-0 focus:ring-0 focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-4">
          <select
            value={metadata.contentType}
            onChange={(e) => setMetadata((prev) => ({ ...prev, contentType: e.target.value as ContentMetadata['contentType'] }))}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          >
            <option value="article">Article</option>
            <option value="video">Video</option>
            <option value="course">Course</option>
            <option value="template">Template</option>
            <option value="ebook">Ebook</option>
          </select>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Price (ZAR):</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={metadata.price}
              onChange={(e) => setMetadata((prev) => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
              className="w-24 px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <select
            value={metadata.minTier}
            onChange={(e) => setMetadata((prev) => ({ ...prev, minTier: e.target.value as ContentMetadata['minTier'] }))}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="free">Free (Everyone)</option>
            <option value="basic">Basic Tier</option>
            <option value="pro">Pro Tier</option>
            <option value="enterprise">Enterprise Tier</option>
          </select>
        </div>
        {/* Tags */}
        <div className="flex flex-wrap items-center gap-2">
          {metadata.tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm">
              #{tag}
              <button type="button" onClick={() => removeTag(tag)} className="hover:text-indigo-900">×</button>
            </span>
          ))}
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
            placeholder="Add tag..."
            className="w-24 px-2 py-1 text-sm border border-gray-300 rounded"
          />
          <button type="button" onClick={addTag} className="p-1 text-gray-500 hover:text-indigo-600">+</button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="p-2 border-b border-gray-100 flex flex-wrap items-center gap-1 bg-gray-50">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} title="Bold">
          <span className="font-bold text-sm">B</span>
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} title="Italic">
          <span className="italic text-sm">I</span>
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive('underline')} title="Underline">
          <span className="underline text-sm">U</span>
        </ToolbarButton>
        <div className="w-px h-6 bg-gray-300 mx-1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive('heading', { level: 2 })} title="Heading 2">
          <span className="font-bold text-sm">H2</span>
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} isActive={editor.isActive('heading', { level: 3 })} title="Heading 3">
          <span className="font-bold text-sm">H3</span>
        </ToolbarButton>
        <div className="w-px h-6 bg-gray-300 mx-1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} title="Bullet List">
          <span className="text-lg">•</span>
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} title="Numbered List">
          <span className="text-sm">1.</span>
        </ToolbarButton>
        <div className="w-px h-6 bg-gray-300 mx-1" />
        <ToolbarButton onClick={() => { const url = window.prompt('Enter URL:'); if (url) editor.chain().focus().setLink({ href: url }).run(); }} isActive={editor.isActive('link')} title="Add Link">
          <span className="text-sm">🔗</span>
        </ToolbarButton>
        <ToolbarButton onClick={() => fileInputRef.current?.click()} title="Upload Image">
          <span className="text-sm">🖼️</span>
        </ToolbarButton>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImageUpload(file); }} />
        <div className="w-px h-6 bg-gray-300 mx-1" />
        <ToolbarButton onClick={() => setShowAIPanel(!showAIPanel)} isActive={showAIPanel} title="AI Assistant">
          <span className="text-sm">✨</span>
        </ToolbarButton>
        <ToolbarButton onClick={() => setShowSeoPanel(!showSeoPanel)} isActive={showSeoPanel} title="SEO Settings">
          <span className="text-sm">🔍</span>
        </ToolbarButton>
        <div className="flex-1" />
        <div className="text-sm text-gray-500 flex items-center gap-4">
          <span>{wordCount.toLocaleString()} words</span>
          <span>~{readTime} min read</span>
        </div>
      </div>

      {/* AI Panel */}
      {showAIPanel && (
        <div className="border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-purple-50 p-4">
          <div className="flex gap-3">
            <input
              type="text"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Describe what you want to write..."
              className="flex-1 px-4 py-2 border border-indigo-200 rounded-lg"
            />
            <button
              onClick={generateAIContent}
              disabled={aiGenerating || !aiPrompt.trim()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {aiGenerating ? 'Generating...' : 'Generate'}
            </button>
          </div>
        </div>
      )}

      {/* SEO Panel */}
      {showSeoPanel && (
        <div className="border-b border-gray-100 bg-gray-50 p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SEO Title ({metadata.seoTitle.length}/60)</label>
              <input
                type="text"
                value={metadata.seoTitle}
                onChange={(e) => setMetadata((prev) => ({ ...prev, seoTitle: e.target.value }))}
                placeholder={metadata.title}
                maxLength={60}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
              <input
                type="text"
                value={metadata.slug}
                onChange={(e) => setMetadata((prev) => ({ ...prev, slug: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">SEO Description ({metadata.seoDescription.length}/160)</label>
            <textarea
              value={metadata.seoDescription}
              onChange={(e) => setMetadata((prev) => ({ ...prev, seoDescription: e.target.value }))}
              placeholder="Brief description for search engines..."
              maxLength={160}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cover Image URL</label>
            <input
              type="text"
              value={metadata.coverImageUrl}
              onChange={(e) => setMetadata((prev) => ({ ...prev, coverImageUrl: e.target.value }))}
              placeholder="https://..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>
      )}

      {/* Editor */}
      <div className="prose prose-lg max-w-none p-6 min-h-[400px] focus:outline-none">
        <EditorContent editor={editor} />
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {saving ? 'Saving...' : lastSaved ? `Last saved: ${lastSaved.toLocaleTimeString()}` : 'Not yet saved'}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 disabled:opacity-50">
            Save Draft
          </button>
          {onPublish && (
            <button onClick={handlePublish} disabled={saving || !metadata.title.trim()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              Publish
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
