
'use server';
/**
 * @fileOverview A Genkit flow to generate a creative prefix for an image filename.
 *
 * - generateImageName - A function that suggests a creative filename prefix.
 * - GenerateImageNameInput - The input type for the generateImageName function.
 * - GenerateImageNameOutput - The return type for the generateImageName function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateImageNameInputSchema = z.object({
  settings: z.object({
    width: z.number().describe('The width of the image in pixels.'),
    height: z.number().describe('The height of the image in pixels.'),
    format: z.string().describe('The format of the image (e.g., jpeg, png).'),
  }),
  timestamp: z.string().describe('The ISO string of when the image was captured.'),
});
export type GenerateImageNameInput = z.infer<typeof GenerateImageNameInputSchema>;

const GenerateImageNameOutputSchema = z.object({
  suggestedNamePrefix: z
    .string()
    .describe(
      'A short, creative, filesystem-friendly prefix for the image name, using underscores instead of spaces.'
    ),
});
export type GenerateImageNameOutput = z.infer<typeof GenerateImageNameOutputSchema>;

export async function generateImageName(input: GenerateImageNameInput): Promise<GenerateImageNameOutput> {
  return generateImageNameFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateImageNamePrompt',
  input: {schema: GenerateImageNameInputSchema},
  output: {schema: GenerateImageNameOutputSchema},
  prompt: `You are a creative assistant helping name images. Generate a short, creative, and filesystem-friendly prefix for an image. The prefix should be 1 to 3 words long, using underscores instead of spaces.
The image was captured with these settings:
Dimensions: {{settings.width}}x{{settings.height}}
Format: {{settings.format}}
Captured around: {{timestamp}}

Do not include the dimensions or format in your suggested prefix.
Examples of good prefixes: 'VibrantCapture', 'MyGreatShot', 'Quick_Snap', 'ArtisticView', 'PixelPerfect'.
Please provide only the prefix.`,
});

const generateImageNameFlow = ai.defineFlow(
  {
    name: 'generateImageNameFlow',
    inputSchema: GenerateImageNameInputSchema,
    outputSchema: GenerateImageNameOutputSchema,
  },
  async (input) => {
    const {output} = await prompt(input);
    // Ensure the output is not null and adheres to the schema, provide a fallback if needed.
    if (output?.suggestedNamePrefix) {
      // Sanitize to remove any accidental extra characters or ensure filesystem friendliness
      let prefix = output.suggestedNamePrefix.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      if (prefix.length === 0) {
        prefix = 'PixSnap_Image';
      }
      return { suggestedNamePrefix: prefix };
    }
    // Fallback if Gemini returns an unexpected or empty response
    return { suggestedNamePrefix: 'CapturedImage' };
  }
);
