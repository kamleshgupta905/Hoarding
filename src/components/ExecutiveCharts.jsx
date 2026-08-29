import React, { useEffect, useState, useRef } from 'react';

/**
 * Animated Number Counter Component
 * Smoothly interpolates from 0 to value with easing
 */
export const AnimatedCounter = ({ value, duration = 800, prefix = '', suffix = '', decimals = 0 }) => {
    const [count, setCount] = useState(0);

    useEffect(() => {
        const target = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.]/g, '')) || 0;
        let startTimestamp = null;
        let animationFrameId;

        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            // Ease out cubic
            const easeOutProgress = 1 - Math.pow(1 - progress, 3);
            const current = easeOutProgress * target;
            setCount(current);

            if (progress < 1) {
                animationFrameId = window.requestAnimationFrame(step);
            } else {
                setCount(target);
            }
        };

        animationFrameId = window.requestAnimationFrame(step);
        return () => window.cancelAnimationFrame(animationFrameId);
    }, [value, duration]);

    const formatted = decimals > 0 
        ? count.toFixed(decimals) 
        : Math.round(count).toLocaleString('en-IN');

    return (
        <span 
            className="animated-counter-value"
            style={{
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                fontWeight: 700,
                letterSpacing: '-0.02em',
                lineHeight: 1.1,
                display: 'inline-flex',
                alignItems: 'baseline'
            }}
        >
            {prefix}{formatted}{suffix}
        </span>
    );
};

/**
 * Heera Advertising Interactive Revenue Line Chart
 * Fully animated rising spline wave with interactive glowing pulses, area gradients, and tooltip
 */
