"use client";

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { PDFDocument } from 'pdf-lib';
import { Loader2, FileIcon, X, Download, Eye, FileText, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface PDFFile {
  id: string;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getDefaultFileName(): string {
  const date = new Date();
  return `merged_${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

interface SortableFileItemProps {
  file: PDFFile;
  onRemove: () => void;
  onPreview: () => void;
}

function SortableFileItem({ file, onRemove, onPreview }: SortableFileItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: file.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : 0,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
        isDragging ? 'shadow-lg' : ''
      }`}
    >
      <div className="flex items-center space-x-4 flex-1">
        <button
          className="cursor-grab active:cursor-grabbing touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-5 w-5 text-gray-400" />
        </button>
        <FileIcon className="h-8 w-8 text-blue-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {file.name}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {formatFileSize(file.size)}
          </p>
        </div>
      </div>
      <div className="flex space-x-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onPreview}
          className="flex items-center space-x-1"
        >
          <Eye className="h-4 w-4" />
          <span>Preview</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function PDFMerger() {
  const [files, setFiles] = useState<PDFFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState(getDefaultFileName());
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const pdfFiles = acceptedFiles.filter(file => file.type === 'application/pdf');
    if (pdfFiles.length !== acceptedFiles.length) {
      toast({
        title: "Invalid files",
        description: "Please upload PDF files only",
        variant: "destructive"
      });
      return;
    }
    
    const newFiles = pdfFiles.map(file => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
      arrayBuffer: () => file.arrayBuffer(),
    }));
    
    setFiles(prevFiles => [...prevFiles, ...newFiles]);
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    noClick: true,
    noKeyboard: false,
  });

  const removeFile = (id: string) => {
    setFiles(files => files.filter(file => file.id !== id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      setFiles((files) => {
        const oldIndex = files.findIndex((file) => file.id === active.id);
        const newIndex = files.findIndex((file) => file.id === over.id);
        return arrayMove(files, oldIndex, newIndex);
      });
    }
  };

  const mergePDFs = async () => {
    if (files.length < 2) {
      toast({
        title: "Not enough files",
        description: "Please add at least 2 PDF files to merge",
        variant: "destructive"
      });
      return;
    }

    try {
      setLoading(true);
      const mergedPdf = await PDFDocument.create();

      for (const file of files) {
        const fileBuffer = await file.arrayBuffer();
        const pdf = await PDFDocument.load(fileBuffer);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => {
          mergedPdf.addPage(page);
        });
      }

      const mergedPdfFile = await mergedPdf.save();
      const blob = new Blob([mergedPdfFile], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName.trim() || getDefaultFileName()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Success!",
        description: "PDFs merged successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to merge PDFs. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const previewFile = (file: PDFFile) => {
    const reader = new FileReader();
    file.arrayBuffer().then(buffer => {
      const blob = new Blob([buffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div {...getRootProps()} className="min-h-screen relative">
      <input {...getInputProps()} />
      
      {/* Overlay when dragging */}
      {isDragActive && (
        <div className="fixed inset-0 bg-primary/10 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-background p-8 rounded-lg shadow-lg text-center">
            <FileText className="mx-auto h-16 w-16 text-primary animate-bounce" />
            <p className="mt-4 text-xl font-semibold text-primary">
              Drop your PDF files here
            </p>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              PDF Merger
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              Drag and drop PDF files anywhere on the page, or click below to select files.
            </p>
          </div>

          <Card
            onClick={open}
            className="p-8 border-dashed cursor-pointer transition-colors mb-6 hover:border-primary hover:bg-primary/5"
          >
            <div className="text-center">
              <FileText className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                Click to select PDF files
              </p>
            </div>
          </Card>

          {files.length > 0 && (
            <>
              <Card className="p-4 mb-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="fileName">Output File Name</Label>
                    <div className="flex items-center space-x-2 mt-1.5">
                      <Input
                        id="fileName"
                        value={fileName}
                        onChange={(e) => setFileName(e.target.value)}
                        placeholder="Enter file name (optional)"
                        className="flex-1"
                      />
                      <span className="text-sm text-muted-foreground">.pdf</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1.5">
                      Leave empty to use the default name: {getDefaultFileName()}.pdf
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Selected Files ({files.length})
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Drag files to reorder them. The PDFs will be merged in this order.
                  </p>
                </div>
                <ScrollArea className="h-[300px] w-full rounded-md border p-4">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={files}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-4">
                        {files.map((file) => (
                          <SortableFileItem
                            key={file.id}
                            file={file}
                            onRemove={() => removeFile(file.id)}
                            onPreview={() => previewFile(file)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </ScrollArea>
              </Card>
            </>
          )}

          <div className="flex justify-center mt-6">
            <Button
              onClick={mergePDFs}
              disabled={loading || files.length < 2}
              className="w-full sm:w-auto"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Merging PDFs...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-5 w-5" />
                  Merge and Download
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}