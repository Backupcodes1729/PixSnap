
"use client";

import Image from 'next/image';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
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

export default function PreviewCapturePage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [settings, setSettings] = useState<PixsnapSettings | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  
  const [isLoadingSettings, setIsLoadingSettings] = useState<boolean>(true);
  const [isLoadingCamera, setIsLoadingCamera] = useState<boolean>(true); // Start true
  const [isCapturingPhoto, setIsCapturingPhoto] = useState<boolean>(false);
  const [isPreviewing, setIsPreviewing] = useState<boolean>(false);

  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState<number>(0);

  useEffect(() => {
    setIsLoadingSettings(true);
    try {
      const widthStr = searchParams.get('width');
      const heightStr = searchParams.get('height');
      const formatStr = searchParams.get('format');
      const aspectRatioKeyStr = searchParams.get('aspectRatioKey');
      const targetFileSizeKBStr = searchParams.get('targetFileSizeKB');

      if (widthStr && heightStr && formatStr && aspectRatioKeyStr && targetFileSizeKBStr) {
        const parsedSettings: PixsnapSettings = {
          width: parseInt(widthStr, 10),
          height: parseInt(heightStr, 10),
          format: formatStr as OutputFormat,
          aspectRatioKey: aspectRatioKeyStr,
          targetFileSizeKB: parseInt(targetFileSizeKBStr, 10),
        };

        if (isNaN(parsedSettings.width) || isNaN(parsedSettings.height) || isNaN(parsedSettings.targetFileSizeKB)) {
          throw new Error("Invalid number format in URL parameters.");
        }
        const validFormats: OutputFormat[] = ['png', 'jpeg', 'webp'];
        if (!validFormats.includes(parsedSettings.format)) {
            throw new Error("Invalid format in URL parameters.");
        }
        setSettings(parsedSettings);
      } else {
        setSettings(null);
        setWebcamError("Capture settings not found or incomplete in URL. Please configure them on the main page and try again.");
        toast({ title: 'Settings Error', description: 'Incomplete settings provided via URL.', variant: 'destructive' });
      }
    } catch (e: any) {
      console.error("Error parsing settings from URL:", e);
      setSettings(null);
      setWebcamError(`Error loading settings: ${e.message}. Please close this window, reconfigure on the main page, and try again.`);
      toast({ title: 'Settings Error', description: `Invalid settings format: ${e.message}`, variant: 'destructive' });
    }
    setIsLoadingSettings(false);
  }, [searchParams, toast]);

  const initializeCamera = useCallback(async () => {
    if (!settings) return; 

    setIsLoadingCamera(true);
    setWebcamError(null);
    setHasCameraPermission(null); 
    setIsPreviewing(false); 
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
        }
      };

      const newMediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      activeStream = newMediaStream;
      setStream(newMediaStream);
      setHasCameraPermission(true);

      if (videoRef.current) {
        videoRef.current.srcObject = newMediaStream;
        setIsLoadingCamera(false); // Set loading false once stream object is assigned

        videoRef.current.onloadedmetadata = () => {
           // console.log("Video metadata loaded");
           // Can be used for other checks if needed, like video dimensions
        };
        videoRef.current.onerror = () => {
            console.error('Video element error');
            setWebcamError('Error with video stream playback.');
            if (isLoadingCamera) setIsLoadingCamera(false);
            setHasCameraPermission(false);
            if (activeStream) {
                activeStream.getTracks().forEach(track => track.stop());
            }
            if (videoRef.current && videoRef.current.srcObject === activeStream) {
                  videoRef.current.srcObject = null;
            }
            setStream(s => s === activeStream ? null : s);
        };
      } else {
        setIsLoadingCamera(false); // Fallback if ref is not available
      }
    } catch (err: any) {
      console.error("Error accessing webcam:", err);
      setHasCameraPermission(false);
      let description = 'Could not access webcam. Please ensure permissions are granted.';
      if (err.name === "NotAllowedError") description = "Camera access was denied. Please enable camera permissions in your browser settings.";
      else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") description = "No camera found on this device.";
      else if (err.name === "NotReadableError" || err.name === "TrackStartError") description = "Camera is currently in use by another application or a hardware error occurred.";
      setWebcamError(description);
      setIsLoadingCamera(false);
      setStream(null);
    }
  }, [settings, currentCameraIndex]); // Removed toast from deps, it should be stable

  useEffect(() => {
    if (!isLoadingSettings && settings && !isPreviewing) { 
      initializeCamera();
    }
    
    return () => { 
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
  }, [isLoadingSettings, settings, initializeCamera]); // initializeCamera handles currentCameraIndex internally

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
            toast({ title: 'File Size Note', description: `PNG size: ${(currentSize / 1024).toFixed(1)} KB. Target size affects JPEG/WEBP quality.`, duration: 5000 });
        }
    }
    
    setImageDataUrl(tempImageUrl);
    setIsPreviewing(true);
    setIsCapturingPhoto(false);

    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null); 
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
    // setCurrentCameraIndex(prev => prev); // This line might be redundant if initializeCamera is called directly
    if (settings) { 
        initializeCamera(); // Re-initialize camera with current settings (and currentCameraIndex)
    }
  };

  const handleSwitchCamera = () => {
    if (availableCameras.length > 1) {
      setCurrentCameraIndex((prevIndex) => (prevIndex + 1) % availableCameras.length);
      // initializeCamera will be called by the useEffect that depends on currentCameraIndex via initializeCamera's deps
    }
  };

  const handleClose = () => {
    if (window.opener) {
      window.close();
    } else {
      // Fallback for windows not opened by script, e.g. direct navigation
      window.location.assign('/'); // Or some other appropriate fallback
      toast({ title: 'Closing Window', description: 'Attempting to close. If this fails, please close the tab manually.', variant: 'default' });
    }
  };
  
  useEffect(() => {
    // This effect now specifically re-initializes camera when currentCameraIndex changes
    // and settings are loaded and not previewing.
    if (!isLoadingSettings && settings && !isPreviewing) {
      initializeCamera();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCameraIndex]); // Removed initializeCamera from here to avoid potential loops, initializeCamera deps handle settings


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
    <div className="flex flex-col items-stretch justify-between min-h-screen bg-black text-white overflow-hidden">
      <div className="absolute top-2 right-2 md:top-4 md:right-4 z-50">
        <Button onClick={handleClose} variant="ghost" size="icon" className="text-white hover:bg-white/20 rounded-full p-2">
          <XCircle size={28} />
          <span className="sr-only">Close Preview</span>
        </Button>
      </div>

      <div className="flex-grow flex items-center justify-center p-0 md:p-4 overflow-hidden relative">
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
                "object-contain w-full h-full rounded-none md:rounded-lg shadow-2xl",
                { 'opacity-100': stream && hasCameraPermission && !isLoadingCamera && !webcamError },
                { 'opacity-0': isLoadingCamera || webcamError || !stream || hasCameraPermission !== true }
              )}
            />
            <canvas ref={canvasRef} className="hidden"></canvas>
            
            {(isLoadingCamera || (isCapturingPhoto && !webcamError)) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black/80 z-10">
                  <Loader2 size={48} className="animate-spin mb-2"/>
                  <p>{isCapturingPhoto ? 'Processing Image...' : 'Initializing Webcam...'}</p>
              </div>
            )}

            {!isLoadingCamera && !isCapturingPhoto && (hasCameraPermission === false || webcamError) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-destructive p-4 text-center z-10">
                <VideoOff size={48} className="mb-2"/>
                <p className="font-semibold">Webcam Error</p>
                <p className="text-sm">{webcamError || "Camera access denied or unavailable."}</p>
                 {hasCameraPermission === false && !webcamError?.includes("denied") && ( 
                    <Alert variant="destructive" className="mt-4 max-w-md bg-destructive/20 border-destructive/50 text-destructive-foreground">
                        <AlertTitle>Camera Access Problem</AlertTitle>
                        <AlertDescription>
                           {webcamError || "Please ensure camera permissions are enabled and no other app is using the camera."}
                        </AlertDescription>
                    </Alert>
                 )}
              </div>
            )}
             {!isLoadingCamera && !isCapturingPhoto && !webcamError && hasCameraPermission === null && (
                 <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-white p-4 z-10 text-center">
                    <CameraIcon size={48} className="mb-2"/>
                    <p>Waiting for camera permission...</p>
                    <p className="text-xs mt-1">If prompted, please allow camera access.</p>
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
              className="object-contain rounded-none md:rounded-lg shadow-2xl"
              style={{maxWidth: '100%', maxHeight: 'calc(100vh - 0px)'}} 
              data-ai-hint="user capture preview"
              priority 
            />
        )}
      </div>

      {/* Floating Action Buttons Container */}
      <div className="absolute bottom-6 md:bottom-10 inset-x-0 z-40 flex items-center justify-center px-4">
        <div className="relative flex items-center justify-center bg-black/50 backdrop-blur-md p-2 md:p-3 rounded-2xl shadow-xl space-x-2 md:space-x-3">
          {!isPreviewing && stream && hasCameraPermission === true && !webcamError && !isLoadingCamera && (
            <>
              {availableCameras.length > 1 && (
                <Button
                  onClick={handleSwitchCamera}
                  variant="ghost"
                  size="icon" 
                  className="text-white hover:bg-white/20 w-12 h-12 md:w-14 md:h-14"
                  disabled={isCapturingPhoto}
                  aria-label="Switch Camera"
                >
                  <SwitchCamera size={22} />
                </Button>
              )}

              <Button
                onClick={handleCapture}
                variant="default"
                size="icon" 
                className="bg-accent hover:bg-accent/90 text-accent-foreground rounded-full w-16 h-16 md:w-20 md:h-20 p-0 flex items-center justify-center shadow-lg"
                disabled={isCapturingPhoto}
                aria-label="Capture Photo"
              >
                {isCapturingPhoto ? (
                  <Loader2 className="h-7 w-7 md:h-8 md:h-8 animate-spin" />
                ) : (
                  <CameraIcon className="h-7 w-7 md:h-8 md:h-8" />
                )}
              </Button>
              
              {availableCameras.length > 1 && ( /* Invisible spacer for symmetry if switch camera is present */
                <div className="w-12 h-12 md:w-14 md:h-14 flex-shrink-0"></div>
              )}
               {availableCameras.length <= 1 && ( /* Spacers if capture is only button to center it more effectively */
                <>
                 <div className="w-12 h-12 md:w-14 md:h-14 flex-shrink-0 opacity-0 pointer-events-none"></div>
                 <div className="w-12 h-12 md:w-14 md:h-14 flex-shrink-0 opacity-0 pointer-events-none"></div>
                </>
              )}
            </>
          )}

          {isPreviewing && imageDataUrl && (
            <>
              <Button onClick={handleRetake} variant="outline" className="text-sm md:text-base px-4 py-2 bg-white/20 hover:bg-white/30 border-white/40 text-white rounded-full">
                <RefreshCw className="mr-2 h-4 w-4" /> Retake
              </Button>
              <Button onClick={handleDownload} className="text-base md:text-base px-4 py-2 bg-accent hover:bg-accent/90 text-accent-foreground rounded-full">
                <Download className="mr-2 h-5 w-5" /> Download
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
    
