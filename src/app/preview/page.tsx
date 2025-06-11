
"use client";

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, RefreshCw, XCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const PREVIEW_IMAGE_STORAGE_KEY = 'pixsnapCapturedImage';
const PREVIEW_DIMENSIONS_STORAGE_KEY = 'pixsnapCapturedDimensions';
const PREVIEW_FORMAT_STORAGE_KEY = 'pixsnapCapturedFormat';

export default function PreviewPage() {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{width: number, height: number} | null>(null);
  const [format, setFormat] = useState<string>('png');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const { toast } = useToast();

  useEffect(() => {
    const dataUrl = sessionStorage.getItem(PREVIEW_IMAGE_STORAGE_KEY);
    const dimsString = sessionStorage.getItem(PREVIEW_DIMENSIONS_STORAGE_KEY);
    const fmt = sessionStorage.getItem(PREVIEW_FORMAT_STORAGE_KEY);

    if (dataUrl && dimsString && fmt) {
      setImageDataUrl(dataUrl);
      try {
        const parsedDims = JSON.parse(dimsString);
        if (typeof parsedDims.width === 'number' && typeof parsedDims.height === 'number') {
            setDimensions(parsedDims);
        } else {
            throw new Error("Invalid dimensions format");
        }
      } catch (e) {
        console.error("Error parsing dimensions from session storage", e);
        toast({ title: 'Preview Error', description: 'Could not load image dimensions. Please try capturing again.', variant: 'destructive' });
        setDimensions({width: 640, height:480}); // Fallback dimensions
      }
      setFormat(fmt);

      sessionStorage.removeItem(PREVIEW_IMAGE_STORAGE_KEY);
      sessionStorage.removeItem(PREVIEW_DIMENSIONS_STORAGE_KEY);
      sessionStorage.removeItem(PREVIEW_FORMAT_STORAGE_KEY);
    } else {
      toast({ title: 'Preview Error', description: 'No image data found. Please return to the app and capture an image.', variant: 'destructive' });
      // Don't close automatically, let user see the message.
    }
    setIsLoading(false);
  }, [toast]);

  const handleDownload = () => {
    if (!imageDataUrl || !dimensions) {
        toast({ title: 'Download Error', description: 'Image data not available for download.', variant: 'destructive' });
        return;
    }
    const link = document.createElement('a');
    link.href = imageDataUrl;
    link.download = `pixsnap_image_${dimensions.width}x${dimensions.height}.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: 'Download Started', description: `Image saved as ${link.download}` });
  };

  const handleRetake = () => {
    if (window.opener && !window.opener.closed) {
      try {
         window.opener.postMessage({ type: 'pixsnap-retake-requested' }, '*');
      } catch (e) {
        console.warn("Could not post message to opener window. It might have navigated away or closed.", e);
      }
    }
    window.close();
  };

  const handleClose = () => {
    window.close();
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-4">
        <Loader2 size={48} className="animate-spin mb-2"/>
        <p className="text-xl">Loading Preview...</p>
      </div>
    );
  }

  if (!imageDataUrl || !dimensions) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-muted text-foreground p-4 text-center">
        <XCircle size={48} className="mb-4 text-destructive"/>
        <p className="text-xl font-semibold">Preview Unavailable</p>
        <p className="text-md mb-4">Could not load image data. Please close this window and try capturing again from the main application.</p>
        <Button onClick={handleClose} variant="outline" className="mt-4">Close Preview</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-stretch justify-between min-h-screen bg-black text-white">
      <div className="absolute top-2 right-2 md:top-4 md:right-4 z-20">
        <Button onClick={handleClose} variant="ghost" size="icon" className="text-white hover:bg-white/20 rounded-full p-2">
          <XCircle size={28} />
          <span className="sr-only">Close Preview</span>
        </Button>
      </div>

      <div className="flex-grow flex items-center justify-center p-4 overflow-hidden">
         <Image
            src={imageDataUrl}
            alt="Captured preview"
            width={dimensions.width}
            height={dimensions.height}
            className="object-contain rounded-lg shadow-2xl"
            style={{maxWidth: '100%', maxHeight: 'calc(100vh - 100px)'}} // 100px approx for controls area
            data-ai-hint="user capture preview"
            priority
          />
      </div>

      <div className="bg-black/70 p-3 md:p-4 flex justify-center items-center gap-3 md:gap-4 backdrop-blur-sm border-t border-white/20">
        <Button onClick={handleRetake} variant="outline" className="text-base md:text-lg px-4 md:px-6 py-2 md:py-3 bg-white/10 hover:bg-white/20 border-white/30 text-white rounded-lg">
          <RefreshCw className="mr-2 h-5 w-5" /> Retake
        </Button>
        <Button onClick={handleDownload} className="text-base md:text-lg px-4 md:px-6 py-2 md:py-3 bg-accent hover:bg-accent/90 text-accent-foreground rounded-lg">
          <Download className="mr-2 h-5 w-5" /> Download
        </Button>
      </div>
    </div>
  );
}

