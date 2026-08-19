import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Send, CheckCircle } from 'lucide-react';
import './EnquiryForm.css';

const schema = z.object({
    fullName: z.string().min(2, 'Name is required'),
    phone: z.string().min(10, 'Invalid phone number'),
    startDate: z.string().min(1, 'Start date is required'),
    message: z.string().optional(),
});

const EnquiryForm = ({ siteName, city }) => {
    const [submitted, setSubmitted] = useState(false);
    const [loading, setLoading] = useState(false);

    const { register, handleSubmit, formState: { errors } } = useForm({
        resolver: zodResolver(schema)
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
            // Simulated submission
            console.log('Simplified Enquiry Data:', formData);
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
            <p className="form-subtitle">Direct contact for <strong>{siteName}</strong></p>

            <div className="form-grid-one-col">
                <div className="form-group">
                    <label>Full Name</label>
                    <input {...register('fullName')} placeholder="Enter your full name" />
                    {errors.fullName && <span className="error">{errors.fullName.message}</span>}
                </div>

                <div className="form-group">
                    <label>Phone Number</label>
                    <input {...register('phone')} placeholder="+91 00000 00000" />
                    {errors.phone && <span className="error">{errors.phone.message}</span>}
                </div>

                <div className="form-group">
                    <label>Anticipated Start Date</label>
                    <input type="date" {...register('startDate')} />
                    {errors.startDate && <span className="error">{errors.startDate.message}</span>}
                </div>
            </div>

            <div className="form-group full-width">
                <label>Campaign Brief (Optional)</label>
                <textarea {...register('message')} placeholder="Briefly describe your campaign goals..." rows="3"></textarea>
            </div>

            <button type="submit" disabled={loading} className="submit-enquiry-btn">
                {loading ? 'Sending...' : <><Send size={18} /> Send Enquiry</>}
            </button>
            <p className="form-footer">You will receive a quote via Phone/WhatsApp.</p>
        </form>
    );
};

export default EnquiryForm;
