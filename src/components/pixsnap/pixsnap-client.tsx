
"use client";

import type { ChangeEvent } from 'react';
import { useState, useMemo } from 'react';
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
import { Camera, Settings2 } from 'lucide-react';

const ASPECT_RATIOS: Record<string, { ratioWbyH: number | null; label: string }> = {
  '16:9': { ratioWbyH: 16 / 9, label: '16:9 (Landscape Wide)' },
  '9:16': { ratioWbyH: 9 / 16, label: '9:16 (Portrait Tall)' },
  '4:3': { ratioWbyH: 4 / 3, label: '4:3 (Classic Landscape)' },
  '3:4': { ratioWbyH: 3 / 4, label: '3:4 (Classic Portrait)' },
  '1:1': { ratioWbyH: 1 / 1, label: '1:1 (Square)' },
  'custom': { ratioWbyH: null, label: 'Custom Dimensions' },
};
const ASPECT_RATIO_KEYS_ORDERED = ['16:9', '9:16', '4:3', '3:4', '1:1', 'custom'];

type OutputFormat = 'png' | 'jpeg' | 'webp';

const PIXSNAP_SETTINGS_STORAGE_KEY = 'pixsnapSettings';

export default function PixsnapClient() {
  const { toast } = useToast();

  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string>('16:9');
  const [customWidth, setCustomWidth] = useState<number>(1280);
  const [customHeight, setCustomHeight] = useState<number>(720);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('png');
  const [targetFileSizeKB, setTargetFileSizeKB] = useState<number>(0);
  
  const handleAspectRatioChange = (newAspectRatioKey: string) => {
    setSelectedAspectRatio(newAspectRatioKey);
    if (newAspectRatioKey !== 'custom' && ASPECT_RATIOS[newAspectRatioKey]?.ratioWbyH) {
      const ratio = ASPECT_RATIOS[newAspectRatioKey].ratioWbyH!;
      const currentW = Number(customWidth) || 1280;
      setCustomHeight(Math.max(1, Math.round(currentW / ratio)));
    }
  };

  const handleWidthChange = (e: ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const newNumericValue = parseInt(rawValue, 10);
    const newWidthState = isNaN(newNumericValue) ? 1 : Math.max(1, newNumericValue);
    setCustomWidth(newWidthState);

    if (selectedAspectRatio !== 'custom' && ASPECT_RATIOS[selectedAspectRatio]?.ratioWbyH) {
      const ratio = ASPECT_RATIOS[selectedAspectRatio].ratioWbyH!;
      setCustomHeight(Math.max(1, Math.round(newWidthState / ratio)));
    }
  };
  
  const handleHeightChange = (e: ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const newNumericValue = parseInt(rawValue, 10);
    const newHeightState = isNaN(newNumericValue) ? 1 : Math.max(1, newNumericValue);
    setCustomHeight(newHeightState);
    setSelectedAspectRatio('custom'); 
  };
  
  const handleFileSizeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setTargetFileSizeKB(isNaN(val) ? 0 : Math.max(0, val));
  };

  const handleOpenCameraAndCapture = () => {
    const settings = {
      aspectRatioKey: selectedAspectRatio,
      width: customWidth,
      height: customHeight,
      format: outputFormat,
      targetFileSizeKB: targetFileSizeKB,
    };

    try {
      sessionStorage.setItem(PIXSNAP_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
      
      const previewWindow = window.open('/preview', '_blank', 'noopener,noreferrer');
      if (!previewWindow) {
        toast({ title: 'Popup Blocked', description: 'Please allow popups for this site to open the camera.', variant: 'destructive' });
      } else {
        toast({ title: 'Camera Opening...', description: 'Configure capture settings in the new window.'});
      }
    } catch (e) {
      console.error("Error using session storage or opening window:", e);
      toast({ title: 'Error', description: 'Could not open camera. Your browser might be blocking it or session storage is unavailable.', variant: 'destructive' });
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <header className="p-4 border-b">
        <h1 className="text-3xl font-bold text-primary flex items-center gap-2">
           <Camera className="w-8 h-8" /> PixSnap
        </h1>
        <p className="text-sm text-muted-foreground">Configure image settings, then open camera to capture.</p>
      </header>
      
      <div className="flex flex-1 justify-center items-start p-2 md:p-4">
        <div className="w-full max-w-lg space-y-6">
          <Card className="shadow-lg rounded-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl font-headline">
                <Settings2 className="w-6 h-6 text-primary" />
                Image Output Settings
              </CardTitle>
              <CardDescription className="font-body text-xs">
                Configure dimensions, format, and target file size before capturing.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <div>
                <Label htmlFor="aspectRatio" className="text-sm font-medium">Aspect Ratio</Label>
                <Select value={selectedAspectRatio} onValueChange={handleAspectRatioChange}>
                  <SelectTrigger id="aspectRatio" className="mt-1">
                    <SelectValue placeholder="Select aspect ratio" />
                  </SelectTrigger>
                  <SelectContent>
                    {ASPECT_RATIO_KEYS_ORDERED.map((key) => (
                       <SelectItem key={key} value={key}>{ASPECT_RATIOS[key].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="format" className="text-sm font-medium">Format</Label>
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
              <div>
                <Label htmlFor="width" className="text-sm font-medium">Width (px)</Label>
                <Input 
                  id="width" 
                  type="number" 
                  value={customWidth}
                  onChange={handleWidthChange}
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
                  disabled={outputFormat === 'png'}
                  className="mt-1"
                  min="0"
                  placeholder="0 for no limit"
                />
                {outputFormat === 'png' && (
                  <p className="text-xs text-muted-foreground mt-1">PNG size control is limited. Target size has minimal effect for PNGs.</p>
                )}
                 {outputFormat !== 'png' && targetFileSizeKB > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">JPEG/WEBP quality will be adjusted to meet target. Results may vary.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Button 
              onClick={handleOpenCameraAndCapture} 
              className="bg-accent hover:bg-accent/90 text-accent-foreground px-8 py-6 text-lg rounded-lg shadow-md w-full"
              aria-label="Open camera and capture"
            >
              <Camera className="mr-2 h-5 w-5" /> Open Camera & Capture
            </Button>
        </div>
      </div>
      <footer className="text-center p-4 text-sm text-muted-foreground font-body border-t">
        PixSnap &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