export const QuickMartLineChart = ({ data, height = 220 }) => {
    const [hoveredPoint, setHoveredPoint] = useState(null);
    const [animProgress, setAnimProgress] = useState(0);
    const pathRef = useRef(null);

    // Default 14-day data points if not provided
    const chartData = data && data.length > 0 ? data : [
        { date: '16 Aug', value: 0.8 },
        { date: '18 Aug', value: 1.1 },
        { date: '19 Aug', value: 1.0 },
        { date: '21 Aug', value: 1.25 },
        { date: '22 Aug', value: 1.15 },
        { date: '24 Aug', value: 1.32 },
        { date: '25 Aug', value: 1.28 },
        { date: '27 Aug', value: 1.35 },
        { date: '28 Aug', value: 1.38 }
    ];

    const padding = { top: 20, right: 20, bottom: 35, left: 35 };
    const width = 500;
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const baselineY = height - padding.bottom;

    const maxY = 4; // 0 to 4 Cr
    const yGridTicks = [0, 1, 2, 3, 4];

    // Trigger smooth 60fps rising entrance animation
    useEffect(() => {
        let startTimestamp = null;
        let animationFrameId;
        const duration = 1100; // ms

        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const rawProgress = Math.min((timestamp - startTimestamp) / duration, 1);
            // Elastic-cubic ease out for organic upward wave surge
            const ease = 1 - Math.pow(1 - rawProgress, 3);
            setAnimProgress(ease);

            if (rawProgress < 1) {
                animationFrameId = window.requestAnimationFrame(step);
            } else {
                setAnimProgress(1);
            }
        };

        animationFrameId = window.requestAnimationFrame(step);
        return () => window.cancelAnimationFrame(animationFrameId);
    }, [data]);

    // Compute coordinate points with animated vertical interpolation
    const points = chartData.map((d, i) => {
        const x = padding.left + (i / (chartData.length - 1)) * innerWidth;
        const targetY = padding.top + innerHeight - (d.value / maxY) * innerHeight;
        const animatedY = baselineY - (baselineY - targetY) * animProgress;
        return { ...d, x, y: animatedY, targetY };
    });

    // Generate smooth SVG spline path
    const pathD = points.reduce((acc, pt, i) => {
        if (i === 0) return `M ${pt.x} ${pt.y}`;
        const prev = points[i - 1];
        const cx = (prev.x + pt.x) / 2;
        return `${acc} C ${cx} ${prev.y}, ${cx} ${pt.y}, ${pt.x} ${pt.y}`;
    }, '');

    // Area fill path
    const areaD = `${pathD} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`;

    return (
        <div style={{ position: 'relative', width: '100%', height }}>
            <svg 
                viewBox={`0 0 ${width} ${height}`} 
                style={{ width: '100%', height: '100%', overflow: 'visible' }}
            >
                <defs>
                    <linearGradient id="heeraRevenueAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
                        <stop offset="70%" stopColor="#10b981" stopOpacity="0.04" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                    </linearGradient>
                    <filter id="emeraldGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#10b981" floodOpacity="0.4" />
                    </filter>
                </defs>

                {/* Horizontal Dotted/Subtle Grid Lines */}
                {yGridTicks.map((tick) => {
                    const y = padding.top + innerHeight - (tick / maxY) * innerHeight;
                    return (
                        <g key={tick}>
                            <line 
                                x1={padding.left} 
                                y1={y} 
                                x2={width - padding.right} 
                                y2={y} 
                                stroke="#e2e8f0" 
                                strokeDasharray="3 3" 
                                strokeWidth="1" 
                            />
                            <text 
                                x={padding.left - 10} 
                                y={y + 4} 
                                fill="#94a3b8" 
                                fontSize="11" 
                                fontWeight="600" 
                                textAnchor="end"
                                style={{
                                    fontFamily: "'Inter', sans-serif"
                                }}
                            >
                                {tick}
                            </text>
                        </g>
                    );
                })}

                {/* Animated Gradient Area Fill under curve */}
                <path 
                    d={areaD} 
                    fill="url(#heeraRevenueAreaGrad)"
                    style={{
                        opacity: animProgress,
                        transition: 'opacity 0.3s ease'
                    }}
                />

                {/* Animated Crisp Solid Line */}
                <path 
                    ref={pathRef}
                    d={pathD} 
                    fill="none" 
                    stroke="#10b981" 
                    strokeWidth="2.5" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    filter="url(#emeraldGlow)"
                />

                {/* Interactive Data Points with Staggered Scale entrance */}
                {points.map((pt, idx) => {
                    const isHovered = hoveredPoint === idx;
                    const pointProgress = Math.max(0, Math.min(1, (animProgress - idx * 0.05) / 0.6));
                    const pointScale = isHovered ? 1.4 : pointProgress;
                    const isLastPoint = idx === points.length - 1;

                    return (
                        <g key={idx}>
                            {/* Live Pulse Ring on latest active point */}
                            {isLastPoint && animProgress > 0.8 && (
                                <circle 
                                    cx={pt.x} 
                                    cy={pt.y} 
                                    r={10} 
                                    fill="none" 
                                    stroke="#10b981" 
                                    strokeWidth="1.5"
                                    opacity="0.6"
                                    style={{
                                        animation: 'qmPulseRing 1.8s cubic-bezier(0.24, 0, 0.38, 1) infinite'
                                    }}
                                />
                            )}

                            {/* Outer hover highlight */}
                            {isHovered && (
                                <circle 
                                    cx={pt.x} 
                                    cy={pt.y} 
                                    r={12} 
                                    fill="#10b981" 
                                    fillOpacity="0.18" 
                                />
                            )}

                            {/* Core Point Circle */}
                            <circle 
                                cx={pt.x} 
                                cy={pt.y} 
                                r={isHovered ? 6 : 3.5} 
                                fill="#ffffff" 
                                stroke="#10b981" 
                                strokeWidth={isHovered ? 3 : 2}
                                style={{ 
                                    cursor: 'pointer', 
                                    transition: 'r 0.2s ease, stroke-width 0.2s ease',
                                    transformOrigin: `${pt.x}px ${pt.y}px`,
                                    transform: `scale(${pointScale})`,
                                    opacity: pointProgress > 0 ? 1 : 0
                                }}
                                onMouseEnter={() => setHoveredPoint(idx)}
                                onMouseLeave={() => setHoveredPoint(null)}
                            />

                            {/* X-Axis Date Labels */}
                            {(idx === 0 || idx === Math.floor(points.length / 4) || idx === Math.floor(points.length / 2) || idx === Math.floor((points.length * 3) / 4) || idx === points.length - 1) && (
                                <text 
                                    x={pt.x} 
                                    y={height - 10} 
                                    fill="#64748b" 
                                    fontSize="11" 
                                    fontWeight="600" 
                                    textAnchor="middle"
                                    style={{
                                        fontFamily: "'Inter', sans-serif",
                                        opacity: animProgress,
                                        transition: 'opacity 0.4s ease'
                                    }}
                                >
                                    {pt.date}
                                </text>
                            )}
                        </g>
                    );
                })}
            </svg>

            {/* Hover Tooltip with Smooth Float Animation */}
            {hoveredPoint !== null && (
                <div style={{
                    position: 'absolute',
                    left: `${(points[hoveredPoint].x / width) * 100}%`,
                    top: `${(points[hoveredPoint].y / height) * 100}%`,
                    transform: 'translate(-50%, -135%) scale(1.02)',
                    background: '#111827',
                    color: '#ffffff',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
                    zIndex: 10,
                    animation: 'qmTooltipIn 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '2px',
                    fontFamily: "'Inter', sans-serif"
                }}>
                    <span style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 500 }}>{points[hoveredPoint].date}</span>
                    <span style={{ color: '#10b981', fontWeight: 800 }}>₹{points[hoveredPoint].value} Cr</span>
                </div>
            )}

            <style>{`
                @keyframes qmPulseRing {
                    0% { r: 5px; opacity: 0.8; }
                    50% { opacity: 0.3; }
                    100% { r: 16px; opacity: 0; }
                }
                @keyframes qmTooltipIn {
                    0% { opacity: 0; transform: translate(-50%, -115%) scale(0.92); }
                    100% { opacity: 1; transform: translate(-50%, -135%) scale(1.02); }
                }
            `}</style>
        </div>
    );
};

