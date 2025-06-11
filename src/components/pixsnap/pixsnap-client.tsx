
"use client";

import Image from 'next/image';
import type { ChangeEvent } from 'react';
import { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Camera, Download, Settings2, Image as ImageIcon, VideoOff, Loader2, FileSliders } from 'lucide-react';

const RESOLUTION_PRESETS: Record<string, { width: number; height: number }> = {
  low: { width: 640, height: 480 },
  medium: { width: 1280, height: 720 },
  high: { width: 1920, height: 1080 },
};

type OutputFormat = 'png' | 'jpeg' | 'webp';

export default function PixsnapClient() {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [selectedResolution, setSelectedResolution] = useState<string>('medium');
  const [customWidth, setCustomWidth] = useState<number>(RESOLUTION_PRESETS.medium.width);
  const [customHeight, setCustomHeight] = useState<number>(RESOLUTION_PRESETS.medium.height);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('png');
  const [targetFileSizeKB, setTargetFileSizeKB] = useState<number>(0); // 0 for no limit
  
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true); // Start true for initial webcam setup

  const currentDimensions = useMemo(() => {
    if (selectedResolution === 'custom') {
      return { width: Math.max(1, customWidth), height: Math.max(1, customHeight) };
    }
    return RESOLUTION_PRESETS[selectedResolution] || RESOLUTION_PRESETS.medium;
  }, [selectedResolution, customWidth, customHeight]);

  useEffect(() => {
    if (selectedResolution !== 'custom' && RESOLUTION_PRESETS[selectedResolution]) {
      setCustomWidth(RESOLUTION_PRESETS[selectedResolution].width);
      setCustomHeight(RESOLUTION_PRESETS[selectedResolution].height);
    }
  }, [selectedResolution]);

  useEffect(() => {
    async function setupWebcam() {
      setIsLoading(true);
      setWebcamError(null);
      try {
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
        const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
        setStream(newStream);
        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
        }
      } catch (err) {
        console.error("Error accessing webcam:", err);
        setWebcamError('Failed to access webcam. Please check permissions and try again.');
        toast({
          title: 'Webcam Error',
          description: 'Could not access webcam. Please ensure permissions are granted.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    }
    setupWebcam();
    return () => {
      stream?.getTracks().forEach(track => track.stop());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getEstimatedByteSize = (dataUri: string): number => {
    if (!dataUri.includes(',')) return 0;
    const base64 = dataUri.substring(dataUri.indexOf(',') + 1);
    const paddingMatch = base64.match(/(=*)$/);
    const padding = paddingMatch ? paddingMatch[1].length : 0;
    return (base64.length * 3/4) - padding;
  };

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current || !stream) {
      toast({ title: 'Error', description: 'Webcam not ready.', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = currentDimensions.width;
    canvas.height = currentDimensions.height;
    
    const context = canvas.getContext('2d');
    if (!context) {
      toast({ title: 'Error', description: 'Could not get canvas context.', variant: 'destructive' });
      setIsLoading(false);
      return;
    }
    
    // Flip the image horizontally for a mirror effect if desired
    // context.translate(canvas.width, 0);
    // context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    // context.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
    
    let imageMimeType: string;
    let initialQuality: number | undefined = undefined;

    switch (outputFormat) {
      case 'jpeg':
        imageMimeType = 'image/jpeg';
        initialQuality = 0.92; // Slightly lower default for better size control
        break;
      case 'webp':
        imageMimeType = 'image/webp';
        initialQuality = 0.90; 
        break;
      case 'png':
      default:
        imageMimeType = 'image/png';
        break;
    }
    
    let imageUrl = canvas.toDataURL(imageMimeType, initialQuality);
    let finalQuality = initialQuality;

    if ((outputFormat === 'jpeg' || outputFormat === 'webp') && targetFileSizeKB > 0 && initialQuality !== undefined) {
      let currentQuality = initialQuality;
      const targetSizeBytes = targetFileSizeKB * 1024;
      const minQuality = 0.1;
      const qualityStep = 0.05; // Finer steps for adjustment
      let attempts = 0;
      const maxAttempts = Math.ceil((currentQuality - minQuality) / qualityStep) + 2; // Max attempts based on steps

      let currentSize = getEstimatedByteSize(imageUrl);

      while (currentSize > targetSizeBytes && currentQuality > minQuality && attempts < maxAttempts) {
        currentQuality -= qualityStep;
        if (currentQuality < minQuality) currentQuality = minQuality;
        
        const tempImgUrl = canvas.toDataURL(imageMimeType, currentQuality);
        const tempSize = getEstimatedByteSize(tempImgUrl);

        // Only update if the new size is smaller, to avoid issues with quality/size non-linearity at very low qualities
        if (tempSize < currentSize || currentSize > targetSizeBytes) {
             imageUrl = tempImgUrl;
             currentSize = tempSize;
             finalQuality = currentQuality;
        } else if (tempSize > currentSize && currentSize <= targetSizeBytes) {
            // If reducing quality made it larger but we were already under target, stop.
            break;
        }
        
        attempts++;
        if (currentQuality === minQuality && currentSize > targetSizeBytes) break; 
      }

      if (currentSize > targetSizeBytes) {
        toast({
          title: 'File Size Warning',
          description: `Could not meet target file size of ${targetFileSizeKB} KB. Actual size: ${(currentSize / 1024).toFixed(1)} KB at quality ${(finalQuality!*100).toFixed(0)}%. Try reducing dimensions or increasing target size.`,
          duration: 5000,
        });
      } else if (finalQuality !== initialQuality) {
         toast({
          title: 'File Size Optimized',
          description: `Image size is ${(currentSize / 1024).toFixed(1)} KB at quality ${(finalQuality!*100).toFixed(0)}%.`,
          duration: 3000,
        });
      }
    } else if (outputFormat === 'png' && targetFileSizeKB > 0) {
        const currentSize = getEstimatedByteSize(imageUrl);
         if (currentSize > targetFileSizeKB * 1024) {
            toast({
              title: 'File Size Note',
              description: `PNG size is ${(currentSize / 1024).toFixed(1)} KB. For smaller PNGs, reduce dimensions. File size target applies best to JPEG/WEBP.`,
              duration: 5000,
            });
        }
    }

    setCapturedImage(imageUrl);
    setIsLoading(false);
    toast({ title: 'Image Captured!', description: 'Your image is ready for download.' });
  };

  const handleDownload = () => {
    if (!capturedImage) {
      toast({ title: 'Error', description: 'No image captured to download.', variant: 'destructive' });
      return;
    }
    const link = document.createElement('a');
    link.href = capturedImage;
    link.download = `pixsnap_image_${currentDimensions.width}x${currentDimensions.height}.${outputFormat}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: 'Download Started', description: `Image saved as ${link.download}` });
  };

  const handleRetake = () => {
    setCapturedImage(null);
  };
  
  const handleWidthChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setCustomWidth(isNaN(val) ? 0 : Math.max(1, val));
  }
  
  const handleHeightChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setCustomHeight(isNaN(val) ? 0 : Math.max(1, val));
  }

  const handleFileSizeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setTargetFileSizeKB(isNaN(val) ? 0 : Math.max(0, val));
  };


  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <header className="p-4 border-b">
        <h1 className="text-3xl font-bold text-primary flex items-center gap-2">
           <Camera className="w-8 h-8" /> PixSnap
        </h1>
        <p className="text-sm text-muted-foreground">Capture images with custom dimensions, resolution, and format.</p>
      </header>
      
      <div className="flex flex-col lg:flex-row flex-1">
        <aside className="w-full lg:w-96 p-2 md:p-4 border-b lg:border-b-0 lg:border-r">
          <Card className="shadow-lg rounded-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl font-headline">
                <Settings2 className="w-6 h-6 text-primary" />
                Output Settings
              </CardTitle>
              <CardDescription className="font-body text-xs">
                Configure image dimensions, format, and target file size.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <div>
                <Label htmlFor="resolution" className="text-sm font-medium">Resolution</Label>
                <Select value={selectedResolution} onValueChange={setSelectedResolution} disabled={isLoading}>
                  <SelectTrigger id="resolution" className="mt-1">
                    <SelectValue placeholder="Select resolution" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low (640x480)</SelectItem>
                    <SelectItem value="medium">Medium (1280x720)</SelectItem>
                    <SelectItem value="high">High (1920x1080)</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="format" className="text-sm font-medium">Format</Label>
                <Select value={outputFormat} onValueChange={(value) => setOutputFormat(value as OutputFormat)} disabled={isLoading}>
                  <SelectTrigger id="format" className="mt-1">
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="png">PNG</SelectItem>
                    <SelectItem value="jpeg">JPEG</SelectItem>
                    <SelectItem value="webp">WEBP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className={selectedResolution === 'custom' ? '' : 'opacity-50'}>
                <Label htmlFor="width" className="text-sm font-medium">Width (px)</Label>
                <Input 
                  id="width" 
                  type="number" 
                  value={customWidth}
                  onChange={handleWidthChange}
                  disabled={selectedResolution !== 'custom' || isLoading}
                  className="mt-1"
                  min="1"
                />
              </div>
              <div className={selectedResolution === 'custom' ? '' : 'opacity-50'}>
                <Label htmlFor="height" className="text-sm font-medium">Height (px)</Label>
                <Input 
                  id="height" 
                  type="number" 
                  value={customHeight}
                  onChange={handleHeightChange}
                  disabled={selectedResolution !== 'custom' || isLoading}
                  className="mt-1"
                  min="1"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="fileSize" className="text-sm font-medium">Max File Size (KB)</Label>
                <Input 
                  id="fileSize" 
                  type="number" 
                  value={targetFileSizeKB}
                  onChange={handleFileSizeChange}
                  disabled={isLoading}
                  className="mt-1"
                  min="0"
                  placeholder="0 for no limit"
                />
                {outputFormat === 'png' && targetFileSizeKB > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">PNG size control is limited; use JPEG/WEBP or adjust dimensions for smaller PNGs.</p>
                )}
                 {outputFormat !== 'png' && targetFileSizeKB > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">JPEG/WEBP quality will be adjusted to meet target. Results may vary.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </aside>

        <main className="flex-1 flex flex-col items-center justify-center p-2 md:p-4 space-y-4">
          <div 
            className="w-full max-w-4xl bg-muted rounded-lg shadow-inner overflow-hidden flex items-center justify-center relative"
            style={{ 
              aspectRatio: `${currentDimensions.width > 0 && currentDimensions.height > 0 ? currentDimensions.width : 16}/${currentDimensions.width > 0 && currentDimensions.height > 0 ? currentDimensions.height : 9}`
            }}
          >
            {isLoading && !stream && !capturedImage && (
               <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground bg-muted/50 z-10">
                  <Loader2 size={48} className="animate-spin mb-2"/>
                  <p>Initializing Webcam...</p>
               </div>
            )}
            {webcamError ? (
              <div className="flex flex-col items-center text-destructive p-4 text-center">
                <VideoOff size={48} className="mb-2"/>
                <p className="font-semibold">Webcam Error</p>
                <p className="text-sm">{webcamError}</p>
              </div>
            ) : capturedImage ? (
              <Image 
                src={capturedImage} 
                alt="Captured image" 
                width={currentDimensions.width} 
                height={currentDimensions.height} 
                className="object-contain w-full h-full"
                data-ai-hint="user capture"
                priority
              />
            ) : stream ? (
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="object-contain w-full h-full"
                width={currentDimensions.width}
                height={currentDimensions.height}
              />
            ) : (
              <div className="flex flex-col items-center text-muted-foreground p-4">
                  <ImageIcon size={48} className="mb-2"/>
                  <p>Webcam feed will appear here</p>
              </div>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden"></canvas>
          
          <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-3 sm:gap-4 w-full max-w-md">
            {!capturedImage ? (
              <Button 
                onClick={handleCapture} 
                disabled={!stream || isLoading || !!webcamError} 
                className="bg-accent hover:bg-accent/90 text-accent-foreground px-6 py-3 sm:px-8 sm:py-6 text-base sm:text-lg rounded-lg shadow-md w-full sm:w-auto flex-1 sm:flex-none"
                aria-label="Capture image"
              >
                {isLoading && stream && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                <Camera className="mr-2 h-5 w-5" /> Capture
              </Button>
            ) : (
              <>
                <Button 
                  onClick={handleRetake} 
                  variant="outline"
                  disabled={isLoading}
                  className="px-6 py-3 sm:px-8 sm:py-6 text-base sm:text-lg rounded-lg shadow-md w-full sm:w-auto flex-1"
                  aria-label="Retake image"
                >
                  {isLoading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                  Retake
                </Button>
                <Button 
                  onClick={handleDownload} 
                  disabled={isLoading}
                  className="bg-accent hover:bg-accent/90 text-accent-foreground px-6 py-3 sm:px-8 sm:py-6 text-base sm:text-lg rounded-lg shadow-md w-full sm:w-auto flex-1"
                  aria-label="Download image"
                >
                  {isLoading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                  <Download className="mr-2 h-5 w-5" /> Download
                </Button>
              </>
            )}
          </div>
        </main>
      </div>
      <footer className="text-center p-4 text-sm text-muted-foreground font-body border-t">
        PixSnap &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}

    