import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Compass, Home, Search } from 'lucide-react';

const NotFound = () => {
  const location = useLocation();

  return (
    <div
      style={{
        minHeight: '70vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 20px'
      }}
    >
      <Helmet>
        <title>Page Not Found | Heera Advertising</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <div style={{ textAlign: 'center', maxWidth: '520px' }}>
        <div
          style={{
            width: '84px',
            height: '84px',
            margin: '0 auto 24px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#6366f1'
          }}
        >
          <Compass size={40} />
        </div>

        <h1
          style={{
            fontSize: 'clamp(2.5rem, 8vw, 4rem)',
            lineHeight: 1,
            margin: '0 0 12px',
            color: '#0f172a',
            letterSpacing: '-2px'
          }}
        >
          404
        </h1>

        <h2 style={{ fontSize: 'clamp(1.1rem, 4vw, 1.4rem)', margin: '0 0 12px', color: '#1e293b' }}>
          This page isn&apos;t on our map
        </h2>

        <p style={{ color: '#64748b', fontSize: '0.95rem', lineHeight: 1.6, margin: '0 0 8px' }}>
          We couldn&apos;t find anything at <strong style={{ color: '#475569', wordBreak: 'break-all' }}>{location.pathname}</strong>.
          The site may have been renamed, removed, or the link might be incorrect.
        </p>

        <div
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'center',
            flexWrap: 'wrap',
            marginTop: '28px'
          }}
        >
          <Link
            to="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 22px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.9rem',
              textDecoration: 'none',
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)'
            }}
          >
            <Home size={17} /> Back to Home
          </Link>

          <Link
            to="/all"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 22px',
              borderRadius: '10px',
              background: '#fff',
              color: '#4338ca',
              fontWeight: 700,
              fontSize: '0.9rem',
              textDecoration: 'none',
              border: '1.5px solid #c7d2fe'
            }}
          >
            <Search size={17} /> Explore All Hoardings
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
