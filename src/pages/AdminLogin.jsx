import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail } from 'lucide-react';
import { loginAdmin } from '../services/secureApi';
import './AdminLogin.css';

const AdminLogin = () => {
    const [id, setId] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);
        try {
            await loginAdmin(id.trim(), password);
            navigate('/admin/dashboard');
        } catch (loginError) {
            setError(loginError.message || 'Login failed. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="admin-login-page">
            <div className="login-card">
                <div className="login-header">
                    <div style={{ background: '#ffffff', padding: '6px 14px', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', marginBottom: '16px', boxShadow: '0 4px 14px rgba(0,0,0,0.1)' }}>
                        <img src="/hira-logo.png" alt="HIRA Advertising" style={{ height: '48px', width: 'auto', display: 'block', objectFit: 'contain' }} />
                    </div>
                    <h2>Admin Portal</h2>
                    <p>Login to manage your media inventory</p>
                </div>

                {error && <div className="login-error">{error}</div>}

                <form onSubmit={handleLogin}>
                    <div className="form-group">
                        <label>Admin ID</label>
                        <div className="input-with-icon">
                            <Mail size={18} />
                            <input
                                type="text"
                                placeholder="Enter ID"
                                value={id}
                                onChange={(e) => setId(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Password</label>
                        <div className="input-with-icon">
                            <Lock size={18} />
                            <input
                                type="password"
                                placeholder="Enter Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <button type="submit" className="login-btn" disabled={isSubmitting}>
                        {isSubmitting ? 'Verifying...' : 'Login to Dashboard'}
                    </button>
                </form>

                <p className="login-footer">Protected by Heera Advertising Secure Logic</p>
            </div>
        </div>
    );
};

export default AdminLogin;
