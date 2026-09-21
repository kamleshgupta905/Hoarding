import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { generateVisualLandmarksWithGemini } from '../src/services/geminiService.js';
import fs from 'fs';

async function testLandmarkGeneration() {
  console.log('Testing Visual Landmark Fingerprinting with Gemini 3.6 Flash on real desktop photo...');
  
  const imgPath = 'C:/Users/shri hari computer/OneDrive/Desktop/4fde4f68-8d95-4400-9c7c-80d1299f00c6.jpg';
  if (!fs.existsSync(imgPath)) {
    console.error('File not found:', imgPath);
    process.exit(1);
  }

  const buf = fs.readFileSync(imgPath);
  const base64 = `data:image/jpeg;base64,${buf.toString('base64')}`;

  const siteInfo = {
    'Locality Site Location': 'Modipuram Chauraha',
    Facing: 'Roorkee Road',
    Media: 'Unipole'
  };

  const landmark = await generateVisualLandmarksWithGemini(base64, siteInfo);
  console.log('\n================ GENERATED VISUAL LANDMARK FINGERPRINT ================');
  console.log(landmark);
  console.log('=======================================================================\n');
  process.exit(0);
}

testLandmarkGeneration().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
