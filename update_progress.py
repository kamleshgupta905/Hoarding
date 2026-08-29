import re

with open('src/core/pptxEngine.js', 'r') as f:
    content = f.read()

target = """  const AI_BATCH_SIZE = 3;
  for (let i = 0; i < slides.length; i += AI_BATCH_SIZE) {
    const slideBatch = slides.slice(i, i + AI_BATCH_SIZE);
    
    await Promise.all(slideBatch.map(async (slide) => {"""

replacement = """  const AI_BATCH_SIZE = 3;
  for (let i = 0; i < slides.length; i += AI_BATCH_SIZE) {
    if (onProgress) {
        onProgress(60 + Math.round((i / slides.length) * 35), `Running AI Vision & Semantic Analysis... Slide ${i + 1} of ${slides.length}`);
    }
    const slideBatch = slides.slice(i, i + AI_BATCH_SIZE);
    
    await Promise.all(slideBatch.map(async (slide) => {"""

if target in content:
    with open('src/core/pptxEngine.js', 'w') as f:
        f.write(content.replace(target, replacement))
    print("Success")
else:
    print("Target not found")
