import re

with open('src/pages/AdminDashboard.jsx', 'r') as f:
    content = f.read()

target = """                // Implement chunking mechanism: process slides in batches of 20 to prevent Apps Script timeouts
                const BATCH_SIZE = 20;
                for (let i = 0; i < processableSlides.length; i += BATCH_SIZE) {
                    const chunk = processableSlides.slice(i, i + BATCH_SIZE);
                    
                    await Promise.all(chunk.map(async (slide) => {"""

replacement = """                // Implement chunking mechanism: process slides in batches of 5 to prevent Apps Script timeouts
                const BATCH_SIZE = 5;
                for (let i = 0; i < processableSlides.length; i += BATCH_SIZE) {
                    updateFileProcessing({ 
                        phase: `Syncing photos to Google Drive... (${i + 1} to ${Math.min(i + BATCH_SIZE, processableSlides.length)} of ${processableSlides.length})`, 
                        progress: 45 + Math.round((i / processableSlides.length) * 50) 
                    });
                    const chunk = processableSlides.slice(i, i + BATCH_SIZE);
                    
                    await Promise.all(chunk.map(async (slide) => {"""

if target in content:
    with open('src/pages/AdminDashboard.jsx', 'w') as f:
        f.write(content.replace(target, replacement))
    print("Success")
else:
    print("Target not found")
