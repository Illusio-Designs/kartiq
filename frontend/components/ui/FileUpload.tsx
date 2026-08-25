'use client';

import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { Upload, File, Image as ImageIcon, X, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  label?: string;
  hint?: string;
  accept?: string;
  multiple?: boolean;
  maxSize?: number; // bytes
  onChange?: (files: File[]) => void;
  value?: File[];
  error?: string;
  className?: string;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function FileUpload({
  label, hint, accept, multiple, maxSize = 10 * 1024 * 1024,
  onChange, value = [], error, className,
}: FileUploadProps) {
  const [dragging, setDragging] = useState(false);
  const [internalFiles, setInternalFiles] = useState<File[]>(value);
  const [rejected, setRejected] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  const files = value.length ? value : internalFiles;

  const handleFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const all = Array.from(incoming);
    const accepted = all.filter(f => f.size <= maxSize);
    const tooBig = all.filter(f => f.size > maxSize);
    // Tell the user why a file didn't attach instead of dropping it silently.
    setRejected(
      tooBig.length
        ? `${tooBig.length === 1 ? `“${tooBig[0].name}” is` : `${tooBig.length} files are`} larger than the ${formatSize(maxSize)} limit and ${tooBig.length === 1 ? 'was' : 'were'} not added.`
        : ''
    );
    const next = multiple ? [...files, ...accepted] : accepted.slice(0, 1);
    setInternalFiles(next);
    onChange?.(next);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    if (inputRef.current) inputRef.current.value = '';
  };

  const remove = (index: number) => {
    const next = files.filter((_, i) => i !== index);
    setInternalFiles(next);
    setRejected('');
    onChange?.(next);
  };

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
          {label}
        </label>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'relative cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all',
          dragging
            ? 'border-emerald-400 bg-emerald-50/50 scale-[1.01]'
            : error
            ? 'border-rose-300 bg-rose-50/30'
            : 'border-slate-200 bg-slate-50/30 hover:border-emerald-300 hover:bg-emerald-50/20',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={onInputChange}
          className="sr-only"
        />
        <div className="flex flex-col items-center gap-2">
          <div className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center transition-colors',
            dragging ? 'bg-emerald-100 text-emerald-600' : 'bg-white border border-slate-200 text-slate-500'
          )}>
            <Upload size={18} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">
              {dragging ? 'Drop files here' : (
                <>
                  <span className="text-emerald-600">Click to upload</span> or drag and drop
                </>
              )}
            </p>
            {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
            <p className="text-[10px] text-slate-400 mt-1 font-semibold uppercase tracking-wider">
              Max {formatSize(maxSize)}
            </p>
          </div>
        </div>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="mt-3 space-y-2">
          {files.map((file, i) => {
            const isImage = file.type.startsWith('image/');
            return (
              <div
                key={`${file.name}-${i}`}
                className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl"
              >
                <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  {isImage ? (
                    <ImageIcon size={16} className="text-emerald-600" />
                  ) : (
                    <File size={16} className="text-emerald-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-900 truncate">{file.name}</div>
                  <div className="text-[10px] text-slate-500 font-semibold">
                    {formatSize(file.size)}
                  </div>
                </div>
                <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); remove(i); }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors flex-shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="text-xs text-rose-600 mt-2 font-medium">{error}</p>}
      {!error && rejected && (
        <p className="text-xs text-amber-600 mt-2 font-medium" role="alert">{rejected}</p>
      )}
    </div>
  );
}
