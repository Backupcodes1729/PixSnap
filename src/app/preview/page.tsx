
"use client";

import Image from 'next/image';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Download, RefreshCw, XCircle, Loader2, Camera as CameraIcon, VideoOff, SwitchCamera } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type OutputFormat = 'png' | 'jpeg' | 'webp';

interface PixsnapSettings {
  aspectRatioKey: string;
  width: number;
  height: number;
  format: OutputFormat;
  targetFileSizeKB: number;
}

const PIXSNAP_SETTINGS_STORAGE_KEY = 'pixsnapSettings';

export default function PreviewCapturePage() {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [settings, setSettings] = useState<PixsnapSettings | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  
  const [isLoadingSettings, setIsLoadingSettings] = useState<boolean>(true);
  const [isLoadingCamera, setIsLoadingCamera] = useState<boolean>(false);
  const [isCapturingPhoto, setIsCapturingPhoto] = useState<boolean>(false);
  const [isPreviewing, setIsPreviewing] = useState<boolean>(false);

  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState<number>(0);

  // Load settings from sessionStorage and initialize camera
  useEffect(() => {
    const settingsString = sessionStorage.getItem(PIXSNAP_SETTINGS_STORAGE_KEY);
    if (settingsString) {
      try {
        const parsedSettings = JSON.parse(settingsString) as PixsnapSettings;
        setSettings(parsedSettings);
      } catch (e) {
        console.error("Error parsing settings:", e);
        setWebcamError("Could not load capture settings. Please close and try again.");
        toast({ title: 'Settings Error', description: 'Invalid settings found.', variant: 'destructive' });
      }
    } else {
      setWebcamError("Capture settings not found. Please configure them on the main page.");
      toast({ title: 'Settings Error', description: 'No settings provided.', variant: 'destructive' });
    }
    setIsLoadingSettings(false);
    // sessionStorage.removeItem(PIXSNAP_SETTINGS_STORAGE_KEY); // Keep for retakes or remove if settings shouldn't persist for retake
  }, [toast]);

  const initializeCamera = useCallback(async () => {
    if (!settings) return; // Wait for settings to load

    setIsLoadingCamera(true);
    setWebcamError(null);
    setHasCameraPermission(null);
    setIsPreviewing(false); // Ensure we are in live feed mode
    setImageDataUrl(null);


    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (videoRef.current && videoRef.current.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
        videoRef.current.srcObject = null;
    }
    
    let activeStream: MediaStream | null = null;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoCameras = devices.filter(device => device.kind === 'videoinput');
      setAvailableCameras(videoCameras);

      if (videoCameras.length === 0) {
        setWebcamError('No video cameras found on this device.');
        setHasCameraPermission(false);
        setIsLoadingCamera(false);
        return;
      }
      
      const selectedCameraId = videoCameras[currentCameraIndex % videoCameras.length]?.deviceId;
      const constraints: MediaStreamConstraints = {
        video: { 
            deviceId: selectedCameraId ? { exact: selectedCameraId } : undefined,
            // Request preferred resolution for the live preview if needed, but capture resolution is handled by canvas
            // width: { ideal: settings.width }, 
            // height: { ideal: settings.height }
        }
      };

      const newMediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      activeStream = newMediaStream;
      setStream(newMediaStream);
      setHasCameraPermission(true);

      if (videoRef.current) {
        videoRef.current.srcObject = newMediaStream;
        videoRef.current.onloadedmetadata = () => setIsLoadingCamera(false);
        videoRef.current.onerror = () => {
            setWebcamError('Error with video stream.');
            setIsLoadingCamera(false);
            setHasCameraPermission(false);
            newMediaStream.getTracks().forEach(track => track.stop());
             if (videoRef.current && videoRef.current.srcObject === newMediaStream) {
                  videoRef.current.srcObject = null;
              }
            setStream(s => s === newMediaStream ? null : s);
        };
      } else {
        setIsLoadingCamera(false);
      }
    } catch (err: any) {
      console.error("Error accessing webcam:", err);
      setHasCameraPermission(false);
      let description = 'Could not access webcam. Please ensure permissions are granted.';
      if (err.name === "NotAllowedError") description = "Camera access was denied. Please enable camera permissions.";
      else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") description = "No camera found.";
      else if (err.name === "NotReadableError" || err.name === "TrackStartError") description = "Camera is in use or hardware error.";
      setWebcamError(description);
      setIsLoadingCamera(false);
      setStream(null);
    }
  }, [settings, currentCameraIndex, stream]); // Add stream as dependency to re-init if it's externally cleared

  useEffect(() => {
    if (!isLoadingSettings && settings && !isPreviewing) { // Only initialize if settings are loaded and not already previewing a captured image
      initializeCamera();
    }
    
    return () => { // Cleanup stream on component unmount
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
       if (videoRef.current && videoRef.current.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingSettings, settings, currentCameraIndex]); // initializeCamera is stable due to useCallback
  // Removed initializeCamera from deps to avoid loop, useEffect for currentCameraIndex handles re-init for switch

  const getEstimatedByteSize = (dataUri: string): number => {
    if (!dataUri.includes(',')) return 0;
    const base64 = dataUri.substring(dataUri.indexOf(',') + 1);
    const paddingMatch = base64.match(/(=*)$/);
    const padding = paddingMatch ? paddingMatch[1].length : 0;
    return (base64.length * 3/4) - padding;
  };

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current || !stream || !hasCameraPermission || !settings) {
      toast({ title: 'Error', description: 'Webcam not ready or settings missing.', variant: 'destructive' });
      return;
    }
    setIsCapturingPhoto(true);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = settings.width;
    canvas.height = settings.height;
    
    const context = canvas.getContext('2d');
    if (!context) {
      toast({ title: 'Error', description: 'Could not get canvas context.', variant: 'destructive' });
      setIsCapturingPhoto(false);
      return;
    }
    
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    let imageMimeType: string;
    let initialQuality: number | undefined = undefined;

    switch (settings.format) {
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
    
    let tempImageUrl = canvas.toDataURL(imageMimeType, initialQuality);
    let finalQuality = initialQuality;

    if ((settings.format === 'jpeg' || settings.format === 'webp') && settings.targetFileSizeKB > 0 && initialQuality !== undefined) {
      let currentQuality = initialQuality;
      const targetSizeBytes = settings.targetFileSizeKB * 1024;
      const minQuality = 0.1;
      const qualityStep = 0.05;
      let attempts = 0;
      const maxAttempts = Math.ceil((currentQuality - minQuality) / qualityStep) + 5;
      let currentSize = getEstimatedByteSize(tempImageUrl);

      while (currentSize > targetSizeBytes && currentQuality > minQuality && attempts < maxAttempts) {
        currentQuality -= qualityStep;
        if (currentQuality < minQuality) currentQuality = minQuality;
        
        const nextImgUrl = canvas.toDataURL(imageMimeType, currentQuality);
        const nextSize = getEstimatedByteSize(nextImgUrl);

        if (nextSize < currentSize || (nextSize > currentSize && currentSize > targetSizeBytes) ) {
             tempImageUrl = nextImgUrl;
             currentSize = nextSize;
             finalQuality = currentQuality;
        } else if (nextSize > currentSize && currentSize <= targetSizeBytes) {
            break;
        }
        attempts++;
        if (currentQuality <= minQuality && currentSize > targetSizeBytes) break; 
      }
      if (currentSize > targetSizeBytes) {
        toast({ title: 'File Size Warning', description: `Could not meet target ${settings.targetFileSizeKB} KB. Actual: ${(currentSize / 1024).toFixed(1)} KB at quality ${(finalQuality!*100).toFixed(0)}%.`, duration: 5000 });
      } else if (finalQuality !== initialQuality) {
         toast({ title: 'File Size Optimized', description: `Image size: ${(currentSize / 1024).toFixed(1)} KB at quality ${(finalQuality!*100).toFixed(0)}%.`, duration: 3000 });
      }
    } else if (settings.format === 'png' && settings.targetFileSizeKB > 0) {
        const currentSize = getEstimatedByteSize(tempImageUrl);
         if (currentSize > settings.targetFileSizeKB * 1024) {
            toast({ title: 'File Size Note', description: `PNG size: ${(currentSize / 1024).toFixed(1)} KB. Target size affects JPEG/WEBP.`, duration: 5000 });
        }
    }
    
    setImageDataUrl(tempImageUrl);
    setIsPreviewing(true);
    setIsCapturingPhoto(false);

    // Stop camera stream after capture
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null); // Clear stream state
    }
    if (videoRef.current && videoRef.current.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
        videoRef.current.srcObject = null;
    }


    toast({ title: 'Image Captured!' });
  };

  const handleDownload = () => {
    if (!imageDataUrl || !settings) {
        toast({ title: 'Download Error', description: 'Image data not available.', variant: 'destructive' });
        return;
    }
    const link = document.createElement('a');
    link.href = imageDataUrl;
    link.download = `pixsnap_image_${settings.width}x${settings.height}.${settings.format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: 'Download Started', description: `Image saved as ${link.download}` });
  };

  const handleRetake = () => {
    setIsPreviewing(false);
    setImageDataUrl(null);
    if (settings) { // Re-initialize camera
        initializeCamera();
    }
  };

  const handleSwitchCamera = () => {
    if (availableCameras.length > 1) {
      setCurrentCameraIndex((prevIndex) => (prevIndex + 1) % availableCameras.length);
      // The useEffect listening to currentCameraIndex will re-initialize the camera.
    }
  };

  const handleClose = () => {
    window.close();
  };

  if (isLoadingSettings) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-4">
        <Loader2 size={48} className="animate-spin mb-2"/>
        <p className="text-xl">Loading Settings...</p>
      </div>
    );
  }

  if (!settings) {
     return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-4 text-center">
        <XCircle size={48} className="mb-4 text-destructive"/>
        <p className="text-xl font-semibold">Error Loading Settings</p>
        <p className="text-md mb-4">{webcamError || "Could not load capture settings. Please close this window and try again from the main application."}</p>
        <Button onClick={handleClose} variant="outline" className="mt-4 bg-white/10 hover:bg-white/20 border-white/30 text-white">Close</Button>
      </div>
    );
  }
  
  const videoAspectRatio = settings.width > 0 && settings.height > 0 ? settings.width / settings.height : 16/9;

  return (
    <div className="flex flex-col items-stretch justify-between min-h-screen bg-black text-white">
      <div className="absolute top-2 right-2 md:top-4 md:right-4 z-20">
        <Button onClick={handleClose} variant="ghost" size="icon" className="text-white hover:bg-white/20 rounded-full p-2">
          <XCircle size={28} />
          <span className="sr-only">Close Preview</span>
        </Button>
      </div>

      <div className="flex-grow flex items-center justify-center p-4 overflow-hidden relative">
        {!isPreviewing && (
          <div 
            className="w-full h-full max-w-full max-h-full bg-black flex items-center justify-center relative"
            style={{ aspectRatio: `${videoAspectRatio}` }}
          >
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className={cn(
                "object-contain w-full h-full rounded-lg shadow-2xl",
                { 'opacity-0': isLoadingCamera || isCapturingPhoto || webcamError || !stream || hasCameraPermission !== true }
              )}
            />
            <canvas ref={canvasRef} className="hidden"></canvas>
            
            {(isLoadingCamera || isCapturingPhoto) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black/70 z-10">
                  <Loader2 size={48} className="animate-spin mb-2"/>
                  <p>{isCapturingPhoto ? 'Processing Image...' : (availableCameras.length > 0 && stream && currentCameraIndex >= 0 ? 'Switching camera...' : 'Initializing Webcam...')}</p>
              </div>
            )}

            {!isLoadingCamera && !isCapturingPhoto && (hasCameraPermission === false || webcamError) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-destructive p-4 text-center z-10">
                <VideoOff size={48} className="mb-2"/>
                <p className="font-semibold">Webcam Error</p>
                <p className="text-sm">{webcamError || "Camera access denied or unavailable."}</p>
                 {hasCameraPermission === false && !webcamError && (
                    <Alert variant="destructive" className="mt-4 max-w-md bg-destructive/20 border-destructive/50 text-destructive-foreground">
                        <AlertTitle>Camera Access Denied</AlertTitle>
                        <AlertDescription>
                            Please enable camera permissions in your browser settings to use this feature.
                        </AlertDescription>
                    </Alert>
                 )}
              </div>
            )}
             {!isLoadingCamera && !isCapturingPhoto && !webcamError && hasCameraPermission === null && (
                 <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-white p-4 z-10 text-center">
                    <CameraIcon size={48} className="mb-2"/>
                    <p>Waiting for camera permission...</p>
                </div>
            )}
          </div>
        )}

        {isPreviewing && imageDataUrl && (
           <Image
              src={imageDataUrl}
              alt="Captured preview"
              width={settings.width}
              height={settings.height}
              className="object-contain rounded-lg shadow-2xl"
              style={{maxWidth: '100%', maxHeight: 'calc(100vh - 100px)'}}
              data-ai-hint="user capture preview"
              priority
            />
        )}
      </div>

      <div className="bg-black/70 p-3 md:p-4 flex justify-center items-center gap-3 md:gap-4 backdrop-blur-sm border-t border-white/20">
        {!isPreviewing && (
          <>
            <Button 
              onClick={handleCapture} 
              disabled={!stream || !hasCameraPermission || isLoadingCamera || isCapturingPhoto || !!webcamError} 
              className="text-base md:text-lg px-4 md:px-6 py-2 md:py-3 bg-accent hover:bg-accent/90 text-accent-foreground rounded-lg flex-1 max-w-xs"
            >
              {isCapturingPhoto ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CameraIcon className="mr-2 h-5 w-5" />}
              Capture
            </Button>
            {availableCameras.length > 1 && (
              <Button
                onClick={handleSwitchCamera}
                variant="outline"
                disabled={isLoadingCamera || isCapturingPhoto || !hasCameraPermission || !!webcamError} 
                className="text-base md:text-lg px-4 md:px-6 py-2 md:py-3 bg-white/10 hover:bg-white/20 border-white/30 text-white rounded-lg"
              >
                <SwitchCamera className="mr-2 h-5 w-5" /> Switch
              </Button>
            )}
          </>
        )}
        {isPreviewing && (
          <>
            <Button onClick={handleRetake} variant="outline" className="text-base md:text-lg px-4 md:px-6 py-2 md:py-3 bg-white/10 hover:bg-white/20 border-white/30 text-white rounded-lg">
              <RefreshCw className="mr-2 h-5 w-5" /> Retake
            </Button>
            <Button onClick={handleDownload} className="text-base md:text-lg px-4 md:px-6 py-2 md:py-3 bg-accent hover:bg-accent/90 text-accent-foreground rounded-lg">
              <Download className="mr-2 h-5 w-5" /> Download
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
