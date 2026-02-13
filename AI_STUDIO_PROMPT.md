# 🤖 detailed Prompt for Google AI Studio (Gemini)

**System Instruction (Optional but Recommended):**
> You are an expert AI Vision Analyst specialized in Outdoor Advertising & Geolocation. Your job is to accurately match billboard images to a specific list of known locations based on visual landmarks and text overlays.

---

**USER PROMPT (Copy & Paste this into the Chat Box along with an Image):**

I am building an automated system to track billboard executions. I have a list of known billboard locations.
I will provide you with:
1. A **List of Locations** (indexed 0 to N).
2. An **Image** of a billboard.

**YOUR TASK:**
Analyze the uploaded image and identify which specific location from my list it matches.

**MATCHING LOGIC (Follow Strictly):**
1.  **PRIORITY 1: GPS/Text Stamp Reading:**
    *   Look closely at the bottom/corners of the image for GPS stamps (e.g., "Sector 18", "Begumpul", "Meerut", coordinates, or dates).
    *   If the text in the image matches a location name in the list, that is the strongest match.
2.  **PRIORITY 2: Visual Landmarks:**
    *   If no text is visible, look at the visual context: Shops, Malls, Flyovers, Bridges, specific building colors/shapes.
    *   Match these visual cues with keywords in the location list (e.g., if image shows a Mall, look for 'Shopprix Mall' in the list).

**INPUT LIST (Example Data - Replace this with your full real list if needed for testing):**
0. Begum Bridge Chauraha
1. Near Tanya Maruti Showroom
2. Central Market Shastri Nagar
3. PVS Mall Road B Block
4. L Block Hapur Chungi
5. Kesar Ganj Fcng Metro Plaza
6. T.P Nagar Fcng Shopprix Mall
7. Shaheed Smarak Jali Kothi Fcng Shopprix
8. Shaheed Smarak Jali Kothi Fcng Delhi Bus Stand
9. Defence Colony Fcng Comissionary
10. University Road Apex Tower
11. Saket Crossing
12. Hapur Road Chungi

**OUTPUT FORMAT:**
You must return **ONLY** a rigorous JSON object (no markdown, no extra text) with the following structure:

```json
{
  "matchedIndex": number,      // The integer index from the list (e.g., 5). Return -1 if no match found.
  "matchedLocation": "string", // The exact name string from the list.
  "status": "string",          // "Occupied" (if brand ad is visible) OR "Available" (if empty/white/to-let).
  "confidence": number,        // A score between 0.0 and 1.0 indicating how sure you are.
  "reasoning": "string"        // A brief explanation of why you matched this (e.g. "Matched GPS text 'Begumpul'").
}
```

**TEST:**
(Upload your image here in AI Studio)