/**
 * Heera Advertising Format & Category Mix Donut Chart
 * Fully animated rotational sweep entrance, interactive exploding segment slices, and animated center readout
 */
export const QuickMartDonutChart = ({ data, size = 190, strokeWidth = 32 }) => {
    const [hoveredIdx, setHoveredIdx] = useState(null);
    const [animProgress, setAnimProgress] = useState(0);

    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    
    // Ordered segments: Green -> Red -> Purple -> Amber -> Blue
    const chartData = data && data.length > 0 ? data : [
        { label: 'Prime Unipoles', value: 165, color: '#10b981' },
        { label: 'Gantries & Bridge', value: 18, color: '#ef4444' },
        { label: 'Digital LED Screens', value: 24, color: '#6366f1' },
        { label: 'Foot Overbridge', value: 28, color: '#f59e0b' },
        { label: 'Kiosks & Transit', value: 42, color: '#0070f3' }
    ];

    const total = chartData.reduce((acc, item) => acc + (item.value || 0), 0);
    const gapPerSegment = 3; // pixels gap between segments
    const totalGap = chartData.length * gapPerSegment;
    const effectiveCircumference = Math.max(circumference - totalGap, 0);

    // Smooth rotational arc sweep animation on mount
    useEffect(() => {
        let startTimestamp = null;
        let animationFrameId;
        const duration = 1000;

        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const rawProgress = Math.min((timestamp - startTimestamp) / duration, 1);
            // Smooth ease-out cubic
            const ease = 1 - Math.pow(1 - rawProgress, 3);
            setAnimProgress(ease);

            if (rawProgress < 1) {
                animationFrameId = window.requestAnimationFrame(step);
            } else {
                setAnimProgress(1);
            }
        };

        animationFrameId = window.requestAnimationFrame(step);
        return () => window.cancelAnimationFrame(animationFrameId);
    }, [data]);

    const segments = chartData.reduce((acc, item, idx) => {
        const val = item.value || 0;
        const fullLength = total > 0 ? (val / total) * effectiveCircumference : 0;
        // Scale length by animProgress for smooth filling animation
        const rawLength = fullLength * animProgress;
        const currentOffset = -acc.accumulatedOffset;

        acc.list.push({
            ...item,
            idx,
            val,
            percent: total > 0 ? Math.round((val / total) * 100) : 0,
            dashArray: `${rawLength} ${circumference}`,
            dashOffset: currentOffset
        });

        acc.accumulatedOffset += (fullLength + gapPerSegment) * animProgress;
        return acc;
    }, { list: [], accumulatedOffset: 0 }).list;

    return (
        <div style={{ position: 'relative', width: size, height: size, margin: '10px auto' }}>
            <svg 
                width={size} 
                height={size} 
                viewBox={`0 0 ${size} ${size}`} 
                style={{ 
                    transform: `rotate(-90deg)`,
                    overflow: 'visible',
                    transition: 'transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
            >
                {/* Subtle base track */}
                <circle 
                    cx={size / 2} 
                    cy={size / 2} 
                    r={radius} 
                    fill="none" 
                    stroke="#f3f4f6" 
                    strokeWidth={strokeWidth} 
                />

                {segments.map((item) => {
                    const isHovered = hoveredIdx === item.idx;
                    return (
                        <circle
                            key={item.idx}
                            cx={size / 2}
                            cy={size / 2}
                            r={radius}
                            fill="none"
                            stroke={item.color}
                            strokeWidth={isHovered ? strokeWidth + 6 : strokeWidth}
                            strokeDasharray={item.dashArray}
                            strokeDashoffset={item.dashOffset}
                            strokeLinecap="butt"
                            style={{
                                transition: 'stroke-width 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease, filter 0.2s ease',
                                cursor: 'pointer',
                                opacity: hoveredIdx !== null && !isHovered ? 0.4 : 1,
                                filter: isHovered ? 'drop-shadow(0 6px 12px rgba(0,0,0,0.22))' : 'none'
                            }}
                            onMouseEnter={() => setHoveredIdx(item.idx)}
                            onMouseLeave={() => setHoveredIdx(null)}
                        />
                    );
                })}
            </svg>

            {/* Center Animated Readout (Shows hovered segment or animated total) */}
            <div 
                style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    textAlign: 'center',
                    pointerEvents: 'none',
                    width: `${size - strokeWidth * 2 - 12}px`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: "'Inter', sans-serif"
                }}
            >
                {hoveredIdx !== null ? (
                    <div style={{ animation: 'qmDonutCenterIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                        <div style={{ fontSize: '1.35rem', fontWeight: 800, color: chartData[hoveredIdx].color || '#111827', letterSpacing: '-0.03em', lineHeight: 1 }}>
                            {chartData[hoveredIdx].value}
                        </div>
                        <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#6b7280', marginTop: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                            {chartData[hoveredIdx].label}
                        </div>
                        <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#9ca3af', marginTop: '1px' }}>
                            {segments[hoveredIdx]?.percent}%
                        </div>
                    </div>
                ) : (
                    <div style={{ opacity: animProgress, transition: 'opacity 0.4s ease' }}>
                        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em', lineHeight: 1 }}>
                            <AnimatedCounter value={total} duration={800} />
                        </div>
                        <div style={{ fontSize: '0.68rem', fontWeight: 500, color: '#9ca3af', marginTop: '2px' }}>
                            Total Sites
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes qmDonutCenterIn {
                    0% { opacity: 0; transform: scale(0.85); }
                    100% { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </div>
    );
};

/**
 * Heera Advertising Top Corridors & Locations Bar Chart
 * Fully animated progressive bar expansion with staggered delays, counters, and vibrant hover states
 */
export const QuickMartTopLocationsChart = ({ data, onBarClick }) => {
    const [hoveredIdx, setHoveredIdx] = useState(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const maxVal = Math.max(...(data || []).map(d => d.count), 1);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsLoaded(true);
        }, 50);
        return () => clearTimeout(timer);
    }, [data]);

    const chartData = data && data.length > 0 ? data : [
        { name: 'Ring Road & Expressway', count: 48 },
        { name: 'Airport Road VIP Corridor', count: 36 },
        { name: 'Civil Lines & High Street', count: 29 },
        { name: 'Commercial Hub / Tech Park', count: 22 },
        { name: 'Central Junction & Railway', count: 18 }
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '6px 0', fontFamily: "'Inter', sans-serif" }}>
            {chartData.map((item, idx) => {
                const pct = Math.round((item.count / maxVal) * 100);
                const isHovered = hoveredIdx === idx;
                const transitionDelay = `${idx * 90}ms`;

                return (
                    <div 
                        key={idx}
                        onMouseEnter={() => setHoveredIdx(idx)}
                        onMouseLeave={() => setHoveredIdx(null)}
                        onClick={() => onBarClick && onBarClick(item.name)}
                        style={{
                            display: 'grid',
                            gridTemplateColumns: '140px 1fr 50px',
                            alignItems: 'center',
                            gap: '14px',
                            cursor: 'pointer',
                            padding: '3px 6px',
                            borderRadius: '8px',
                            background: isHovered ? '#f9fafb' : 'transparent',
                            transition: 'all 0.2s ease',
                            transform: isHovered ? 'translateX(2px)' : 'none'
                        }}
                    >
                        {/* Corridor / Location Name */}
                        <div style={{ 
                            fontSize: '0.8125rem', 
                            fontWeight: isHovered ? 700 : 500, 
                            color: isHovered ? '#10b981' : '#374151', 
                            textAlign: 'right',
                            whiteSpace: 'nowrap', 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis',
                            transition: 'color 0.2s ease'
                        }}>
                            {item.name}
                        </div>

                        {/* Animated Track & Bar Fill */}
                        <div style={{ 
                            background: '#f3f4f6', 
                            height: '18px', 
                            borderRadius: '9999px', 
                            overflow: 'hidden',
                            position: 'relative'
                        }}>
                            <div 
                                style={{
                                    height: '100%',
                                    width: isLoaded ? `${pct}%` : '0%',
                                    background: isHovered 
                                        ? 'linear-gradient(90deg, #0284c7 0%, #06b6d4 100%)' 
                                        : 'linear-gradient(90deg, #0ea5e9 0%, #38bdf8 100%)',
                                    borderRadius: '9999px',
                                    transition: `width 0.9s cubic-bezier(0.16, 1, 0.3, 1) ${transitionDelay}, background 0.2s ease, box-shadow 0.2s ease`,
                                    boxShadow: isHovered ? '0 2px 8px rgba(14, 165, 233, 0.4)' : 'none',
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}
                            >
                                {/* Animated subtle shine effect across the bar */}
                                <div 
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        right: 0,
                                        bottom: 0,
                                        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)',
                                        animation: 'qmBarShine 2.8s infinite',
                                        opacity: isHovered ? 1 : 0.6
                                    }}
                                />
                            </div>
                        </div>

                        {/* Animated Counter for value */}
                        <div style={{ 
                            textAlign: 'left', 
                            fontSize: '0.8125rem', 
                            fontWeight: 700, 
                            color: isHovered ? '#10b981' : '#111827',
                            transition: 'color 0.2s ease'
                        }}>
                            <AnimatedCounter value={item.count} duration={900 + idx * 100} />
                        </div>
                    </div>
                );
            })}

            <style>{`
                @keyframes qmBarShine {
                    0% { transform: translateX(-100%); }
                    60%, 100% { transform: translateX(200%); }
                }
            `}</style>
        </div>
    );
};

// Aliases for compatibility
export const InteractiveBarChart = QuickMartTopLocationsChart;
export const InteractiveDonutChart = QuickMartDonutChart;
