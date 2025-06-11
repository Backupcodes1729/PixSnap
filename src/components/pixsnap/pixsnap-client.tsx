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
import { Camera, Download, Settings2, Image as ImageIcon, VideoOff, Loader2 } from 'lucide-react';

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
  
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

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
  }, []); // Run once on mount

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
    
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    let imageMimeType: string;
    switch (outputFormat) {
      case 'jpeg':
        imageMimeType = 'image/jpeg';
        break;
      case 'webp':
        imageMimeType = 'image/webp';
        break;
      case 'png':
      default:
        imageMimeType = 'image/png';
        break;
    }
    
    const imageUrl = canvas.toDataURL(imageMimeType, outputFormat === 'jpeg' || outputFormat === 'webp' ? 0.9 : undefined);
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
    setCustomWidth(isNaN(val) ? 0 : val);
  }
  
  const handleHeightChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setCustomHeight(isNaN(val) ? 0 : val);
  }

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <Card className="m-2 md:m-4 shadow-lg rounded-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl font-headline">
            <Settings2 className="w-7 h-7 text-primary" />
            PixSnap Settings
          </CardTitle>
          <CardDescription className="font-body">
            Configure your desired image output dimensions, resolution, and format.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div>
            <Label htmlFor="resolution" className="text-sm font-medium">Resolution</Label>
            <Select value={selectedResolution} onValueChange={setSelectedResolution}>
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
          <div>
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
          <div>
            <Label htmlFor="format" className="text-sm font-medium">Output Format</Label>
            <Select value={outputFormat} onValueChange={(value) => setOutputFormat(value as OutputFormat)}>
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
        </CardContent>
      </Card>

      <main className="flex-1 flex flex-col items-center justify-center p-2 md:p-4 space-y-4">
        <div 
          className="w-full max-w-4xl bg-muted rounded-lg shadow-inner overflow-hidden flex items-center justify-center"
          style={{ aspectRatio: `${currentDimensions.width}/${currentDimensions.height}`}}
        >
          {webcamError ? (
            <div className="flex flex-col items-center text-destructive p-4">
              <VideoOff size={64} className="mb-2"/>
              <p className="text-center font-semibold">{webcamError}</p>
            </div>
          ) : capturedImage ? (
            <Image 
              src={capturedImage} 
              alt="Captured" 
              width={currentDimensions.width} 
              height={currentDimensions.height} 
              className="object-contain w-full h-full"
              data-ai-hint="user capture"
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
                {isLoading ? <Loader2 size={64} className="animate-spin mb-2"/> : <ImageIcon size={64} className="mb-2"/>}
                <p>{isLoading ? "Initializing Webcam..." : "Webcam starting or no image captured."}</p>
             </div>
          )}
        </div>
        <canvas ref={canvasRef} className="hidden"></canvas>
        
        <div className="flex flex-wrap justify-center gap-4">
          {!capturedImage ? (
            <Button 
              onClick={handleCapture} 
              disabled={!stream || isLoading || !!webcamError} 
              className="bg-accent hover:bg-accent/90 text-accent-foreground px-8 py-6 text-lg rounded-lg shadow-md"
              aria-label="Capture image"
            >
              {isLoading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
              <Camera className="mr-2 h-5 w-5" /> Capture
            </Button>
          ) : (
            <>
              <Button 
                onClick={handleRetake} 
                variant="outline"
                disabled={isLoading}
                className="px-8 py-6 text-lg rounded-lg shadow-md"
                aria-label="Retake image"
              >
                {isLoading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                Retake
              </Button>
              <Button 
                onClick={handleDownload} 
                disabled={isLoading}
                className="bg-accent hover:bg-accent/90 text-accent-foreground px-8 py-6 text-lg rounded-lg shadow-md"
                aria-label="Download image"
              >
                {isLoading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                <Download className="mr-2 h-5 w-5" /> Download
              </Button>
            </>
          )}
        </div>
      </main>
      <footer className="text-center p-4 text-sm text-muted-foreground font-body">
        PixSnap &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
