import { describe, it, expect } from 'vitest';
import { extractSlideBrackets } from './pptxEngine';
import { stampRedBracketsOnCanvas } from './imageOrientation';

describe('Red Corner Target Brackets Engine', () => {
  it('extracts Half Frame red brackets from slide XML relative to main picture', () => {
    const mockSlideXml = `
      <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:cSld>
          <p:spTree>
            <p:pic>
              <p:spPr>
                <a:xfrm>
                  <a:off x="0" y="0"/>
                  <a:ext cx="1000000" cy="1000000"/>
                </a:xfrm>
              </p:spPr>
            </p:pic>
            <p:sp>
              <p:nvSpPr>
                <p:cNvPr id="10" name="Half Frame 1"/>
              </p:nvSpPr>
              <p:spPr>
                <a:xfrm>
                  <a:off x="200000" y="300000"/>
                  <a:ext cx="50000" cy="50000"/>
                </a:xfrm>
                <a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>
              </p:spPr>
            </p:sp>
            <p:sp>
              <p:nvSpPr>
                <p:cNvPr id="11" name="Half Frame 2"/>
              </p:nvSpPr>
              <p:spPr>
                <a:xfrm flipH="1" flipV="1">
                  <a:off x="600000" y="500000"/>
                  <a:ext cx="50000" cy="50000"/>
                </a:xfrm>
                <a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>
              </p:spPr>
            </p:sp>
          </p:spTree>
        </p:cSld>
      </p:sld>
    `;

    const brackets = extractSlideBrackets(mockSlideXml);
    expect(brackets).not.toBeNull();
    expect(brackets.relX).toBeCloseTo(0.2, 2);
    expect(brackets.relY).toBeCloseTo(0.3, 2);
    expect(brackets.relW).toBeCloseTo(0.45, 2); // (650000 - 200000) / 1000000 = 0.45
    expect(brackets.relH).toBeCloseTo(0.25, 2); // (550000 - 300000) / 1000000 = 0.25
  });

  it('returns null when no red Half Frame shapes exist', () => {
    const mockSlideXml = `
      <p:sld>
        <p:pic>
          <a:xfrm><a:off x="0" y="0"/><a:ext cx="1000" cy="1000"/></a:xfrm>
        </p:pic>
      </p:sld>
    `;
    const brackets = extractSlideBrackets(mockSlideXml);
    expect(brackets).toBeNull();
  });

  it('safely stamps red brackets on canvas mock context', () => {
    const strokes = [];
    const mockCtx = {
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: (x, y) => strokes.push({ move: [x, y] }),
      lineTo: (x, y) => strokes.push({ line: [x, y] }),
      stroke: () => {},
      strokeStyle: '',
      lineWidth: 0,
      lineCap: '',
      lineJoin: '',
      shadowColor: '',
      shadowBlur: 0
    };

    stampRedBracketsOnCanvas(mockCtx, 1000, 800, {
      relX: 0.2,
      relY: 0.3,
      relW: 0.4,
      relH: 0.2,
      armW1: 0.05,
      armH1: 0.05,
      armW2: 0.05,
      armH2: 0.05
    });

    expect(strokes.length).toBeGreaterThanOrEqual(4);
    expect(mockCtx.strokeStyle).toBe('#ef4444');
  });
});
