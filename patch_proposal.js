import fs from 'fs';

let content = fs.readFileSync('src/components/ProposalBuilder.jsx', 'utf8');

const updatedImports = `import React, { useState, useRef } from 'react';
import readXlsxFile from 'read-excel-file/browser';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Link as LinkIcon, ExternalLink, RefreshCw, Presentation, Search, Image as ImageIcon } from 'lucide-react';
import { getImageUrl } from '../services/dataService';
import { parsePptx } from '../core/pptxEngine';`;

content = content.replace(/import React[\s\S]*?from '\.\.\/services\/dataService';/, updatedImports);

const newUploadLogic = `    const handleFileUpload = async (e) => {
        const uploadedFile = e.target.files[0];
        if (!uploadedFile) return;
        setFile(uploadedFile);
        setIsProcessing(true);
        setProposalUrl('');
        
        try {
            const fileName = uploadedFile.name.toLowerCase();
            
            // Try to auto-detect client name from filename (e.g. Pears booking.xlsx)
            const matches = fileName.match(/([a-z0-9]+)\\s*booking/i) || fileName.match(/([a-z0-9]+)\\s*plan/i);
            if (matches && matches[1]) {
                setClientName(matches[1].charAt(0).toUpperCase() + matches[1].slice(1));
            }

            const matchedRows = [];

            if (fileName.endsWith('.pptx') || fileName.endsWith('.ppt')) {
                const arrayBuffer = await uploadedFile.arrayBuffer();
                const slides = await parsePptx(arrayBuffer, hoardings, (pct, msg) => {
                    // Optional: could add progress text to UI, but for now we'll just show the spinner
                    console.log(pct, msg);
                });
                
                slides.forEach(slide => {
                    if (slide.candidates && slide.candidates.length > 0) {
                        const match = slide.candidates[0].site;
                        matchedRows.push({
                            originalLocation: \`Slide \${slide.number}\`,
                            originalCity: 'PPT Extract',
                            w: '', h: '',
                            matchedSite: match,
                            siteId: match.UniqueID || match._SiteID || match.ID || match['Site Code'] || ''
                        });
                    }
                });
                
                if (matchedRows.length === 0) throw new Error("Could not match any locations from this PPT.");
            } else {
                const rows = await readXlsxFile(uploadedFile);
                if (rows.length < 2) throw new Error("Excel file is empty or missing data rows.");
                
                const headers = rows[0].map(h => String(h || '').trim().toLowerCase());
                const locIdx = headers.findIndex(h => h.includes('location') || h.includes('site'));
                const cityIdx = headers.findIndex(h => h.includes('city'));
                const wIdx = headers.findIndex(h => h === 'w' || h.includes('width'));
                const hIdx = headers.findIndex(h => h === 'h' || h.includes('height'));
                
                if (locIdx === -1) throw new Error("Could not find a 'Location' column in the Excel file.");
                
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (!row[locIdx]) continue;
                    
                    const locName = String(row[locIdx]);
                    const normLoc = normalizeStr(locName);
                    
                    let match = hoardings.find(h => {
                        const hLoc = normalizeStr(h['Location '] || h['Locality Site Location'] || '');
                        return hLoc === normLoc || hLoc.includes(normLoc) || normLoc.includes(hLoc);
                    });
                    
                    matchedRows.push({
                        originalLocation: locName,
                        originalCity: cityIdx !== -1 ? row[cityIdx] : '',
                        w: wIdx !== -1 ? row[wIdx] : '',
                        h: hIdx !== -1 ? row[hIdx] : '',
                        matchedSite: match || null,
                        siteId: match ? (match.UniqueID || match._SiteID || match.ID || match['Site Code'] || '') : null
                    });
                }
            }
            
            setParsedRows(matchedRows);
            
        } catch (err) {
            alert("Error parsing file: " + err.message);
        } finally {
            setIsProcessing(false);
        }
    };`;

content = content.replace(/const handleFileUpload = async \(e\) => \{[\s\S]*?\} finally \{\s*setIsProcessing\(false\);\s*\}\s*\};/, newUploadLogic);

content = content.replace("accept=\".xlsx,.xls,.csv\"", "accept=\".xlsx,.xls,.csv,.ppt,.pptx\"");
content = content.replace("Drop Excel File Here", "Drop Excel or PPT File");
content = content.replace("Or click to browse (.xlsx)", "Or click to browse (.xlsx, .pptx)");
content = content.replace("<FileSpreadsheet size={40} color=\"#10b981\" style={{ margin: '0 auto 16px' }} />", "<div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '16px' }}><FileSpreadsheet size={40} color=\"#10b981\" /><Presentation size={40} color=\"#f59e0b\" /></div>");
content = content.replace("Upload an Excel file containing", "Upload an Excel or PPT file containing");

fs.writeFileSync('src/components/ProposalBuilder.jsx', content);
