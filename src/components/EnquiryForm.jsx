import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Send, CheckCircle } from 'lucide-react';
import './EnquiryForm.css';

const schema = z.object({
    fullName: z.string().min(2, 'Name is required'),
    companyName: z.string().min(2, 'Company name is required'),
    phone: z.string().min(10, 'Invalid phone number'),
    email: z.string().email('Invalid email address'),
    startDate: z.string().min(1, 'Start date is required'),
    duration: z.string().min(1, 'Duration is required'),
    message: z.string().optional(),
});

const EnquiryForm = ({ siteName, city }) => {
    const [submitted, setSubmitted] = useState(false);
    const [loading, setLoading] = useState(false);

    const { register, handleSubmit, formState: { errors } } = useForm({
        resolver: zodResolver(schema),
        defaultValues: {
            duration: '3',
        }
    });

    const onSubmit = async (data) => {
        setLoading(true);
        const formData = {
            ...data,
            siteName,
            city,
            timestamp: new Date().toLocaleString(),
        };

        try {
            // NOTE: To save data to Google Sheets, you must deploy a Google Apps Script Web App
            // and replace the URL below with your script's exec URL.
            // The script should handle POST requests and append row to a sheet.
            const SCRIPT_URL = 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL';

            // For now, we simulate success and log data
            console.log('Enquiry Data:', formData);

            /* 
            await fetch(SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            */

            // Simulate network delay
            await new Promise(resolve => setTimeout(resolve, 1500));
            setSubmitted(true);
        } catch (error) {
            console.error('Submission error:', error);
            alert('Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (submitted) {
        return (
            <div className="enquiry-success">
                <CheckCircle size={48} className="success-icon" />
                <h3>Enquiry Sent!</h3>
                <p>Thank you for your interest. Our media team will contact you within 24 hours.</p>
                <button onClick={() => setSubmitted(false)} className="reset-btn">Send Another Enquiry</button>
            </div>
        );
    }

    return (
        <form className="enquiry-form" onSubmit={handleSubmit(onSubmit)}>
            <h3>Quick Enquiry</h3>
            <p className="form-subtitle">Enquiring for: <strong>{siteName}</strong></p>

            <div className="form-grid">
                <div className="form-group">
                    <label>Full Name</label>
                    <input {...register('fullName')} placeholder="John Doe" />
                    {errors.fullName && <span className="error">{errors.fullName.message}</span>}
                </div>

                <div className="form-group">
                    <label>Company Name</label>
                    <input {...register('companyName')} placeholder="Your Agency Ltd." />
                    {errors.companyName && <span className="error">{errors.companyName.message}</span>}
                </div>

                <div className="form-group">
                    <label>Phone Number</label>
                    <input {...register('phone')} placeholder="+91 98765 43210" />
                    {errors.phone && <span className="error">{errors.phone.message}</span>}
                </div>

                <div className="form-group">
                    <label>Email Address</label>
                    <input {...register('email')} placeholder="john@company.com" />
                    {errors.email && <span className="error">{errors.email.message}</span>}
                </div>

                <div className="form-group">
                    <label>Preferred Start Date</label>
                    <input type="date" {...register('startDate')} />
                    {errors.startDate && <span className="error">{errors.startDate.message}</span>}
                </div>

                <div className="form-group">
                    <label>Duration</label>
                    <select {...register('duration')}>
                        <option value="1">1 Month</option>
                        <option value="3">3 Months</option>
                        <option value="6">6 Months</option>
                        <option value="12">12 Months</option>
                    </select>
                    {errors.duration && <span className="error">{errors.duration.message}</span>}
                </div>
            </div>

            <div className="form-group full-width">
                <label>Message (Optional)</label>
                <textarea {...register('message')} placeholder="Tell us about your campaign objectives..." rows="3"></textarea>
            </div>

            <button type="submit" disabled={loading} className="submit-enquiry-btn">
                {loading ? 'Sending...' : <><Send size={18} /> Send Enquiry</>}
            </button>
            <p className="form-footer">No payment required for enquiry.</p>
        </form>
    );
};

export default EnquiryForm;
