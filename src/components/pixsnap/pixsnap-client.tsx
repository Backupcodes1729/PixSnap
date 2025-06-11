
"use client";

import Image from 'next/image';
import type { ChangeEvent } from 'react';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
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
import { Camera, Download, Settings2, Image as ImageIcon, VideoOff, Loader2, SwitchCamera } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const [targetFileSizeKB, setTargetFileSizeKB] = useState<number>(0);
  
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  
  const [isLoading, setIsLoading] = useState<boolean>(true); // For camera init/switching
  const [isCapturingPhoto, setIsCapturingPhoto] = useState<boolean>(false); // For photo capture process

  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState<number>(0);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);


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

  const initializeCamera = useCallback(async () => {
    setIsLoading(true);
    setWebcamError(null);
    setCapturedImage(null); // Clear previous capture when re-initializing
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoCameras = devices.filter(device => device.kind === 'videoinput');
      setAvailableCameras(videoCameras);

      if (videoCameras.length === 0) {
        setWebcamError('No video cameras found on this device.');
        setHasCameraPermission(false);
        toast({ title: 'Camera Error', description: 'No video cameras found.', variant: 'destructive' });
        setIsLoading(false);
        return;
      }
      
      const selectedCameraId = videoCameras[currentCameraIndex % videoCameras.length]?.deviceId;
      const constraints: MediaStreamConstraints = {
        video: selectedCameraId ? { deviceId: { exact: selectedCameraId } } : true,
      };

      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(newStream);
      setHasCameraPermission(true);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        videoRef.current.onloadedmetadata = () => {
          setIsLoading(false);
        };
        videoRef.current.onerror = () => {
            setWebcamError('Error with video stream.');
            setIsLoading(false);
            setHasCameraPermission(false);
        }
      } else {
        setIsLoading(false); 
      }
    } catch (err: any) {
      console.error("Error accessing webcam:", err);
      setHasCameraPermission(false);
      let description = 'Could not access webcam. Please ensure permissions are granted.';
      if (err.name === "NotAllowedError") {
        description = "Camera access was denied. Please enable camera permissions in your browser settings.";
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        description = "No camera was found. Please ensure a camera is connected and enabled.";
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        description = "The camera is currently in use by another application or a hardware error occurred.";
      }  else if (err.name === "OverconstrainedError" || err.name === "ConstraintNotSatisfiedError") {
        description = `The selected camera resolution (${currentDimensions.width}x${currentDimensions.height}) may not be supported. Try a different one.`;
      }
      setWebcamError(description);
      toast({
        title: 'Webcam Error',
        description: description,
        variant: 'destructive',
      });
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCameraIndex, toast]); // currentDimensions removed to avoid re-init on every dimension change, handle resolution issues via OverconstrainedError

  useEffect(() => {
    initializeCamera();
    return () => {
      stream?.getTracks().forEach(track => track.stop());
    };
  }, [initializeCamera]); // initializeCamera is memoized

  const getEstimatedByteSize = (dataUri: string): number => {
    if (!dataUri.includes(',')) return 0;
    const base64 = dataUri.substring(dataUri.indexOf(',') + 1);
    const paddingMatch = base64.match(/(=*)$/);
    const padding = paddingMatch ? paddingMatch[1].length : 0;
    return (base64.length * 3/4) - padding;
  };

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current || !stream || !hasCameraPermission) {
      toast({ title: 'Error', description: 'Webcam not ready or permission denied.', variant: 'destructive' });
      return;
    }
    setIsCapturingPhoto(true);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = currentDimensions.width;
    canvas.height = currentDimensions.height;
    
    const context = canvas.getContext('2d');
    if (!context) {
      toast({ title: 'Error', description: 'Could not get canvas context.', variant: 'destructive' });
      setIsCapturingPhoto(false);
      return;
    }
    
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    let imageMimeType: string;
    let initialQuality: number | undefined = undefined;

    switch (outputFormat) {
      case 'jpeg':
        imageMimeType = 'image/jpeg';
        initialQuality = 0.92; 
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
      const qualityStep = 0.05;
      let attempts = 0;
      const maxAttempts = Math.ceil((currentQuality - minQuality) / qualityStep) + 5;

      let currentSize = getEstimatedByteSize(imageUrl);

      while (currentSize > targetSizeBytes && currentQuality > minQuality && attempts < maxAttempts) {
        currentQuality -= qualityStep;
        if (currentQuality < minQuality) currentQuality = minQuality;
        
        const tempImgUrl = canvas.toDataURL(imageMimeType, currentQuality);
        const tempSize = getEstimatedByteSize(tempImgUrl);

        if (tempSize < currentSize || (tempSize > currentSize && currentSize > targetSizeBytes) ) {
             imageUrl = tempImgUrl;
             currentSize = tempSize;
             finalQuality = currentQuality;
        } else if (tempSize > currentSize && currentSize <= targetSizeBytes) {
            break;
        }
        
        attempts++;
        if (currentQuality <= minQuality && currentSize > targetSizeBytes) break; 
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
    setIsCapturingPhoto(false);
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
    // No need to call initializeCamera here unless settings changed that require it
  };

  const handleSwitchCamera = () => {
    if (availableCameras.length > 1) {
      setCurrentCameraIndex((prevIndex) => (prevIndex + 1) % availableCameras.length);
    }
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

  const isControlDisabled = isLoading || isCapturingPhoto;

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
                <Select value={selectedResolution} onValueChange={setSelectedResolution} disabled={isControlDisabled}>
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
                <Select value={outputFormat} onValueChange={(value) => setOutputFormat(value as OutputFormat)} disabled={isControlDisabled}>
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
                  disabled={selectedResolution !== 'custom' || isControlDisabled}
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
                  disabled={selectedResolution !== 'custom' || isControlDisabled}
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
                  disabled={isControlDisabled}
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
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className={cn(
                "object-contain w-full h-full",
                { 'opacity-0': capturedImage || isLoading || isCapturingPhoto || (webcamError && !stream) || (!stream && !webcamError && hasCameraPermission !== true) }
              )}
              width={currentDimensions.width}
              height={currentDimensions.height}
            />
            
            {capturedImage && !isCapturingPhoto && (
              <Image 
                src={capturedImage} 
                alt="Captured image" 
                width={currentDimensions.width} 
                height={currentDimensions.height} 
                className="absolute inset-0 object-contain w-full h-full z-20"
                data-ai-hint="user capture"
                priority
              />
            )}

            {isLoading && !capturedImage && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground bg-muted/90 z-30">
                  <Loader2 size={48} className="animate-spin mb-2"/>
                  <p>{availableCameras.length > 0 && stream ? 'Switching camera...' : 'Initializing Webcam...'}</p>
              </div>
            )}
            
            {isCapturingPhoto && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground bg-muted/90 z-30">
                  <Loader2 size={48} className="animate-spin mb-2"/>
                  <p>Processing Image...</p>
              </div>
            )}

            {!isLoading && !isCapturingPhoto && webcamError && !capturedImage && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/90 text-destructive p-4 text-center z-10">
                <VideoOff size={48} className="mb-2"/>
                <p className="font-semibold">Webcam Error</p>
                <p className="text-sm">{webcamError}</p>
              </div>
            )}

            {!isLoading && !isCapturingPhoto && !webcamError && !stream && !capturedImage && hasCameraPermission !== true && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/90 text-muted-foreground p-4 z-10">
                    <ImageIcon size={48} className="mb-2"/>
                    <p>Webcam feed will appear here.</p>
                    {hasCameraPermission === false && (
                        <p className="text-sm text-destructive mt-1">Camera access is required. Please check permissions or ensure a camera is connected.</p>
                    )}
                     {hasCameraPermission === null && (
                        <p className="text-sm text-muted-foreground mt-1">Attempting to access camera...</p>
                    )}
                </div>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden"></canvas>
          
          <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-3 sm:gap-4 w-full max-w-md">
            {!capturedImage ? (
              <>
                <Button 
                  onClick={handleCapture} 
                  disabled={!stream || !hasCameraPermission || isControlDisabled || !!webcamError} 
                  className="bg-accent hover:bg-accent/90 text-accent-foreground px-6 py-3 sm:px-8 sm:py-6 text-base sm:text-lg rounded-lg shadow-md w-full sm:w-auto flex-1 sm:flex-none"
                  aria-label="Capture image"
                >
                  {(isLoading || isCapturingPhoto) && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                  <Camera className="mr-2 h-5 w-5" /> Capture
                </Button>
                {availableCameras.length > 1 && (
                  <Button
                    onClick={handleSwitchCamera}
                    variant="outline"
                    disabled={isControlDisabled}
                    className="px-4 py-3 sm:px-6 sm:py-6 text-base rounded-lg shadow-md w-full sm:w-auto"
                    aria-label="Switch camera"
                  >
                    <SwitchCamera className="mr-2 h-5 w-5" /> Switch
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button 
                  onClick={handleRetake} 
                  variant="outline"
                  disabled={isControlDisabled}
                  className="px-6 py-3 sm:px-8 sm:py-6 text-base sm:text-lg rounded-lg shadow-md w-full sm:w-auto flex-1"
                  aria-label="Retake image"
                >
                  {(isLoading || isCapturingPhoto) && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                  Retake
                </Button>
                <Button 
                  onClick={handleDownload} 
                  disabled={isControlDisabled}
                  className="bg-accent hover:bg-accent/90 text-accent-foreground px-6 py-3 sm:px-8 sm:py-6 text-base sm:text-lg rounded-lg shadow-md w-full sm:w-auto flex-1"
                  aria-label="Download image"
                >
                  {(isLoading || isCapturingPhoto) && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
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

    